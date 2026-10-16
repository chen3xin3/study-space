use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use chrono::Utc;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

use crate::data::database::DatabaseManager;
use crate::data::error::DataError;
use crate::data::models::{
    BackupManifest, BackupPreview, BackupResult, ManifestFile, RestoreResult,
};

const BACKUP_FORMAT_VERSION: u32 = 1;
const MAX_UNCOMPRESSED_BYTES: u64 = 2 * 1024 * 1024 * 1024;

pub fn inspect_backup(
    manager: &DatabaseManager,
    backup_path: &Path,
) -> Result<BackupPreview, DataError> {
    let _operation = manager.lock_operation()?;
    let (staging, staged_archive) = stage_backup_copy(manager, backup_path)?;
    let manifest = validate_backup(&staged_archive)?;
    let fingerprint = backup_fingerprint(&staged_archive)?;
    drop(staging);
    Ok(BackupPreview {
        path: backup_path.to_string_lossy().into_owned(),
        created_at: manifest.created_at,
        app_version: manifest.app_version,
        fingerprint,
    })
}

pub fn create_backup(
    manager: &DatabaseManager,
    settings: serde_json::Value,
) -> Result<BackupResult, DataError> {
    let _operation = manager.lock_operation()?;
    create_backup_with_label(manager, settings, "study-space-backup")
}

pub(crate) fn create_backup_with_label(
    manager: &DatabaseManager,
    settings: serde_json::Value,
    label: &str,
) -> Result<BackupResult, DataError> {
    let staging = manager
        .paths()
        .restore_staging_dir
        .join(format!("backup-{}", Uuid::new_v4()));
    fs::create_dir_all(&staging)
        .map_err(|error| DataError::backup_create_failed(error.to_string()))?;
    let result = create_backup_in_staging(manager, settings, label, &staging);
    let _ = fs::remove_dir_all(&staging);
    result
}

