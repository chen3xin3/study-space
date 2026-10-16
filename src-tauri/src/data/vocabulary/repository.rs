use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use uuid::Uuid;

use crate::data::error::DataError;
use crate::data::vocabulary::models::{
    BatchResult, CreateWordInput, CreateWordOutcome, DeleteWordsInput, DuplicateResolution,
    EnglishSummary, ResolveDuplicateInput, ReviewResult, ScheduleWordsInput, SummaryQuery,
    UpdateWordInput, UpdateWordTagsInput, WordDetail, WordListItem, WordListPage, WordListQuery,
    WordMeaning, WordReviewFilter, WordReviewState, WordSort, WordTag,
};
use crate::data::vocabulary::normalize::{normalize_meaning, normalize_tag, normalize_word};

const MAX_WORD_CHARS: usize = 200;
const MAX_TEXT_CHARS: usize = 10_000;
const MAX_TAGS: usize = 30;

pub fn create_word(
    connection: &mut Connection,
    input: CreateWordInput,
    occurred_at: &str,
    initial_review_at: &str,
) -> Result<CreateWordOutcome, DataError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(vocabulary_error)?;
    let outcome = create_word_in(&transaction, input, occurred_at, initial_review_at)?;
    transaction.commit().map_err(vocabulary_error)?;
    Ok(outcome)
}

pub(crate) fn create_word_in(
    transaction: &Transaction<'_>,
    input: CreateWordInput,
    occurred_at: &str,
    initial_review_at: &str,
) -> Result<CreateWordOutcome, DataError> {
    let normalized_word = validate_input(&input)?;

    let existing_id = transaction
        .query_row(
            "SELECT id FROM words WHERE normalized_text=?1
             ORDER BY deleted_at IS NULL DESC, created_at ASC LIMIT 1",
            [&normalized_word],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(vocabulary_error)?;
    if let Some(id) = existing_id {
        let word = get_word_from(&transaction, &id)?;
        let deleted = word.deleted_at.is_some();
        return Ok(CreateWordOutcome::Duplicate { word, deleted });
    }

    let id = Uuid::new_v4().to_string();
    transaction
        .execute(
            "INSERT INTO words
             (id, display_text, normalized_text, phonetic, part_of_speech,
              example_sentence, note, created_at, updated_at, version)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, 1)",
            params![
                id,
                input.word.trim(),
                normalized_word,
                clean_optional(input.phonetic.as_deref()),
                clean_optional(input.part_of_speech.as_deref()),
                clean_optional(input.example_sentence.as_deref()),
                clean_optional(input.note.as_deref()),
                occurred_at,
            ],
        )
        .map_err(vocabulary_error)?;
    insert_meaning(&transaction, &id, &input.meaning, occurred_at)?;
    replace_tags(&transaction, &id, &input.tags, occurred_at)?;
    insert_learning_log(&transaction, &id, "created", None, occurred_at)?;
    transaction
        .execute(
            "INSERT INTO word_review_state
             (word_id, next_review_at, interval_days, updated_at, version)
             VALUES (?1, ?2, 0, ?3, 1)",
            params![id, initial_review_at, occurred_at],
        )
        .map_err(vocabulary_error)?;

    let word = get_word_from(&transaction, &id)?;
    Ok(CreateWordOutcome::Created { word })
}

pub fn resolve_duplicate(
    connection: &mut Connection,
    input: ResolveDuplicateInput,
    occurred_at: &str,
    initial_review_at: &str,
) -> Result<WordDetail, DataError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(vocabulary_error)?;
    let word = resolve_duplicate_in(&transaction, input, occurred_at, initial_review_at)?;
    transaction.commit().map_err(vocabulary_error)?;
    Ok(word)
}

