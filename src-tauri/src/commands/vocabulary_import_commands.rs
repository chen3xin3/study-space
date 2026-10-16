use chrono::{Duration, Utc};

use crate::commands::ai_commands::AiState;
use crate::commands::data_commands::{run_blocking, DataState};
use crate::data::attachments;
use crate::data::error::DataError;
use crate::data::models::AttachmentRecord;
use crate::data::vocabulary::import_commit;
use crate::data::vocabulary::import_models::{
    BatchImportInput, BatchImportResult, DuplicatePreview, ImportCandidate, ImportSessionDetail,
    UpdateImportCandidateInput,
};
use crate::data::vocabulary::{import_recognition, import_repository};

fn recognize_inner(
    data: &DataState,
    ai: &AiState,
    session_id: &str,
    version: i64,
) -> Result<ImportSessionDetail, DataError> {
    let prepared = import_recognition::prepare_recognition(data.manager(), session_id, version)?;
    let result =
        import_recognition::call_recognition(prepared.clone(), ai.credentials(), ai.transport());
    import_recognition::finalize_recognition(
        data.manager(),
        &prepared,
        result,
        &Utc::now().to_rfc3339(),
    )
}

#[tauri::command]
pub async fn create_vocabulary_import(
    attachment_ids: Vec<String>,
    state: tauri::State<'_, DataState>,
) -> Result<ImportSessionDetail, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection_mut(|connection| {
            import_repository::create_session(connection, attachment_ids, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn get_vocabulary_import(
    session_id: String,
    state: tauri::State<'_, DataState>,
) -> Result<ImportSessionDetail, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state
            .manager()
            .with_connection(|connection| import_repository::get_session(connection, &session_id))
    })
    .await
}

#[tauri::command]
pub async fn list_open_vocabulary_imports(
    state: tauri::State<'_, DataState>,
) -> Result<Vec<ImportSessionDetail>, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state
            .manager()
            .with_connection(import_repository::list_open_sessions)
    })
    .await
}

#[tauri::command]
pub async fn rotate_vocabulary_import_image(
    session_id: String,
    attachment_id: String,
    version: i64,
    rotation_degrees: i64,
    state: tauri::State<'_, DataState>,
) -> Result<ImportSessionDetail, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection_mut(|connection| {
            import_repository::rotate_image(
                connection,
                &session_id,
                &attachment_id,
                version,
                rotation_degrees,
                &Utc::now().to_rfc3339(),
            )
        })
    })
    .await
}

#[tauri::command]
pub async fn recognize_vocabulary_import(
    session_id: String,
    version: i64,
    data: tauri::State<'_, DataState>,
    ai: tauri::State<'_, AiState>,
) -> Result<ImportSessionDetail, DataError> {
    let data = data.inner().clone();
    let ai = ai.inner().clone();
    run_blocking(move || recognize_inner(&data, &ai, &session_id, version)).await
}

#[tauri::command]
pub async fn retry_vocabulary_import(
    session_id: String,
    version: i64,
    data: tauri::State<'_, DataState>,
    ai: tauri::State<'_, AiState>,
) -> Result<ImportSessionDetail, DataError> {
    recognize_vocabulary_import(session_id, version, data, ai).await
}

#[tauri::command]
pub async fn update_vocabulary_import_candidate(
    input: UpdateImportCandidateInput,
    state: tauri::State<'_, DataState>,
) -> Result<ImportCandidate, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection_mut(|connection| {
            import_repository::update_candidate(connection, input, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn preview_vocabulary_import_duplicates(
    session_id: String,
    state: tauri::State<'_, DataState>,
) -> Result<Vec<DuplicatePreview>, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection(|connection| {
            import_commit::preview_duplicates(connection, &session_id)
        })
    })
    .await
}

#[tauri::command]
pub async fn commit_vocabulary_import(
    input: BatchImportInput,
    state: tauri::State<'_, DataState>,
) -> Result<BatchImportResult, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        let now = Utc::now();
        let review = now + Duration::days(1);
        state.manager().with_connection_mut(|connection| {
            import_commit::commit_import(connection, input, &now.to_rfc3339(), &review.to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn delete_vocabulary_import(
    session_id: String,
    version: i64,
    state: tauri::State<'_, DataState>,
) -> Result<(), DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection_mut(|connection| {
            import_repository::delete_session(
                connection,
                &session_id,
                version,
                &Utc::now().to_rfc3339(),
            )
        })
    })
    .await
}

#[tauri::command]
pub async fn import_clipboard_image(
    bytes: Vec<u8>,
    media_type: String,
    state: tauri::State<'_, DataState>,
) -> Result<AttachmentRecord, DataError> {
    let state = state.inner().clone();
    run_blocking(move || attachments::import_image_bytes(state.manager(), bytes, &media_type)).await
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use rusqlite::params;

    use super::*;
    use crate::data::ai::credentials::MemoryCredentialStore;
    use crate::data::ai::provider::{
        AiTransport, TransportError, TransportRequest, TransportResponse,
    };
    use crate::data::database::DatabaseManager;
    use crate::data::paths::DataPaths;

    struct CountingTransport(AtomicUsize);

    impl AiTransport for CountingTransport {
        fn send(&self, _request: TransportRequest) -> Result<TransportResponse, TransportError> {
            self.0.fetch_add(1, Ordering::SeqCst);
            unreachable!()
        }
    }

    #[test]
    fn disabled_recognition_command_never_calls_transport() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        std::fs::write(paths.attachments_dir.join("image.png"), b"image").unwrap();
        let data = DataState::new(DatabaseManager::open(paths).unwrap());
        let session = data
            .manager()
            .with_connection_mut(|connection| {
                connection
                    .execute(
                        "INSERT INTO attachments
                         (id, original_name, stored_name, media_type, byte_size, sha256,
                          created_at, updated_at, version)
                         VALUES ('image','image.png','image.png','image/png',5,'hash',?1,?1,1)",
                        params!["2026-09-27T01:00:00Z"],
                    )
                    .map_err(DataError::from)?;
                import_repository::create_session(
                    connection,
                    vec!["image".into()],
                    "2026-09-27T01:00:00Z",
                )
            })
            .unwrap();
        let transport = Arc::new(CountingTransport(AtomicUsize::new(0)));
        let ai = AiState::new(
            Arc::new(MemoryCredentialStore::default()),
            transport.clone(),
        );

        let error = recognize_inner(&data, &ai, &session.id, session.version).unwrap_err();

        assert_eq!(error.code(), "AI_DISABLED");
        assert_eq!(transport.0.load(Ordering::SeqCst), 0);
    }
}
