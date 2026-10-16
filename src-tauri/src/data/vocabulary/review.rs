use std::collections::HashSet;

use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use uuid::Uuid;

use crate::data::error::DataError;
use crate::data::vocabulary::models::{
    RescheduleReviewInput, ReviewCard, ReviewDirection, ReviewQueueQuery, ReviewResult,
    ReviewSubmission, SubmitReviewInput,
};
use crate::data::vocabulary::repository::get_word;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScheduleDecision {
    pub next_review_at: String,
    pub interval_days: i64,
    pub lapse_delta: i64,
}

pub fn calculate_schedule(
    result: ReviewResult,
    previous_interval_days: i64,
    previous_known_count: i64,
    unknown_already_today: bool,
    submitted_at: DateTime<Utc>,
    next_local_day_nine_utc: DateTime<Utc>,
) -> ScheduleDecision {
    match result {
        ReviewResult::Known => {
            let interval_days = if previous_known_count < 3 {
                3
            } else {
                (previous_interval_days.max(3) * 2).min(60)
            };
            ScheduleDecision {
                next_review_at: (submitted_at + Duration::days(interval_days)).to_rfc3339(),
                interval_days,
                lapse_delta: 0,
            }
        }
        ReviewResult::Fuzzy => ScheduleDecision {
            next_review_at: (submitted_at + Duration::days(1)).to_rfc3339(),
            interval_days: 1,
            lapse_delta: 0,
        },
        ReviewResult::Unknown => ScheduleDecision {
            next_review_at: if unknown_already_today {
                next_local_day_nine_utc.to_rfc3339()
            } else {
                (submitted_at + Duration::hours(4)).to_rfc3339()
            },
            interval_days: 0,
            lapse_delta: 1,
        },
    }
}

pub fn get_review_queue(
    connection: &Connection,
    query: ReviewQueueQuery,
) -> Result<Vec<ReviewCard>, DataError> {
    let limit = query.limit.unwrap_or(20).clamp(1, 500) as usize;
    let selected = query.word_ids.into_iter().collect::<HashSet<_>>();
    if selected.len() > 500 {
        return Err(DataError::word_invalid(
            "review selection exceeds 500 words",
        ));
    }
    let mut statement = connection
        .prepare(
            "SELECT w.id, s.version
             FROM words w JOIN word_review_state s ON s.word_id=w.id
             WHERE w.deleted_at IS NULL
             ORDER BY s.next_review_at ASC, w.id ASC
             LIMIT 500",
        )
        .map_err(vocabulary_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(vocabulary_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(vocabulary_error)?;
    let mut cards = Vec::new();
    for (id, version) in rows {
        let due: bool = connection
            .query_row(
                "SELECT next_review_at<=?1 FROM word_review_state WHERE word_id=?2",
                params![query.now, id],
                |row| row.get(0),
            )
            .map_err(vocabulary_error)?;
        if (selected.is_empty() && !due) || (!selected.is_empty() && !selected.contains(&id)) {
            continue;
        }
        let word = get_word(connection, &id)?;
        let meanings = word
            .meanings
            .into_iter()
            .map(|meaning| meaning.meaning)
            .collect::<Vec<_>>();
        let (prompt, answer) = match query.direction {
            ReviewDirection::EnToZh => (word.display_text, meanings.join("；")),
            ReviewDirection::ZhToEn => (meanings.join("；"), word.display_text),
        };
        cards.push(ReviewCard {
            word_id: id,
            prompt,
            answer,
            meanings,
            direction: query.direction,
            review_state_version: version,
            prompted_at: query.now.clone(),
        });
        if cards.len() == limit {
            break;
        }
    }
    Ok(cards)
}

pub fn submit_review(
    connection: &mut Connection,
    input: SubmitReviewInput,
) -> Result<ReviewSubmission, DataError> {
    let submitted_at = parse_time(&input.submitted_at)?;
    let next_nine = parse_time(&input.next_local_day_nine_utc)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(vocabulary_error)?;
    let state = transaction
        .query_row(
            "SELECT next_review_at, interval_days, version FROM word_review_state
             WHERE word_id=?1",
            [&input.word_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            },
        )
        .optional()
        .map_err(vocabulary_error)?
        .ok_or_else(|| DataError::word_not_found(&input.word_id))?;
    if state.2 != input.review_state_version {
        return Err(DataError::word_version_conflict(&input.word_id));
    }
    let previous_known_count: i64 = transaction
        .query_row(
            "SELECT count(*) FROM word_review_logs WHERE word_id=?1 AND result='known'",
            [&input.word_id],
            |row| row.get(0),
        )
        .map_err(vocabulary_error)?;
    let unknown_today: bool = transaction
        .query_row(
            "SELECT EXISTS(
               SELECT 1 FROM word_review_logs
               WHERE word_id=?1 AND result='unknown'
                 AND submitted_at>=?2 AND submitted_at<?3
             )",
            params![input.word_id, input.local_day_start, input.local_day_end],
            |row| row.get(0),
        )
        .map_err(vocabulary_error)?;
    let decision = calculate_schedule(
        input.result,
        state.1,
        previous_known_count,
        unknown_today,
        submitted_at,
        next_nine,
    );
    let changed = transaction
        .execute(
            "UPDATE word_review_state SET next_review_at=?1, interval_days=?2,
               last_result=?3, review_count=review_count+1,
               lapse_count=lapse_count+?4, updated_at=?5, version=version+1
             WHERE word_id=?6 AND version=?7",
            params![
                decision.next_review_at,
                decision.interval_days,
                input.result.as_db_value(),
                decision.lapse_delta,
                input.submitted_at,
                input.word_id,
                input.review_state_version,
            ],
        )
        .map_err(vocabulary_error)?;
    if changed == 0 {
        return Err(DataError::word_version_conflict(&input.word_id));
    }
    transaction
        .execute(
            "INSERT INTO word_review_logs
             (id, word_id, direction, result, prompted_at, answer_revealed_at,
              submitted_at, previous_review_at, next_review_at, version)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1)",
            params![
                Uuid::new_v4().to_string(),
                input.word_id,
                input.direction.as_db_value(),
                input.result.as_db_value(),
                input.prompted_at,
                input.answer_revealed_at,
                input.submitted_at,
                state.0,
                decision.next_review_at,
            ],
        )
        .map_err(vocabulary_error)?;
    let submission = ReviewSubmission {
        word_id: input.word_id,
        next_review_at: decision.next_review_at,
        interval_days: decision.interval_days,
        review_state_version: input.review_state_version + 1,
    };
    transaction.commit().map_err(vocabulary_error)?;
    Ok(submission)
}