fn create_backup_in_staging(
    manager: &DatabaseManager,
    settings: serde_json::Value,
    label: &str,
    staging: &Path,
) -> Result<BackupResult, DataError> {
    let database_dir = staging.join("database");
    let attachments_dir = staging.join("attachments");
    let settings_dir = staging.join("settings");
    for directory in [&database_dir, &attachments_dir, &settings_dir] {
        fs::create_dir_all(directory)
            .map_err(|error| DataError::backup_create_failed(error.to_string()))?;
    }

    let snapshot = database_dir.join("study-space.db");
    manager.with_connection(|connection| {
        connection
            .backup("main", &snapshot, None)
            .map_err(|error| DataError::backup_create_failed(error.to_string()))
    })?;

    let stored_names: Vec<String> = manager.with_connection(|connection| {
        let mut statement = connection
            .prepare("SELECT stored_name FROM attachments WHERE deleted_at IS NULL")
            .map_err(|error| DataError::backup_create_failed(error.to_string()))?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| DataError::backup_create_failed(error.to_string()))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| DataError::backup_create_failed(error.to_string()))
    })?;

    let mut archive_files = vec![("database/study-space.db".to_owned(), snapshot.clone())];
    for stored_name in stored_names {
        let source = manager.paths().attachments_dir.join(&stored_name);
        let target = attachments_dir.join(&stored_name);
        fs::copy(&source, &target)
            .map_err(|error| DataError::backup_create_failed(error.to_string()))?;
        archive_files.push((format!("attachments/{stored_name}"), target));
    }

    let settings_path = settings_dir.join("app-settings.json");
    let settings_bytes = serde_json::to_vec_pretty(&settings)
        .map_err(|error| DataError::backup_create_failed(error.to_string()))?;
    fs::write(&settings_path, settings_bytes)
        .map_err(|error| DataError::backup_create_failed(error.to_string()))?;
    archive_files.push(("settings/app-settings.json".to_owned(), settings_path));

    let mut manifest_files = Vec::with_capacity(archive_files.len());
    for (archive_path, local_path) in &archive_files {
        let metadata = fs::metadata(local_path)
            .map_err(|error| DataError::backup_create_failed(error.to_string()))?;
        manifest_files.push(ManifestFile {
            path: archive_path.clone(),
            byte_size: metadata.len(),
            sha256: hash_for_backup(local_path)?,
        });
    }
    let database_sha256 = manifest_files
        .iter()
        .find(|entry| entry.path == "database/study-space.db")
        .map(|entry| entry.sha256.clone())
        .ok_or_else(|| DataError::backup_create_failed("database missing from manifest"))?;
    let created_at = Utc::now();
    let manifest = BackupManifest {
        format_version: BACKUP_FORMAT_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        created_at: created_at.to_rfc3339(),
        database_sha256,
        files: manifest_files,
    };

    let file_name = format!("{label}-{}.zip", created_at.format("%Y%m%dT%H%M%SZ"));
    let partial_path = staging.join(format!("{file_name}.part"));
    let final_path = manager.paths().backups_dir.join(&file_name);
    write_archive(&partial_path, &manifest, &archive_files)?;
    fs::rename(&partial_path, &final_path)
        .map_err(|error| DataError::backup_create_failed(error.to_string()))?;
    let byte_size = fs::metadata(&final_path)
        .map_err(|error| DataError::backup_create_failed(error.to_string()))?
        .len();
    let database_size = i64::try_from(byte_size)
        .map_err(|error| DataError::backup_create_failed(error.to_string()))?;
    let backup_id = Uuid::new_v4().to_string();
    manager.with_connection(|connection| {
        connection
            .execute(
                "INSERT INTO backup_history (
                    id, file_name, created_at, byte_size, status, app_version, error_message
                 ) VALUES (?1, ?2, ?3, ?4, 'completed', ?5, NULL)",
                params![
                    backup_id,
                    file_name,
                    manifest.created_at,
                    database_size,
                    manifest.app_version,
                ],
            )
            .map_err(|error| DataError::backup_create_failed(error.to_string()))?;
        Ok(())
    })?;

    Ok(BackupResult {
        path: final_path.to_string_lossy().into_owned(),
        created_at: manifest.created_at,
        byte_size,
    })
}

fn write_archive(
    target: &Path,
    manifest: &BackupManifest,
    files: &[(String, PathBuf)],
) -> Result<(), DataError> {
    let file =
        File::create(target).map_err(|error| DataError::backup_create_failed(error.to_string()))?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    archive
        .start_file("manifest.json", options)
        .map_err(|error| DataError::backup_create_failed(error.to_string()))?;
    archive
        .write_all(
            &serde_json::to_vec_pretty(manifest)
                .map_err(|error| DataError::backup_create_failed(error.to_string()))?,
        )
        .map_err(|error| DataError::backup_create_failed(error.to_string()))?;

    for (archive_path, local_path) in files {
        archive
            .start_file(archive_path, options)
            .map_err(|error| DataError::backup_create_failed(error.to_string()))?;
        let mut input = File::open(local_path)
            .map_err(|error| DataError::backup_create_failed(error.to_string()))?;
        std::io::copy(&mut input, &mut archive)
            .map_err(|error| DataError::backup_create_failed(error.to_string()))?;
    }
    let output = archive
        .finish()
        .map_err(|error| DataError::backup_create_failed(error.to_string()))?;
    output
        .sync_all()
        .map_err(|error| DataError::backup_create_failed(error.to_string()))
}

