use chrono::Utc;
use rusqlite::Connection;

use crate::commands::data_commands::{run_blocking, DataState};
use crate::data::attachments;
use crate::data::error::DataError;
use crate::data::essays::attempts;
use crate::data::essays::import_drafts::{self, EssayImportDraft, UpdateEssayImportDraftInput};
use crate::data::essays::models::{
    AttemptDetail, AttemptListPage, CreateAttemptInput, CreateEssayInput, DictationComparison,
    EssayDetail, EssayListPage, EssayListQuery, EssaySummary, UpdateAttemptInput, UpdateEssayInput,
};
use crate::data::essays::repository;

fn read<T>(
    state: &DataState,
    operation: impl FnOnce(&Connection) -> Result<T, DataError>,
) -> Result<T, DataError> {
    let _guard = state.manager().lock_operation()?;
    state.manager().with_connection(operation)
}

fn write<T>(
    state: &DataState,
    operation: impl FnOnce(&mut Connection) -> Result<T, DataError>,
) -> Result<T, DataError> {
    let _guard = state.manager().lock_operation()?;
    state.manager().with_connection_mut(operation)
}

fn create_essay_inner(
    state: &DataState,
    input: CreateEssayInput,
    now: &str,
) -> Result<EssayDetail, DataError> {
    write(state, |connection| {
        repository::create_essay(connection, input, now)
    })
}

fn get_essay_inner(state: &DataState, id: &str) -> Result<EssayDetail, DataError> {
    read(state, |connection| repository::get_essay(connection, id))
}

fn create_essay_import_draft_inner(
    state: &DataState,
    now: &str,
) -> Result<EssayImportDraft, DataError> {
    write(state, |connection| {
        import_drafts::create_draft(connection, now)
    })
}

fn get_essay_import_draft_inner(
    state: &DataState,
    id: &str,
) -> Result<EssayImportDraft, DataError> {
    read(state, |connection| import_drafts::get_draft(connection, id))
}

fn list_essay_import_drafts_inner(state: &DataState) -> Result<Vec<EssayImportDraft>, DataError> {
    read(state, import_drafts::list_drafts)
}

fn add_essay_import_draft_image_inner(
    state: &DataState,
    draft_id: &str,
    version: i64,
    bytes: Vec<u8>,
    media_type: &str,
    now: &str,
) -> Result<EssayImportDraft, DataError> {
    let attachment = attachments::import_private_image_bytes(state.manager(), bytes, media_type)?;
    match write(state, |connection| {
        import_drafts::add_attachment(connection, draft_id, version, &attachment.id, now)
    }) {
        Ok(draft) => Ok(draft),
        Err(error) => {
            let _ = attachments::remove_unreferenced_attachment(state.manager(), &attachment.id);
            Err(error)
        }
    }
}

fn remove_essay_import_draft_image_inner(
    state: &DataState,
    draft_id: &str,
    version: i64,
    attachment_id: &str,
    now: &str,
) -> Result<EssayImportDraft, DataError> {
    let draft = write(state, |connection| {
        import_drafts::remove_attachment(connection, draft_id, version, attachment_id, now)
    })?;
    attachments::remove_unreferenced_attachment(state.manager(), attachment_id)?;
    Ok(draft)
}

fn update_essay_import_draft_inner(
    state: &DataState,
    input: UpdateEssayImportDraftInput,
    now: &str,
) -> Result<EssayImportDraft, DataError> {
    write(state, |connection| {
        import_drafts::update_draft(connection, input, now)
    })
}

fn abandon_essay_import_draft_inner(
    state: &DataState,
    id: &str,
    version: i64,
) -> Result<(), DataError> {
    let attachment_ids = write(state, |connection| {
        import_drafts::abandon_draft(connection, id, version)
    })?;
    for attachment_id in attachment_ids {
        attachments::remove_unreferenced_attachment(state.manager(), &attachment_id)?;
    }
    Ok(())
}

