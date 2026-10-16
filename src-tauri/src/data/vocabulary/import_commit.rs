use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};

use crate::data::error::DataError;
use crate::data::vocabulary::import_models::{
    BatchImportInput, BatchImportResult, DuplicatePreview, ImportConfidence, ImportResolution,
    ImportStatus,
};
use crate::data::vocabulary::import_repository;
use crate::data::vocabulary::models::{
    CreateWordInput, CreateWordOutcome, DuplicateResolution, ResolveDuplicateInput,
};
use crate::data::vocabulary::normalize::normalize_word;
use crate::data::vocabulary::repository;

const MAX_BATCH_ITEMS: usize = 100;

pub fn preview_duplicates(
    connection: &Connection,
    session_id: &str,
) -> Result<Vec<DuplicatePreview>, DataError> {
    let session = import_repository::get_session(connection, session_id)?;
    let selected: Vec<_> = session
        .candidates
        .iter()
        .filter(|candidate| candidate.selected)
        .collect();
    let mut groups: HashMap<String, Vec<String>> = HashMap::new();
    for candidate in &selected {
        groups
            .entry(normalize_word(&candidate.word))
            .or_default()
            .push(candidate.id.clone());
    }

    selected
        .into_iter()
        .map(|candidate| {
            let normalized = normalize_word(&candidate.word);
            let existing = connection
                .query_row(
                    "SELECT id, deleted_at IS NOT NULL FROM words
                     WHERE normalized_text=?1
                     ORDER BY deleted_at IS NULL DESC, created_at ASC LIMIT 1",
                    [&normalized],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? != 0)),
                )
                .optional()
                .map_err(import_error)?;
            let existing_meanings = if let Some((id, _)) = &existing {
                let mut statement = connection
                    .prepare(
                        "SELECT meaning FROM word_meanings
                         WHERE word_id=?1 AND deleted_at IS NULL ORDER BY created_at, id",
                    )
                    .map_err(import_error)?;
                let meanings = statement
                    .query_map([id], |row| row.get::<_, String>(0))
                    .map_err(import_error)?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(import_error)?;
                meanings
            } else {
                vec![]
            };
            Ok(DuplicatePreview {
                candidate_id: candidate.id.clone(),
                word: candidate.word.clone(),
                existing_word_id: existing.as_ref().map(|value| value.0.clone()),
                existing_deleted: existing.as_ref().is_some_and(|value| value.1),
                existing_meanings,
                same_batch_candidate_ids: groups
                    .get(&normalized)
                    .into_iter()
                    .flatten()
                    .filter(|id| *id != &candidate.id)
                    .cloned()
                    .collect(),
            })
        })
        .collect()
}

