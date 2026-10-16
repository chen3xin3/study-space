use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use uuid::Uuid;

use crate::data::error::DataError;
use crate::data::vocabulary::import_models::{
    ImportCandidate, ImportConfidence, ImportImage, ImportResolution, ImportSessionDetail,
    ImportStatus, RecognizedCandidate, UpdateImportCandidateInput,
};

pub const MAX_IMPORT_IMAGES: usize = 4;
pub const MAX_IMPORT_IMAGE_BYTES: i64 = 10 * 1024 * 1024;
pub const MAX_IMPORT_CANDIDATES: usize = 100;
const MAX_WORD_CHARS: usize = 100;
const MAX_NOTE_CHARS: usize = 2_000;

pub fn create_session(
    connection: &mut Connection,
    attachment_ids: Vec<String>,
    now: &str,
) -> Result<ImportSessionDetail, DataError> {
    if attachment_ids.is_empty() || attachment_ids.len() > MAX_IMPORT_IMAGES {
        return Err(DataError::vocabulary_import_invalid(
            "photo import requires one to four images",
        ));
    }
    let unique: HashSet<_> = attachment_ids.iter().collect();
    if unique.len() != attachment_ids.len() || attachment_ids.iter().any(|id| id.trim().is_empty())
    {
        return Err(DataError::vocabulary_import_invalid(
            "image ids must be unique and non-empty",
        ));
    }
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(import_error)?;
    for id in &attachment_ids {
        let record = transaction
            .query_row(
                "SELECT media_type, byte_size FROM attachments
                 WHERE id=?1 AND deleted_at IS NULL",
                [id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
            )
            .optional()
            .map_err(import_error)?
            .ok_or_else(|| {
                DataError::vocabulary_import_invalid(format!("image {id} is unavailable"))
            })?;
        if !matches!(record.0.as_str(), "image/png" | "image/jpeg" | "image/webp")
            || record.1 <= 0
            || record.1 > MAX_IMPORT_IMAGE_BYTES
        {
            return Err(DataError::vocabulary_import_invalid(format!(
                "image {id} has an unsupported type or size"
            )));
        }
    }
    let id = Uuid::new_v4().to_string();
    transaction
        .execute(
            "INSERT INTO vocabulary_import_sessions
             (id, status, created_at, updated_at, version)
             VALUES (?1, 'draft', ?2, ?2, 1)",
            params![id, now],
        )
        .map_err(import_error)?;
    for (index, attachment_id) in attachment_ids.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO vocabulary_import_images
                 (session_id, attachment_id, sort_order, rotation_degrees)
                 VALUES (?1, ?2, ?3, 0)",
                params![id, attachment_id, index as i64],
            )
            .map_err(import_error)?;
    }
    let detail = get_session(&transaction, &id)?;
    transaction.commit().map_err(import_error)?;
    Ok(detail)
}

pub fn get_session(connection: &Connection, id: &str) -> Result<ImportSessionDetail, DataError> {
    let base = connection
        .query_row(
            "SELECT id, status, error_code, created_at, updated_at, completed_at,
                    deleted_at, version
             FROM vocabulary_import_sessions
             WHERE id=?1 AND deleted_at IS NULL",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, i64>(7)?,
                ))
            },
        )
        .optional()
        .map_err(import_error)?
        .ok_or_else(|| DataError::vocabulary_import_not_found(format!("session {id} not found")))?;

    let mut image_statement = connection
        .prepare(
            "SELECT a.id, a.original_name, a.media_type, a.byte_size,
                    i.sort_order, i.rotation_degrees
             FROM vocabulary_import_images i
             JOIN attachments a ON a.id=i.attachment_id
             WHERE i.session_id=?1 AND a.deleted_at IS NULL
             ORDER BY i.sort_order, a.id",
        )
        .map_err(import_error)?;
    let images = image_statement
        .query_map([id], |row| {
            let byte_size: i64 = row.get(3)?;
            Ok(ImportImage {
                attachment_id: row.get(0)?,
                original_name: row.get(1)?,
                media_type: row.get(2)?,
                byte_size: u64::try_from(byte_size).unwrap_or_default(),
                sort_order: row.get(4)?,
                rotation_degrees: row.get(5)?,
            })
        })
        .map_err(import_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(import_error)?;

    let mut candidate_statement = connection
        .prepare(
            "SELECT id, word, meaning_or_note, confidence, source_attachment_id,
                    source_line, selected, resolution, created_at, updated_at, version
             FROM vocabulary_import_candidates
             WHERE session_id=?1 AND deleted_at IS NULL
             ORDER BY coalesce(source_line, 9223372036854775807), id",
        )
        .map_err(import_error)?;
    let rows = candidate_statement
        .query_map([id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, i64>(10)?,
            ))
        })
        .map_err(import_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(import_error)?;
    let candidates = rows
        .into_iter()
        .map(|row| {
            Ok(ImportCandidate {
                id: row.0,
                word: row.1,
                meaning_or_note: row.2,
                confidence: parse_confidence(&row.3)?,
                source_attachment_id: row.4,
                source_line: row.5,
                selected: row.6 != 0,
                resolution: row.7.as_deref().map(parse_resolution).transpose()?,
                created_at: row.8,
                updated_at: row.9,
                version: row.10,
            })
        })
        .collect::<Result<Vec<_>, DataError>>()?;

    Ok(ImportSessionDetail {
        id: base.0,
        status: parse_status(&base.1)?,
        error_code: base.2,
        images,
        candidates,
        created_at: base.3,
        updated_at: base.4,
        completed_at: base.5,
        deleted_at: base.6,
        version: base.7,
    })
}