pub(crate) fn resolve_duplicate_in(
    transaction: &Transaction<'_>,
    input: ResolveDuplicateInput,
    occurred_at: &str,
    initial_review_at: &str,
) -> Result<WordDetail, DataError> {
    let existing = get_word_from(&transaction, &input.word_id)?;

    match input.resolution {
        DuplicateResolution::EncounterOnly => {
            if existing.deleted_at.is_some() {
                return Err(DataError::word_invalid(
                    "deleted word requires restore resolution",
                ));
            }
            insert_learning_log(
                &transaction,
                &input.word_id,
                "encountered",
                None,
                occurred_at,
            )?;
        }
        DuplicateResolution::AppendMeaning { meaning } => {
            if existing.deleted_at.is_some() {
                return Err(DataError::word_invalid(
                    "deleted word requires restore resolution",
                ));
            }
            let inserted = insert_meaning(&transaction, &input.word_id, &meaning, occurred_at)?;
            insert_learning_log(
                &transaction,
                &input.word_id,
                if inserted {
                    "meaning_added"
                } else {
                    "encountered"
                },
                None,
                occurred_at,
            )?;
            transaction
                .execute(
                    "UPDATE words SET updated_at=?1, version=version+1 WHERE id=?2",
                    params![occurred_at, input.word_id],
                )
                .map_err(vocabulary_error)?;
        }
        DuplicateResolution::RestoreAndAppend { meaning } => {
            if existing.deleted_at.is_none() {
                return Err(DataError::word_invalid("word is not deleted"));
            }
            transaction
                .execute(
                    "UPDATE words SET deleted_at=NULL, updated_at=?1, version=version+1 WHERE id=?2",
                    params![occurred_at, input.word_id],
                )
                .map_err(vocabulary_error)?;
            transaction
                .execute(
                    "INSERT INTO word_review_state
                     (word_id, next_review_at, interval_days, last_result, review_count,
                      lapse_count, updated_at, version)
                     VALUES (?1, ?2, 0, NULL, 0, 0, ?3, 1)
                     ON CONFLICT(word_id) DO UPDATE SET
                       next_review_at=excluded.next_review_at,
                       updated_at=excluded.updated_at,
                       version=word_review_state.version+1",
                    params![input.word_id, initial_review_at, occurred_at],
                )
                .map_err(vocabulary_error)?;
            if let Some(meaning) = meaning {
                insert_meaning(&transaction, &input.word_id, &meaning, occurred_at)?;
            }
            insert_learning_log(&transaction, &input.word_id, "restored", None, occurred_at)?;
        }
    }

    let word = get_word_from(&transaction, &input.word_id)?;
    Ok(word)
}

pub fn get_word(connection: &Connection, id: &str) -> Result<WordDetail, DataError> {
    get_word_from(connection, id)
}

