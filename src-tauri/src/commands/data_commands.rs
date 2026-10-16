use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde_json::Value;
use uuid::Uuid;

use crate::data::attachments;
use crate::data::backup;
use crate::data::database::DatabaseManager;
use crate::data::error::DataError;
use crate::data::models::{
    AttachmentRecord, BackupPreview, BackupResult, DataStatus, RestoreResult,
};

#[derive(Clone)]
pub struct DataState {
    manager: Arc<DatabaseManager>,
}

impl DataState {
    pub fn new(manager: DatabaseManager) -> Self {
        Self {
            manager: Arc::new(manager),
        }
    }

    pub(crate) fn manager(&self) -> &DatabaseManager {
        &self.manager
    }
}

pub(crate) fn get_data_status_inner(state: &DataState) -> Result<DataStatus, DataError> {
    state.manager.status()
}

#[tauri::command]
pub async fn get_data_status(state: tauri::State<'_, DataState>) -> Result<DataStatus, DataError> {
    let state = state.inner().clone();
    run_blocking(move || get_data_status_inner(&state)).await
}

#[tauri::command]
pub async fn import_attachment(
    source_path: String,
    state: tauri::State<'_, DataState>,
) -> Result<AttachmentRecord, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        attachments::import_attachment(&state.manager, &PathBuf::from(source_path))
    })
    .await
}

pub(crate) fn import_attachment_bytes_inner(
    state: &DataState,
    original_name: &str,
    bytes: Vec<u8>,
) -> Result<AttachmentRecord, DataError> {
    let file_name = Path::new(original_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty() && *name == original_name)
        .ok_or_else(|| DataError::attachment_invalid("source file name is invalid"))?;
    if bytes.is_empty() {
        return Err(DataError::attachment_invalid("source file is empty"));
    }

    let staging = state
        .manager
        .paths()
        .restore_staging_dir
        .join(format!("attachment-{}", Uuid::new_v4()));
    fs::create_dir_all(&staging)
        .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
    let staged_file = staging.join(file_name);
    let result = fs::write(&staged_file, bytes)
        .map_err(|error| DataError::attachment_invalid(error.to_string()))
        .and_then(|_| attachments::import_attachment(&state.manager, &staged_file));
    let _ = fs::remove_dir_all(staging);
    result
}

#[tauri::command]
pub async fn import_attachment_bytes(
    original_name: String,
    bytes: Vec<u8>,
    state: tauri::State<'_, DataState>,
) -> Result<AttachmentRecord, DataError> {
    let state = state.inner().clone();
    run_blocking(move || import_attachment_bytes_inner(&state, &original_name, bytes)).await
}

#[tauri::command]
pub async fn create_backup(
    settings: Value,
    state: tauri::State<'_, DataState>,
) -> Result<BackupResult, DataError> {
    let state = state.inner().clone();
    run_blocking(move || backup::create_backup(&state.manager, settings)).await
}

pub(crate) fn read_backup_bytes_inner(
    state: &DataState,
    backup_path: &Path,
) -> Result<Vec<u8>, DataError> {
    let managed_root = state
        .manager
        .paths()
        .backups_dir
        .canonicalize()
        .map_err(|error| DataError::backup_invalid(error.to_string()))?;
    let source = backup_path
        .canonicalize()
        .map_err(|error| DataError::backup_invalid(error.to_string()))?;
    if !source.starts_with(&managed_root) || source.extension().and_then(|value| value.to_str()) != Some("zip") {
        return Err(DataError::backup_invalid("backup is outside managed storage"));
    }
    fs::read(source).map_err(|error| DataError::backup_invalid(error.to_string()))
}

#[tauri::command]
pub async fn read_backup_bytes(
    backup_path: String,
    state: tauri::State<'_, DataState>,
) -> Result<Vec<u8>, DataError> {
    let state = state.inner().clone();
    run_blocking(move || read_backup_bytes_inner(&state, Path::new(&backup_path))).await
}

pub(crate) fn stage_backup_bytes_inner(
    state: &DataState,
    bytes: &[u8],
) -> Result<String, DataError> {
    if bytes.is_empty() {
        return Err(DataError::backup_invalid("selected backup is empty"));
    }
    fs::create_dir_all(&state.manager.paths().restore_staging_dir)
        .map_err(|error| DataError::restore_failed(error.to_string()))?;
    let path = state
        .manager
        .paths()
        .restore_staging_dir
        .join(format!("selected-{}.zip", Uuid::new_v4()));
    fs::write(&path, bytes).map_err(|error| DataError::restore_failed(error.to_string()))?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn stage_backup_bytes(
    bytes: Vec<u8>,
    state: tauri::State<'_, DataState>,
) -> Result<String, DataError> {
    let state = state.inner().clone();
    run_blocking(move || stage_backup_bytes_inner(&state, &bytes)).await
}

#[tauri::command]
pub async fn inspect_backup(
    backup_path: String,
    state: tauri::State<'_, DataState>,
) -> Result<BackupPreview, DataError> {
    let state = state.inner().clone();
    run_blocking(move || backup::inspect_backup(&state.manager, &PathBuf::from(backup_path))).await
}

#[tauri::command]
pub async fn restore_backup(
    backup_path: String,
    expected_fingerprint: String,
    current_settings: Value,
    state: tauri::State<'_, DataState>,
) -> Result<RestoreResult, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        backup::restore_backup(
            &state.manager,
            &PathBuf::from(backup_path),
            expected_fingerprint,
            current_settings,
        )
    })
    .await
}

pub(crate) async fn run_blocking<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, DataError> + Send + 'static,
) -> Result<T, DataError> {
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| DataError::database_open_failed(error.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::paths::DataPaths;
    use std::fs;

    #[test]
    fn status_command_reports_schema_and_attachment_count() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let state = DataState::new(DatabaseManager::open(paths).unwrap());
        let status = get_data_status_inner(&state).unwrap();
        assert_eq!(status.schema_version, 15);
        assert_eq!(status.attachment_count, 0);
    }

    #[test]
    fn imports_attachment_bytes_with_the_original_file_name() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let state = DataState::new(DatabaseManager::open(paths).unwrap());

        let record = import_attachment_bytes_inner(
            &state,
            "lecture-notes.pdf",
            b"%PDF-1.7\nnotes".to_vec(),
        )
        .unwrap();

        assert_eq!(record.original_name, "lecture-notes.pdf");
        assert_eq!(record.media_type, "application/pdf");
        assert_eq!(state.manager().active_attachment_count().unwrap(), 1);
    }

    #[test]
    fn stages_backup_bytes_and_reads_only_managed_backups() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let state = DataState::new(DatabaseManager::open(paths).unwrap());

        let staged = stage_backup_bytes_inner(&state, b"zip-bytes").unwrap();
        assert_eq!(fs::read(&staged).unwrap(), b"zip-bytes");

        let managed_backup = state.manager().paths().backups_dir.join("managed.zip");
        fs::write(&managed_backup, b"managed").unwrap();
        assert_eq!(read_backup_bytes_inner(&state, &managed_backup).unwrap(), b"managed");

        let external = temp.path().join("external.zip");
        fs::write(&external, b"external").unwrap();
        let error = read_backup_bytes_inner(&state, &external).unwrap_err();
        assert_eq!(error.code(), "BACKUP_INVALID");
    }
}
