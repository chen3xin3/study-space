pub mod client;
pub mod crypto;
pub mod server;
pub mod session;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncManifest {
    pub protocol_version: u32,
    pub app_version: String,
    pub device_name: String,
    pub platform: String,
    pub created_at: String,
    pub byte_size: u64,
    pub attachment_count: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SendSessionStatus {
    Preparing,
    Waiting,
    Transferring,
    Completed,
    Stopped,
    Expired,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SendSessionInfo {
    pub address: String,
    pub pairing_code: String,
    pub expires_at: String,
    pub status: SendSessionStatus,
    pub manifest: SyncManifest,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncSourcePreview {
    pub address: String,
    pub session_token: String,
    pub manifest: SyncManifest,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReceivedSyncBackup {
    pub staged_path: String,
    pub expected_fingerprint: String,
    pub manifest: SyncManifest,
}

#[derive(Debug, Clone, thiserror::Error, PartialEq, Eq)]
pub enum SyncError {
    #[error("配对码不正确。")]
    InvalidPairingCode,
    #[error("配对尝试次数过多，请重新开启发送。")]
    TooManyAttempts,
    #[error("配对码已经失效，请重新开启发送。")]
    Expired,
    #[error("这次发送已经被另一台设备接收。")]
    AlreadyClaimed,
    #[error("传输凭据无效。")]
    InvalidToken,
    #[error("当前传输状态不允许执行此操作。")]
    InvalidState,
}

#[cfg(test)]
pub(crate) fn network_test_guard() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
    LOCK.get_or_init(|| std::sync::Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