pub fn list_words(
    connection: &Connection,
    query: WordListQuery,
) -> Result<WordListPage, DataError> {
    let limit = query.limit.unwrap_or(50).clamp(1, 100) as i64;
    let offset = query
        .cursor
        .as_deref()
        .unwrap_or("0")
        .parse::<i64>()
        .map_err(|error| DataError::word_invalid(error.to_string()))?
        .max(0);
    let search = query
        .search
        .as_deref()
        .map(normalize_word)
        .filter(|value| !value.is_empty())
        .map(|value| format!("%{value}%"));
    let tag = query
        .tag
        .as_deref()
        .map(normalize_tag)
        .filter(|value| !value.is_empty());
    let review_filter = query.review_status.as_ref().map(|value| match value {
        WordReviewFilter::Due => "due",
        WordReviewFilter::NeverReviewed => "never",
        WordReviewFilter::Scheduled => "scheduled",
    });
    let order = match query.sort {
        WordSort::Newest => "w.created_at DESC, w.id ASC",
        WordSort::Alphabetical => "w.normalized_text ASC, w.id ASC",
        WordSort::NextReview => "s.next_review_at ASC, w.id ASC",
    };
    let sql = format!(
        "SELECT w.id FROM words w
         LEFT JOIN word_review_state s ON s.word_id=w.id
         WHERE (?1=1 OR w.deleted_at IS NULL)
           AND (?2 IS NULL OR lower(w.display_text) LIKE ?2
             OR lower(COALESCE(w.example_sentence,'')) LIKE ?2
             OR lower(COALESCE(w.note,'')) LIKE ?2
             OR EXISTS (
               SELECT 1 FROM word_meanings m
               WHERE m.word_id=w.id AND m.deleted_at IS NULL
                 AND lower(m.meaning) LIKE ?2
             )
             OR EXISTS (
               SELECT 1 FROM word_tag_relations r
               JOIN word_tags t ON t.id=r.tag_id
               WHERE r.word_id=w.id AND t.deleted_at IS NULL
                 AND lower(t.name) LIKE ?2
             ))
           AND (?3 IS NULL OR EXISTS (
             SELECT 1 FROM word_tag_relations r
             JOIN word_tags t ON t.id=r.tag_id
             WHERE r.word_id=w.id AND t.deleted_at IS NULL AND t.normalized_name=?3
           ))
           AND (?4 IS NULL
             OR (?4='due' AND s.next_review_at<=?5)
             OR (?4='never' AND COALESCE(s.review_count,0)=0)
             OR (?4='scheduled' AND s.next_review_at>?5))
           AND (?6 IS NULL OR w.created_at>=?6)
           AND (?7 IS NULL OR w.created_at<?7)
         ORDER BY {order}
         LIMIT ?8 OFFSET ?9"
    );
    let mut statement = connection.prepare(&sql).map_err(vocabulary_error)?;
    let ids = statement
        .query_map(
            params![
                query.include_deleted as i64,
                search,
                tag,
                review_filter,
                query.now,
                query.created_from,
                query.created_to,
                limit + 1,
                offset,
            ],
            |row| row.get::<_, String>(0),
        )
        .map_err(vocabulary_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(vocabulary_error)?;
    let has_more = ids.len() as i64 > limit;
    let items = ids
        .into_iter()
        .take(limit as usize)
        .map(|id| get_word_from(connection, &id).map(word_to_list_item))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(WordListPage {
        next_cursor: has_more.then(|| (offset + limit).to_string()),
        items,
    })
}

pub fn update_word(
    connection: &mut Connection,
    input: UpdateWordInput,
    updated_at: &str,
) -> Result<WordDetail, DataError> {
    let primary_meaning = input.meanings.first().cloned().unwrap_or_default();
    let validation = CreateWordInput {
        word: input.word.clone(),
        meaning: primary_meaning,
        phonetic: input.phonetic.clone(),
        part_of_speech: input.part_of_speech.clone(),
        example_sentence: input.example_sentence.clone(),
        note: input.note.clone(),
        tags: input.tags.clone(),
    };
    let normalized = validate_input(&validation)?;
    if input.meanings.is_empty() || input.meanings.len() > 100 {
        return Err(DataError::word_invalid("meanings are required"));
    }
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(vocabulary_error)?;
    let changed = transaction
        .execute(
            "UPDATE words SET display_text=?1, normalized_text=?2, phonetic=?3,
              part_of_speech=?4, example_sentence=?5, note=?6, updated_at=?7,
              version=version+1
             WHERE id=?8 AND version=?9 AND deleted_at IS NULL",
            params![
                input.word.trim(),
                normalized,
                clean_optional(input.phonetic.as_deref()),
                clean_optional(input.part_of_speech.as_deref()),
                clean_optional(input.example_sentence.as_deref()),
                clean_optional(input.note.as_deref()),
                updated_at,
                input.id,
                input.version,
            ],
        )
        .map_err(vocabulary_error)?;
    if changed == 0 {
        return Err(DataError::word_version_conflict(&input.id));
    }
    transaction
        .execute(
            "UPDATE word_meanings SET deleted_at=?1, updated_at=?1, version=version+1
             WHERE word_id=?2 AND deleted_at IS NULL",
            params![updated_at, input.id],
        )
        .map_err(vocabulary_error)?;
    let mut seen = HashSet::new();
    for meaning in input.meanings {
        let normalized = normalize_meaning(&meaning);
        if seen.insert(normalized) {
            insert_meaning(&transaction, &input.id, &meaning, updated_at)?;
        }
    }
    transaction
        .execute(
            "DELETE FROM word_tag_relations WHERE word_id=?1",
            [&input.id],
        )
        .map_err(vocabulary_error)?;
    replace_tags(&transaction, &input.id, &input.tags, updated_at)?;
    let word = get_word_from(&transaction, &input.id)?;
    transaction.commit().map_err(vocabulary_error)?;
    Ok(word)
}

pub fn delete_words(
    connection: &mut Connection,
    input: DeleteWordsInput,
    deleted_at: &str,
) -> Result<BatchResult, DataError> {
    let ids = validated_ids(input.word_ids)?;
    let requested = ids.len();
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(vocabulary_error)?;
    let mut changed = 0;
    for id in ids {
        changed += transaction
            .execute(
                "UPDATE words SET deleted_at=?1, updated_at=?1, version=version+1
                 WHERE id=?2 AND deleted_at IS NULL",
                params![deleted_at, id],
            )
            .map_err(vocabulary_error)?;
    }
    transaction.commit().map_err(vocabulary_error)?;
    Ok(batch_result(requested, changed))
}

pub fn update_word_tags(
    connection: &mut Connection,
    input: UpdateWordTagsInput,
    updated_at: &str,
) -> Result<BatchResult, DataError> {
    let ids = validated_ids(input.word_ids)?;
    let requested = ids.len();
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(vocabulary_error)?;
    let remove = input
        .remove
        .iter()
        .map(|tag| normalize_tag(tag))
        .collect::<Vec<_>>();
    let mut changed = 0;
    for id in ids {
        let exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM words WHERE id=?1 AND deleted_at IS NULL)",
                [&id],
                |row| row.get(0),
            )
            .map_err(vocabulary_error)?;
        if !exists {
            continue;
        }
        for tag in &remove {
            transaction
                .execute(
                    "DELETE FROM word_tag_relations
                     WHERE word_id=?1 AND tag_id IN (
                       SELECT id FROM word_tags WHERE normalized_name=?2
                     )",
                    params![id, tag],
                )
                .map_err(vocabulary_error)?;
        }
        replace_tags(&transaction, &id, &input.add, updated_at)?;
        transaction
            .execute(
                "UPDATE words SET updated_at=?1, version=version+1 WHERE id=?2",
                params![updated_at, id],
            )
            .map_err(vocabulary_error)?;
        changed += 1;
    }
    transaction.commit().map_err(vocabulary_error)?;
    Ok(batch_result(requested, changed))
}

