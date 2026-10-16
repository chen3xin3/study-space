use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;

use chrono::{Local, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::data::database::DatabaseManager;
use crate::data::error::DataError;
use crate::data::models::AttachmentRecord;

const MAX_ATTACHMENT_BYTES: u64 = 100 * 1024 * 1024;
const MAX_ESSAY_IMAGE_BYTES: i64 = 10 * 1024 * 1024;
const MAX_ESSAY_IMAGES: usize = 4;
const HASH_BUFFER_BYTES: usize = 8 * 1024 * 1024;

pub fn import_image_bytes(
    manager: &DatabaseManager,
    bytes: Vec<u8>,
    media_type: &str,
) -> Result<AttachmentRecord, DataError> {
    import_image_bytes_inner(manager, bytes, media_type, true)
}

pub fn import_private_image_bytes(
    manager: &DatabaseManager,
    bytes: Vec<u8>,
    media_type: &str,
) -> Result<AttachmentRecord, DataError> {
    import_image_bytes_inner(manager, bytes, media_type, false)
}

fn import_image_bytes_inner(
    manager: &DatabaseManager,
    bytes: Vec<u8>,
    media_type: &str,
    index_in_libraries: bool,
) -> Result<AttachmentRecord, DataError> {
    let _operation = manager.lock_operation()?;
    if bytes.is_empty() || bytes.len() > MAX_ESSAY_IMAGE_BYTES as usize {
        return Err(DataError::attachment_invalid(
            "clipboard image is empty or exceeds 10 MB",
        ));
    }
    let extension = match media_type {
        "image/png" if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => "png",
        "image/jpeg" if bytes.starts_with(&[0xff, 0xd8, 0xff]) => "jpg",
        "image/webp" if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" => {
            "webp"
        }
        _ => {
            return Err(DataError::attachment_invalid(
                "clipboard image type or signature is unsupported",
            ))
        }
    };
    let id = Uuid::new_v4().to_string();
    let original_name = format!("clipboard-{id}.{extension}");
    let stored_name = format!("{id}.{extension}");
    let destination = manager.paths().attachments_dir.join(&stored_name);
    let partial = manager
        .paths()
        .attachments_dir
        .join(format!("{stored_name}.part"));
    let write_result = (|| -> Result<(), DataError> {
        let mut file = File::create(&partial)
            .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
        fs::rename(&partial, &destination)
            .map_err(|error| DataError::attachment_invalid(error.to_string()))
    })();
    if let Err(error) = write_result {
        let _ = fs::remove_file(&partial);
        let _ = fs::remove_file(&destination);
        return Err(error);
    }
    let sha256 = hex::encode(Sha256::digest(&bytes));
    let created_at = Utc::now().to_rfc3339();
    let record = AttachmentRecord {
        id: id.clone(),
        original_name: original_name.clone(),
        media_type: media_type.to_owned(),
        byte_size: bytes.len() as u64,
        sha256: sha256.clone(),
        created_at: created_at.clone(),
    };
    let study_date = Local::now().format("%Y-%m-%d").to_string();
    let inserted = manager.with_connection_mut(|connection| {
        let transaction = connection.transaction().map_err(DataError::from)?;
        transaction
            .execute(
                "INSERT INTO attachments
                 (id, original_name, stored_name, media_type, byte_size, sha256,
                  created_at, updated_at, version)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?7,1)",
                params![
                    id,
                    original_name,
                    stored_name,
                    media_type,
                    bytes.len() as i64,
                    sha256,
                    created_at
                ],
            )
            .map_err(DataError::from)?;
        if index_in_libraries {
            transaction
                .execute(
                    "INSERT INTO study_photos (attachment_id, study_date, study_date_confirmed,
                 title, kind, memorized, created_at, updated_at, version)
                 VALUES (?1,?2,0,?3,'other',0,?4,?4,1)",
                    params![id, study_date, original_name, created_at],
                )
                .map_err(DataError::from)?;
            transaction.execute(
                "INSERT INTO inbox_items (id,attachment_id,title,note,kind,created_at,updated_at,version)
                 VALUES (?1,?2,?3,'','image',?4,?4,1)",
                params![Uuid::new_v4().to_string(), id, original_name, created_at],
            ).map_err(DataError::from)?;
        }
        transaction.commit().map_err(DataError::from)
    });
    if let Err(error) = inserted {
        let _ = fs::remove_file(destination);
        return Err(error);
    }
    Ok(record)
}