pub fn list_open_sessions(connection: &Connection) -> Result<Vec<ImportSessionDetail>, DataError> {
    let mut statement = connection
        .prepare(
            "SELECT id FROM vocabulary_import_sessions
             WHERE deleted_at IS NULL AND status != 'completed'
             ORDER BY updated_at DESC, id",
        )
        .map_err(import_error)?;
    let ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(import_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(import_error)?;
    ids.into_iter()
        .map(|id| get_session(connection, &id))
        .collect()
}

pub fn set_recognizing(
    connection: &mut Connection,
    id: &str,
    version: i64,
    now: &str,
) -> Result<ImportSessionDetail, DataError> {
    update_session_state(connection, id, version, "recognizing", None, now)
}

pub fn mark_failed(
    connection: &mut Connection,
    id: &str,
    version: i64,
    error_code: &str,
    now: &str,
) -> Result<ImportSessionDetail, DataError> {
    update_session_state(connection, id, version, "failed", Some(error_code), now)
}

fn update_session_state(
    connection: &mut Connection,
    id: &str,
    version: i64,
    status: &str,
    error_code: Option<&str>,
    now: &str,
) -> Result<ImportSessionDetail, DataError> {
    let changed = connection
        .execute(
            "UPDATE vocabulary_import_sessions
             SET status=?1, error_code=?2, updated_at=?3, version=version+1
             WHERE id=?4 AND version=?5 AND deleted_at IS NULL AND status != 'completed'",
            params![status, error_code, now, id, version],
        )
        .map_err(import_error)?;
    if changed == 0 {
        return conflict_or_missing(connection, id);
    }
    get_session(connection, id)
}

pub fn replace_candidates(
    connection: &mut Connection,
    session_id: &str,
    version: i64,
    candidates: Vec<RecognizedCandidate>,
    now: &str,
) -> Result<ImportSessionDetail, DataError> {
    if candidates.len() > MAX_IMPORT_CANDIDATES {
        return Err(DataError::vocabulary_import_invalid(
            "recognition returned more than 100 candidates",
        ));
    }
    for candidate in &candidates {
        validate_candidate(
            &candidate.word,
            candidate.meaning_or_note.as_deref(),
            candidate.line,
        )?;
    }
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(import_error)?;
    let session = get_session(&transaction, session_id)?;
    if session.version != version {
        return Err(DataError::vocabulary_import_conflict(
            "session version changed before recognition completed",
        ));
    }
    transaction
        .execute(
            "UPDATE vocabulary_import_candidates
             SET deleted_at=?1, updated_at=?1, version=version+1
             WHERE session_id=?2 AND deleted_at IS NULL",
            params![now, session_id],
        )
        .map_err(import_error)?;
    for candidate in candidates {
        let source_attachment_id = session
            .images
            .get(candidate.image_index)
            .ok_or_else(|| {
                DataError::vocabulary_import_invalid("candidate image index is out of range")
            })?
            .attachment_id
            .clone();
        transaction
            .execute(
                "INSERT INTO vocabulary_import_candidates
                 (id, session_id, word, meaning_or_note, confidence, source_attachment_id,
                  source_line, selected, created_at, updated_at, version)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,1,?8,?8,1)",
                params![
                    Uuid::new_v4().to_string(),
                    session_id,
                    candidate.word.trim(),
                    clean_optional(candidate.meaning_or_note),
                    confidence_db(candidate.confidence),
                    source_attachment_id,
                    candidate.line,
                    now,
                ],
            )
            .map_err(import_error)?;
    }
    let changed = transaction
        .execute(
            "UPDATE vocabulary_import_sessions
             SET status='reviewing', error_code=NULL, updated_at=?1, version=version+1
             WHERE id=?2 AND version=?3 AND deleted_at IS NULL",
            params![now, session_id, version],
        )
        .map_err(import_error)?;
    if changed == 0 {
        return Err(DataError::vocabulary_import_conflict(
            "session changed while candidates were saved",
        ));
    }
    let detail = get_session(&transaction, session_id)?;
    transaction.commit().map_err(import_error)?;
    Ok(detail)
}

