use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use uuid::Uuid;

use crate::data::attachments::validate_essay_attachments;
use crate::data::error::DataError;
use crate::data::essays::models::{
    AttemptDetail, AttemptListPage, AttemptMode, AttemptStatus, CreateAttemptInput,
    DictationChange, DictationComparison, EssayType, ExamTrack, UpdateAttemptInput,
};

const MAX_TITLE_CHARS: usize = 200;
const MAX_BODY_CHARS: usize = 50_000;
const MAX_DICTATION_TOKENS: usize = 10_000;

pub fn create_attempt(
    connection: &mut Connection,
    input: CreateAttemptInput,
    now: &str,
) -> Result<AttemptDetail, DataError> {
    validate_attempt(&input.title, &input.body)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(attempt_error)?;
    validate_source(&transaction, input.mode, input.source_essay_id.as_deref())?;
    validate_essay_attachments(&transaction, &input.attachment_ids)?;
    let id = Uuid::new_v4().to_string();
    transaction
        .execute(
            "INSERT INTO essay_attempts
             (id, mode, source_essay_id, title, prompt, scoring_criteria, body, note,
              exam_track, essay_type, status, created_at, updated_at, version)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'draft', ?11, ?11, 1)",
            params![
                id,
                mode_db(input.mode),
                input.source_essay_id,
                input.title.trim(),
                clean_optional(input.prompt),
                clean_optional(input.scoring_criteria),
                input.body.trim(),
                clean_optional(input.note),
                input.exam_track.map(track_db),
                essay_type_db(input.essay_type),
                now,
            ],
        )
        .map_err(attempt_error)?;
    replace_attachments(&transaction, &id, &input.attachment_ids, now)?;
    let detail = get_attempt(&transaction, &id)?;
    transaction.commit().map_err(attempt_error)?;
    Ok(detail)
}

pub fn get_attempt(connection: &Connection, id: &str) -> Result<AttemptDetail, DataError> {
    let value = connection
        .query_row(
            "SELECT id, mode, source_essay_id, title, prompt, scoring_criteria, body, note,
                    exam_track, essay_type, status, completed_at, created_at, updated_at, version
             FROM essay_attempts WHERE id=?1 AND deleted_at IS NULL",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, String>(10)?,
                    row.get::<_, Option<String>>(11)?,
                    row.get::<_, String>(12)?,
                    row.get::<_, String>(13)?,
                    row.get::<_, i64>(14)?,
                ))
            },
        )
        .optional()
        .map_err(attempt_error)?
        .ok_or_else(|| DataError::essay_not_found(format!("attempt {id} not found")))?;
    let mut statement = connection
        .prepare(
            "SELECT attachment_id FROM essay_attempt_attachments
             WHERE attempt_id=?1 ORDER BY rowid",
        )
        .map_err(attempt_error)?;
    let attachment_ids = statement
        .query_map([id], |row| row.get::<_, String>(0))
        .map_err(attempt_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(attempt_error)?;
    Ok(AttemptDetail {
        id: value.0,
        mode: parse_mode(value.1)?,
        source_essay_id: value.2,
        title: value.3,
        prompt: value.4,
        scoring_criteria: value.5,
        body: value.6,
        note: value.7,
        exam_track: parse_track(value.8)?,
        essay_type: parse_essay_type(value.9)?,
        status: parse_status(value.10)?,
        attachment_ids,
        completed_at: value.11,
        created_at: value.12,
        updated_at: value.13,
        version: value.14,
    })
}