pub fn commit_import(
    connection: &mut Connection,
    input: BatchImportInput,
    occurred_at: &str,
    initial_review_at: &str,
) -> Result<BatchImportResult, DataError> {
    if input.items.is_empty() || input.items.len() > MAX_BATCH_ITEMS {
        return Err(DataError::vocabulary_import_invalid(
            "batch must contain one to 100 candidates",
        ));
    }
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(import_error)?;
    let session = import_repository::get_session(&transaction, &input.session_id)?;
    if session.status != ImportStatus::Reviewing {
        return Err(DataError::vocabulary_import_invalid(
            "only reviewing sessions can be committed",
        ));
    }
    if session.version != input.version {
        return Err(DataError::vocabulary_import_conflict(
            "session version changed before batch save",
        ));
    }
    let selected: Vec<_> = session
        .candidates
        .iter()
        .filter(|candidate| candidate.selected)
        .collect();
    let supplied_ids: HashSet<_> = input
        .items
        .iter()
        .map(|item| item.candidate_id.as_str())
        .collect();
    if supplied_ids.len() != input.items.len()
        || selected.len() != input.items.len()
        || selected
            .iter()
            .any(|candidate| !supplied_ids.contains(candidate.id.as_str()))
    {
        return Err(DataError::vocabulary_import_invalid(
            "every selected candidate must be resolved exactly once",
        ));
    }

    let mut result = BatchImportResult {
        created: 0,
        appended: 0,
        restored: 0,
        skipped: 0,
        failed: 0,
    };
    for item in &input.items {
        let candidate = session
            .candidates
            .iter()
            .find(|candidate| candidate.id == item.candidate_id)
            .ok_or_else(|| DataError::vocabulary_import_invalid("candidate is not in session"))?;
        if candidate.version != item.candidate_version {
            return Err(DataError::vocabulary_import_conflict(
                "candidate version changed before batch save",
            ));
        }
        if candidate.confidence == ImportConfidence::Uncertain {
            return Err(DataError::vocabulary_import_invalid(
                "uncertain candidates must be confirmed before saving",
            ));
        }
        let normalized = normalize_word(&candidate.word);
        let existing = transaction
            .query_row(
                "SELECT id, deleted_at IS NOT NULL FROM words
                 WHERE normalized_text=?1
                 ORDER BY deleted_at IS NULL DESC, created_at ASC LIMIT 1",
                [&normalized],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? != 0)),
            )
            .optional()
            .map_err(import_error)?;
        let meaning = candidate
            .meaning_or_note
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());

        match item.resolution {
            ImportResolution::Skip => result.skipped += 1,
            ImportResolution::Create => {
                if existing.is_some() {
                    return Err(DataError::vocabulary_import_invalid(
                        "duplicate candidate requires a duplicate resolution",
                    ));
                }
                let meaning = meaning.ok_or_else(|| {
                    DataError::vocabulary_import_invalid("new words require a meaning")
                })?;
                match repository::create_word_in(
                    &transaction,
                    CreateWordInput {
                        word: candidate.word.clone(),
                        meaning: meaning.to_owned(),
                        phonetic: None,
                        part_of_speech: None,
                        example_sentence: None,
                        note: None,
                        tags: item.tags.clone(),
                    },
                    occurred_at,
                    initial_review_at,
                )? {
                    CreateWordOutcome::Created { .. } => result.created += 1,
                    CreateWordOutcome::Duplicate { .. } => {
                        return Err(DataError::vocabulary_import_conflict(
                            "word became a duplicate during batch save",
                        ))
                    }
                }
            }
            ImportResolution::EncounterOnly | ImportResolution::AppendMeaning => {
                let (word_id, deleted) = existing.ok_or_else(|| {
                    DataError::vocabulary_import_invalid("active duplicate was not found")
                })?;
                if deleted {
                    return Err(DataError::vocabulary_import_invalid(
                        "deleted duplicate requires restore resolution",
                    ));
                }
                let resolution = if item.resolution == ImportResolution::EncounterOnly {
                    DuplicateResolution::EncounterOnly
                } else {
                    DuplicateResolution::AppendMeaning {
                        meaning: meaning
                            .ok_or_else(|| {
                                DataError::vocabulary_import_invalid(
                                    "append resolution requires a meaning",
                                )
                            })?
                            .to_owned(),
                    }
                };
                repository::resolve_duplicate_in(
                    &transaction,
                    ResolveDuplicateInput {
                        word_id,
                        resolution,
                    },
                    occurred_at,
                    initial_review_at,
                )?;
                if item.resolution == ImportResolution::AppendMeaning {
                    result.appended += 1;
                } else {
                    result.skipped += 1;
                }
            }
            ImportResolution::RestoreAndAppend => {
                let (word_id, deleted) = existing.ok_or_else(|| {
                    DataError::vocabulary_import_invalid("deleted duplicate was not found")
                })?;
                if !deleted {
                    return Err(DataError::vocabulary_import_invalid(
                        "active duplicate cannot use restore resolution",
                    ));
                }
                repository::resolve_duplicate_in(
                    &transaction,
                    ResolveDuplicateInput {
                        word_id,
                        resolution: DuplicateResolution::RestoreAndAppend {
                            meaning: meaning.map(str::to_owned),
                        },
                    },
                    occurred_at,
                    initial_review_at,
                )?;
                result.restored += 1;
            }
        }
        transaction
            .execute(
                "UPDATE vocabulary_import_candidates
                 SET resolution=?1, updated_at=?2, version=version+1
                 WHERE id=?3 AND version=?4 AND deleted_at IS NULL",
                params![
                    resolution_db(item.resolution),
                    occurred_at,
                    item.candidate_id,
                    item.candidate_version
                ],
            )
            .map_err(import_error)?;
    }
    let changed = transaction
        .execute(
            "UPDATE vocabulary_import_sessions
             SET status='completed', completed_at=?1, updated_at=?1, version=version+1
             WHERE id=?2 AND version=?3 AND status='reviewing' AND deleted_at IS NULL",
            params![occurred_at, input.session_id, input.version],
        )
        .map_err(import_error)?;
    if changed != 1 {
        return Err(DataError::vocabulary_import_conflict(
            "session changed while batch was saved",
        ));
    }
    transaction.commit().map_err(import_error)?;
    Ok(result)
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

