use std::fs::{self, File};
use std::io::Write;
use std::net::{IpAddr, SocketAddr, TcpStream};
use std::path::PathBuf;
use std::time::Duration;

use serde::Deserialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::data::backup;
use crate::data::database::DatabaseManager;
use crate::data::error::DataError;
use crate::sync::crypto::{normalize_pairing_code, read_encrypted, write_encrypted};
use crate::sync::server::{REQUEST_CLAIM, REQUEST_COMPLETE, REQUEST_DOWNLOAD};
use crate::sync::{ReceivedSyncBackup, SyncManifest, SyncSourcePreview};

pub const MAX_SYNC_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const PROTOCOL_VERSION: u32 = 1;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaimResponse {
    session_token: String,
    manifest: SyncManifest,
}

pub fn validate_sync_address(input: &str) -> Result<SocketAddr, DataError> {
    let address: SocketAddr = input
        .trim()
        .parse()
        .map_err(|error: std::net::AddrParseError| {
            DataError::sync_address_invalid(error.to_string())
        })?;
    match address.ip() {
        IpAddr::V4(ip) if ip.is_private() && !ip.is_loopback() && !ip.is_unspecified() => {
            Ok(address)
        }
        _ => Err(DataError::sync_address_invalid(
            "address is not private IPv4",
        )),
    }
}

pub fn inspect_source(address: &str, pairing_code: &str) -> Result<SyncSourcePreview, DataError> {
    let pairing_code = normalize_pairing_code(pairing_code)
        .map_err(|error| DataError::sync_pairing_failed(error.to_string()))?;
    inspect_source_at(
        validate_sync_address(address)?,
        &format_pairing_code(&pairing_code),
    )
}

fn inspect_source_at(
    address: SocketAddr,
    pairing_code: &str,
) -> Result<SyncSourcePreview, DataError> {
    let mut stream = connect(address)?;
    stream
        .write_all(&[REQUEST_CLAIM])
        .map_err(|error| DataError::sync_connection_failed(error.to_string()))?;
    write_encrypted(&mut stream, pairing_code, b"claim")
        .map_err(|error| DataError::sync_pairing_failed(error.to_string()))?;
    let response = read_encrypted(&mut stream, pairing_code)
        .map_err(|error| DataError::sync_pairing_failed(error.to_string()))?;
    let claim: ClaimResponse = serde_json::from_slice(&response)
        .map_err(|error| DataError::sync_transfer_failed(error.to_string()))?;
    if claim.manifest.protocol_version != PROTOCOL_VERSION {
        return Err(DataError::sync_protocol_incompatible(format!(
            "unsupported protocol {}",
            claim.manifest.protocol_version
        )));
    }
    Ok(SyncSourcePreview {
        address: address.to_string(),
        session_token: claim.session_token,
        manifest: claim.manifest,
    })
}

pub fn receive_backup(
    manager: &DatabaseManager,
    preview: &SyncSourcePreview,
) -> Result<ReceivedSyncBackup, DataError> {
    let address = validate_sync_address(&preview.address)?;
    receive_backup_at(manager, preview, address)
}

fn receive_backup_at(
    manager: &DatabaseManager,
    preview: &SyncSourcePreview,
    address: SocketAddr,
) -> Result<ReceivedSyncBackup, DataError> {
    if preview.manifest.byte_size > MAX_SYNC_BYTES {
        return Err(DataError::sync_too_large(format!(
            "declared {} bytes",
            preview.manifest.byte_size
        )));
    }
    let mut stream = connect(address)?;
    stream
        .write_all(&[REQUEST_DOWNLOAD])
        .map_err(|error| DataError::sync_connection_failed(error.to_string()))?;
    write_encrypted(&mut stream, &preview.session_token, b"download")
        .map_err(|error| DataError::sync_transfer_failed(error.to_string()))?;

    let directory = manager.paths().restore_staging_dir.clone();
    fs::create_dir_all(&directory)
        .map_err(|error| DataError::sync_transfer_failed(error.to_string()))?;
    let id = Uuid::new_v4();
    let partial_path = directory.join(format!("received-{id}.part"));
    let completed_path = directory.join(format!("received-{id}.zip"));
    let result = download_and_validate(&mut stream, &partial_path, preview)
        .and_then(|_| {
            fs::rename(&partial_path, &completed_path)
                .map_err(|error| DataError::sync_transfer_failed(error.to_string()))
        })
        .and_then(|_| backup::inspect_backup(manager, &completed_path));
    let inspected = match result {
        Ok(value) => value,
        Err(error) => {
            let _ = fs::remove_file(&partial_path);
            let _ = fs::remove_file(&completed_path);
            return Err(error);
        }
    };
    if inspected.fingerprint != preview.manifest.sha256 {
        let _ = fs::remove_file(&completed_path);
        return Err(DataError::sync_checksum_mismatch(
            "backup fingerprint differs after inspection",
        ));
    }
    complete_transfer(address, &preview.session_token)?;
    Ok(ReceivedSyncBackup {
        staged_path: completed_path.to_string_lossy().into_owned(),
        expected_fingerprint: inspected.fingerprint,
        manifest: preview.manifest.clone(),
    })
}