pub fn update_attempt(
    connection: &mut Connection,
    input: UpdateAttemptInput,
    now: &str,
) -> Result<AttemptDetail, DataError> {
    validate_attempt(&input.title, &input.body)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(attempt_error)?;
    validate_essay_attachments(&transaction, &input.attachment_ids)?;
    let changed = transaction
        .execute(
            "UPDATE essay_attempts
             SET title=?1, prompt=?2, scoring_criteria=?3, body=?4, note=?5,
                 exam_track=?6, essay_type=?7, updated_at=?8, version=version+1
             WHERE id=?9 AND version=?10 AND deleted_at IS NULL AND status='draft'",
            params![
                input.title.trim(),
                clean_optional(input.prompt),
                clean_optional(input.scoring_criteria),
                input.body.trim(),
                clean_optional(input.note),
                input.exam_track.map(track_db),
                essay_type_db(input.essay_type),
                now,
                input.id,
                input.version,
            ],
        )
        .map_err(attempt_error)?;
    if changed == 0 {
        return Err(resolve_attempt_conflict(&transaction, &input.id)?);
    }
    replace_attachments(&transaction, &input.id, &input.attachment_ids, now)?;
    let detail = get_attempt(&transaction, &input.id)?;
    transaction.commit().map_err(attempt_error)?;
    Ok(detail)
}

