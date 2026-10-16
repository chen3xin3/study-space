use std::fs::{self, File};
use std::io::Write;

use chrono::{Local, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::data::database::DatabaseManager;
use crate::data::error::DataError;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxFolder {
    pub id: String,
    pub name: String,
    pub version: i64,
    pub item_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxItem {
    pub id: String,
    pub folder_id: Option<String>,
    pub attachment_id: Option<String>,
    pub title: String,
    pub note: String,
    pub kind: String,
    pub original_name: Option<String>,
    pub media_type: Option<String>,
    pub byte_size: Option<i64>,
    pub created_at: String,
    pub deleted_at: Option<String>,
    pub version: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportInboxFileInput {
    pub name: String,
    pub bytes: Vec<u8>,
    pub folder_id: Option<String>,
}

fn validate_name(name: &str) -> Result<&str, DataError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 || name.contains(['/', '\\']) {
        return Err(DataError::attachment_invalid("invalid folder or file name"));
    }
    Ok(name)
}

fn file_type(
    name: &str,
    bytes: &[u8],
) -> Result<(&'static str, &'static str, &'static str), DataError> {
    let extension = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match extension.as_str() {
        "png" if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => Ok(("png", "image/png", "image")),
        "jpg" | "jpeg" if bytes.starts_with(&[0xff, 0xd8, 0xff]) => {
            Ok(("jpg", "image/jpeg", "image"))
        }
        "webp" if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" => {
            Ok(("webp", "image/webp", "image"))
        }
        "pdf" if bytes.starts_with(b"%PDF-") => Ok(("pdf", "application/pdf", "document")),
        "docx" if bytes.starts_with(b"PK\x03\x04") => Ok((
            "docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "document",
        )),
        "txt" | "md" if std::str::from_utf8(bytes).is_ok() => Ok((
            if extension == "md" { "md" } else { "txt" },
            "text/plain",
            "document",
        )),
        _ => Err(DataError::attachment_invalid(
            "unsupported file type or signature",
        )),
    }
}

fn folder_exists(connection: &Connection, folder_id: &str) -> Result<bool, DataError> {
    connection
        .query_row(
            "SELECT 1 FROM inbox_folders WHERE id=?1 AND deleted_at IS NULL",
            [folder_id],
            |_| Ok(()),
        )
        .optional()
        .map(|found| found.is_some())
        .map_err(DataError::from)
}

pub fn list_folders(connection: &Connection) -> Result<Vec<InboxFolder>, DataError> {
    let mut stmt = connection.prepare("SELECT f.id,f.name,f.version,count(i.id) FROM inbox_folders f LEFT JOIN inbox_items i ON i.folder_id=f.id AND i.deleted_at IS NULL WHERE f.deleted_at IS NULL GROUP BY f.id ORDER BY f.created_at,f.id").map_err(DataError::from)?;
    let items = stmt
        .query_map([], |row| {
            Ok(InboxFolder {
                id: row.get(0)?,
                name: row.get(1)?,
                version: row.get(2)?,
                item_count: row.get(3)?,
            })
        })
        .map_err(DataError::from)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(DataError::from)?;
    Ok(items)
}

pub fn create_folder(connection: &Connection, name: &str) -> Result<InboxFolder, DataError> {
    let name = validate_name(name)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    connection.execute("INSERT INTO inbox_folders (id,name,created_at,updated_at,version) VALUES (?1,?2,?3,?3,1)", params![id,name,now]).map_err(DataError::from)?;
    Ok(InboxFolder {
        id,
        name: name.into(),
        version: 1,
        item_count: 0,
    })
}

pub fn rename_folder(
    connection: &Connection,
    id: &str,
    version: i64,
    name: &str,
) -> Result<(), DataError> {
    let name = validate_name(name)?;
    let count = connection.execute("UPDATE inbox_folders SET name=?1,version=version+1,updated_at=?2 WHERE id=?3 AND version=?4 AND deleted_at IS NULL", params![name,Utc::now().to_rfc3339(),id,version]).map_err(DataError::from)?;
    if count == 0 {
        return Err(DataError::dashboard_conflict("folder changed"));
    }
    Ok(())
}

pub fn list_items(
    connection: &Connection,
    folder_id: Option<&str>,
    trash: bool,
) -> Result<Vec<InboxItem>, DataError> {
    list_items_page(connection, folder_id, trash, 0)
}

pub fn list_items_page(
    connection: &Connection,
    folder_id: Option<&str>,
    trash: bool,
    offset: usize,
) -> Result<Vec<InboxItem>, DataError> {
    let offset = offset.min(100_000) as i64;
    let sql = if trash {
        "SELECT i.id,i.folder_id,i.attachment_id,i.title,i.note,i.kind,a.original_name,a.media_type,a.byte_size,i.created_at,i.deleted_at,i.version FROM inbox_items i LEFT JOIN attachments a ON a.id=i.attachment_id WHERE i.deleted_at IS NOT NULL ORDER BY i.deleted_at DESC,i.id DESC LIMIT 100 OFFSET ?1"
    } else {
        "SELECT i.id,i.folder_id,i.attachment_id,i.title,i.note,i.kind,a.original_name,a.media_type,a.byte_size,i.created_at,i.deleted_at,i.version FROM inbox_items i LEFT JOIN attachments a ON a.id=i.attachment_id WHERE i.deleted_at IS NULL AND i.folder_id IS ?1 ORDER BY i.created_at DESC,i.id DESC LIMIT 100 OFFSET ?2"
    };
    let mut stmt = connection.prepare(sql).map_err(DataError::from)?;
    let mapper = |row: &rusqlite::Row<'_>| {
        Ok(InboxItem {
            id: row.get(0)?,
            folder_id: row.get(1)?,
            attachment_id: row.get(2)?,
            title: row.get(3)?,
            note: row.get(4)?,
            kind: row.get(5)?,
            original_name: row.get(6)?,
            media_type: row.get(7)?,
            byte_size: row.get(8)?,
            created_at: row.get(9)?,
            deleted_at: row.get(10)?,
            version: row.get(11)?,
        })
    };
    let items = if trash {
        stmt.query_map([offset], mapper)
            .map_err(DataError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(DataError::from)?
    } else {
        stmt.query_map(params![folder_id, offset], mapper)
            .map_err(DataError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(DataError::from)?
    };
    Ok(items)
}

pub fn create_note(
    connection: &Connection,
    title: &str,
    note: &str,
    folder_id: Option<&str>,
) -> Result<(), DataError> {
    let title = validate_name(title)?;
    if note.trim().is_empty() || note.chars().count() > 20_000 {
        return Err(DataError::attachment_invalid("note is empty or too long"));
    }
    if let Some(folder_id) = folder_id {
        if !folder_exists(connection, folder_id)? {
            return Err(DataError::dashboard_not_found("folder not found"));
        }
    }
    let now = Utc::now().to_rfc3339();
    connection.execute("INSERT INTO inbox_items (id,folder_id,title,note,kind,created_at,updated_at,version) VALUES (?1,?2,?3,?4,'note',?5,?5,1)", params![Uuid::new_v4().to_string(),folder_id,title,note.trim(),now]).map_err(DataError::from)?;
    Ok(())
}

pub fn import_file(
    manager: &DatabaseManager,
    input: ImportInboxFileInput,
) -> Result<(), DataError> {
    let _guard = manager.lock_operation()?;
    let name = validate_name(&input.name)?;
    if input.bytes.is_empty() || input.bytes.len() > 20 * 1024 * 1024 {
        return Err(DataError::attachment_invalid(
            "inbox file must be 1 byte to 20 MB",
        ));
    }
    let (extension, media_type, kind) = file_type(name, &input.bytes)?;
    let attachment_id = Uuid::new_v4().to_string();
    let stored_name = format!("{attachment_id}.{extension}");
    let destination = manager.paths().attachments_dir.join(&stored_name);
    let partial = manager
        .paths()
        .attachments_dir
        .join(format!("{stored_name}.part"));
    let hash = hex::encode(Sha256::digest(&input.bytes));
    let mut file =
        File::create(&partial).map_err(|error| DataError::attachment_invalid(error.to_string()))?;
    if let Err(error) = file
        .write_all(&input.bytes)
        .and_then(|_| file.sync_all())
        .and_then(|_| fs::rename(&partial, &destination))
    {
        let _ = fs::remove_file(&partial);
        return Err(DataError::attachment_invalid(error.to_string()));
    }
    let outcome = manager.with_connection_mut(|connection| {
        let transaction = connection.transaction().map_err(DataError::from)?;
        if let Some(folder_id) = input.folder_id.as_deref() { if !folder_exists(&transaction, folder_id)? { return Err(DataError::dashboard_not_found("folder not found")); } }
        let now = Utc::now().to_rfc3339();
        transaction.execute("INSERT INTO attachments (id,original_name,stored_name,media_type,byte_size,sha256,created_at,updated_at,version) VALUES (?1,?2,?3,?4,?5,?6,?7,?7,1)", params![attachment_id,name,stored_name,media_type,input.bytes.len() as i64,hash,now]).map_err(DataError::from)?;
        transaction.execute("INSERT INTO inbox_items (id,folder_id,attachment_id,title,note,kind,created_at,updated_at,version) VALUES (?1,?2,?3,?4,'',?5,?6,?6,1)", params![Uuid::new_v4().to_string(),input.folder_id,attachment_id,name,kind,now]).map_err(DataError::from)?;
        if kind == "image" {
            transaction.execute(
                "INSERT INTO study_photos (attachment_id,study_date,study_date_confirmed,title,kind,memorized,created_at,updated_at,version)
                 VALUES (?1,?2,0,?3,'other',0,?4,?4,1)",
                params![attachment_id, Local::now().format("%Y-%m-%d").to_string(), name, now],
            ).map_err(DataError::from)?;
        }
        transaction.commit().map_err(DataError::from)
    });
    if outcome.is_err() {
        let _ = fs::remove_file(destination);
    }
    outcome
}

pub fn move_item(
    connection: &Connection,
    id: &str,
    version: i64,
    folder_id: Option<&str>,
) -> Result<(), DataError> {
    if let Some(folder_id) = folder_id {
        if !folder_exists(connection, folder_id)? {
            return Err(DataError::dashboard_not_found("folder not found"));
        }
    }
    let count = connection.execute("UPDATE inbox_items SET folder_id=?1,version=version+1,updated_at=?2 WHERE id=?3 AND version=?4 AND deleted_at IS NULL", params![folder_id,Utc::now().to_rfc3339(),id,version]).map_err(DataError::from)?;
    if count == 0 {
        return Err(DataError::dashboard_conflict("inbox item changed"));
    }
    Ok(())
}

pub fn set_deleted(
    connection: &Connection,
    id: &str,
    version: i64,
    deleted: bool,
) -> Result<(), DataError> {
    let now = Utc::now().to_rfc3339();
    let count = connection.execute("UPDATE inbox_items SET deleted_at=?1,version=version+1,updated_at=?2 WHERE id=?3 AND version=?4", params![if deleted { Some(now.as_str()) } else { None },now,id,version]).map_err(DataError::from)?;
    if count == 0 {
        return Err(DataError::dashboard_conflict("inbox item changed"));
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxFile {
    pub bytes: Vec<u8>,
    pub media_type: String,
    pub name: String,
}

pub fn read_file(manager: &DatabaseManager, item_id: &str) -> Result<InboxFile, DataError> {
    let (stored_name, media_type, name, expected_hash): (String,String,String,String) = manager.with_connection(|connection| connection.query_row("SELECT a.stored_name,a.media_type,a.original_name,a.sha256 FROM inbox_items i JOIN attachments a ON a.id=i.attachment_id WHERE i.id=?1 AND i.deleted_at IS NULL", [item_id], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?))).map_err(DataError::from))?;
    if std::path::Path::new(&stored_name)
        .file_name()
        .and_then(|value| value.to_str())
        != Some(stored_name.as_str())
    {
        return Err(DataError::attachment_invalid("invalid managed file path"));
    }
    let bytes = fs::read(manager.paths().attachments_dir.join(stored_name))
        .map_err(|error| DataError::attachment_invalid(error.to_string()))?;
    if hex::encode(Sha256::digest(&bytes)) != expected_hash {
        return Err(DataError::database_integrity_failed(
            "inbox file hash mismatch",
        ));
    }
    Ok(InboxFile {
        bytes,
        media_type,
        name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::migrations::migrate;
    use crate::data::paths::DataPaths;
    #[test]
    fn folders_move_note_and_soft_delete_without_losing_content() {
        let mut db = Connection::open_in_memory().unwrap();
        migrate(&mut db).unwrap();
        let folder = create_folder(&db, "英语资料").unwrap();
        create_note(&db, "词汇", "记住一组表达", None).unwrap();
        let item = list_items(&db, None, false).unwrap().remove(0);
        move_item(&db, &item.id, item.version, Some(&folder.id)).unwrap();
        let moved = list_items(&db, Some(&folder.id), false).unwrap().remove(0);
        assert_eq!(moved.note, "记住一组表达");
        set_deleted(&db, &moved.id, moved.version, true).unwrap();
        assert_eq!(list_items(&db, None, true).unwrap().len(), 1);
        let trashed = list_items(&db, None, true).unwrap().remove(0);
        set_deleted(&db, &trashed.id, trashed.version, false).unwrap();
        assert_eq!(list_items(&db, Some(&folder.id), false).unwrap().len(), 1);
    }
    #[test]
    fn imported_file_is_copied_into_managed_storage_and_reopens() {
        let temp = tempfile::tempdir().unwrap();
        let manager =
            DatabaseManager::open(DataPaths::from_root(temp.path().join("app")).unwrap()).unwrap();
        import_file(
            &manager,
            ImportInboxFileInput {
                name: "note.pdf".into(),
                bytes: b"%PDF-1.4\nexample".to_vec(),
                folder_id: None,
            },
        )
        .unwrap();
        let item = manager
            .with_connection(|db| list_items(db, None, false))
            .unwrap()
            .remove(0);
        assert_eq!(
            read_file(&manager, &item.id).unwrap().bytes,
            b"%PDF-1.4\nexample"
        );
    }
    #[test]
    fn inbox_image_is_immediately_visible_in_dated_photo_archive() {
        let temp = tempfile::tempdir().unwrap();
        let manager =
            DatabaseManager::open(DataPaths::from_root(temp.path().join("app")).unwrap()).unwrap();
        import_file(
            &manager,
            ImportInboxFileInput {
                name: "word-page.png".into(),
                bytes: b"\x89PNG\r\n\x1a\nphoto".to_vec(),
                folder_id: None,
            },
        )
        .unwrap();
        assert_eq!(
            crate::data::photo_archive::list_photos(&manager, None, 24)
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn older_inbox_items_remain_reachable_after_first_page() {
        let mut db = Connection::open_in_memory().unwrap();
        migrate(&mut db).unwrap();
        for index in 0..101 {
            create_note(&db, &format!("笔记{index}"), "内容", None).unwrap();
        }
        assert_eq!(list_items_page(&db, None, false, 0).unwrap().len(), 100);
        assert_eq!(list_items_page(&db, None, false, 100).unwrap().len(), 1);
    }
}