fn import_error(error: rusqlite::Error) -> DataError {
    DataError::vocabulary_operation_failed(error.to_string())
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    use super::*;
    use crate::data::migrations::migrate;
    use crate::data::vocabulary::import_models::{
        BatchImportInput, BatchImportItem, ImportConfidence, ImportResolution, RecognizedCandidate,
    };
    use crate::data::vocabulary::import_repository;
    use crate::data::vocabulary::models::{CreateWordInput, CreateWordOutcome};
    use crate::data::vocabulary::repository;

    const NOW: &str = "2026-09-27T03:00:00Z";
    const REVIEW: &str = "2026-09-28T01:00:00Z";

    fn connection() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        migrate(&mut connection).unwrap();
        connection
    }

    fn reviewed_session(
        connection: &mut Connection,
        candidates: Vec<RecognizedCandidate>,
    ) -> crate::data::vocabulary::import_models::ImportSessionDetail {
        connection
            .execute(
                "INSERT INTO attachments
                 (id, original_name, stored_name, media_type, byte_size, sha256,
                  created_at, updated_at, version)
                 VALUES ('image', 'image.png', 'image.png', 'image/png', 10,
                         'hash', ?1, ?1, 1)",
                [NOW],
            )
            .unwrap();
        let draft =
            import_repository::create_session(connection, vec!["image".into()], NOW).unwrap();
        let recognizing =
            import_repository::set_recognizing(connection, &draft.id, draft.version, NOW).unwrap();
        import_repository::replace_candidates(
            connection,
            &draft.id,
            recognizing.version,
            candidates,
            NOW,
        )
        .unwrap()
    }

    fn candidate(
        word: &str,
        meaning: Option<&str>,
        confidence: ImportConfidence,
    ) -> RecognizedCandidate {
        RecognizedCandidate {
            word: word.into(),
            meaning_or_note: meaning.map(str::to_owned),
            confidence,
            image_index: 0,
            line: Some(1),
        }
    }

    fn create_existing(connection: &mut Connection, word: &str, meaning: &str) -> String {
        match repository::create_word(
            connection,
            CreateWordInput {
                word: word.into(),
                meaning: meaning.into(),
                phonetic: None,
                part_of_speech: None,
                example_sentence: None,
                note: None,
                tags: vec![],
            },
            NOW,
            REVIEW,
        )
        .unwrap()
        {
            CreateWordOutcome::Created { word } => word.id,
            _ => unreachable!(),
        }
    }

    #[test]
    fn previews_active_deleted_and_same_batch_duplicates() {
        let mut connection = connection();
        let active_id = create_existing(&mut connection, "persist", "坚持");
        let deleted_id = create_existing(&mut connection, "abandon", "放弃");
        connection
            .execute(
                "UPDATE words SET deleted_at=?1 WHERE id=?2",
                params![NOW, deleted_id],
            )
            .unwrap();
        let session = reviewed_session(
            &mut connection,
            vec![
                candidate("Persist", Some("持续"), ImportConfidence::Confident),
                candidate("abandon", Some("抛弃"), ImportConfidence::Confident),
                candidate("novel", Some("新颖的"), ImportConfidence::Confident),
                candidate(" NOVEL ", Some("小说"), ImportConfidence::Confident),
            ],
        );

        let preview = preview_duplicates(&connection, &session.id).unwrap();
        assert_eq!(preview.len(), 4);
        let persist = preview.iter().find(|item| item.word == "Persist").unwrap();
        let abandon = preview.iter().find(|item| item.word == "abandon").unwrap();
        let novels: Vec<_> = preview
            .iter()
            .filter(|item| normalize_word(&item.word) == "novel")
            .collect();
        assert_eq!(
            persist.existing_word_id.as_deref(),
            Some(active_id.as_str())
        );
        assert!(abandon.existing_deleted);
        assert!(novels
            .iter()
            .all(|item| item.same_batch_candidate_ids.len() == 1));
    }

    #[test]
    fn commits_create_append_restore_and_skip_as_one_batch() {
        let mut connection = connection();
        create_existing(&mut connection, "persist", "坚持");
        let deleted_id = create_existing(&mut connection, "abandon", "放弃");
        connection
            .execute(
                "UPDATE words SET deleted_at=?1 WHERE id=?2",
                params![NOW, deleted_id],
            )
            .unwrap();
        let session = reviewed_session(
            &mut connection,
            vec![
                candidate("novel", Some("新颖的"), ImportConfidence::Confident),
                candidate("persist", Some("持续"), ImportConfidence::Confident),
                candidate("abandon", Some("抛弃"), ImportConfidence::Confident),
                candidate("omit", Some("省略"), ImportConfidence::Confident),
            ],
        );
        let items = session
            .candidates
            .iter()
            .map(|candidate| {
                let resolution = match normalize_word(&candidate.word).as_str() {
                    "novel" => ImportResolution::Create,
                    "persist" => ImportResolution::AppendMeaning,
                    "abandon" => ImportResolution::RestoreAndAppend,
                    "omit" => ImportResolution::Skip,
                    _ => unreachable!(),
                };
                BatchImportItem {
                    candidate_id: candidate.id.clone(),
                    candidate_version: candidate.version,
                    resolution,
                    tags: vec!["照片录入".into()],
                }
            })
            .collect();

        let result = commit_import(
            &mut connection,
            BatchImportInput {
                session_id: session.id.clone(),
                version: session.version,
                items,
            },
            NOW,
            REVIEW,
        )
        .unwrap();

        assert_eq!(
            (
                result.created,
                result.appended,
                result.restored,
                result.skipped
            ),
            (1, 1, 1, 1)
        );
        let completed = import_repository::get_session(&connection, &session.id).unwrap();
        assert_eq!(
            completed.status,
            crate::data::vocabulary::import_models::ImportStatus::Completed
        );
    }

    #[test]
    fn rejects_unconfirmed_items_and_rolls_back_before_completion() {
        let mut connection = connection();
        let session = reviewed_session(
            &mut connection,
            vec![candidate(
                "unclear",
                Some("不清楚"),
                ImportConfidence::Uncertain,
            )],
        );
        let error = commit_import(
            &mut connection,
            BatchImportInput {
                session_id: session.id.clone(),
                version: session.version,
                items: vec![BatchImportItem {
                    candidate_id: session.candidates[0].id.clone(),
                    candidate_version: 1,
                    resolution: ImportResolution::Create,
                    tags: vec![],
                }],
            },
            NOW,
            REVIEW,
        )
        .unwrap_err();
        assert_eq!(error.code(), "VOCABULARY_IMPORT_INVALID");
        let count: i64 = connection
            .query_row(
                "SELECT count(*) FROM words WHERE normalized_text='unclear'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
        assert_eq!(
            import_repository::get_session(&connection, &session.id)
                .unwrap()
                .status,
            crate::data::vocabulary::import_models::ImportStatus::Reviewing
        );
    }
}