pub fn update_candidate(
    connection: &mut Connection,
    input: UpdateImportCandidateInput,
    now: &str,
) -> Result<ImportCandidate, DataError> {
    validate_candidate(&input.word, input.meaning_or_note.as_deref(), None)?;
    let changed = connection
        .execute(
            "UPDATE vocabulary_import_candidates
             SET word=?1, meaning_or_note=?2, confidence=?3, selected=?4,
                 resolution=?5, updated_at=?6, version=version+1
             WHERE id=?7 AND version=?8 AND deleted_at IS NULL",
            params![
                input.word.trim(),
                clean_optional(input.meaning_or_note),
                confidence_db(input.confidence),
                i64::from(input.selected),
                input.resolution.map(resolution_db),
                now,
                input.id,
                input.version,
            ],
        )
        .map_err(import_error)?;
    if changed == 0 {
        let exists = connection
            .query_row(
                "SELECT 1 FROM vocabulary_import_candidates
                 WHERE id=?1 AND deleted_at IS NULL",
                [&input.id],
                |_| Ok(()),
            )
            .optional()
            .map_err(import_error)?
            .is_some();
        return Err(if exists {
            DataError::vocabulary_import_conflict("candidate version changed")
        } else {
            DataError::vocabulary_import_not_found("candidate not found")
        });
    }
    get_candidate(connection, &input.id)
}

pub fn rotate_image(
    connection: &mut Connection,
    session_id: &str,
    attachment_id: &str,
    version: i64,
    rotation_degrees: i64,
    now: &str,
) -> Result<ImportSessionDetail, DataError> {
    if !matches!(rotation_degrees, 0 | 90 | 180 | 270) {
        return Err(DataError::vocabulary_import_invalid(
            "rotation must be 0, 90, 180, or 270",
        ));
    }
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(import_error)?;
    let changed = transaction
        .execute(
            "UPDATE vocabulary_import_sessions
             SET updated_at=?1, version=version+1
             WHERE id=?2 AND version=?3 AND deleted_at IS NULL AND status != 'completed'",
            params![now, session_id, version],
        )
        .map_err(import_error)?;
    if changed == 0 {
        return Err(DataError::vocabulary_import_conflict(
            "session changed before image rotation",
        ));
    }
    let image_changed = transaction
        .execute(
            "UPDATE vocabulary_import_images SET rotation_degrees=?1
             WHERE session_id=?2 AND attachment_id=?3",
            params![rotation_degrees, session_id, attachment_id],
        )
        .map_err(import_error)?;
    if image_changed == 0 {
        return Err(DataError::vocabulary_import_invalid(
            "image is not part of this session",
        ));
    }
    let detail = get_session(&transaction, session_id)?;
    transaction.commit().map_err(import_error)?;
    Ok(detail)
}

pub fn delete_session(
    connection: &mut Connection,
    id: &str,
    version: i64,
    now: &str,
) -> Result<(), DataError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(import_error)?;
    let changed = transaction
        .execute(
            "UPDATE vocabulary_import_sessions
             SET deleted_at=?1, updated_at=?1, version=version+1
             WHERE id=?2 AND version=?3 AND deleted_at IS NULL",
            params![now, id, version],
        )
        .map_err(import_error)?;
    if changed == 0 {
        return conflict_or_missing(&transaction, id);
    }
    transaction
        .execute(
            "UPDATE vocabulary_import_candidates
             SET deleted_at=?1, updated_at=?1, version=version+1
             WHERE session_id=?2 AND deleted_at IS NULL",
            params![now, id],
        )
        .map_err(import_error)?;
    transaction.commit().map_err(import_error)
}