fn complete_essay_import_draft_inner(
    state: &DataState,
    input: UpdateEssayImportDraftInput,
    now: &str,
) -> Result<EssayDetail, DataError> {
    write(state, |connection| {
        let transaction = connection.transaction().map_err(DataError::from)?;
        let draft = import_drafts::update_draft(&transaction, input, now)?;
        let essay = repository::create_essay_in_transaction(
            &transaction,
            CreateEssayInput {
                title: draft.title.clone(),
                body: draft.body.clone(),
                translation: (!draft.translation.trim().is_empty())
                    .then_some(draft.translation.clone()),
                exam_track: draft.exam_track,
                essay_type: draft.essay_type,
                source: Some("照片识别".into()),
                note: None,
                category: None,
                expressions: vec![],
                tags: vec![],
                source_photo_ids: draft.attachment_ids.clone(),
            },
            now,
        )?;
        let removed = transaction
            .execute(
                "DELETE FROM essay_import_drafts WHERE id=?1 AND version=?2",
                rusqlite::params![draft.id, draft.version],
            )
            .map_err(DataError::from)?;
        if removed != 1 {
            return Err(DataError::essay_version_conflict("import draft changed"));
        }
        transaction.commit().map_err(DataError::from)?;
        Ok(essay)
    })
}

#[tauri::command]
pub async fn create_essay_import_draft(
    state: tauri::State<'_, DataState>,
) -> Result<EssayImportDraft, DataError> {
    let state = state.inner().clone();
    run_blocking(move || create_essay_import_draft_inner(&state, &Utc::now().to_rfc3339())).await
}
#[tauri::command]
pub async fn get_essay_import_draft(
    draft_id: String,
    state: tauri::State<'_, DataState>,
) -> Result<EssayImportDraft, DataError> {
    let state = state.inner().clone();
    run_blocking(move || get_essay_import_draft_inner(&state, &draft_id)).await
}
#[tauri::command]
pub async fn list_essay_import_drafts(
    state: tauri::State<'_, DataState>,
) -> Result<Vec<EssayImportDraft>, DataError> {
    let state = state.inner().clone();
    run_blocking(move || list_essay_import_drafts_inner(&state)).await
}
#[tauri::command]
pub async fn add_essay_import_draft_image(
    draft_id: String,
    version: i64,
    bytes: Vec<u8>,
    media_type: String,
    state: tauri::State<'_, DataState>,
) -> Result<EssayImportDraft, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        add_essay_import_draft_image_inner(
            &state,
            &draft_id,
            version,
            bytes,
            &media_type,
            &Utc::now().to_rfc3339(),
        )
    })
    .await
}
#[tauri::command]
pub async fn remove_essay_import_draft_image(
    draft_id: String,
    version: i64,
    attachment_id: String,
    state: tauri::State<'_, DataState>,
) -> Result<EssayImportDraft, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        remove_essay_import_draft_image_inner(
            &state,
            &draft_id,
            version,
            &attachment_id,
            &Utc::now().to_rfc3339(),
        )
    })
    .await
}
#[tauri::command]
pub async fn update_essay_import_draft(
    input: UpdateEssayImportDraftInput,
    state: tauri::State<'_, DataState>,
) -> Result<EssayImportDraft, DataError> {
    let state = state.inner().clone();
    run_blocking(move || update_essay_import_draft_inner(&state, input, &Utc::now().to_rfc3339()))
        .await
}
#[tauri::command]
pub async fn abandon_essay_import_draft(
    draft_id: String,
    version: i64,
    state: tauri::State<'_, DataState>,
) -> Result<(), DataError> {
    let state = state.inner().clone();
    run_blocking(move || abandon_essay_import_draft_inner(&state, &draft_id, version)).await
}
#[tauri::command]
pub async fn complete_essay_import_draft(
    input: UpdateEssayImportDraftInput,
    state: tauri::State<'_, DataState>,
) -> Result<EssayDetail, DataError> {
    let state = state.inner().clone();
    run_blocking(move || complete_essay_import_draft_inner(&state, input, &Utc::now().to_rfc3339()))
        .await
}

#[tauri::command]
pub async fn create_essay(
    input: CreateEssayInput,
    state: tauri::State<'_, DataState>,
) -> Result<EssayDetail, DataError> {
    let state = state.inner().clone();
    run_blocking(move || create_essay_inner(&state, input, &Utc::now().to_rfc3339())).await
}