fn download_and_validate(
    stream: &mut TcpStream,
    path: &PathBuf,
    preview: &SyncSourcePreview,
) -> Result<(), DataError> {
    let mut output =
        File::create(path).map_err(|error| DataError::sync_transfer_failed(error.to_string()))?;
    let mut hasher = Sha256::new();
    let mut byte_size = 0u64;
    loop {
        let chunk = read_encrypted(stream, &preview.session_token)
            .map_err(|error| DataError::sync_transfer_failed(error.to_string()))?;
        if chunk.is_empty() {
            break;
        }
        byte_size = byte_size.saturating_add(chunk.len() as u64);
        if byte_size > MAX_SYNC_BYTES || byte_size > preview.manifest.byte_size {
            return Err(DataError::sync_too_large("download exceeded declared size"));
        }
        output
            .write_all(&chunk)
            .map_err(|error| DataError::sync_transfer_failed(error.to_string()))?;
        hasher.update(&chunk);
    }
    output
        .sync_all()
        .map_err(|error| DataError::sync_transfer_failed(error.to_string()))?;
    if byte_size != preview.manifest.byte_size {
        return Err(DataError::sync_transfer_failed(
            "download length differs from manifest",
        ));
    }
    let digest = hex::encode(hasher.finalize());
    if digest != preview.manifest.sha256 {
        return Err(DataError::sync_checksum_mismatch(
            "download sha256 differs from manifest",
        ));
    }
    Ok(())
}

fn connect(address: SocketAddr) -> Result<TcpStream, DataError> {
    let stream = TcpStream::connect_timeout(&address, Duration::from_secs(8))
        .map_err(|error| DataError::sync_connection_failed(error.to_string()))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(300)))
        .map_err(|error| DataError::sync_connection_failed(error.to_string()))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(30)))
        .map_err(|error| DataError::sync_connection_failed(error.to_string()))?;
    Ok(stream)
}

fn complete_transfer(address: SocketAddr, token: &str) -> Result<(), DataError> {
    let mut stream = connect(address)?;
    stream
        .write_all(&[REQUEST_COMPLETE])
        .map_err(|error| DataError::sync_transfer_failed(error.to_string()))?;
    write_encrypted(&mut stream, token, b"complete")
        .map_err(|error| DataError::sync_transfer_failed(error.to_string()))?;
    let response = read_encrypted(&mut stream, token)
        .map_err(|error| DataError::sync_transfer_failed(error.to_string()))?;
    if response != b"completed" {
        return Err(DataError::sync_transfer_failed(
            "sender did not confirm completion",
        ));
    }
    Ok(())
}

fn format_pairing_code(compact: &str) -> String {
    compact
        .as_bytes()
        .chunks(5)
        .map(|chunk| std::str::from_utf8(chunk).unwrap_or_default())
        .collect::<Vec<_>>()
        .join("-")
}

#[cfg(test)]
fn inspect_source_for_test(
    address: SocketAddr,
    pairing_code: &str,
) -> Result<SyncSourcePreview, DataError> {
    inspect_source_at(address, pairing_code)
}