pub fn complete_attempt(
    connection: &mut Connection,
    id: String,
    version: i64,
    now: &str,
) -> Result<AttemptDetail, DataError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(attempt_error)?;
    let body = transaction
        .query_row(
            "SELECT body FROM essay_attempts WHERE id=?1 AND deleted_at IS NULL",
            [&id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(attempt_error)?
        .ok_or_else(|| DataError::essay_not_found(format!("attempt {id} not found")))?;
    if body.trim().is_empty() {
        return Err(DataError::essay_invalid(
            "a blank draft cannot be completed",
        ));
    }
    let changed = transaction
        .execute(
            "UPDATE essay_attempts
             SET status='completed', completed_at=?1, updated_at=?1, version=version+1
             WHERE id=?2 AND version=?3 AND deleted_at IS NULL AND status='draft'",
            params![now, id, version],
        )
        .map_err(attempt_error)?;
    if changed == 0 {
        return Err(resolve_attempt_conflict(&transaction, &id)?);
    }
    let detail = get_attempt(&transaction, &id)?;
    transaction.commit().map_err(attempt_error)?;
    Ok(detail)
}

pub fn copy_attempt(
    connection: &mut Connection,
    source_id: &str,
    title: &str,
    now: &str,
) -> Result<AttemptDetail, DataError> {
    let source = get_attempt(connection, source_id)?;
    if source.status != AttemptStatus::Completed {
        return Err(DataError::essay_invalid(
            "only completed work can be copied",
        ));
    }
    create_attempt(
        connection,
        CreateAttemptInput {
            mode: source.mode,
            source_essay_id: source.source_essay_id,
            title: title.to_owned(),
            prompt: source.prompt,
            scoring_criteria: source.scoring_criteria,
            body: source.body,
            note: source.note,
            exam_track: source.exam_track,
            essay_type: source.essay_type,
            attachment_ids: source.attachment_ids,
        },
        now,
    )
}

pub fn list_attempts(
    connection: &Connection,
    cursor: Option<&str>,
    limit: usize,
) -> Result<AttemptListPage, DataError> {
    let limit = limit.clamp(1, 50);
    let (cursor_time, cursor_id) = parse_cursor(cursor)?;
    let mut statement = connection
        .prepare(
            "SELECT id FROM essay_attempts
             WHERE deleted_at IS NULL
               AND (?1 IS NULL OR updated_at < ?1 OR (updated_at = ?1 AND id > ?2))
             ORDER BY updated_at DESC, id ASC LIMIT ?3",
        )
        .map_err(attempt_error)?;
    let ids = statement
        .query_map(params![cursor_time, cursor_id, (limit + 1) as i64], |row| {
            row.get::<_, String>(0)
        })
        .map_err(attempt_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(attempt_error)?;
    let has_more = ids.len() > limit;
    let mut items = Vec::with_capacity(ids.len().min(limit));
    for id in ids.into_iter().take(limit) {
        items.push(get_attempt(connection, &id)?);
    }
    let next_cursor = if has_more {
        items
            .last()
            .map(|item| format!("{}\u{1f}{}", item.updated_at, item.id))
    } else {
        None
    };
    Ok(AttemptListPage { items, next_cursor })
}

pub fn compare_dictation(expected: &str, actual: &str) -> Result<DictationComparison, DataError> {
    let expected_tokens = tokenize(expected);
    let actual_tokens = tokenize(actual);
    if expected_tokens.len() > MAX_DICTATION_TOKENS || actual_tokens.len() > MAX_DICTATION_TOKENS {
        return Err(DataError::essay_invalid(
            "dictation text contains too many tokens",
        ));
    }
    if expected_tokens == actual_tokens {
        return Ok(DictationComparison {
            changed_segments: 0,
            changes: vec![],
        });
    }
    let lcs = lcs_length(&expected_tokens, &actual_tokens);
    let changed_segments = expected_tokens.len().max(actual_tokens.len()) - lcs;
    Ok(DictationComparison {
        changed_segments: changed_segments.max(1),
        changes: vec![DictationChange {
            kind: "replace".into(),
            expected: expected_tokens.join(" "),
            actual: actual_tokens.join(" "),
        }],
    })
}

fn validate_attempt(title: &str, body: &str) -> Result<(), DataError> {
    let title_len = title.trim().chars().count();
    if title_len == 0 || title_len > MAX_TITLE_CHARS {
        return Err(DataError::essay_invalid("attempt title length is invalid"));
    }
    if body.trim().chars().count() > MAX_BODY_CHARS {
        return Err(DataError::essay_invalid("attempt body is too long"));
    }
    Ok(())
}

fn validate_source(
    connection: &Connection,
    mode: AttemptMode,
    source_id: Option<&str>,
) -> Result<(), DataError> {
    if mode == AttemptMode::Dictation && source_id.is_none() {
        return Err(DataError::essay_invalid(
            "dictation requires a source essay",
        ));
    }
    if let Some(source_id) = source_id {
        let exists = connection
            .query_row(
                "SELECT 1 FROM essays WHERE id=?1 AND deleted_at IS NULL",
                [source_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(attempt_error)?
            .is_some();
        if !exists {
            return Err(DataError::essay_invalid("source essay is unavailable"));
        }
    }
    Ok(())
}

fn replace_attachments(
    transaction: &Transaction<'_>,
    attempt_id: &str,
    attachment_ids: &[String],
    now: &str,
) -> Result<(), DataError> {
    transaction
        .execute(
            "DELETE FROM essay_attempt_attachments WHERE attempt_id=?1",
            [attempt_id],
        )
        .map_err(attempt_error)?;
    for attachment_id in attachment_ids {
        transaction
            .execute(
                "INSERT INTO essay_attempt_attachments (attempt_id, attachment_id, created_at)
                 VALUES (?1, ?2, ?3)",
                params![attempt_id, attachment_id, now],
            )
            .map_err(attempt_error)?;
    }
    Ok(())
}

fn resolve_attempt_conflict(connection: &Connection, id: &str) -> Result<DataError, DataError> {
    let exists = connection
        .query_row(
            "SELECT 1 FROM essay_attempts WHERE id=?1 AND deleted_at IS NULL",
            [id],
            |_| Ok(()),
        )
        .optional()
        .map_err(attempt_error)?
        .is_some();
    Ok(if exists {
        DataError::essay_version_conflict(format!("attempt {id} changed"))
    } else {
        DataError::essay_not_found(format!("attempt {id} not found"))
    })
}

fn tokenize(value: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut word = String::new();
    for character in value.chars() {
        if character.is_alphanumeric() || character == '\'' {
            word.extend(character.to_lowercase());
        } else {
            if !word.is_empty() {
                tokens.push(std::mem::take(&mut word));
            }
            if !character.is_whitespace() {
                tokens.push(character.to_string());
            }
        }
    }
    if !word.is_empty() {
        tokens.push(word);
    }
    tokens
}

fn lcs_length(left: &[String], right: &[String]) -> usize {
    let mut previous = vec![0_usize; right.len() + 1];
    let mut current = vec![0_usize; right.len() + 1];
    for left_token in left {
        for (index, right_token) in right.iter().enumerate() {
            current[index + 1] = if left_token == right_token {
                previous[index] + 1
            } else {
                current[index].max(previous[index + 1])
            };
        }
        std::mem::swap(&mut previous, &mut current);
        current.fill(0);
    }
    previous[right.len()]
}

fn clean_optional(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty())
}

fn parse_cursor(value: Option<&str>) -> Result<(Option<String>, Option<String>), DataError> {
    match value {
        None => Ok((None, None)),
        Some(value) => value
            .split_once('\u{1f}')
            .map(|(time, id)| (Some(time.to_owned()), Some(id.to_owned())))
            .ok_or_else(|| DataError::essay_invalid("invalid attempt cursor")),
    }
}

fn mode_db(value: AttemptMode) -> &'static str {
    match value {
        AttemptMode::Independent => "independent",
        AttemptMode::Dictation => "dictation",
    }
}

fn parse_mode(value: String) -> Result<AttemptMode, DataError> {
    match value.as_str() {
        "independent" => Ok(AttemptMode::Independent),
        "dictation" => Ok(AttemptMode::Dictation),
        _ => Err(DataError::essay_operation_failed(format!(
            "unknown attempt mode {value}"
        ))),
    }
}

fn parse_status(value: String) -> Result<AttemptStatus, DataError> {
    match value.as_str() {
        "draft" => Ok(AttemptStatus::Draft),
        "completed" => Ok(AttemptStatus::Completed),
        _ => Err(DataError::essay_operation_failed(format!(
            "unknown attempt status {value}"
        ))),
    }
}

fn track_db(value: ExamTrack) -> &'static str {
    match value {
        ExamTrack::English1 => "english_1",
        ExamTrack::English2 => "english_2",
    }
}

fn parse_track(value: Option<String>) -> Result<Option<ExamTrack>, DataError> {
    value
        .map(|value| match value.as_str() {
            "english_1" => Ok(ExamTrack::English1),
            "english_2" => Ok(ExamTrack::English2),
            _ => Err(DataError::essay_operation_failed(format!(
                "unknown exam track {value}"
            ))),
        })
        .transpose()
}

fn essay_type_db(value: EssayType) -> &'static str {
    match value {
        EssayType::Small => "small",
        EssayType::Large => "large",
        EssayType::Custom => "custom",
    }
}

