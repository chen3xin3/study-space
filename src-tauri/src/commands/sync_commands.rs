use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use chrono::Utc;
use serde_json::Value;

use crate::commands::data_commands::{run_blocking, DataState};
use crate::data::backup;
use crate::data::database::DatabaseManager;
use crate::data::error::DataError;
use crate::data::models::RestoreResult;
use crate::sync::client;
use crate::sync::server::{sha256_file, RunningSyncServer};
use crate::sync::session::SendSession;
use crate::sync::{ReceivedSyncBackup, SendSessionInfo, SyncManifest, SyncSourcePreview};

const SYNC_PROTOCOL_VERSION: u32 = 1;

#[derive(Clone, Default)]
pub struct SyncState {
    sender: Arc<Mutex<Option<RunningSyncServer>>>,
    received: Arc<Mutex<Option<ReceivedSyncBackup>>>,
}

impl SyncState {
    pub fn new() -> Self {
        Self::default()
    }

    fn set_received(&self, received: ReceivedSyncBackup) {
        if let Ok(mut current) = self.received.lock() {
            *current = Some(received);
        }
    }
}

pub(crate) fn start_send_inner(
    sync: &SyncState,
    manager: &DatabaseManager,
    settings: Value,
    device_name: String,
    platform: &str,
) -> Result<SendSessionInfo, DataError> {
    stop_send_inner(sync)?;
    let backup = backup::create_backup(manager, settings)?;
    let backup_path = PathBuf::from(&backup.path);
    let sha256 = sha256_file(&backup_path)
        .map_err(|error| DataError::sync_transfer_failed(error.to_string()))?;
    let status = manager.status()?;
    let manifest = SyncManifest {
        protocol_version: SYNC_PROTOCOL_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        device_name: if device_name.trim().is_empty() {
            "学习设备".into()
        } else {
            device_name.trim().to_owned()
        },
        platform: platform.to_owned(),
        created_at: backup.created_at,
        byte_size: backup.byte_size,
        attachment_count: status.attachment_count,
        sha256,
    };
    let session = SendSession::new(manifest, Utc::now());
    let server = RunningSyncServer::start(backup_path, session)
        .map_err(|error| DataError::sync_connection_failed(error.to_string()))?;
    let info = server_info(&server)?;
    *sync
        .sender
        .lock()
        .map_err(|_| DataError::sync_transfer_failed("sender state lock poisoned"))? = Some(server);
    Ok(info)
}

pub(crate) fn get_send_status_inner(
    sync: &SyncState,
) -> Result<Option<SendSessionInfo>, DataError> {
    let sender = sync
        .sender
        .lock()
        .map_err(|_| DataError::sync_transfer_failed("sender state lock poisoned"))?;
    sender.as_ref().map(server_info).transpose()
}

pub(crate) fn stop_send_inner(sync: &SyncState) -> Result<(), DataError> {
    let mut sender = sync
        .sender
        .lock()
        .map_err(|_| DataError::sync_transfer_failed("sender state lock poisoned"))?;
    if let Some(mut running) = sender.take() {
        running.stop();
    }
    Ok(())
}

fn server_info(server: &RunningSyncServer) -> Result<SendSessionInfo, DataError> {
    Ok(SendSessionInfo {
        address: server.address().to_string(),
        pairing_code: server
            .pairing_code()
            .ok_or_else(|| DataError::sync_transfer_failed("sender state unavailable"))?,
        expires_at: server
            .expires_at()
            .ok_or_else(|| DataError::sync_transfer_failed("sender expiry unavailable"))?
            .to_rfc3339(),
        status: server.status(),
        manifest: server
            .manifest()
            .ok_or_else(|| DataError::sync_transfer_failed("sender manifest unavailable"))?,
    })
}

pub(crate) fn restore_received_inner(
    sync: &SyncState,
    manager: &DatabaseManager,
    staged_path: &str,
    expected_fingerprint: &str,
    current_settings: Value,
) -> Result<RestoreResult, DataError> {
    let received = sync
        .received
        .lock()
        .map_err(|_| DataError::sync_transfer_failed("received state lock poisoned"))?
        .clone()
        .ok_or_else(|| {
            DataError::sync_transfer_failed("no received snapshot is awaiting confirmation")
        })?;
    if received.staged_path != staged_path || received.expected_fingerprint != expected_fingerprint
    {
        return Err(DataError::sync_transfer_failed(
            "received snapshot identity differs",
        ));
    }
    let result = backup::restore_backup(
        manager,
        Path::new(staged_path),
        expected_fingerprint.to_owned(),
        current_settings,
    )?;
    let _ = fs::remove_file(staged_path);
    if let Ok(mut current) = sync.received.lock() {
        *current = None;
    }
    Ok(result)
}