pub fn remove_unreferenced_attachment(
    manager: &DatabaseManager,
    attachment_id: &str,
) -> Result<bool, DataError> {
    let _operation = manager.lock_operation()?;
    let mut quarantined_file = None;
    let result = manager.with_connection_mut(|connection| {
        let transaction = connection.transaction().map_err(DataError::from)?;
        let references: i64 = transaction
            .query_row(
                "SELECT
               (SELECT count(*) FROM study_photos WHERE attachment_id=?1) +
               (SELECT count(*) FROM inbox_items WHERE attachment_id=?1) +
               (SELECT count(*) FROM essay_photo_sources WHERE attachment_id=?1) +
               (SELECT count(*) FROM vocabulary_import_images WHERE attachment_id=?1) +
               (SELECT count(*) FROM vocabulary_import_candidates WHERE source_attachment_id=?1) +
               (SELECT count(*) FROM essay_attempt_attachments WHERE attachment_id=?1) +
               (SELECT count(*) FROM essay_import_draft_attachments WHERE attachment_id=?1)",
                [attachment_id],
                |row| row.get(0),
            )
            .map_err(DataError::from)?;
        if references != 0 {
            return Ok(false);
        }
        let stored_name = transaction
            .query_row(
                "SELECT stored_name FROM attachments WHERE id=?1",
                [attachment_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(DataError::from)?;
        let Some(stored_name) = stored_name else {
            return Ok(false);
        };
        if Path::new(&stored_name)
            .file_name()
            .and_then(|name| name.to_str())
            != Some(stored_name.as_str())
        {
            return Err(DataError::attachment_invalid(
                "stored attachment path is invalid",
            ));
        }
        let source = manager.paths().attachments_dir.join(&stored_name);
        if source.exists() {
            let quarantine = manager
                .paths()
                .attachments_dir
                .join(format!("{stored_name}.delete-{}", Uuid::new_v4()));
            fs::rename(&source, &quarantine)
                .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
            quarantined_file = Some((source, quarantine));
        }
        transaction
            .execute("DELETE FROM attachments WHERE id=?1", [attachment_id])
            .map_err(DataError::from)?;
        transaction.commit().map_err(DataError::from)?;
        Ok(true)
    });
    match result {
        Ok(removed) => {
            if let Some((_, quarantine)) = quarantined_file {
                let _ = fs::remove_file(quarantine);
            }
            Ok(removed)
        }
        Err(error) => {
            if let Some((source, quarantine)) = quarantined_file {
                let _ = fs::rename(quarantine, source);
            }
            Err(error)
        }
    }
}

pub fn import_attachment(
    manager: &DatabaseManager,
    source: &Path,
) -> Result<AttachmentRecord, DataError> {
    let _operation = manager.lock_operation()?;
    let source = source
        .canonicalize()
        .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
    let metadata = source
        .metadata()
        .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
    if !metadata.is_file() {
        return Err(DataError::attachment_invalid(
            "source is not a regular file",
        ));
    }
    if metadata.len() > MAX_ATTACHMENT_BYTES {
        return Err(DataError::attachment_too_large(metadata.len().to_string()));
    }

    let original_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .ok_or_else(|| DataError::attachment_invalid("source file name is invalid"))?
        .to_owned();
    let extension = source
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| DataError::attachment_invalid("source file has no extension"))?;
    let media_type = media_type_for_extension(&extension).ok_or_else(|| {
        DataError::attachment_invalid(format!("unsupported extension: {extension}"))
    })?;

    let id = Uuid::new_v4().to_string();
    let stored_name = format!("{id}.{extension}");
    let destination = manager.paths().attachments_dir.join(&stored_name);
    let partial = manager
        .paths()
        .attachments_dir
        .join(format!("{stored_name}.part"));

    let copied = copy_to_managed_path(&source, &partial, &destination);
    let (byte_size, sha256) = match copied {
        Ok(copied) => copied,
        Err(error) => {
            let _ = fs::remove_file(&partial);
            let _ = fs::remove_file(&destination);
            return Err(error);
        }
    };
    if byte_size == 0 {
        let _ = fs::remove_file(&partial);
        let _ = fs::remove_file(&destination);
        return Err(DataError::attachment_invalid("source file is empty"));
    }

    let created_at = Utc::now().to_rfc3339();
    let database_size = i64::try_from(byte_size)
        .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
    let record = AttachmentRecord {
        id: id.clone(),
        original_name: original_name.clone(),
        media_type: media_type.to_owned(),
        byte_size,
        sha256: sha256.clone(),
        created_at: created_at.clone(),
    };

    let insert_result = manager.with_connection_mut(|connection| {
        let transaction = connection
            .transaction()
            .map_err(|error| DataError::database_open_failed(error.to_string()))?;
        transaction
            .execute(
                "INSERT INTO attachments (
                    id, original_name, stored_name, media_type, byte_size,
                    sha256, created_at, updated_at, deleted_at, version
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, NULL, 1)",
                params![
                    id,
                    original_name,
                    stored_name,
                    media_type,
                    database_size,
                    sha256,
                    created_at,
                ],
            )
            .map_err(|error| DataError::database_open_failed(error.to_string()))?;
        transaction
            .commit()
            .map_err(|error| DataError::database_open_failed(error.to_string()))
    });

    if let Err(error) = insert_result {
        let _ = fs::remove_file(destination);
        return Err(error);
    }
    Ok(record)
}