#[cfg(test)]
fn receive_backup_for_test(
    manager: &DatabaseManager,
    preview: &SyncSourcePreview,
) -> Result<ReceivedSyncBackup, DataError> {
    receive_backup_at(manager, preview, preview.address.parse().unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::database::DatabaseManager;
    use crate::data::paths::DataPaths;
    use crate::sync::server::{sha256_hex, RunningSyncServer};
    use crate::sync::session::SendSession;
    use crate::sync::SyncManifest;
    use chrono::Utc;
    use std::fs;

    fn server(
        bytes: &[u8],
        declared_size: u64,
        sha256: String,
    ) -> (tempfile::TempDir, RunningSyncServer) {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("sync.zip");
        fs::write(&path, bytes).unwrap();
        let manifest = SyncManifest {
            protocol_version: 1,
            app_version: "0.6.0".into(),
            device_name: "Study PC".into(),
            platform: "windows".into(),
            created_at: Utc::now().to_rfc3339(),
            byte_size: declared_size,
            attachment_count: 0,
            sha256,
        };
        let session = SendSession::new_with_secrets(
            manifest,
            Utc::now(),
            "ABCDE-FGHJK-MNPQR-STUVW",
            "session-token-with-high-entropy",
        );
        let server =
            RunningSyncServer::start_on(path, session, "127.0.0.1:0".parse().unwrap()).unwrap();
        (temp, server)
    }

    #[test]
    fn public_loopback_and_path_addresses_are_rejected_for_real_sync() {
        assert_eq!(
            validate_sync_address("8.8.8.8:80").unwrap_err().code(),
            "SYNC_ADDRESS_INVALID"
        );
        assert_eq!(
            validate_sync_address("127.0.0.1:80").unwrap_err().code(),
            "SYNC_ADDRESS_INVALID"
        );
        assert_eq!(
            validate_sync_address("192.168.1.3:80/path")
                .unwrap_err()
                .code(),
            "SYNC_ADDRESS_INVALID"
        );
        assert_eq!(
            validate_sync_address("192.168.1.3:43821").unwrap(),
            "192.168.1.3:43821".parse().unwrap()
        );
    }

    #[test]
    fn source_preview_requires_the_correct_pairing_code() {
        let _guard = crate::sync::network_test_guard();
        let (_temp, server) = server(b"backup", 6, sha256_hex(b"backup"));
        let error =
            inspect_source_for_test(server.address(), "ZZZZZ-YYYYY-XXXXX-WWWWW").unwrap_err();
        assert_eq!(error.code(), "SYNC_PAIRING_FAILED");
        let preview = inspect_source_for_test(server.address(), "ABCDE-FGHJK-MNPQR-STUVW").unwrap();
        assert_eq!(preview.manifest.device_name, "Study PC");
        assert_eq!(preview.session_token, "session-token-with-high-entropy");
    }

    #[test]
    fn oversized_manifest_is_rejected_before_download() {
        let _guard = crate::sync::network_test_guard();
        let (_temp, server) = server(b"small", MAX_SYNC_BYTES + 1, sha256_hex(b"small"));
        let preview = inspect_source_for_test(server.address(), "ABCDE-FGHJK-MNPQR-STUVW").unwrap();
        let root = tempfile::tempdir().unwrap();
        let manager =
            DatabaseManager::open(DataPaths::from_root(root.path().join("receiver")).unwrap())
                .unwrap();
        assert_eq!(
            receive_backup_for_test(&manager, &preview)
                .unwrap_err()
                .code(),
            "SYNC_TOO_LARGE"
        );
    }

    #[test]
    fn checksum_mismatch_removes_the_partial_snapshot() {
        let _guard = crate::sync::network_test_guard();
        let bytes = b"not-a-valid-backup";
        let (_temp, server) = server(bytes, bytes.len() as u64, "00".repeat(32));
        let preview = inspect_source_for_test(server.address(), "ABCDE-FGHJK-MNPQR-STUVW").unwrap();
        let root = tempfile::tempdir().unwrap();
        let manager =
            DatabaseManager::open(DataPaths::from_root(root.path().join("receiver")).unwrap())
                .unwrap();
        let staging = manager.paths().restore_staging_dir.clone();
        assert_eq!(
            receive_backup_for_test(&manager, &preview)
                .unwrap_err()
                .code(),
            "SYNC_CHECKSUM_MISMATCH"
        );
        assert!(fs::read_dir(staging).unwrap().next().is_none());
    }

    #[test]
    fn encrypted_transfer_produces_a_valid_managed_backup() {
        let _guard = crate::sync::network_test_guard();
        let root = tempfile::tempdir().unwrap();
        let source =
            DatabaseManager::open(DataPaths::from_root(root.path().join("source")).unwrap())
                .unwrap();
        source.set_metadata("sync-fixture", "from-windows").unwrap();
        let backup =
            backup::create_backup(&source, serde_json::json!({ "theme": "eye-care" })).unwrap();
        let bytes = fs::read(&backup.path).unwrap();
        let (_temp, server) = server(&bytes, bytes.len() as u64, sha256_hex(&bytes));
        let preview = inspect_source_for_test(server.address(), "ABCDE-FGHJK-MNPQR-STUVW").unwrap();
        let receiver =
            DatabaseManager::open(DataPaths::from_root(root.path().join("receiver")).unwrap())
                .unwrap();

        let received = receive_backup_for_test(&receiver, &preview).unwrap();

        assert_eq!(received.expected_fingerprint, preview.manifest.sha256);
        assert!(PathBuf::from(&received.staged_path).is_file());
        assert_eq!(server.status(), crate::sync::SendSessionStatus::Completed);
    }
}