pub fn validate_backup(path: &Path) -> Result<BackupManifest, DataError> {
    let file = File::open(path).map_err(|error| DataError::backup_invalid(error.to_string()))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| DataError::backup_invalid(error.to_string()))?;
    let mut names = HashSet::new();
    let mut total_size = 0_u64;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| DataError::backup_invalid(error.to_string()))?;
        if entry.enclosed_name().is_none() {
            return Err(DataError::backup_invalid("unsafe archive entry path"));
        }
        if !names.insert(entry.name().to_owned()) {
            return Err(DataError::backup_invalid("duplicate archive entry"));
        }
        total_size = total_size
            .checked_add(entry.size())
            .ok_or_else(|| DataError::backup_invalid("archive size overflow"))?;
        if total_size > MAX_UNCOMPRESSED_BYTES {
            return Err(DataError::backup_invalid("archive is too large"));
        }
    }
    if !names.contains("manifest.json") {
        return Err(DataError::backup_invalid("manifest is missing"));
    }

    let manifest: BackupManifest = {
        let mut entry = archive
            .by_name("manifest.json")
            .map_err(|error| DataError::backup_invalid(error.to_string()))?;
        serde_json::from_reader(&mut entry)
            .map_err(|error| DataError::backup_invalid(error.to_string()))?
    };
    if manifest.format_version != BACKUP_FORMAT_VERSION {
        return Err(DataError::backup_invalid("unsupported backup format"));
    }

    let mut declared = HashSet::new();
    for expected in &manifest.files {
        if expected.path == "manifest.json"
            || Path::new(&expected.path).is_absolute()
            || Path::new(&expected.path)
                .components()
                .any(|component| !matches!(component, std::path::Component::Normal(_)))
        {
            return Err(DataError::backup_invalid("unsafe manifest path"));
        }
        if !declared.insert(expected.path.clone()) {
            return Err(DataError::backup_invalid("duplicate manifest path"));
        }
        let mut entry = archive
            .by_name(&expected.path)
            .map_err(|error| DataError::backup_invalid(error.to_string()))?;
        if entry.size() != expected.byte_size {
            return Err(DataError::backup_invalid("file size mismatch"));
        }
        let digest = hash_reader(&mut entry)?;
        if digest != expected.sha256 {
            return Err(DataError::backup_invalid("file hash mismatch"));
        }
    }
    if names.len() != declared.len() + 1 {
        return Err(DataError::backup_invalid(
            "archive contains undeclared files",
        ));
    }
    let database_entry = manifest
        .files
        .iter()
        .find(|entry| entry.path == "database/study-space.db")
        .ok_or_else(|| DataError::backup_invalid("database is missing"))?;
    if database_entry.sha256 != manifest.database_sha256 {
        return Err(DataError::backup_invalid("database hash mismatch"));
    }
    validate_database_entry(&mut archive, &manifest)?;
    Ok(manifest)
}