#[tauri::command]
pub async fn get_essay(
    essay_id: String,
    state: tauri::State<'_, DataState>,
) -> Result<EssayDetail, DataError> {
    let state = state.inner().clone();
    run_blocking(move || get_essay_inner(&state, &essay_id)).await
}

#[tauri::command]
pub async fn list_essays(
    query: EssayListQuery,
    state: tauri::State<'_, DataState>,
) -> Result<EssayListPage, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        read(&state, |connection| {
            repository::list_essays(connection, query)
        })
    })
    .await
}

#[tauri::command]
pub async fn update_essay(
    input: UpdateEssayInput,
    state: tauri::State<'_, DataState>,
) -> Result<EssayDetail, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let now = Utc::now().to_rfc3339();
        write(&state, |connection| {
            repository::update_essay(connection, input, &now)
        })
    })
    .await
}

#[tauri::command]
pub async fn delete_essays(
    essay_ids: Vec<String>,
    state: tauri::State<'_, DataState>,
) -> Result<usize, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let now = Utc::now().to_rfc3339();
        write(&state, |connection| {
            repository::delete_essays(connection, essay_ids, &now)
        })
    })
    .await
}

#[tauri::command]
pub async fn create_essay_attempt(
    input: CreateAttemptInput,
    state: tauri::State<'_, DataState>,
) -> Result<AttemptDetail, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let now = Utc::now().to_rfc3339();
        write(&state, |connection| {
            attempts::create_attempt(connection, input, &now)
        })
    })
    .await
}

#[tauri::command]
pub async fn get_essay_attempt(
    attempt_id: String,
    state: tauri::State<'_, DataState>,
) -> Result<AttemptDetail, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        read(&state, |connection| {
            attempts::get_attempt(connection, &attempt_id)
        })
    })
    .await
}

#[tauri::command]
pub async fn update_essay_attempt(
    input: UpdateAttemptInput,
    state: tauri::State<'_, DataState>,
) -> Result<AttemptDetail, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let now = Utc::now().to_rfc3339();
        write(&state, |connection| {
            attempts::update_attempt(connection, input, &now)
        })
    })
    .await
}

#[tauri::command]
pub async fn complete_essay_attempt(
    attempt_id: String,
    version: i64,
    state: tauri::State<'_, DataState>,
) -> Result<AttemptDetail, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let now = Utc::now().to_rfc3339();
        write(&state, |connection| {
            attempts::complete_attempt(connection, attempt_id, version, &now)
        })
    })
    .await
}

#[tauri::command]
pub async fn copy_essay_attempt(
    source_id: String,
    title: String,
    state: tauri::State<'_, DataState>,
) -> Result<AttemptDetail, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let now = Utc::now().to_rfc3339();
        write(&state, |connection| {
            attempts::copy_attempt(connection, &source_id, &title, &now)
        })
    })
    .await
}

#[tauri::command]
pub async fn list_essay_attempts(
    cursor: Option<String>,
    limit: Option<usize>,
    state: tauri::State<'_, DataState>,
) -> Result<AttemptListPage, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        read(&state, |connection| {
            attempts::list_attempts(connection, cursor.as_deref(), limit.unwrap_or(20))
        })
    })
    .await
}

#[tauri::command]
pub async fn compare_essay_dictation(
    expected: String,
    actual: String,
) -> Result<DictationComparison, DataError> {
    attempts::compare_dictation(&expected, &actual)
}