fn parse_essay_type(value: String) -> Result<EssayType, DataError> {
    match value.as_str() {
        "small" => Ok(EssayType::Small),
        "large" => Ok(EssayType::Large),
        "custom" => Ok(EssayType::Custom),
        _ => Err(DataError::essay_operation_failed(format!(
            "unknown essay type {value}"
        ))),
    }
}

fn attempt_error(error: rusqlite::Error) -> DataError {
    DataError::essay_operation_failed(error.to_string())
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    use super::*;
    use crate::data::essays::models::{
        AttemptMode, AttemptStatus, CreateAttemptInput, CreateEssayInput, EssayType, ExamTrack,
        UpdateAttemptInput,
    };
    use crate::data::essays::repository::create_essay;
    use crate::data::migrations::migrate;

    const NOW: &str = "2026-09-25T03:00:00Z";
    const LATER: &str = "2026-09-25T04:00:00Z";
    const DONE: &str = "2026-09-25T05:00:00Z";

    fn setup() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        migrate(&mut connection).unwrap();
        connection
    }

    fn independent_input() -> CreateAttemptInput {
        CreateAttemptInput {
            mode: AttemptMode::Independent,
            source_essay_id: None,
            title: "My first essay".into(),
            prompt: Some("Write a letter".into()),
            scoring_criteria: None,
            body: String::new(),
            note: None,
            exam_track: Some(ExamTrack::English1),
            essay_type: EssayType::Small,
            attachment_ids: vec![],
        }
    }

    fn attachment(connection: &Connection, id: &str, media_type: &str, bytes: i64) {
        connection
            .execute(
                "INSERT INTO attachments
             (id, original_name, stored_name, media_type, byte_size, sha256,
              created_at, updated_at, version)
             VALUES (?1, 'page.png', ?1, ?2, ?3, 'hash', ?4, ?4, 1)",
                params![id, media_type, bytes, NOW],
            )
            .unwrap();
    }

    #[test]
    fn saves_updates_completes_and_copies_independent_work() {
        let mut connection = setup();
        attachment(&connection, "image-1", "image/png", 2048);
        let mut input = independent_input();
        input.attachment_ids.push("image-1".into());
        let created = create_attempt(&mut connection, input, NOW).unwrap();
        assert_eq!(created.status, AttemptStatus::Draft);
        assert_eq!(created.attachment_ids, vec!["image-1"]);

        let saved = update_attempt(
            &mut connection,
            UpdateAttemptInput {
                id: created.id.clone(),
                version: created.version,
                title: created.title.clone(),
                prompt: created.prompt.clone(),
                scoring_criteria: created.scoring_criteria.clone(),
                body: "First draft".into(),
                note: None,
                exam_track: created.exam_track,
                essay_type: created.essay_type,
                attachment_ids: created.attachment_ids.clone(),
            },
            LATER,
        )
        .unwrap();
        assert_eq!(saved.version, 2);
        let completed = complete_attempt(&mut connection, saved.id.clone(), 2, DONE).unwrap();
        assert_eq!(completed.status, AttemptStatus::Completed);
        assert_eq!(completed.completed_at.as_deref(), Some(DONE));
        assert_eq!(
            complete_attempt(&mut connection, saved.id.clone(), 2, DONE)
                .unwrap_err()
                .code(),
            "ESSAY_VERSION_CONFLICT"
        );

        let copied = copy_attempt(&mut connection, &saved.id, "Copy", DONE).unwrap();
        assert_eq!(copied.status, AttemptStatus::Draft);
        assert_eq!(copied.body, "First draft");
        assert_eq!(copied.title, "Copy");
    }

    #[test]
    fn validates_dictation_source_and_essay_image_limits() {
        let mut connection = setup();
        let source = create_essay(
            &mut connection,
            CreateEssayInput {
                title: "Model".into(),
                body: "I study every day.".into(),
                translation: None,
                exam_track: Some(ExamTrack::English1),
                essay_type: EssayType::Small,
                source: None,
                note: None,
                category: None,
                expressions: vec![],
                tags: vec![],
                source_photo_ids: vec![],
            },
            NOW,
        )
        .unwrap();
        let mut value = independent_input();
        value.mode = AttemptMode::Dictation;
        value.source_essay_id = Some(source.id);
        assert!(create_attempt(&mut connection, value, NOW).is_ok());

        let mut missing = independent_input();
        missing.mode = AttemptMode::Dictation;
        assert_eq!(
            create_attempt(&mut connection, missing, NOW)
                .unwrap_err()
                .code(),
            "ESSAY_INVALID"
        );

        attachment(&connection, "pdf", "application/pdf", 100);
        let mut invalid = independent_input();
        invalid.attachment_ids = vec!["pdf".into()];
        assert_eq!(
            create_attempt(&mut connection, invalid, NOW)
                .unwrap_err()
                .code(),
            "ESSAY_INVALID"
        );

        attachment(&connection, "huge", "image/jpeg", 10 * 1024 * 1024 + 1);
        let mut huge = independent_input();
        huge.attachment_ids = vec!["huge".into()];
        assert_eq!(
            create_attempt(&mut connection, huge, NOW)
                .unwrap_err()
                .code(),
            "ESSAY_INVALID"
        );
    }

    #[test]
    fn compares_dictation_and_pages_history_stably() {
        let comparison = compare_dictation("I study every day.", "I study each day.").unwrap();
        assert!(comparison.changed_segments >= 1);
        assert!(!comparison.changes.is_empty());

        let mut connection = setup();
        for index in 0..12 {
            let mut input = independent_input();
            input.title = format!("Draft {index:02}");
            create_attempt(
                &mut connection,
                input,
                &format!("2026-09-25T03:{index:02}:00Z"),
            )
            .unwrap();
        }
        let first = list_attempts(&connection, None, 10).unwrap();
        assert_eq!(first.items.len(), 10);
        assert!(first.next_cursor.is_some());
        let second = list_attempts(&connection, first.next_cursor.as_deref(), 10).unwrap();
        assert_eq!(second.items.len(), 2);
        assert_ne!(first.items[0].id, second.items[0].id);
    }
}