fn validate_database_entry(
    archive: &mut ZipArchive<File>,
    manifest: &BackupManifest,
) -> Result<(), DataError> {
    let mut entry = archive
        .by_name("database/study-space.db")
        .map_err(|error| DataError::backup_invalid(error.to_string()))?;
    let temporary = tempfile::NamedTempFile::new()
        .map_err(|error| DataError::backup_invalid(error.to_string()))?;
    {
        let mut output = temporary
            .reopen()
            .map_err(|error| DataError::backup_invalid(error.to_string()))?;
        std::io::copy(&mut entry, &mut output)
            .map_err(|error| DataError::backup_invalid(error.to_string()))?;
        output
            .sync_all()
            .map_err(|error| DataError::backup_invalid(error.to_string()))?;
    }
    let connection = Connection::open(temporary.path())
        .map_err(|error| DataError::backup_invalid(error.to_string()))?;
    let result: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| DataError::backup_invalid(error.to_string()))?;
    if result != "ok" {
        return Err(DataError::backup_invalid(result));
    }

    let invalid_import_references: i64 = connection
        .query_row(
            "SELECT count(*)
             FROM vocabulary_import_images image
             JOIN vocabulary_import_sessions session ON session.id=image.session_id
             LEFT JOIN attachments attachment ON attachment.id=image.attachment_id
             WHERE session.deleted_at IS NULL
               AND (attachment.id IS NULL OR attachment.deleted_at IS NOT NULL)",
            [],
            |row| row.get(0),
        )
        .map_err(|error| DataError::backup_invalid(error.to_string()))?;
    if invalid_import_references != 0 {
        return Err(DataError::backup_invalid(
            "vocabulary import references an unavailable attachment",
        ));
    }

    let declared_attachments: HashMap<&str, &ManifestFile> = manifest
        .files
        .iter()
        .filter_map(|file| {
            file.path
                .strip_prefix("attachments/")
                .map(|name| (name, file))
        })
        .collect();
    let mut statement = connection
        .prepare(
            "SELECT stored_name, byte_size, sha256
             FROM attachments WHERE deleted_at IS NULL",
        )
        .map_err(|error| DataError::backup_invalid(error.to_string()))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| DataError::backup_invalid(error.to_string()))?;
    let mut active_count = 0_usize;
    for row in rows {
        let (stored_name, byte_size, sha256) =
            row.map_err(|error| DataError::backup_invalid(error.to_string()))?;
        let stored_path = Path::new(&stored_name);
        if stored_path.components().count() != 1
            || !matches!(
                stored_path.components().next(),
                Some(std::path::Component::Normal(_))
            )
        {
            return Err(DataError::backup_invalid("unsafe managed attachment name"));
        }
        let expected = declared_attachments
            .get(stored_name.as_str())
            .ok_or_else(|| DataError::backup_invalid("active attachment file is missing"))?;
        let database_size = u64::try_from(byte_size)
            .map_err(|error| DataError::backup_invalid(error.to_string()))?;
        if expected.byte_size != database_size || expected.sha256 != sha256 {
            return Err(DataError::backup_invalid("attachment metadata mismatch"));
        }
        active_count += 1;
    }
    if active_count != declared_attachments.len() {
        return Err(DataError::backup_invalid(
            "undeclared attachment metadata mismatch",
        ));
    }
    Ok(())
}

fn hash_for_backup(path: &Path) -> Result<String, DataError> {
    let file =
        File::open(path).map_err(|error| DataError::backup_create_failed(error.to_string()))?;
    hash_reader(file).map_err(|error| DataError::backup_create_failed(error.internal().to_owned()))
}

fn hash_reader(mut reader: impl Read) -> Result<String, DataError> {
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 8 * 1024 * 1024];
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| DataError::backup_invalid(error.to_string()))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

pub fn restore_backup(
    manager: &DatabaseManager,
    backup_path: &Path,
    expected_fingerprint: String,
    current_settings: serde_json::Value,
) -> Result<RestoreResult, DataError> {
    restore_backup_with_hook(
        manager,
        backup_path,
        expected_fingerprint,
        current_settings,
        || Ok(()),
    )
}

pub(crate) fn restore_backup_with_hook(
    manager: &DatabaseManager,
    backup_path: &Path,
    expected_fingerprint: String,
    current_settings: serde_json::Value,
    after_swap: impl FnOnce() -> Result<(), DataError>,
) -> Result<RestoreResult, DataError> {
    let _operation = manager.lock_operation()?;
    let source_file_name = backup_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("backup.zip")
        .to_owned();
    let (staging, staged_archive) = stage_backup_copy(manager, backup_path)?;
    fs::create_dir_all(staging.path().join("attachments"))
        .map_err(|error| DataError::restore_failed(error.to_string()))?;
    let source_byte_size = fs::metadata(&staged_archive)
        .map_err(|error| DataError::restore_failed(error.to_string()))?
        .len();
    let actual_fingerprint = backup_fingerprint(&staged_archive)?;
    if actual_fingerprint != expected_fingerprint {
        return Err(DataError::backup_invalid(
            "backup changed after confirmation",
        ));
    }
    let manifest = validate_backup(&staged_archive)?;
    restore_from_archive(
        manager,
        &staged_archive,
        &manifest,
        staging.path(),
        source_file_name,
        source_byte_size,
        current_settings,
        after_swap,
    )
}