fn get_candidate(connection: &Connection, id: &str) -> Result<ImportCandidate, DataError> {
    let row = connection
        .query_row(
            "SELECT id, word, meaning_or_note, confidence, source_attachment_id,
                    source_line, selected, resolution, created_at, updated_at, version
             FROM vocabulary_import_candidates
             WHERE id=?1 AND deleted_at IS NULL",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, i64>(10)?,
                ))
            },
        )
        .optional()
        .map_err(import_error)?
        .ok_or_else(|| DataError::vocabulary_import_not_found("candidate not found"))?;
    Ok(ImportCandidate {
        id: row.0,
        word: row.1,
        meaning_or_note: row.2,
        confidence: parse_confidence(&row.3)?,
        source_attachment_id: row.4,
        source_line: row.5,
        selected: row.6 != 0,
        resolution: row.7.as_deref().map(parse_resolution).transpose()?,
        created_at: row.8,
        updated_at: row.9,
        version: row.10,
    })
}

fn conflict_or_missing<T>(connection: &Connection, id: &str) -> Result<T, DataError> {
    let exists = connection
        .query_row(
            "SELECT 1 FROM vocabulary_import_sessions
             WHERE id=?1 AND deleted_at IS NULL",
            [id],
            |_| Ok(()),
        )
        .optional()
        .map_err(import_error)?
        .is_some();
    Err(if exists {
        DataError::vocabulary_import_conflict("session version changed")
    } else {
        DataError::vocabulary_import_not_found("session not found")
    })
}

fn validate_candidate(
    word: &str,
    meaning_or_note: Option<&str>,
    line: Option<i64>,
) -> Result<(), DataError> {
    let word_length = word.trim().chars().count();
    if word_length == 0
        || word_length > MAX_WORD_CHARS
        || word.chars().any(char::is_control)
        || meaning_or_note.is_some_and(|value| value.chars().count() > MAX_NOTE_CHARS)
        || line.is_some_and(|value| value < 0)
    {
        return Err(DataError::vocabulary_import_invalid(
            "candidate fields are outside accepted limits",
        ));
    }
    Ok(())
}

fn clean_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn parse_status(value: &str) -> Result<ImportStatus, DataError> {
    match value {
        "draft" => Ok(ImportStatus::Draft),
        "recognizing" => Ok(ImportStatus::Recognizing),
        "reviewing" => Ok(ImportStatus::Reviewing),
        "completed" => Ok(ImportStatus::Completed),
        "failed" => Ok(ImportStatus::Failed),
        _ => Err(DataError::vocabulary_import_invalid(format!(
            "unknown import status {value}"
        ))),
    }
}

fn confidence_db(value: ImportConfidence) -> &'static str {
    match value {
        ImportConfidence::Confident => "confident",
        ImportConfidence::Uncertain => "uncertain",
    }
}

fn parse_confidence(value: &str) -> Result<ImportConfidence, DataError> {
    match value {
        "confident" => Ok(ImportConfidence::Confident),
        "uncertain" => Ok(ImportConfidence::Uncertain),
        _ => Err(DataError::vocabulary_import_invalid(format!(
            "unknown confidence {value}"
        ))),
    }
}

fn resolution_db(value: ImportResolution) -> &'static str {
    match value {
        ImportResolution::Create => "create",
        ImportResolution::EncounterOnly => "encounter_only",
        ImportResolution::AppendMeaning => "append_meaning",
        ImportResolution::RestoreAndAppend => "restore_and_append",
        ImportResolution::Skip => "skip",
    }
}

fn parse_resolution(value: &str) -> Result<ImportResolution, DataError> {
    match value {
        "create" => Ok(ImportResolution::Create),
        "encounter_only" => Ok(ImportResolution::EncounterOnly),
        "append_meaning" => Ok(ImportResolution::AppendMeaning),
        "restore_and_append" => Ok(ImportResolution::RestoreAndAppend),
        "skip" => Ok(ImportResolution::Skip),
        _ => Err(DataError::vocabulary_import_invalid(format!(
            "unknown import resolution {value}"
        ))),
    }
}