#[tauri::command]
pub async fn start_lan_sync_send(
    settings: Value,
    device_name: String,
    sync: tauri::State<'_, SyncState>,
    data: tauri::State<'_, DataState>,
) -> Result<SendSessionInfo, DataError> {
    let sync = sync.inner().clone();
    let data = data.inner().clone();
    let platform = if cfg!(mobile) { "android" } else { "windows" }.to_owned();
    run_blocking(move || start_send_inner(&sync, data.manager(), settings, device_name, &platform))
        .await
}

#[tauri::command]
pub fn get_lan_sync_send_status(
    sync: tauri::State<'_, SyncState>,
) -> Result<Option<SendSessionInfo>, DataError> {
    get_send_status_inner(sync.inner())
}

#[tauri::command]
pub fn stop_lan_sync_send(sync: tauri::State<'_, SyncState>) -> Result<(), DataError> {
    stop_send_inner(sync.inner())
}

#[tauri::command]
pub async fn inspect_lan_sync_source(
    address: String,
    pairing_code: String,
) -> Result<SyncSourcePreview, DataError> {
    run_blocking(move || client::inspect_source(&address, &pairing_code)).await
}

#[tauri::command]
pub async fn receive_lan_sync_backup(
    preview: SyncSourcePreview,
    sync: tauri::State<'_, SyncState>,
    data: tauri::State<'_, DataState>,
) -> Result<ReceivedSyncBackup, DataError> {
    let sync = sync.inner().clone();
    let data = data.inner().clone();
    run_blocking(move || {
        let received = client::receive_backup(data.manager(), &preview)?;
        sync.set_received(received.clone());
        Ok(received)
    })
    .await
}

#[tauri::command]
pub async fn restore_lan_sync_backup(
    staged_path: String,
    expected_fingerprint: String,
    current_settings: Value,
    sync: tauri::State<'_, SyncState>,
    data: tauri::State<'_, DataState>,
) -> Result<RestoreResult, DataError> {
    let sync = sync.inner().clone();
    let data = data.inner().clone();
    run_blocking(move || {
        restore_received_inner(
            &sync,
            data.manager(),
            &staged_path,
            &expected_fingerprint,
            current_settings,
        )
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::database::DatabaseManager;
    use crate::data::paths::DataPaths;
    use crate::sync::{ReceivedSyncBackup, SyncManifest};

    fn manifest() -> SyncManifest {
        SyncManifest {
            protocol_version: 1,
            app_version: "0.6.0".into(),
            device_name: "Study PC".into(),
            platform: "windows".into(),
            created_at: "2026-10-10T12:00:00Z".into(),
            byte_size: 10,
            attachment_count: 0,
            sha256: "ab".repeat(32),
        }
    }

    #[test]
    fn restore_rejects_any_snapshot_not_received_by_this_process() {
        let temp = tempfile::tempdir().unwrap();
        let manager =
            DatabaseManager::open(DataPaths::from_root(temp.path().join("app")).unwrap()).unwrap();
        let sync = SyncState::new();
        let error = restore_received_inner(
            &sync,
            &manager,
            "invented.zip",
            "fingerprint",
            serde_json::json!({}),
        )
        .unwrap_err();
        assert_eq!(error.code(), "SYNC_TRANSFER_FAILED");
    }

    #[test]
    fn restore_requires_the_exact_received_path_and_fingerprint() {
        let temp = tempfile::tempdir().unwrap();
        let manager =
            DatabaseManager::open(DataPaths::from_root(temp.path().join("app")).unwrap()).unwrap();
        let sync = SyncState::new();
        sync.set_received(ReceivedSyncBackup {
            staged_path: "managed.zip".into(),
            expected_fingerprint: "expected".into(),
            manifest: manifest(),
        });
        let error = restore_received_inner(
            &sync,
            &manager,
            "other.zip",
            "expected",
            serde_json::json!({}),
        )
        .unwrap_err();
        assert_eq!(error.code(), "SYNC_TRANSFER_FAILED");
    }
}