pub fn schedule_words_for_today(
    connection: &mut Connection,
    input: ScheduleWordsInput,
    updated_at: &str,
) -> Result<BatchResult, DataError> {
    let ids = validated_ids(input.word_ids)?;
    let requested = ids.len();
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(vocabulary_error)?;
    let mut changed = 0;
    for id in ids {
        changed += transaction
            .execute(
                "UPDATE word_review_state SET next_review_at=?1, updated_at=?2,
                   version=version+1
                 WHERE word_id=?3 AND EXISTS (
                   SELECT 1 FROM words w WHERE w.id=?3 AND w.deleted_at IS NULL
                 )",
                params![input.next_review_at, updated_at, id],
            )
            .map_err(vocabulary_error)?;
    }
    transaction.commit().map_err(vocabulary_error)?;
    Ok(batch_result(requested, changed))
}

pub fn get_english_summary(
    connection: &Connection,
    query: SummaryQuery,
) -> Result<EnglishSummary, DataError> {
    let total_words = count(
        connection,
        "SELECT count(*) FROM words WHERE deleted_at IS NULL",
        [],
    )?;
    let learned_today = count(
        connection,
        "SELECT count(*) FROM word_learning_logs
         WHERE occurred_at>=?1 AND occurred_at<?2",
        params![query.day_start, query.day_end],
    )?;
    let due_today = count(
        connection,
        "SELECT count(*) FROM word_review_state s
         JOIN words w ON w.id=s.word_id
         WHERE w.deleted_at IS NULL AND s.next_review_at<=?1",
        [&query.now],
    )?;
    let reviewed_today = count(
        connection,
        "SELECT count(*) FROM word_review_logs
         WHERE submitted_at>=?1 AND submitted_at<?2",
        params![query.day_start, query.day_end],
    )?;
    let learned_this_week = count(
        connection,
        "SELECT count(*) FROM word_learning_logs
         WHERE occurred_at>=?1 AND occurred_at<?2",
        params![query.week_start, query.day_end],
    )?;
    let feedback_count = |result: &str| {
        count(
            connection,
            "SELECT count(*) FROM word_review_logs
             WHERE submitted_at>=?1 AND submitted_at<?2 AND result=?3",
            params![query.week_start, query.day_end, result],
        )
    };
    Ok(EnglishSummary {
        total_words,
        learned_today,
        due_today,
        reviewed_today,
        learned_this_week,
        known_this_week: feedback_count("known")?,
        fuzzy_this_week: feedback_count("fuzzy")?,
        unknown_this_week: feedback_count("unknown")?,
    })
}

fn count<P: rusqlite::Params>(
    connection: &Connection,
    sql: &str,
    params: P,
) -> Result<u64, DataError> {
    let value: i64 = connection
        .query_row(sql, params, |row| row.get(0))
        .map_err(vocabulary_error)?;
    u64::try_from(value).map_err(|error| DataError::vocabulary_operation_failed(error.to_string()))
}

fn validated_ids(ids: Vec<String>) -> Result<Vec<String>, DataError> {
    let mut seen = HashSet::new();
    let ids = ids
        .into_iter()
        .filter(|id| !id.trim().is_empty() && seen.insert(id.clone()))
        .collect::<Vec<_>>();
    if ids.is_empty() || ids.len() > 500 {
        return Err(DataError::word_invalid(
            "batch size must be between 1 and 500",
        ));
    }
    Ok(ids)
}

fn batch_result(requested: usize, changed: usize) -> BatchResult {
    BatchResult {
        requested,
        changed,
        skipped: requested.saturating_sub(changed),
    }
}