#[tauri::command]
pub async fn get_essay_summary(
    state: tauri::State<'_, DataState>,
) -> Result<EssaySummary, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        read(&state, |connection| {
            let essay_count = connection
                .query_row(
                    "SELECT count(*) FROM essays WHERE deleted_at IS NULL",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(|error| DataError::essay_operation_failed(error.to_string()))?;
            let draft_count = connection.query_row(
                "SELECT count(*) FROM essay_attempts WHERE deleted_at IS NULL AND status='draft'",
                [],
                |row| row.get::<_, i64>(0),
            ).map_err(|error| DataError::essay_operation_failed(error.to_string()))?;
            let writing_count = connection
                .query_row(
                    "SELECT count(*) FROM essay_attempts WHERE deleted_at IS NULL",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(|error| DataError::essay_operation_failed(error.to_string()))?;
            let last_ai_review_at = connection
                .query_row("SELECT max(created_at) FROM essay_ai_reviews", [], |row| {
                    row.get::<_, Option<String>>(0)
                })
                .map_err(|error| DataError::essay_operation_failed(error.to_string()))?;
            Ok(EssaySummary {
                essay_count: essay_count as u64,
                draft_count: draft_count as u64,
                writing_count: writing_count as u64,
                last_ai_review_at,
            })
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use crate::commands::data_commands::DataState;
    use crate::data::database::DatabaseManager;
    use crate::data::essays::models::{CreateEssayInput, EssayType};
    use crate::data::paths::DataPaths;

    use super::*;

    #[test]
    fn command_layer_persists_and_completes_an_essay_import_draft() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let state = DataState::new(DatabaseManager::open(paths).unwrap());
        let created = create_essay_import_draft_inner(&state, "2026-10-04T08:00:00Z").unwrap();
        let with_image = add_essay_import_draft_image_inner(
            &state,
            &created.id,
            created.version,
            b"\x89PNG\r\n\x1a\npage".to_vec(),
            "image/png",
            "2026-10-04T08:01:00Z",
        )
        .unwrap();
        assert_eq!(with_image.attachment_ids.len(), 1);

        let reviewed = update_essay_import_draft_inner(
            &state,
            import_drafts::UpdateEssayImportDraftInput {
                id: created.id.clone(),
                version: with_image.version,
                stage: import_drafts::EssayImportDraftStage::Review,
                title: "A letter".into(),
                body: "Dear Sir or Madam".into(),
                translation: "尊敬的先生或女士".into(),
                exam_track: None,
                essay_type: EssayType::Small,
                last_error: None,
            },
            "2026-10-04T08:02:00Z",
        )
        .unwrap();
        let essay = complete_essay_import_draft_inner(
            &state,
            import_drafts::UpdateEssayImportDraftInput {
                id: reviewed.id.clone(),
                version: reviewed.version,
                stage: reviewed.stage,
                title: reviewed.title,
                body: reviewed.body,
                translation: reviewed.translation,
                exam_track: reviewed.exam_track,
                essay_type: reviewed.essay_type,
                last_error: None,
            },
            "2026-10-04T08:03:00Z",
        )
        .unwrap();

        assert_eq!(essay.title, "A letter");
        assert_eq!(essay.source_photo_ids.len(), 1);
        assert!(list_essay_import_drafts_inner(&state).unwrap().is_empty());
    }

    #[test]
    fn failed_essay_completion_rolls_back_the_draft_update() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let state = DataState::new(DatabaseManager::open(paths).unwrap());
        let created = create_essay_import_draft_inner(&state, "2026-10-04T08:00:00Z").unwrap();
        let with_image = add_essay_import_draft_image_inner(
            &state,
            &created.id,
            created.version,
            b"\x89PNG\r\n\x1a\npage".to_vec(),
            "image/png",
            "2026-10-04T08:01:00Z",
        )
        .unwrap();
        state
            .manager()
            .with_connection_mut(|connection| {
                connection
                    .execute_batch(
                        "CREATE TRIGGER fail_essay_insert BEFORE INSERT ON essays
                 BEGIN SELECT RAISE(ABORT, 'forced essay failure'); END;",
                    )
                    .map_err(DataError::from)
            })
            .unwrap();

        let result = complete_essay_import_draft_inner(
            &state,
            import_drafts::UpdateEssayImportDraftInput {
                id: with_image.id.clone(),
                version: with_image.version,
                stage: import_drafts::EssayImportDraftStage::Review,
                title: "Must roll back".into(),
                body: "Essay body".into(),
                translation: String::new(),
                exam_track: None,
                essay_type: EssayType::Small,
                last_error: None,
            },
            "2026-10-04T08:02:00Z",
        );

        assert!(result.is_err());
        let reopened = get_essay_import_draft_inner(&state, &with_image.id).unwrap();
        assert_eq!(reopened.version, with_image.version);
        assert_eq!(reopened.stage, import_drafts::EssayImportDraftStage::Draft);
        assert!(reopened.title.is_empty());
        assert_eq!(reopened.attachment_ids, with_image.attachment_ids);
    }

    #[test]
    fn failed_or_removed_draft_images_leave_no_managed_attachment() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let state = DataState::new(DatabaseManager::open(paths.clone()).unwrap());
        let created = create_essay_import_draft_inner(&state, "2026-10-04T08:00:00Z").unwrap();

        let stale = add_essay_import_draft_image_inner(
            &state,
            &created.id,
            created.version + 10,
            b"\x89PNG\r\n\x1a\nstale".to_vec(),
            "image/png",
            "2026-10-04T08:01:00Z",
        );
        assert!(stale.is_err());
        let after_failed: i64 = state
            .manager()
            .with_connection(|connection| {
                connection
                    .query_row("SELECT count(*) FROM attachments", [], |row| row.get(0))
                    .map_err(DataError::from)
            })
            .unwrap();
        assert_eq!(after_failed, 0);
        assert_eq!(
            std::fs::read_dir(&paths.attachments_dir).unwrap().count(),
            0
        );

        let with_image = add_essay_import_draft_image_inner(
            &state,
            &created.id,
            created.version,
            b"\x89PNG\r\n\x1a\nremove".to_vec(),
            "image/png",
            "2026-10-04T08:02:00Z",
        )
        .unwrap();
        let attachment_id = with_image.attachment_ids[0].clone();
        let after_remove = remove_essay_import_draft_image_inner(
            &state,
            &with_image.id,
            with_image.version,
            &attachment_id,
            "2026-10-04T08:03:00Z",
        )
        .unwrap();

        let remaining: i64 = state
            .manager()
            .with_connection(|connection| {
                connection
                    .query_row(
                        "SELECT count(*) FROM attachments WHERE id=?1",
                        [&attachment_id],
                        |row| row.get(0),
                    )
                    .map_err(DataError::from)
            })
            .unwrap();
        assert_eq!(remaining, 0);
        assert_eq!(
            std::fs::read_dir(&paths.attachments_dir).unwrap().count(),
            0
        );

        let before_abandon = add_essay_import_draft_image_inner(
            &state,
            &after_remove.id,
            after_remove.version,
            b"\x89PNG\r\n\x1a\nabandon".to_vec(),
            "image/png",
            "2026-10-04T08:04:00Z",
        )
        .unwrap();
        let abandoned_id = before_abandon.attachment_ids[0].clone();
        abandon_essay_import_draft_inner(&state, &before_abandon.id, before_abandon.version)
            .unwrap();
        let abandoned_remaining: i64 = state
            .manager()
            .with_connection(|connection| {
                connection
                    .query_row(
                        "SELECT count(*) FROM attachments WHERE id=?1",
                        [&abandoned_id],
                        |row| row.get(0),
                    )
                    .map_err(DataError::from)
            })
            .unwrap();
        assert_eq!(abandoned_remaining, 0);
        assert_eq!(
            std::fs::read_dir(&paths.attachments_dir).unwrap().count(),
            0
        );
    }

    #[test]
    fn command_layer_creates_and_reads_an_essay() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let state = DataState::new(DatabaseManager::open(paths).unwrap());
        let created = create_essay_inner(
            &state,
            CreateEssayInput {
                title: "A letter".into(),
                body: "Dear Sir or Madam".into(),
                translation: None,
                exam_track: None,
                essay_type: EssayType::Small,
                source: None,
                note: None,
                category: Some("书信".into()),
                expressions: vec![],
                tags: vec!["模板".into()],
                source_photo_ids: vec![],
            },
            "2026-09-26T00:00:00Z",
        )
        .unwrap();

        let loaded = get_essay_inner(&state, &created.id).unwrap();
        assert_eq!(loaded.title, "A letter");
        assert_eq!(loaded.category.unwrap().name, "书信");
    }
}