pub fn reschedule_review(
    connection: &mut Connection,
    input: RescheduleReviewInput,
) -> Result<ReviewSubmission, DataError> {
    parse_time(&input.next_review_at)?;
    let changed = connection
        .execute(
            "UPDATE word_review_state SET next_review_at=?1, updated_at=?2,
               version=version+1 WHERE word_id=?3 AND version=?4",
            params![
                input.next_review_at,
                input.updated_at,
                input.word_id,
                input.review_state_version
            ],
        )
        .map_err(vocabulary_error)?;
    if changed == 0 {
        return Err(DataError::word_version_conflict(&input.word_id));
    }
    let interval_days = connection
        .query_row(
            "SELECT interval_days FROM word_review_state WHERE word_id=?1",
            [&input.word_id],
            |row| row.get(0),
        )
        .map_err(vocabulary_error)?;
    Ok(ReviewSubmission {
        word_id: input.word_id,
        next_review_at: input.next_review_at,
        interval_days,
        review_state_version: input.review_state_version + 1,
    })
}

fn parse_time(value: &str) -> Result<DateTime<Utc>, DataError> {
    DateTime::parse_from_rfc3339(value)
        .map(|value| value.with_timezone(&Utc))
        .map_err(|error| DataError::word_invalid(error.to_string()))
}