fn word_to_list_item(word: WordDetail) -> WordListItem {
    WordListItem {
        id: word.id,
        display_text: word.display_text,
        primary_meaning: word.meanings.first().map(|meaning| meaning.meaning.clone()),
        tags: word.tags,
        next_review_at: word.review_state.map(|state| state.next_review_at),
        created_at: word.created_at,
        updated_at: word.updated_at,
        deleted_at: word.deleted_at,
        version: word.version,
    }
}

fn validate_input(input: &CreateWordInput) -> Result<String, DataError> {
    let normalized = normalize_word(&input.word);
    if normalized.is_empty() || normalized.chars().count() > MAX_WORD_CHARS {
        return Err(DataError::word_invalid("word length is invalid"));
    }
    if normalize_meaning(&input.meaning).is_empty() {
        return Err(DataError::word_invalid("meaning is required"));
    }
    for value in [
        Some(input.meaning.as_str()),
        input.phonetic.as_deref(),
        input.part_of_speech.as_deref(),
        input.example_sentence.as_deref(),
        input.note.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        if value.chars().count() > MAX_TEXT_CHARS {
            return Err(DataError::word_invalid("text field is too long"));
        }
    }
    if input.tags.len() > MAX_TAGS {
        return Err(DataError::word_invalid("too many tags"));
    }
    Ok(normalized)
}

fn clean_optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn insert_meaning(
    transaction: &Transaction<'_>,
    word_id: &str,
    meaning: &str,
    now: &str,
) -> Result<bool, DataError> {
    let display = meaning.trim();
    let normalized = normalize_meaning(display);
    if normalized.is_empty() || display.chars().count() > MAX_TEXT_CHARS {
        return Err(DataError::word_invalid("meaning is invalid"));
    }
    let changed = transaction
        .execute(
            "INSERT OR IGNORE INTO word_meanings
             (id, word_id, meaning, normalized_meaning, created_at, updated_at, version)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5, 1)",
            params![
                Uuid::new_v4().to_string(),
                word_id,
                display,
                normalized,
                now
            ],
        )
        .map_err(vocabulary_error)?;
    Ok(changed == 1)
}

fn replace_tags(
    transaction: &Transaction<'_>,
    word_id: &str,
    tags: &[String],
    now: &str,
) -> Result<(), DataError> {
    let mut seen = HashSet::new();
    for name in tags {
        let display = name.trim();
        let normalized = normalize_tag(display);
        if normalized.is_empty() || !seen.insert(normalized.clone()) {
            continue;
        }
        transaction
            .execute(
                "INSERT OR IGNORE INTO word_tags
                 (id, name, normalized_name, created_at, updated_at, version)
                 VALUES (?1, ?2, ?3, ?4, ?4, 1)",
                params![Uuid::new_v4().to_string(), display, normalized, now],
            )
            .map_err(vocabulary_error)?;
        let tag_id: String = transaction
            .query_row(
                "SELECT id FROM word_tags WHERE normalized_name=?1 AND deleted_at IS NULL",
                [&normalized],
                |row| row.get(0),
            )
            .map_err(vocabulary_error)?;
        transaction
            .execute(
                "INSERT OR IGNORE INTO word_tag_relations (word_id, tag_id, created_at)
                 VALUES (?1, ?2, ?3)",
                params![word_id, tag_id, now],
            )
            .map_err(vocabulary_error)?;
    }
    Ok(())
}

fn insert_learning_log(
    transaction: &Transaction<'_>,
    word_id: &str,
    action: &str,
    note: Option<&str>,
    occurred_at: &str,
) -> Result<(), DataError> {
    transaction
        .execute(
            "INSERT INTO word_learning_logs
             (id, word_id, action, note, occurred_at, version)
             VALUES (?1, ?2, ?3, ?4, ?5, 1)",
            params![
                Uuid::new_v4().to_string(),
                word_id,
                action,
                note,
                occurred_at
            ],
        )
        .map_err(vocabulary_error)?;
    Ok(())
}