fn import_error(error: rusqlite::Error) -> DataError {
    DataError::vocabulary_operation_failed(error.to_string())
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    use super::*;
    use crate::data::migrations::migrate;
    use crate::data::vocabulary::import_models::{
        ImportConfidence, ImportStatus, RecognizedCandidate, UpdateImportCandidateInput,
    };

    const NOW: &str = "2026-09-26T01:00:00Z";
    const LATER: &str = "2026-09-26T02:00:00Z";

    fn setup() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        migrate(&mut connection).unwrap();
        connection
    }

    fn attachment(connection: &Connection, id: &str, media_type: &str, bytes: i64) {
        connection
            .execute(
                "INSERT INTO attachments
                 (id, original_name, stored_name, media_type, byte_size, sha256,
                  created_at, updated_at, version)
                 VALUES (?1, ?2, ?2, ?3, ?4, 'hash', ?5, ?5, 1)",
                params![id, format!("{id}.png"), media_type, bytes, NOW],
            )
            .unwrap();
    }

    #[test]
    fn creates_rotates_and_restores_an_open_session() {
        let mut connection = setup();
        attachment(&connection, "image-1", "image/png", 1_024);
        let created = create_session(&mut connection, vec!["image-1".into()], NOW).unwrap();
        assert_eq!(created.status, ImportStatus::Draft);
        assert_eq!(created.images.len(), 1);
        assert_eq!(created.images[0].rotation_degrees, 0);

        let rotated = rotate_image(
            &mut connection,
            &created.id,
            "image-1",
            created.version,
            90,
            LATER,
        )
        .unwrap();
        assert_eq!(rotated.images[0].rotation_degrees, 90);
        assert_eq!(list_open_sessions(&connection).unwrap().len(), 1);
        assert_eq!(get_session(&connection, &created.id).unwrap(), rotated);
    }

    #[test]
    fn replaces_and_updates_candidates_with_optimistic_versions() {
        let mut connection = setup();
        attachment(&connection, "image-1", "image/jpeg", 2_048);
        let created = create_session(&mut connection, vec!["image-1".into()], NOW).unwrap();
        let recognizing =
            set_recognizing(&mut connection, &created.id, created.version, LATER).unwrap();
        let reviewing = replace_candidates(
            &mut connection,
            &created.id,
            recognizing.version,
            vec![RecognizedCandidate {
                word: "persist".into(),
                meaning_or_note: Some("坚持".into()),
                confidence: ImportConfidence::Uncertain,
                image_index: 0,
                line: Some(1),
            }],
            LATER,
        )
        .unwrap();
        assert_eq!(reviewing.status, ImportStatus::Reviewing);
        let candidate = &reviewing.candidates[0];
        let updated = update_candidate(
            &mut connection,
            UpdateImportCandidateInput {
                id: candidate.id.clone(),
                version: candidate.version,
                word: "persist".into(),
                meaning_or_note: Some("坚持；持续".into()),
                confidence: ImportConfidence::Confident,
                selected: true,
                resolution: None,
            },
            LATER,
        )
        .unwrap();
        assert_eq!(updated.meaning_or_note.as_deref(), Some("坚持；持续"));
        assert_eq!(
            update_candidate(
                &mut connection,
                UpdateImportCandidateInput {
                    id: updated.id.clone(),
                    version: 1,
                    word: updated.word,
                    meaning_or_note: updated.meaning_or_note,
                    confidence: updated.confidence,
                    selected: updated.selected,
                    resolution: updated.resolution,
                },
                LATER,
            )
            .unwrap_err()
            .code(),
            "VOCABULARY_IMPORT_CONFLICT"
        );
    }

    #[test]
    fn validates_images_and_soft_deletes_sessions() {
        let mut connection = setup();
        attachment(&connection, "pdf", "application/pdf", 100);
        assert_eq!(
            create_session(&mut connection, vec!["pdf".into()], NOW)
                .unwrap_err()
                .code(),
            "VOCABULARY_IMPORT_INVALID"
        );
        attachment(&connection, "huge", "image/webp", 10 * 1024 * 1024 + 1);
        assert_eq!(
            create_session(&mut connection, vec!["huge".into()], NOW)
                .unwrap_err()
                .code(),
            "VOCABULARY_IMPORT_INVALID"
        );

        attachment(&connection, "image-1", "image/png", 100);
        let created = create_session(&mut connection, vec!["image-1".into()], NOW).unwrap();
        delete_session(&mut connection, &created.id, created.version, LATER).unwrap();
        assert!(list_open_sessions(&connection).unwrap().is_empty());
        assert_eq!(
            get_session(&connection, &created.id).unwrap_err().code(),
            "VOCABULARY_IMPORT_NOT_FOUND"
        );
    }
}