fn vocabulary_error(error: rusqlite::Error) -> DataError {
    DataError::vocabulary_operation_failed(error.to_string())
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use rusqlite::Connection;

    use super::{calculate_schedule, get_review_queue, submit_review};
    use crate::data::migrations::migrate;
    use crate::data::vocabulary::models::{
        CreateWordInput, CreateWordOutcome, ReviewDirection, ReviewQueueQuery, ReviewResult,
        SubmitReviewInput,
    };
    use crate::data::vocabulary::repository::create_word;

    #[test]
    fn scheduler_applies_known_fuzzy_and_unknown_rules() {
        let now = Utc.with_ymd_and_hms(2026, 9, 25, 2, 0, 0).unwrap();
        let next_nine = Utc.with_ymd_and_hms(2026, 9, 26, 1, 0, 0).unwrap();

        let first_known = calculate_schedule(ReviewResult::Known, 0, 0, false, now, next_nine);
        assert_eq!(first_known.interval_days, 3);
        assert_eq!(first_known.next_review_at, "2026-09-28T02:00:00+00:00");

        let later_known = calculate_schedule(ReviewResult::Known, 40, 3, false, now, next_nine);
        assert_eq!(later_known.interval_days, 60);

        let fuzzy = calculate_schedule(ReviewResult::Fuzzy, 12, 5, false, now, next_nine);
        assert_eq!(fuzzy.interval_days, 1);
        assert_eq!(fuzzy.next_review_at, "2026-09-26T02:00:00+00:00");

        let first_unknown = calculate_schedule(ReviewResult::Unknown, 12, 5, false, now, next_nine);
        assert_eq!(first_unknown.next_review_at, "2026-09-25T06:00:00+00:00");
        let repeated_unknown =
            calculate_schedule(ReviewResult::Unknown, 0, 5, true, now, next_nine);
        assert_eq!(repeated_unknown.next_review_at, "2026-09-26T01:00:00+00:00");
    }

    fn connection_with_due_word() -> (Connection, String) {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        let result = create_word(
            &mut connection,
            CreateWordInput {
                word: "review".to_owned(),
                meaning: "复习".to_owned(),
                phonetic: None,
                part_of_speech: None,
                example_sentence: None,
                note: None,
                tags: vec![],
            },
            "2026-09-24T02:00:00Z",
            "2026-09-25T01:00:00Z",
        )
        .unwrap();
        let CreateWordOutcome::Created { word } = result else {
            panic!("expected created");
        };
        (connection, word.id)
    }

    #[test]
    fn queue_returns_due_active_words_with_prompt_and_answer() {
        let (connection, id) = connection_with_due_word();
        let cards = get_review_queue(
            &connection,
            ReviewQueueQuery {
                direction: ReviewDirection::EnToZh,
                limit: Some(10),
                word_ids: vec![],
                now: "2026-09-25T02:00:00Z".to_owned(),
            },
        )
        .unwrap();
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].word_id, id);
        assert_eq!(cards[0].prompt, "review");
        assert_eq!(cards[0].answer, "复习");
    }

    #[test]
    fn submission_updates_state_and_writes_one_immutable_log() {
        let (mut connection, id) = connection_with_due_word();
        let submission = submit_review(
            &mut connection,
            SubmitReviewInput {
                word_id: id.clone(),
                direction: ReviewDirection::EnToZh,
                result: ReviewResult::Known,
                review_state_version: 1,
                prompted_at: "2026-09-25T02:00:00Z".to_owned(),
                answer_revealed_at: Some("2026-09-25T02:00:03Z".to_owned()),
                submitted_at: "2026-09-25T02:00:05Z".to_owned(),
                local_day_start: "2026-09-24T16:00:00Z".to_owned(),
                local_day_end: "2026-09-25T16:00:00Z".to_owned(),
                next_local_day_nine_utc: "2026-09-26T01:00:00Z".to_owned(),
            },
        )
        .unwrap();
        assert_eq!(submission.interval_days, 3);
        assert_eq!(submission.review_state_version, 2);
        let log_count: i64 = connection
            .query_row("SELECT count(*) FROM word_review_logs", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(log_count, 1);

        let stale = submit_review(
            &mut connection,
            SubmitReviewInput {
                word_id: id,
                direction: ReviewDirection::EnToZh,
                result: ReviewResult::Fuzzy,
                review_state_version: 1,
                prompted_at: "2026-09-25T03:00:00Z".to_owned(),
                answer_revealed_at: None,
                submitted_at: "2026-09-25T03:00:05Z".to_owned(),
                local_day_start: "2026-09-24T16:00:00Z".to_owned(),
                local_day_end: "2026-09-25T16:00:00Z".to_owned(),
                next_local_day_nine_utc: "2026-09-26T01:00:00Z".to_owned(),
            },
        )
        .unwrap_err();
        assert_eq!(stale.code(), "WORD_VERSION_CONFLICT");
        let log_count: i64 = connection
            .query_row("SELECT count(*) FROM word_review_logs", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(log_count, 1);
    }
}