#[cfg(test)]
pub fn get_attachment(
    manager: &DatabaseManager,
    id: &str,
) -> Result<Option<AttachmentRecord>, DataError> {
    manager.with_connection(|connection| {
        connection
            .query_row(
                "SELECT id, original_name, media_type, byte_size, sha256, created_at
                 FROM attachments WHERE id=?1 AND deleted_at IS NULL",
                [id],
                |row| {
                    let byte_size: i64 = row.get(3)?;
                    Ok(AttachmentRecord {
                        id: row.get(0)?,
                        original_name: row.get(1)?,
                        media_type: row.get(2)?,
                        byte_size: u64::try_from(byte_size).unwrap_or_default(),
                        sha256: row.get(4)?,
                        created_at: row.get(5)?,
                    })
                },
            )
            .optional()
            .map_err(|error| DataError::database_open_failed(error.to_string()))
    })
}

fn copy_to_managed_path(
    source: &Path,
    partial: &Path,
    destination: &Path,
) -> Result<(u64, String), DataError> {
    let mut input =
        File::open(source).map_err(|error| DataError::attachment_invalid(error.to_string()))?;
    let mut output =
        File::create(partial).map_err(|error| DataError::attachment_invalid(error.to_string()))?;
    let mut hasher = Sha256::new();
    let mut byte_size = 0_u64;
    let mut buffer = vec![0_u8; HASH_BUFFER_BYTES];
    loop {
        let read = input
            .read(&mut buffer)
            .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
        if read == 0 {
            break;
        }
        byte_size = byte_size
            .checked_add(read as u64)
            .ok_or_else(|| DataError::attachment_too_large("size overflow"))?;
        if byte_size > MAX_ATTACHMENT_BYTES {
            return Err(DataError::attachment_too_large(byte_size.to_string()));
        }
        output
            .write_all(&buffer[..read])
            .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
        hasher.update(&buffer[..read]);
    }
    output
        .sync_all()
        .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
    fs::rename(partial, destination)
        .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
    Ok((byte_size, hex::encode(hasher.finalize())))
}

fn media_type_for_extension(extension: &str) -> Option<&'static str> {
    match extension {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "bmp" => Some("image/bmp"),
        "pdf" => Some("application/pdf"),
        "doc" => Some("application/msword"),
        "docx" => Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        _ => None,
    }
}