fn stage_backup_copy(
    manager: &DatabaseManager,
    backup_path: &Path,
) -> Result<(tempfile::TempDir, PathBuf), DataError> {
    let staging = tempfile::Builder::new()
        .prefix("restore-")
        .tempdir_in(&manager.paths().restore_staging_dir)
        .map_err(|error| DataError::restore_failed(error.to_string()))?;
    let staged_archive = staging.path().join("validated-backup.zip");
    fs::copy(backup_path, &staged_archive)
        .map_err(|error| DataError::restore_failed(error.to_string()))?;
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(&staged_archive)
        .and_then(|file| file.sync_all())
        .map_err(|error| DataError::restore_failed(error.to_string()))?;
    Ok((staging, staged_archive))
}

fn backup_fingerprint(path: &Path) -> Result<String, DataError> {
    let file = File::open(path).map_err(|error| DataError::backup_invalid(error.to_string()))?;
    hash_reader(file)
}

fn restore_from_archive(
    manager: &DatabaseManager,
    backup_path: &Path,
    manifest: &BackupManifest,
    staging: &Path,
    source_file_name: String,
    source_byte_size: u64,
    current_settings: serde_json::Value,
    after_swap: impl FnOnce() -> Result<(), DataError>,
) -> Result<RestoreResult, DataError> {
    let file =
        File::open(backup_path).map_err(|error| DataError::restore_failed(error.to_string()))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| DataError::restore_failed(error.to_string()))?;
    for declared in &manifest.files {
        let destination = staging.join(&declared.path);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| DataError::restore_failed(error.to_string()))?;
        }
        let mut entry = archive
            .by_name(&declared.path)
            .map_err(|error| DataError::restore_failed(error.to_string()))?;
        let mut output = File::create(&destination)
            .map_err(|error| DataError::restore_failed(error.to_string()))?;
        std::io::copy(&mut entry, &mut output)
            .map_err(|error| DataError::restore_failed(error.to_string()))?;
        output
            .sync_all()
            .map_err(|error| DataError::restore_failed(error.to_string()))?;
    }
    let settings_path = staging.join("settings/app-settings.json");
    let settings: serde_json::Value = serde_json::from_reader(
        File::open(&settings_path).map_err(|error| DataError::restore_failed(error.to_string()))?,
    )
    .map_err(|error| DataError::restore_failed(error.to_string()))?;
    let database_size = i64::try_from(source_byte_size)
        .map_err(|error| DataError::restore_failed(error.to_string()))?;
    let restored_at = Utc::now().to_rfc3339();
    let history_id = Uuid::new_v4().to_string();

    create_backup_with_label(manager, current_settings, "pre-restore-backup")?;
    manager.replace_storage_with_hook(
        &staging.join("database/study-space.db"),
        &staging.join("attachments"),
        after_swap,
    )?;

    let _history_result = manager.with_connection(|connection| {
        connection
            .execute(
                "INSERT INTO backup_history (
                    id, file_name, created_at, byte_size, status, app_version, error_message
                 ) VALUES (?1, ?2, ?3, ?4, 'restored', ?5, NULL)",
                params![
                    history_id,
                    source_file_name,
                    restored_at,
                    database_size,
                    env!("CARGO_PKG_VERSION"),
                ],
            )
            .map_err(|error| DataError::restore_failed(error.to_string()))?;
        Ok(())
    });
    Ok(RestoreResult {
        restored_at,
        settings,
    })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::Write;
    use std::path::PathBuf;

    use super::*;
    use crate::data::attachments::import_attachment;
    use crate::data::database::DatabaseManager;
    use crate::data::paths::DataPaths;

    struct BackupFixture {
        _temp: tempfile::TempDir,
        source_root: PathBuf,
        manager: DatabaseManager,
    }

    impl BackupFixture {
        fn new() -> Self {
            let temp = tempfile::tempdir().unwrap();
            let source_root = temp.path().join("source");
            fs::create_dir_all(&source_root).unwrap();
            let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
            let manager = DatabaseManager::open(paths).unwrap();
            Self {
                _temp: temp,
                source_root,
                manager,
            }
        }

        fn import(&self, name: &str, content: &[u8]) {
            let source = self.source_root.join(name);
            fs::write(&source, content).unwrap();
            import_attachment(&self.manager, &source).unwrap();
        }

        fn malicious_archive(&self) -> PathBuf {
            let path = self.source_root.join("malicious.zip");
            let file = fs::File::create(&path).unwrap();
            let mut archive = ZipWriter::new(file);
            archive
                .start_file("../escape.txt", SimpleFileOptions::default())
                .unwrap();
            archive.write_all(b"escape").unwrap();
            archive.finish().unwrap();
            path
        }

        fn tamper_settings(&self, source: &str) -> PathBuf {
            let input = fs::File::open(source).unwrap();
            let mut archive = zip::ZipArchive::new(input).unwrap();
            let mut entries = Vec::new();
            for index in 0..archive.len() {
                let mut entry = archive.by_index(index).unwrap();
                let mut bytes = Vec::new();
                entry.read_to_end(&mut bytes).unwrap();
                if entry.name() == "settings/app-settings.json" {
                    bytes = br#"{"theme":"tampered"}"#.to_vec();
                }
                entries.push((entry.name().to_owned(), bytes));
            }
            let path = self.source_root.join("tampered.zip");
            let output = fs::File::create(&path).unwrap();
            let mut writer = ZipWriter::new(output);
            for (name, bytes) in entries {
                writer
                    .start_file(name, SimpleFileOptions::default())
                    .unwrap();
                writer.write_all(&bytes).unwrap();
            }
            writer.finish().unwrap();
            path
        }

        fn remove_attachment_and_rewrite_manifest(&self, source: &str) -> PathBuf {
            let input = fs::File::open(source).unwrap();
            let mut archive = zip::ZipArchive::new(input).unwrap();
            let mut entries = Vec::new();
            let mut manifest: BackupManifest = {
                let mut entry = archive.by_name("manifest.json").unwrap();
                serde_json::from_reader(&mut entry).unwrap()
            };
            manifest
                .files
                .retain(|file| !file.path.starts_with("attachments/"));
            for index in 0..archive.len() {
                let mut entry = archive.by_index(index).unwrap();
                if entry.name() == "manifest.json" || entry.name().starts_with("attachments/") {
                    continue;
                }
                let mut bytes = Vec::new();
                entry.read_to_end(&mut bytes).unwrap();
                entries.push((entry.name().to_owned(), bytes));
            }
            entries.push((
                "manifest.json".to_owned(),
                serde_json::to_vec_pretty(&manifest).unwrap(),
            ));
            let path = self.source_root.join("missing-attachment.zip");
            let output = fs::File::create(&path).unwrap();
            let mut writer = ZipWriter::new(output);
            for (name, bytes) in entries {
                writer
                    .start_file(name, SimpleFileOptions::default())
                    .unwrap();
                writer.write_all(&bytes).unwrap();
            }
            writer.finish().unwrap();
            path
        }
    }

    #[test]
    fn backup_contains_snapshot_attachment_settings_and_manifest() {
        let fixture = BackupFixture::new();
        fixture.import("paper.pdf", b"pdf bytes");
        let result = create_backup(
            &fixture.manager,
            serde_json::json!({ "theme": "eye-care", "aiEnabled": false }),
        )
        .unwrap();

        let file = fs::File::open(&result.path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        assert!(archive.by_name("manifest.json").is_ok());
        assert!(archive.by_name("database/study-space.db").is_ok());
        assert!(archive.by_name("settings/app-settings.json").is_ok());
        assert!(archive
            .file_names()
            .any(|name| name.starts_with("attachments/")));
        validate_backup(std::path::Path::new(&result.path)).unwrap();
    }

    #[test]
    fn rejects_archive_entries_that_escape_the_staging_directory() {
        let fixture = BackupFixture::new();
        let archive = fixture.malicious_archive();
        let error = validate_backup(&archive).unwrap_err();
        assert_eq!(error.code(), "BACKUP_INVALID");
        assert!(!fixture._temp.path().join("escape.txt").exists());
    }

    #[test]
    fn rejects_a_backup_whose_content_no_longer_matches_the_manifest() {
        let fixture = BackupFixture::new();
        let backup =
            create_backup(&fixture.manager, serde_json::json!({ "theme": "eye-care" })).unwrap();
        let tampered = fixture.tamper_settings(&backup.path);
        let error = validate_backup(&tampered).unwrap_err();
        assert_eq!(error.code(), "BACKUP_INVALID");
    }

    #[test]
    fn rejects_a_backup_missing_an_attachment_referenced_by_the_database() {
        let fixture = BackupFixture::new();
        fixture.import("paper.pdf", b"pdf bytes");
        let backup = create_backup(&fixture.manager, serde_json::json!({})).unwrap();
        let inconsistent = fixture.remove_attachment_and_rewrite_manifest(&backup.path);
        let error = validate_backup(&inconsistent).unwrap_err();
        assert_eq!(error.code(), "BACKUP_INVALID");
    }

    #[test]
    fn rejects_an_active_vocabulary_import_whose_photo_is_unavailable() {
        let fixture = BackupFixture::new();
        fixture.import("words.jpg", b"handwritten words");
        fixture
            .manager
            .with_connection(|connection| {
                let attachment_id: String = connection
                    .query_row("SELECT id FROM attachments LIMIT 1", [], |row| row.get(0))
                    .map_err(|error| DataError::backup_invalid(error.to_string()))?;
                connection
                    .execute_batch(
                        "INSERT INTO vocabulary_import_sessions
                         (id, status, created_at, updated_at, version)
                         VALUES ('session', 'draft', 'now', 'now', 1);",
                    )
                    .map_err(|error| DataError::backup_invalid(error.to_string()))?;
                connection
                    .execute(
                        "INSERT INTO vocabulary_import_images
                         (session_id, attachment_id, sort_order, rotation_degrees)
                         VALUES ('session', ?1, 0, 0)",
                        [&attachment_id],
                    )
                    .map_err(|error| DataError::backup_invalid(error.to_string()))?;
                connection
                    .execute(
                        "UPDATE attachments SET deleted_at='now' WHERE id=?1",
                        [&attachment_id],
                    )
                    .map(|_| ())
                    .map_err(|error| DataError::backup_invalid(error.to_string()))
            })
            .unwrap();
        let backup = create_backup(&fixture.manager, serde_json::json!({})).unwrap();
        let error = validate_backup(Path::new(&backup.path)).unwrap_err();
        assert_eq!(error.code(), "BACKUP_INVALID");
        assert!(error.internal().contains("vocabulary import"));
    }

    #[test]
    fn restore_rejects_a_valid_archive_that_changed_after_confirmation() {
        let fixture = BackupFixture::new();
        fixture.manager.set_metadata("sentinel", "current").unwrap();
        let confirmed =
            create_backup(&fixture.manager, serde_json::json!({ "theme": "eye-care" })).unwrap();
        let confirmed_fingerprint = backup_fingerprint(Path::new(&confirmed.path)).unwrap();
        let replacement = create_backup_with_label(
            &fixture.manager,
            serde_json::json!({ "theme": "night" }),
            "replacement-backup",
        )
        .unwrap();
        fs::copy(&replacement.path, &confirmed.path).unwrap();

        let error = restore_backup(
            &fixture.manager,
            Path::new(&confirmed.path),
            confirmed_fingerprint,
            serde_json::json!({}),
        )
        .unwrap_err();
        assert_eq!(error.code(), "BACKUP_INVALID");
        assert_eq!(
            fixture.manager.get_metadata("sentinel").unwrap().as_deref(),
            Some("current"),
        );
    }

    #[test]
    fn invalid_preview_cleans_its_staging_directory() {
        let fixture = BackupFixture::new();
        let invalid = fixture.malicious_archive();
        assert!(inspect_backup(&fixture.manager, &invalid).is_err());
        assert_eq!(
            fs::read_dir(&fixture.manager.paths().restore_staging_dir)
                .unwrap()
                .count(),
            0,
        );
    }

    #[test]
    fn successful_restore_replaces_data_and_returns_saved_settings() {
        let fixture = BackupFixture::new();
        fixture.manager.set_metadata("value", "before").unwrap();
        let backup =
            create_backup(&fixture.manager, serde_json::json!({ "theme": "night" })).unwrap();
        fixture.manager.set_metadata("value", "after").unwrap();

        let restored = restore_backup(
            &fixture.manager,
            std::path::Path::new(&backup.path),
            backup_fingerprint(std::path::Path::new(&backup.path)).unwrap(),
            serde_json::json!({ "theme": "current" }),
        )
        .unwrap();
        assert_eq!(
            fixture.manager.get_metadata("value").unwrap().as_deref(),
            Some("before"),
        );
        assert_eq!(restored.settings["theme"], "night");
        fixture.manager.health_check().unwrap();
    }

    #[test]
    fn pre_restore_backup_preserves_current_settings() {
        let fixture = BackupFixture::new();
        let backup =
            create_backup(&fixture.manager, serde_json::json!({ "theme": "night" })).unwrap();

        restore_backup(
            &fixture.manager,
            std::path::Path::new(&backup.path),
            backup_fingerprint(std::path::Path::new(&backup.path)).unwrap(),
            serde_json::json!({ "theme": "macaron", "aiEnabled": false }),
        )
        .unwrap();

        let pre_restore = fs::read_dir(&fixture.manager.paths().backups_dir)
            .unwrap()
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .find(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("pre-restore-backup-"))
            })
            .unwrap();
        let mut archive = ZipArchive::new(File::open(pre_restore).unwrap()).unwrap();
        let mut saved = String::new();
        archive
            .by_name("settings/app-settings.json")
            .unwrap()
            .read_to_string(&mut saved)
            .unwrap();
        let settings: serde_json::Value = serde_json::from_str(&saved).unwrap();
        assert_eq!(settings["theme"], "macaron");
        assert_eq!(settings["aiEnabled"], false);
    }

    #[test]
    fn failed_restore_keeps_current_database_usable() {
        let fixture = BackupFixture::new();
        fixture.manager.set_metadata("sentinel", "keep").unwrap();
        let broken = fixture.malicious_archive();
        assert!(restore_backup(
            &fixture.manager,
            &broken,
            backup_fingerprint(&broken).unwrap(),
            serde_json::json!({ "theme": "current" }),
        )
        .is_err());
        assert_eq!(
            fixture.manager.get_metadata("sentinel").unwrap().as_deref(),
            Some("keep"),
        );
        fixture.manager.health_check().unwrap();
    }

    #[test]
    fn post_swap_failure_rolls_back_database_and_attachments() {
        let fixture = BackupFixture::new();
        fixture.manager.set_metadata("sentinel", "backup").unwrap();
        let backup =
            create_backup(&fixture.manager, serde_json::json!({ "theme": "eye-care" })).unwrap();
        fixture.manager.set_metadata("sentinel", "current").unwrap();
        fixture.import("current.pdf", b"current attachment");
        let current_count = fixture.manager.active_attachment_count().unwrap();

        let result = restore_backup_with_hook(
            &fixture.manager,
            std::path::Path::new(&backup.path),
            backup_fingerprint(std::path::Path::new(&backup.path)).unwrap(),
            serde_json::json!({ "theme": "current" }),
            || Err(DataError::restore_failed("injected post-swap failure")),
        );
        assert!(result.is_err());
        assert_eq!(
            fixture.manager.get_metadata("sentinel").unwrap().as_deref(),
            Some("current"),
        );
        assert_eq!(
            fixture.manager.active_attachment_count().unwrap(),
            current_count,
        );
        fixture.manager.health_check().unwrap();
    }
}
