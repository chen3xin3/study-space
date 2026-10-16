use std::fs::{self, File};
use std::io::Write;

use chrono::{Local, NaiveDate, Utc};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::data::database::DatabaseManager;
use crate::data::error::DataError;

const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPhotoInput {
    pub bytes: Vec<u8>,
    pub media_type: String,
    #[serde(default)]
    pub original_name: Option<String>,
    pub study_date: String,
    pub title: String,
    pub kind: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoRecord {
    pub attachment_id: String,
    pub study_date: String,
    pub study_date_confirmed: bool,
    pub title: String,
    pub kind: String,
    pub memorized: bool,
    pub original_name: String,
    pub media_type: String,
    pub created_at: String,
    pub updated_at: String,
    pub version: i64,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePhotoInput {
    pub attachment_id: String,
    pub version: i64,
    pub study_date: String,
    pub title: String,
    pub kind: String,
    pub memorized: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetPhotoDeletedInput {
    pub attachment_id: String,
    pub version: i64,
    pub deleted: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoMutationInput {
    pub attachment_id: String,
    pub version: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoImage {
    pub media_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoListPage {
    pub items: Vec<PhotoRecord>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermanentDeletePhotoResult {
    pub attachment_removed: bool,
}

fn image_extension(bytes: &[u8], media_type: &str) -> Option<&'static str> {
    match media_type {
        "image/png" if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => Some("png"),
        "image/jpeg" if bytes.starts_with(&[0xff, 0xd8, 0xff]) => Some("jpg"),
        "image/webp" if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" => {
            Some("webp")
        }
        _ => None,
    }
}

fn validate_study_date(value: &str) -> Result<(), DataError> {
    let date = NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
    if date.format("%Y-%m-%d").to_string() != value || date > Local::now().date_naive() {
        return Err(DataError::attachment_invalid(
            "study date must be today or earlier",
        ));
    }
    Ok(())
}

fn validate_kind(value: &str) -> Result<(), DataError> {
    if matches!(value, "english" | "essay" | "other") {
        Ok(())
    } else {
        Err(DataError::attachment_invalid("unknown photo kind"))
    }
}

pub fn import_photo(
    manager: &DatabaseManager,
    input: ImportPhotoInput,
) -> Result<PhotoRecord, DataError> {
    validate_study_date(&input.study_date)?;
    validate_kind(&input.kind)?;
    if input.title.chars().count() > 120 {
        return Err(DataError::attachment_invalid("photo title is too long"));
    }
    if input.bytes.is_empty() || input.bytes.len() > MAX_IMAGE_BYTES {
        return Err(DataError::attachment_invalid(
            "photo is empty or exceeds 10 MB",
        ));
    }
    let extension = image_extension(&input.bytes, &input.media_type)
        .ok_or_else(|| DataError::attachment_invalid("image type or signature is unsupported"))?;
    let _operation = manager.lock_operation()?;
    let id = Uuid::new_v4().to_string();
    let stored_name = format!("{id}.{extension}");
    let original_name = input
        .original_name
        .as_deref()
        .map(str::trim)
        .filter(|name| {
            !name.is_empty()
                && name.chars().count() <= 180
                && std::path::Path::new(name)
                    .file_name()
                    .and_then(|value| value.to_str())
                    == Some(*name)
        })
        .map(str::to_owned)
        .unwrap_or_else(|| format!("study-photo-{id}.{extension}"));
    let destination = manager.paths().attachments_dir.join(&stored_name);
    let partial = manager
        .paths()
        .attachments_dir
        .join(format!("{stored_name}.part"));
    let write_result = (|| -> Result<(), DataError> {
        let mut file = File::create(&partial)
            .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
        file.write_all(&input.bytes)
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

    let now = Utc::now().to_rfc3339();
    let sha256 = hex::encode(Sha256::digest(&input.bytes));
    let result = manager.with_connection_mut(|connection| {
        let transaction = connection.transaction().map_err(DataError::from)?;
        transaction
            .execute(
                "INSERT INTO attachments (id, original_name, stored_name, media_type, byte_size,
             sha256, created_at, updated_at, version) VALUES (?1,?2,?3,?4,?5,?6,?7,?7,1)",
                params![
                    id,
                    original_name,
                    stored_name,
                    input.media_type,
                    input.bytes.len() as i64,
                    sha256,
                    now
                ],
            )
            .map_err(DataError::from)?;
        transaction
            .execute(
                "INSERT INTO study_photos (attachment_id, study_date, study_date_confirmed,
             title, kind, memorized, created_at, updated_at, version)
             VALUES (?1,?2,1,?3,?4,0,?5,?5,1)",
                params![id, input.study_date, input.title.trim(), input.kind, now],
            )
            .map_err(DataError::from)?;
        transaction.execute(
            "INSERT INTO inbox_items (id,attachment_id,title,note,kind,created_at,updated_at,version)
             VALUES (?1,?2,?3,'','image',?4,?4,1)",
            params![Uuid::new_v4().to_string(), id, input.title.trim(), now],
        ).map_err(DataError::from)?;
        transaction.commit().map_err(DataError::from)
    });
    if let Err(error) = result {
        let _ = fs::remove_file(destination);
        return Err(error);
    }
    Ok(PhotoRecord {
        attachment_id: id,
        study_date: input.study_date,
        study_date_confirmed: true,
        title: input.title.trim().to_owned(),
        kind: input.kind,
        memorized: false,
        original_name,
        media_type: input.media_type,
        created_at: now.clone(),
        updated_at: now,
        version: 1,
        deleted_at: None,
    })
}

pub fn list_photos(
    manager: &DatabaseManager,
    kind: Option<&str>,
    limit: usize,
) -> Result<Vec<PhotoRecord>, DataError> {
    Ok(list_photo_page(manager, kind, limit, None)?.items)
}

fn map_photo_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PhotoRecord> {
    Ok(PhotoRecord {
        attachment_id: row.get(0)?,
        study_date: row.get(1)?,
        study_date_confirmed: row.get::<_, i64>(2)? != 0,
        title: row.get(3)?,
        kind: row.get(4)?,
        memorized: row.get::<_, i64>(5)? != 0,
        original_name: row.get(6)?,
        media_type: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        version: row.get(10)?,
        deleted_at: row.get(11)?,
    })
}

pub fn list_photo_page(
    manager: &DatabaseManager,
    kind: Option<&str>,
    limit: usize,
    cursor: Option<&str>,
) -> Result<PhotoListPage, DataError> {
    list_photo_page_by_state(manager, kind, false, limit, cursor)
}

pub fn list_photo_page_by_state(
    manager: &DatabaseManager,
    kind: Option<&str>,
    trash: bool,
    limit: usize,
    cursor: Option<&str>,
) -> Result<PhotoListPage, DataError> {
    if let Some(kind) = kind {
        validate_kind(kind)?;
    }
    let (cursor_date, cursor_id) = match cursor {
        Some(value) => {
            let (date, id) = value
                .split_once('|')
                .ok_or_else(|| DataError::attachment_invalid("photo cursor is invalid"))?;
            NaiveDate::parse_from_str(date, "%Y-%m-%d")
                .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
            Uuid::parse_str(id)
                .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
            (Some(date), Some(id))
        }
        None => (None, None),
    };
    let limit = limit.clamp(1, 24);
    manager.with_connection(|connection| {
        let mut statement = connection
            .prepare(
                "SELECT p.attachment_id, p.study_date, p.study_date_confirmed, p.title,
                    p.kind, p.memorized, a.original_name, a.media_type,
                    a.created_at, p.updated_at, p.version, p.deleted_at
             FROM study_photos p JOIN attachments a ON a.id=p.attachment_id
             WHERE a.deleted_at IS NULL AND (?1 IS NULL OR p.kind=?1)
               AND ((?2=1 AND p.deleted_at IS NOT NULL) OR (?2=0 AND p.deleted_at IS NULL))
               AND (?3 IS NULL OR p.study_date < ?3
                    OR (p.study_date = ?3 AND p.attachment_id < ?4))
             ORDER BY p.study_date DESC, p.attachment_id DESC LIMIT ?5",
            )
            .map_err(DataError::from)?;
        let rows = statement
            .query_map(
                params![kind, trash, cursor_date, cursor_id, (limit + 1) as i64],
                map_photo_row,
            )
            .map_err(DataError::from)?;
        let mut items = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(DataError::from)?;
        let has_more = items.len() > limit;
        items.truncate(limit);
        let next_cursor = if has_more {
            items
                .last()
                .map(|item| format!("{}|{}", item.study_date, item.attachment_id))
        } else {
            None
        };
        Ok(PhotoListPage { items, next_cursor })
    })
}

pub fn update_photo(
    manager: &DatabaseManager,
    input: UpdatePhotoInput,
) -> Result<PhotoRecord, DataError> {
    validate_study_date(&input.study_date)?;
    validate_kind(&input.kind)?;
    if input.title.chars().count() > 120 || input.version < 1 {
        return Err(DataError::attachment_invalid(
            "photo title or version is invalid",
        ));
    }
    let _operation = manager.lock_operation()?;
    manager.with_connection(|connection| {
        let now = Utc::now().to_rfc3339();
        let count = connection
            .execute(
                "UPDATE study_photos SET study_date=?1, study_date_confirmed=1,
             title=?2, kind=?3, memorized=?4, updated_at=?5, version=version+1
             WHERE attachment_id=?6 AND version=?7
               AND EXISTS (SELECT 1 FROM attachments a
                           WHERE a.id=study_photos.attachment_id AND a.deleted_at IS NULL)",
                params![
                    input.study_date,
                    input.title.trim(),
                    input.kind,
                    input.memorized,
                    now,
                    input.attachment_id,
                    input.version
                ],
            )
            .map_err(DataError::from)?;
        if count == 0 {
            return Err(DataError::attachment_invalid("photo not found or changed"));
        }
        connection
            .execute(
                "UPDATE inbox_items SET title=?1, updated_at=?2, version=version+1
             WHERE attachment_id=?3 AND deleted_at IS NULL AND title<>?1",
                params![input.title.trim(), now, input.attachment_id],
            )
            .map_err(DataError::from)?;
        connection
            .query_row(
                "SELECT p.attachment_id, p.study_date, p.study_date_confirmed, p.title,
                    p.kind, p.memorized, a.original_name, a.media_type,
                    a.created_at, p.updated_at, p.version, p.deleted_at
             FROM study_photos p JOIN attachments a ON a.id=p.attachment_id
             WHERE p.attachment_id=?1 AND a.deleted_at IS NULL",
                [&input.attachment_id],
                map_photo_row,
            )
            .map_err(DataError::from)
    })
}

pub fn set_photo_deleted(
    manager: &DatabaseManager,
    attachment_id: &str,
    version: i64,
    deleted: bool,
) -> Result<PhotoRecord, DataError> {
    if version < 1 {
        return Err(DataError::attachment_invalid("photo version is invalid"));
    }
    let _operation = manager.lock_operation()?;
    manager.with_connection(|connection| {
        let now = Utc::now().to_rfc3339();
        let deleted_at = deleted.then_some(now.as_str());
        let changed = connection
            .execute(
                "UPDATE study_photos SET deleted_at=?1,updated_at=?2,version=version+1
                 WHERE attachment_id=?3 AND version=?4
                   AND EXISTS (SELECT 1 FROM attachments a
                               WHERE a.id=study_photos.attachment_id AND a.deleted_at IS NULL)",
                params![deleted_at, now, attachment_id, version],
            )
            .map_err(DataError::from)?;
        if changed != 1 {
            return Err(DataError::attachment_invalid("photo not found or changed"));
        }
        connection
            .query_row(
                "SELECT p.attachment_id,p.study_date,p.study_date_confirmed,p.title,
                        p.kind,p.memorized,a.original_name,a.media_type,
                        a.created_at,p.updated_at,p.version,p.deleted_at
                 FROM study_photos p JOIN attachments a ON a.id=p.attachment_id
                 WHERE p.attachment_id=?1 AND a.deleted_at IS NULL",
                [attachment_id],
                map_photo_row,
            )
            .map_err(DataError::from)
    })
}

pub fn permanently_delete_photo(
    manager: &DatabaseManager,
    attachment_id: &str,
    version: i64,
) -> Result<PermanentDeletePhotoResult, DataError> {
    if version < 1 {
        return Err(DataError::attachment_invalid("photo version is invalid"));
    }
    let _operation = manager.lock_operation()?;
    let mut quarantined_file = None;
    let database_result = manager.with_connection_mut(|connection| {
        let transaction = connection.transaction().map_err(DataError::from)?;
        let changed = transaction
            .execute(
                "DELETE FROM study_photos
                 WHERE attachment_id=?1 AND version=?2 AND deleted_at IS NOT NULL",
                params![attachment_id, version],
            )
            .map_err(DataError::from)?;
        if changed != 1 {
            return Err(DataError::attachment_invalid("trashed photo not found or changed"));
        }
        let references: i64 = transaction
            .query_row(
                "SELECT
                   (SELECT count(*) FROM inbox_items WHERE attachment_id=?1) +
                   (SELECT count(*) FROM essay_photo_sources WHERE attachment_id=?1) +
                   (SELECT count(*) FROM vocabulary_import_images WHERE attachment_id=?1) +
                   (SELECT count(*) FROM vocabulary_import_candidates WHERE source_attachment_id=?1) +
                   (SELECT count(*) FROM essay_attempt_attachments WHERE attachment_id=?1)",
                [attachment_id],
                |row| row.get(0),
            )
            .map_err(DataError::from)?;
        let attachment_removed = references == 0;
        if attachment_removed {
            let stored_name: String = transaction
                .query_row(
                    "SELECT stored_name FROM attachments WHERE id=?1",
                    [attachment_id],
                    |row| row.get(0),
                )
                .map_err(DataError::from)?;
            if std::path::Path::new(&stored_name)
                .file_name()
                .and_then(|name| name.to_str())
                != Some(stored_name.as_str())
            {
                return Err(DataError::attachment_invalid(
                    "stored photo path is invalid",
                ));
            }
            let source = manager.paths().attachments_dir.join(&stored_name);
            let quarantine = manager
                .paths()
                .attachments_dir
                .join(format!("{stored_name}.delete-{}", Uuid::new_v4()));
            fs::rename(&source, &quarantine)
                .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
            quarantined_file = Some((source, quarantine));
            transaction
                .execute("DELETE FROM attachments WHERE id=?1", [attachment_id])
                .map_err(DataError::from)?;
        }
        transaction.commit().map_err(DataError::from)?;
        Ok(PermanentDeletePhotoResult { attachment_removed })
    });

    match database_result {
        Ok(result) => {
            if let Some((_, quarantine)) = quarantined_file {
                let _ = fs::remove_file(quarantine);
            }
            Ok(result)
        }
        Err(error) => {
            if let Some((source, quarantine)) = quarantined_file {
                let _ = fs::rename(quarantine, source);
            }
            Err(error)
        }
    }
}

pub fn read_photo(manager: &DatabaseManager, attachment_id: &str) -> Result<PhotoImage, DataError> {
    let (stored_name, media_type, sha256): (String, String, String) =
        manager.with_connection(|connection| {
            connection
                .query_row(
                    "SELECT a.stored_name, a.media_type, a.sha256
             FROM study_photos p JOIN attachments a ON a.id=p.attachment_id
             WHERE p.attachment_id=?1 AND a.deleted_at IS NULL",
                    [attachment_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .map_err(DataError::from)
        })?;
    if std::path::Path::new(&stored_name)
        .file_name()
        .and_then(|name| name.to_str())
        != Some(stored_name.as_str())
    {
        return Err(DataError::attachment_invalid(
            "stored photo path is invalid",
        ));
    }
    let bytes = fs::read(manager.paths().attachments_dir.join(stored_name))
        .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
    // Existing managed images could be imported under the older 100 MB attachment limit.
    if bytes.len() > 100 * 1024 * 1024
        || image_extension(&bytes, &media_type).is_none()
        || hex::encode(Sha256::digest(&bytes)) != sha256
    {
        return Err(DataError::attachment_invalid(
            "original photo is missing or damaged",
        ));
    }
    Ok(PhotoImage { media_type, bytes })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::database::DatabaseManager;
    use crate::data::paths::DataPaths;

    fn manager() -> (tempfile::TempDir, DatabaseManager) {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let manager = DatabaseManager::open(paths).unwrap();
        (temp, manager)
    }

    #[test]
    fn saves_a_photo_for_a_past_study_date_without_ai() {
        let (_temp, manager) = manager();
        let saved = import_photo(
            &manager,
            ImportPhotoInput {
                bytes: b"\x89PNG\r\n\x1a\nphoto".to_vec(),
                media_type: "image/png".into(),
                original_name: None,
                study_date: "2020-09-27".into(),
                title: "单词纸".into(),
                kind: "english".into(),
            },
        )
        .unwrap();
        assert_eq!(saved.study_date, "2020-09-27");
        assert!(saved.study_date_confirmed);
        assert!(!saved.memorized);
        assert_eq!(list_photos(&manager, None, 24).unwrap().len(), 1);
        assert_eq!(
            manager
                .with_connection(|db| crate::data::inbox::list_items(db, None, false))
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn rejects_future_dates_and_invalid_image_without_creating_an_attachment() {
        let (_temp, manager) = manager();
        for (date, bytes) in [
            ("2999-01-01", b"\x89PNG\r\n\x1a\nphoto".to_vec()),
            ("2020-01-01", b"not an image".to_vec()),
        ] {
            assert!(import_photo(
                &manager,
                ImportPhotoInput {
                    bytes,
                    media_type: "image/png".into(),
                    original_name: None,
                    study_date: date.into(),
                    title: "".into(),
                    kind: "other".into(),
                },
            )
            .is_err());
        }
        assert_eq!(manager.active_attachment_count().unwrap(), 0);
    }

    #[test]
    fn edits_study_date_and_memorized_state_with_version_protection() {
        let (_temp, manager) = manager();
        let saved = import_photo(
            &manager,
            ImportPhotoInput {
                bytes: b"\x89PNG\r\n\x1a\nphoto".to_vec(),
                media_type: "image/png".into(),
                original_name: None,
                study_date: "2020-09-27".into(),
                title: "旧标题".into(),
                kind: "english".into(),
            },
        )
        .unwrap();
        let input = UpdatePhotoInput {
            attachment_id: saved.attachment_id.clone(),
            version: saved.version,
            study_date: "2020-09-26".into(),
            title: "新标题".into(),
            kind: "english".into(),
            memorized: true,
        };
        let changed = update_photo(&manager, input).unwrap();
        assert_eq!(changed.study_date, "2020-09-26");
        assert_eq!(changed.created_at, saved.created_at);
        assert_eq!(changed.version, saved.version + 1);
        assert!(changed.memorized);
        assert!(update_photo(
            &manager,
            UpdatePhotoInput {
                attachment_id: saved.attachment_id,
                version: saved.version,
                study_date: "2020-09-25".into(),
                title: "重复修改".into(),
                kind: "english".into(),
                memorized: false,
            }
        )
        .is_err());
    }

    #[test]
    fn reads_only_a_managed_active_photo() {
        let (_temp, manager) = manager();
        let bytes = b"\x89PNG\r\n\x1a\nphoto".to_vec();
        let saved = import_photo(
            &manager,
            ImportPhotoInput {
                bytes: bytes.clone(),
                media_type: "image/png".into(),
                original_name: None,
                study_date: "2020-09-27".into(),
                title: "".into(),
                kind: "other".into(),
            },
        )
        .unwrap();
        assert_eq!(
            read_photo(&manager, &saved.attachment_id).unwrap().bytes,
            bytes
        );
        assert!(read_photo(&manager, "../../outside").is_err());
    }

    #[test]
    fn pages_photos_without_duplicates_and_filters_by_kind() {
        let (_temp, manager) = manager();
        for (title, kind) in [("A", "english"), ("B", "essay"), ("C", "english")] {
            import_photo(
                &manager,
                ImportPhotoInput {
                    bytes: b"\x89PNG\r\n\x1a\nphoto".to_vec(),
                    media_type: "image/png".into(),
                    original_name: None,
                    study_date: "2020-09-27".into(),
                    title: title.into(),
                    kind: kind.into(),
                },
            )
            .unwrap();
        }
        let first = list_photo_page(&manager, None, 2, None).unwrap();
        assert_eq!(first.items.len(), 2);
        let second = list_photo_page(&manager, None, 2, first.next_cursor.as_deref()).unwrap();
        assert_eq!(second.items.len(), 1);
        assert!(second.next_cursor.is_none());
        assert!(!first
            .items
            .iter()
            .any(|item| item.attachment_id == second.items[0].attachment_id));
        let english = list_photo_page(&manager, Some("english"), 24, None).unwrap();
        assert_eq!(english.items.len(), 2);
    }

    #[test]
    fn trashes_restores_and_permanently_removes_photo_records() {
        let (_temp, manager) = manager();
        let saved = import_photo(
            &manager,
            ImportPhotoInput {
                bytes: b"\x89PNG\r\n\x1a\nphoto".to_vec(),
                media_type: "image/png".into(),
                original_name: Some("notes.png".into()),
                study_date: "2020-09-27".into(),
                title: "课堂笔记".into(),
                kind: "other".into(),
            },
        )
        .unwrap();

        let trashed = set_photo_deleted(
            &manager,
            &saved.attachment_id,
            saved.version,
            true,
        )
        .unwrap();
        assert!(trashed.deleted_at.is_some());
        assert!(list_photo_page_by_state(&manager, None, false, 24, None)
            .unwrap()
            .items
            .is_empty());
        assert_eq!(
            list_photo_page_by_state(&manager, None, true, 24, None)
                .unwrap()
                .items
                .len(),
            1
        );

        assert!(set_photo_deleted(
            &manager,
            &saved.attachment_id,
            saved.version,
            false,
        )
        .is_err());
        let restored = set_photo_deleted(
            &manager,
            &saved.attachment_id,
            trashed.version,
            false,
        )
        .unwrap();
        assert!(restored.deleted_at.is_none());

        let trashed_again = set_photo_deleted(
            &manager,
            &saved.attachment_id,
            restored.version,
            true,
        )
        .unwrap();
        let result = permanently_delete_photo(
            &manager,
            &saved.attachment_id,
            trashed_again.version,
        )
        .unwrap();
        assert!(!result.attachment_removed);
        assert!(list_photo_page_by_state(&manager, None, false, 24, None)
            .unwrap()
            .items
            .is_empty());
        assert!(list_photo_page_by_state(&manager, None, true, 24, None)
            .unwrap()
            .items
            .is_empty());
        assert_eq!(manager.active_attachment_count().unwrap(), 1);
    }

    #[test]
    fn permanently_removing_an_unreferenced_photo_deletes_its_managed_file() {
        let (_temp, manager) = manager();
        let saved = import_photo(
            &manager,
            ImportPhotoInput {
                bytes: b"\x89PNG\r\n\x1a\nphoto".to_vec(),
                media_type: "image/png".into(),
                original_name: Some("notes.png".into()),
                study_date: "2020-09-27".into(),
                title: "课堂笔记".into(),
                kind: "other".into(),
            },
        )
        .unwrap();
        let stored_name: String = manager
            .with_connection(|connection| {
                connection
                    .query_row(
                        "SELECT stored_name FROM attachments WHERE id=?1",
                        [&saved.attachment_id],
                        |row| row.get(0),
                    )
                    .map_err(DataError::from)
            })
            .unwrap();
        let stored_path = manager.paths().attachments_dir.join(stored_name);
        assert!(stored_path.is_file());

        manager
            .with_connection(|connection| {
                connection
                    .execute(
                        "DELETE FROM inbox_items WHERE attachment_id=?1",
                        [&saved.attachment_id],
                    )
                    .map(|_| ())
                    .map_err(DataError::from)
            })
            .unwrap();
        let trashed = set_photo_deleted(
            &manager,
            &saved.attachment_id,
            saved.version,
            true,
        )
        .unwrap();
        let result = permanently_delete_photo(
            &manager,
            &saved.attachment_id,
            trashed.version,
        )
        .unwrap();

        assert!(result.attachment_removed);
        assert_eq!(manager.active_attachment_count().unwrap(), 0);
        assert!(!stored_path.exists());
    }
}