fn get_word_from(connection: &Connection, id: &str) -> Result<WordDetail, DataError> {
    let mut word = connection
        .query_row(
            "SELECT id, display_text, phonetic, part_of_speech, example_sentence, note,
                    created_at, updated_at, deleted_at, version
             FROM words WHERE id=?1",
            [id],
            |row| {
                Ok(WordDetail {
                    id: row.get(0)?,
                    display_text: row.get(1)?,
                    phonetic: row.get(2)?,
                    part_of_speech: row.get(3)?,
                    example_sentence: row.get(4)?,
                    note: row.get(5)?,
                    meanings: Vec::new(),
                    tags: Vec::new(),
                    review_state: None,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                    deleted_at: row.get(8)?,
                    version: row.get(9)?,
                })
            },
        )
        .optional()
        .map_err(vocabulary_error)?
        .ok_or_else(|| DataError::word_not_found(id))?;

    let mut statement = connection
        .prepare(
            "SELECT id, meaning, version FROM word_meanings
             WHERE word_id=?1 AND deleted_at IS NULL ORDER BY created_at, id",
        )
        .map_err(vocabulary_error)?;
    word.meanings = statement
        .query_map([id], |row| {
            Ok(WordMeaning {
                id: row.get(0)?,
                meaning: row.get(1)?,
                version: row.get(2)?,
            })
        })
        .map_err(vocabulary_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(vocabulary_error)?;

    let mut statement = connection
        .prepare(
            "SELECT t.id, t.name FROM word_tags t
             JOIN word_tag_relations r ON r.tag_id=t.id
             WHERE r.word_id=?1 AND t.deleted_at IS NULL ORDER BY t.name, t.id",
        )
        .map_err(vocabulary_error)?;
    word.tags = statement
        .query_map([id], |row| {
            Ok(WordTag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(vocabulary_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(vocabulary_error)?;

    word.review_state = connection
        .query_row(
            "SELECT next_review_at, interval_days, last_result, review_count,
                    lapse_count, version
             FROM word_review_state WHERE word_id=?1",
            [id],
            |row| {
                let last_result: Option<String> = row.get(2)?;
                Ok(WordReviewState {
                    next_review_at: row.get(0)?,
                    interval_days: row.get(1)?,
                    last_result: last_result.as_deref().and_then(parse_review_result),
                    review_count: row.get(3)?,
                    lapse_count: row.get(4)?,
                    version: row.get(5)?,
                })
            },
        )
        .optional()
        .map_err(vocabulary_error)?;
    Ok(word)
}

fn parse_review_result(value: &str) -> Option<ReviewResult> {
    match value {
        "known" => Some(ReviewResult::Known),
        "fuzzy" => Some(ReviewResult::Fuzzy),
        "unknown" => Some(ReviewResult::Unknown),
        _ => None,
    }
}

fn vocabulary_error(error: rusqlite::Error) -> DataError {
    DataError::vocabulary_operation_failed(error.to_string())
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::{
        create_word, delete_words, get_english_summary, list_words, resolve_duplicate,
        schedule_words_for_today, update_word, update_word_tags,
    };
    use crate::data::migrations::migrate;
    use crate::data::vocabulary::models::{
        CreateWordInput, CreateWordOutcome, DeleteWordsInput, DuplicateResolution,
        ResolveDuplicateInput, ScheduleWordsInput, SummaryQuery, UpdateWordInput,
        UpdateWordTagsInput, WordListQuery, WordReviewFilter, WordSort,
    };

    fn connection() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        connection
            .execute_batch("PRAGMA foreign_keys = ON;")
            .unwrap();
        connection
    }

    fn input(word: &str, meaning: &str) -> CreateWordInput {
        CreateWordInput {
            word: word.to_owned(),
            meaning: meaning.to_owned(),
            phonetic: None,
            part_of_speech: Some("verb".to_owned()),
            example_sentence: None,
            note: None,
            tags: vec!["核心词".to_owned()],
        }
    }

    fn created(
        connection: &mut Connection,
        input: CreateWordInput,
    ) -> crate::data::vocabulary::models::WordDetail {
        let CreateWordOutcome::Created { word } = create_word(
            connection,
            input,
            "2026-09-25T02:00:00Z",
            "2026-09-26T01:00:00Z",
        )
        .unwrap() else {
            panic!("expected created");
        };
        word
    }

    fn query(search: Option<&str>) -> WordListQuery {
        WordListQuery {
            search: search.map(str::to_owned),
            tag: None,
            review_status: None,
            created_from: None,
            created_to: None,
            include_deleted: false,
            sort: WordSort::Newest,
            cursor: None,
            limit: Some(50),
            now: "2026-09-25T12:00:00Z".to_owned(),
        }
    }

    #[test]
    fn first_entry_creates_word_meaning_log_tags_and_review_state() {
        let mut connection = connection();
        let result = create_word(
            &mut connection,
            input("Persist", "坚持"),
            "2026-09-25T02:00:00Z",
            "2026-09-26T01:00:00Z",
        )
        .unwrap();

        let CreateWordOutcome::Created { word } = result else {
            panic!("expected a created word");
        };
        assert_eq!(word.display_text, "Persist");
        assert_eq!(word.meanings[0].meaning, "坚持");
        assert_eq!(word.tags[0].name, "核心词");
        assert_eq!(
            word.review_state.unwrap().next_review_at,
            "2026-09-26T01:00:00Z"
        );
        for table in [
            "words",
            "word_meanings",
            "word_learning_logs",
            "word_review_state",
        ] {
            let count: i64 = connection
                .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(count, 1, "{table}");
        }
    }

    #[test]
    fn case_and_whitespace_duplicate_returns_the_existing_word() {
        let mut connection = connection();
        let first = create_word(
            &mut connection,
            input("Take Off", "起飞"),
            "2026-09-25T02:00:00Z",
            "2026-09-26T01:00:00Z",
        )
        .unwrap();
        let duplicate = create_word(
            &mut connection,
            input("  TAKE   OFF ", "脱下"),
            "2026-09-25T03:00:00Z",
            "2026-09-26T01:00:00Z",
        )
        .unwrap();

        let CreateWordOutcome::Created { word: first } = first else {
            panic!("expected created");
        };
        let CreateWordOutcome::Duplicate {
            word: duplicate,
            deleted,
        } = duplicate
        else {
            panic!("expected duplicate");
        };
        assert_eq!(duplicate.id, first.id);
        assert!(!deleted);
        let unique_words: i64 = connection
            .query_row("SELECT count(*) FROM words", [], |row| row.get(0))
            .unwrap();
        assert_eq!(unique_words, 1);
    }

    #[test]
    fn failed_child_insert_rolls_back_the_whole_entry() {
        let mut connection = connection();
        connection
            .execute_batch(
                "CREATE TRIGGER reject_review BEFORE INSERT ON word_review_state
                 BEGIN SELECT RAISE(ABORT, 'injected review failure'); END;",
            )
            .unwrap();

        assert!(create_word(
            &mut connection,
            input("Rollback", "回滚"),
            "2026-09-25T02:00:00Z",
            "2026-09-26T01:00:00Z",
        )
        .is_err());
        let count: i64 = connection
            .query_row("SELECT count(*) FROM words", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn deleted_duplicate_can_be_restored_with_a_new_meaning() {
        let mut connection = connection();
        let created = create_word(
            &mut connection,
            input("Recover", "恢复"),
            "2026-09-25T02:00:00Z",
            "2026-09-26T01:00:00Z",
        )
        .unwrap();
        let CreateWordOutcome::Created { word } = created else {
            panic!("expected created");
        };
        connection
            .execute(
                "UPDATE words SET deleted_at=?1 WHERE id=?2",
                ["2026-09-25T03:00:00Z", word.id.as_str()],
            )
            .unwrap();

        let duplicate = create_word(
            &mut connection,
            input("RECOVER", "重新获得"),
            "2026-09-25T04:00:00Z",
            "2026-09-26T01:00:00Z",
        )
        .unwrap();
        assert!(matches!(
            duplicate,
            CreateWordOutcome::Duplicate { deleted: true, .. }
        ));

        let restored = resolve_duplicate(
            &mut connection,
            ResolveDuplicateInput {
                word_id: word.id,
                resolution: DuplicateResolution::RestoreAndAppend {
                    meaning: Some("重新获得".to_owned()),
                },
            },
            "2026-09-25T04:00:00Z",
            "2026-09-26T01:00:00Z",
        )
        .unwrap();
        assert!(restored.deleted_at.is_none());
        assert_eq!(restored.meanings.len(), 2);
    }

    #[test]
    fn library_searches_word_meaning_example_note_and_tag() {
        let mut connection = connection();
        let mut first = input("launch", "发射");
        first.example_sentence = Some("Launch the project".to_owned());
        first.note = Some("正式启动".to_owned());
        first.tags = vec!["项目".to_owned()];
        created(&mut connection, first);
        created(&mut connection, input("persist", "坚持"));

        for term in ["launch", "发射", "project", "正式启动", "项目"] {
            let page = list_words(&connection, query(Some(term))).unwrap();
            assert_eq!(page.items.len(), 1, "search term: {term}");
            assert_eq!(page.items[0].display_text, "launch");
        }
    }

    #[test]
    fn library_filters_and_paginates_with_a_stable_cursor() {
        let mut connection = connection();
        created(&mut connection, input("alpha", "甲"));
        let mut tagged = input("beta", "乙");
        tagged.tags = vec!["重点".to_owned()];
        let beta = created(&mut connection, tagged);
        let gamma = created(&mut connection, input("gamma", "丙"));
        connection
            .execute(
                "UPDATE word_review_state SET next_review_at='2026-09-25T01:00:00Z' WHERE word_id=?1",
                [&gamma.id],
            )
            .unwrap();

        let mut tag_query = query(None);
        tag_query.tag = Some("重点".to_owned());
        assert_eq!(
            list_words(&connection, tag_query).unwrap().items[0].id,
            beta.id
        );

        let mut due_query = query(None);
        due_query.review_status = Some(WordReviewFilter::Due);
        assert_eq!(
            list_words(&connection, due_query).unwrap().items[0].id,
            gamma.id
        );

        let mut first_page_query = query(None);
        first_page_query.sort = WordSort::Alphabetical;
        first_page_query.limit = Some(1);
        let first_page = list_words(&connection, first_page_query.clone()).unwrap();
        assert_eq!(first_page.items[0].display_text, "alpha");
        first_page_query.cursor = first_page.next_cursor;
        let second_page = list_words(&connection, first_page_query).unwrap();
        assert_eq!(second_page.items[0].display_text, "beta");
    }

    #[test]
    fn editing_uses_optimistic_version_control() {
        let mut connection = connection();
        let word = created(&mut connection, input("edit", "编辑"));
        let update = UpdateWordInput {
            id: word.id.clone(),
            version: word.version,
            word: "edited".to_owned(),
            meanings: vec!["已编辑".to_owned()],
            phonetic: None,
            part_of_speech: None,
            example_sentence: None,
            note: Some("changed".to_owned()),
            tags: vec!["修改".to_owned()],
        };
        let saved = update_word(&mut connection, update.clone(), "2026-09-25T05:00:00Z").unwrap();
        assert_eq!(saved.display_text, "edited");
        assert_eq!(saved.version, word.version + 1);

        let error = update_word(&mut connection, update, "2026-09-25T06:00:00Z").unwrap_err();
        assert_eq!(error.code(), "WORD_VERSION_CONFLICT");
    }

    #[test]
    fn batch_delete_tags_and_review_today_are_transactional() {
        let mut connection = connection();
        let first = created(&mut connection, input("first", "第一"));
        let second = created(&mut connection, input("second", "第二"));
        let ids = vec![first.id.clone(), second.id.clone(), second.id.clone()];

        let tag_result = update_word_tags(
            &mut connection,
            UpdateWordTagsInput {
                word_ids: ids.clone(),
                add: vec!["批量".to_owned()],
                remove: vec![],
            },
            "2026-09-25T06:00:00Z",
        )
        .unwrap();
        assert_eq!(tag_result.requested, 2);
        assert_eq!(tag_result.changed, 2);

        let schedule_result = schedule_words_for_today(
            &mut connection,
            ScheduleWordsInput {
                word_ids: ids,
                next_review_at: "2026-09-25T06:00:00Z".to_owned(),
            },
            "2026-09-25T06:00:00Z",
        )
        .unwrap();
        assert_eq!(schedule_result.changed, 2);

        let deleted = delete_words(
            &mut connection,
            DeleteWordsInput {
                word_ids: vec![first.id, second.id],
            },
            "2026-09-25T07:00:00Z",
        )
        .unwrap();
        assert_eq!(deleted.changed, 2);
        assert!(list_words(&connection, query(None))
            .unwrap()
            .items
            .is_empty());
    }

    #[test]
    fn english_summary_separates_unique_words_from_learning_activity() {
        let mut connection = connection();
        let word = created(&mut connection, input("count", "计数"));
        resolve_duplicate(
            &mut connection,
            ResolveDuplicateInput {
                word_id: word.id,
                resolution: DuplicateResolution::EncounterOnly,
            },
            "2026-09-25T04:00:00Z",
            "2026-09-26T01:00:00Z",
        )
        .unwrap();

        let summary = get_english_summary(
            &connection,
            SummaryQuery {
                day_start: "2026-09-24T16:00:00Z".to_owned(),
                day_end: "2026-09-25T16:00:00Z".to_owned(),
                now: "2026-09-26T02:00:00Z".to_owned(),
                week_start: "2026-09-21T16:00:00Z".to_owned(),
            },
        )
        .unwrap();
        assert_eq!(summary.total_words, 1);
        assert_eq!(summary.learned_today, 2);
        assert_eq!(summary.due_today, 1);
        assert_eq!(summary.reviewed_today, 0);
        assert_eq!(summary.learned_this_week, 2);
    }
}