pub fn validate_essay_attachments(
    connection: &Connection,
    attachment_ids: &[String],
) -> Result<(), DataError> {
    if attachment_ids.len() > MAX_ESSAY_IMAGES {
        return Err(DataError::essay_invalid(
            "an essay can contain at most four images",
        ));
    }
    let mut unique = std::collections::HashSet::new();
    for id in attachment_ids {
        if id.trim().is_empty() || !unique.insert(id) {
            return Err(DataError::essay_invalid(
                "essay attachment ids must be unique and non-empty",
            ));
        }
        let record = connection
            .query_row(
                "SELECT media_type, byte_size FROM attachments
                 WHERE id=?1 AND deleted_at IS NULL",
                [id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
            )
            .optional()
            .map_err(|error| DataError::essay_operation_failed(error.to_string()))?
            .ok_or_else(|| DataError::essay_invalid(format!("attachment {id} is unavailable")))?;
        if !matches!(record.0.as_str(), "image/png" | "image/jpeg" | "image/webp") {
            return Err(DataError::essay_invalid(format!(
                "attachment {id} is not a supported essay image"
            )));
        }
        if record.1 <= 0 || record.1 > MAX_ESSAY_IMAGE_BYTES {
            return Err(DataError::essay_invalid(format!(
                "attachment {id} exceeds the essay image size limit"
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use super::*;
    use crate::data::paths::DataPaths;

    struct TestData {
        _temp: tempfile::TempDir,
        source_root: PathBuf,
        manager: DatabaseManager,
    }

    impl TestData {
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

        fn write_source(&self, relative: &str, content: &[u8]) -> PathBuf {
            let path = self.source_root.join(relative);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, content).unwrap();
            path
        }
    }

    #[test]
    fn an_image_import_is_visible_in_the_photo_archive_without_restarting() {
        let fixture = TestData::new();
        let image = import_image_bytes(
            &fixture.manager,
            b"\x89PNG\r\n\x1a\nphoto".to_vec(),
            "image/png",
        )
        .unwrap();
        let count: i64 = fixture
            .manager
            .with_connection(|connection| {
                connection
                    .query_row(
                        "SELECT count(*) FROM study_photos WHERE attachment_id=?1",
                        [&image.id],
                        |row| row.get(0),
                    )
                    .map_err(DataError::from)
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn same_named_files_receive_distinct_managed_names() {
        let fixture = TestData::new();
        let first_source = fixture.write_source("a/sheet.pdf", b"first");
        let second_source = fixture.write_source("b/sheet.pdf", b"second");
        let first = import_attachment(&fixture.manager, &first_source).unwrap();
        let second = import_attachment(&fixture.manager, &second_source).unwrap();
        assert_ne!(first.id, second.id);
        assert_eq!(first.original_name, "sheet.pdf");
        assert_eq!(second.original_name, "sheet.pdf");
        assert_eq!(fixture.manager.active_attachment_count().unwrap(), 2);
    }

    #[test]
    fn rejects_executable_files_without_copying_them() {
        let fixture = TestData::new();
        let source = fixture.write_source("unsafe.exe", b"MZ");
        let error = import_attachment(&fixture.manager, &source).unwrap_err();
        assert_eq!(error.code(), "ATTACHMENT_INVALID");
        assert_eq!(
            fs::read_dir(&fixture.manager.paths().attachments_dir)
                .unwrap()
                .count(),
            0,
        );
    }

    #[test]
    fn imported_attachment_survives_database_reopen() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let source = temp.path().join("source.pdf");
        fs::write(&source, b"persistent").unwrap();
        let id = {
            let manager = DatabaseManager::open(paths.clone()).unwrap();
            import_attachment(&manager, &source).unwrap().id
        };
        let manager = DatabaseManager::open(paths).unwrap();
        let record = get_attachment(&manager, &id).unwrap().unwrap();
        assert_eq!(record.original_name, "source.pdf");
        assert!(managed_attachment_path(&manager, &id).unwrap().is_file());
    }

    fn managed_attachment_path(manager: &DatabaseManager, id: &str) -> Result<PathBuf, DataError> {
        let stored_name = manager.with_connection(|connection| {
            connection
                .query_row(
                    "SELECT stored_name FROM attachments WHERE id=?1",
                    [id],
                    |row| row.get::<_, String>(0),
                )
                .map_err(|error| DataError::database_open_failed(error.to_string()))
        })?;
        Ok(manager.paths().attachments_dir.join(stored_name))
    }
}
