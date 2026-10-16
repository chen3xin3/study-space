use std::sync::{Mutex, MutexGuard};
use std::time::Duration;
use std::{fs, path::Path};

use chrono::Utc;
#[cfg(test)]
use rusqlite::params;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::data::error::DataError;
use crate::data::migrations::{migrate, schema_version};
use crate::data::models::{DataStateKind, DataStatus};
use crate::data::paths::DataPaths;

pub struct DatabaseManager {
    paths: DataPaths,
    connection: Mutex<Option<Connection>>,
    operation: Mutex<()>,
}

impl DatabaseManager {
    pub fn open(paths: DataPaths) -> Result<Self, DataError> {
        recover_incomplete_restore(&paths)?;
        let connection = open_connection(&paths)?;
        Ok(Self {
            paths,
            connection: Mutex::new(Some(connection)),
            operation: Mutex::new(()),
        })
    }

    pub(crate) fn lock_operation(&self) -> Result<MutexGuard<'_, ()>, DataError> {
        self.operation
            .lock()
            .map_err(|error| DataError::database_open_failed(error.to_string()))
    }

    pub fn paths(&self) -> &DataPaths {
        &self.paths
    }

    pub fn with_connection<T>(
        &self,
        operation: impl FnOnce(&Connection) -> Result<T, DataError>,
    ) -> Result<T, DataError> {
        let guard = self
            .connection
            .lock()
            .map_err(|error| DataError::database_open_failed(error.to_string()))?;
        let connection = guard
            .as_ref()
            .ok_or_else(|| DataError::database_open_failed("database connection is closed"))?;
        operation(connection)
    }

    pub fn with_connection_mut<T>(
        &self,
        operation: impl FnOnce(&mut Connection) -> Result<T, DataError>,
    ) -> Result<T, DataError> {
        let mut guard = self
            .connection
            .lock()
            .map_err(|error| DataError::database_open_failed(error.to_string()))?;
        let connection = guard
            .as_mut()
            .ok_or_else(|| DataError::database_open_failed("database connection is closed"))?;
        operation(connection)
    }

    pub fn health_check(&self) -> Result<(), DataError> {
        self.with_connection(verify_integrity)
    }

    pub fn schema_version(&self) -> Result<usize, DataError> {
        self.with_connection(schema_version)
    }

    #[cfg(test)]
    pub fn set_metadata(&self, key: &str, value: &str) -> Result<(), DataError> {
        let now = Utc::now().to_rfc3339();
        self.with_connection(|connection| {
            connection
                .execute(
                    "INSERT INTO app_metadata (key, value, updated_at)
                     VALUES (?1, ?2, ?3)
                     ON CONFLICT(key) DO UPDATE
                     SET value=excluded.value, updated_at=excluded.updated_at",
                    params![key, value, now],
                )
                .map_err(|error| DataError::database_open_failed(error.to_string()))?;
            Ok(())
        })
    }

    #[cfg(test)]
    pub fn get_metadata(&self, key: &str) -> Result<Option<String>, DataError> {
        self.with_connection(|connection| {
            let mut statement = connection
                .prepare("SELECT value FROM app_metadata WHERE key=?1")
                .map_err(|error| DataError::database_open_failed(error.to_string()))?;
            let mut rows = statement
                .query([key])
                .map_err(|error| DataError::database_open_failed(error.to_string()))?;
            rows.next()
                .map_err(|error| DataError::database_open_failed(error.to_string()))?
                .map(|row| {
                    row.get(0)
                        .map_err(|error| DataError::database_open_failed(error.to_string()))
                })
                .transpose()
        })
    }

    pub fn active_attachment_count(&self) -> Result<u64, DataError> {
        self.with_connection(|connection| {
            let count: i64 = connection
                .query_row(
                    "SELECT count(*) FROM attachments WHERE deleted_at IS NULL",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| DataError::database_open_failed(error.to_string()))?;
            u64::try_from(count).map_err(|error| DataError::database_open_failed(error.to_string()))
        })
    }

    pub fn last_completed_backup_at(&self) -> Result<Option<String>, DataError> {
        self.with_connection(|connection| {
            let mut statement = connection
                .prepare(
                    "SELECT created_at FROM backup_history
                     WHERE status='completed'
                     ORDER BY created_at DESC LIMIT 1",
                )
                .map_err(|error| DataError::database_open_failed(error.to_string()))?;
            let mut rows = statement
                .query([])
                .map_err(|error| DataError::database_open_failed(error.to_string()))?;
            rows.next()
                .map_err(|error| DataError::database_open_failed(error.to_string()))?
                .map(|row| {
                    row.get(0)
                        .map_err(|error| DataError::database_open_failed(error.to_string()))
                })
                .transpose()
        })
    }

    pub fn status(&self) -> Result<DataStatus, DataError> {
        let _operation = self.lock_operation()?;
        self.health_check()?;
        Ok(DataStatus {
            state: DataStateKind::Ready,
            database_path: self.paths.database_path.to_string_lossy().into_owned(),
            schema_version: self.schema_version()?,
            attachment_count: self.active_attachment_count()?,
            last_backup_at: self.last_completed_backup_at()?,
        })
    }

    pub(crate) fn replace_storage_with_hook(
        &self,
        staged_database: &Path,
        staged_attachments: &Path,
        after_swap: impl FnOnce() -> Result<(), DataError>,
    ) -> Result<(), DataError> {
        let mut after_swap = Some(after_swap);
        self.replace_storage_with_move_hook(staged_database, staged_attachments, |step| {
            if step == SwapStep::StagedAttachmentsMoved {
                after_swap.take().expect("after-swap hook called once")()
            } else {
                Ok(())
            }
        })
    }

    fn replace_storage_with_move_hook(
        &self,
        staged_database: &Path,
        staged_attachments: &Path,
        mut after_move: impl FnMut(SwapStep) -> Result<(), DataError>,
    ) -> Result<(), DataError> {
        let token = uuid::Uuid::new_v4();
        let rollback_database = self
            .paths
            .root
            .join(format!(".restore-rollback-{token}.db"));
        let rollback_attachments = self
            .paths
            .root
            .join(format!(".restore-rollback-{token}-attachments"));
        let mut guard = self
            .connection
            .lock()
            .map_err(|error| DataError::restore_failed(error.to_string()))?;
        if let Some(connection) = guard.as_ref() {
            connection
                .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
                .map_err(|error| DataError::restore_failed(error.to_string()))?;
        }
        let journal_path =
            write_restore_journal(&self.paths, &rollback_database, &rollback_attachments)?;
        drop(guard.take());
        remove_database_sidecars(&self.paths.database_path);

        let mut moves = SwapProgress::default();
        let replacement = (|| -> Result<Connection, DataError> {
            fs::rename(&self.paths.database_path, &rollback_database).map_err(|error| {
                DataError::restore_failed(format!("move original database: {error}"))
            })?;
            moves.original_database = true;
            after_move(SwapStep::OriginalDatabaseMoved)?;
            fs::rename(&self.paths.attachments_dir, &rollback_attachments).map_err(|error| {
                DataError::restore_failed(format!("move original attachments: {error}"))
            })?;
            moves.original_attachments = true;
            after_move(SwapStep::OriginalAttachmentsMoved)?;
            fs::rename(staged_database, &self.paths.database_path).map_err(|error| {
                DataError::restore_failed(format!("move staged database: {error}"))
            })?;
            moves.staged_database = true;
            after_move(SwapStep::StagedDatabaseMoved)?;
            fs::rename(staged_attachments, &self.paths.attachments_dir).map_err(|error| {
                DataError::restore_failed(format!("move staged attachments: {error}"))
            })?;
            moves.staged_attachments = true;
            after_move(SwapStep::StagedAttachmentsMoved)?;
            let connection = open_connection(&self.paths)
                .map_err(|error| DataError::restore_failed(error.internal().to_owned()))?;
            fs::remove_file(&journal_path).map_err(|error| {
                DataError::restore_failed(format!("commit restore journal: {error}"))
            })?;
            Ok(connection)
        })();

        match replacement {
            Ok(connection) => {
                *guard = Some(connection);
                let _ = fs::remove_file(rollback_database);
                let _ = fs::remove_dir_all(rollback_attachments);
                Ok(())
            }
            Err(error) => {
                let mut rollback_errors = Vec::new();
                if moves.staged_attachments {
                    if let Err(rollback_error) = fs::remove_dir_all(&self.paths.attachments_dir) {
                        rollback_errors.push(rollback_error.to_string());
                    }
                }
                if moves.staged_database {
                    if let Err(rollback_error) = fs::remove_file(&self.paths.database_path) {
                        rollback_errors.push(rollback_error.to_string());
                    }
                }
                if moves.original_database {
                    if let Err(rollback_error) =
                        fs::rename(&rollback_database, &self.paths.database_path)
                    {
                        rollback_errors.push(rollback_error.to_string());
                    }
                }
                if moves.original_attachments {
                    if let Err(rollback_error) =
                        fs::rename(&rollback_attachments, &self.paths.attachments_dir)
                    {
                        rollback_errors.push(rollback_error.to_string());
                    }
                }
                if !rollback_errors.is_empty()
                    || !self.paths.database_path.is_file()
                    || !self.paths.attachments_dir.is_dir()
                {
                    return Err(DataError::restore_failed(format!(
                        "{}; rollback failed: {}",
                        error.internal(),
                        rollback_errors.join("; "),
                    )));
                }
                remove_database_sidecars(&self.paths.database_path);
                let reopened = open_connection(&self.paths).map_err(|rollback_error| {
                    DataError::restore_failed(format!(
                        "{}; rollback reopen failed: {}",
                        error.internal(),
                        rollback_error.internal(),
                    ))
                })?;
                *guard = Some(reopened);
                fs::remove_file(&journal_path).map_err(|rollback_error| {
                    DataError::restore_failed(format!(
                        "{}; rollback journal cleanup failed: {}",
                        error.internal(),
                        rollback_error,
                    ))
                })?;
                Err(DataError::restore_failed(error.internal().to_owned()))
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SwapStep {
    OriginalDatabaseMoved,
    OriginalAttachmentsMoved,
    StagedDatabaseMoved,
    StagedAttachmentsMoved,
}

#[derive(Default)]
struct SwapProgress {
    original_database: bool,
    original_attachments: bool,
    staged_database: bool,
    staged_attachments: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoreJournal {
    rollback_database: String,
    rollback_attachments: String,
}

fn restore_journal_path(paths: &DataPaths) -> std::path::PathBuf {
    paths.root.join(".restore-in-progress.json")
}

fn write_restore_journal(
    paths: &DataPaths,
    rollback_database: &Path,
    rollback_attachments: &Path,
) -> Result<std::path::PathBuf, DataError> {
    let journal = RestoreJournal {
        rollback_database: rollback_database
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| DataError::restore_failed("invalid rollback database name"))?
            .to_owned(),
        rollback_attachments: rollback_attachments
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| DataError::restore_failed("invalid rollback attachment name"))?
            .to_owned(),
    };
    let journal_path = restore_journal_path(paths);
    let bytes = serde_json::to_vec(&journal)
        .map_err(|error| DataError::restore_failed(error.to_string()))?;
    fs::write(&journal_path, bytes)
        .map_err(|error| DataError::restore_failed(error.to_string()))?;
    fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&journal_path)
        .and_then(|file| file.sync_all())
        .map_err(|error| DataError::restore_failed(error.to_string()))?;
    Ok(journal_path)
}

fn recover_incomplete_restore(paths: &DataPaths) -> Result<(), DataError> {
    let journal_path = restore_journal_path(paths);
    if !journal_path.is_file() {
        return Ok(());
    }
    let journal: RestoreJournal = serde_json::from_reader(
        fs::File::open(&journal_path)
            .map_err(|error| DataError::restore_failed(error.to_string()))?,
    )
    .map_err(|error| DataError::restore_failed(error.to_string()))?;
    for name in [&journal.rollback_database, &journal.rollback_attachments] {
        let path = Path::new(name);
        if path.components().count() != 1
            || !matches!(
                path.components().next(),
                Some(std::path::Component::Normal(_))
            )
        {
            return Err(DataError::restore_failed("unsafe restore journal path"));
        }
    }

    let rollback_database = paths.root.join(&journal.rollback_database);
    let rollback_attachments = paths.root.join(&journal.rollback_attachments);
    if rollback_database.is_file() {
        if paths.database_path.exists() {
            fs::remove_file(&paths.database_path)
                .map_err(|error| DataError::restore_failed(error.to_string()))?;
        }
        fs::rename(&rollback_database, &paths.database_path)
            .map_err(|error| DataError::restore_failed(error.to_string()))?;
    }
    if rollback_attachments.is_dir() {
        if paths.attachments_dir.exists() {
            fs::remove_dir_all(&paths.attachments_dir)
                .map_err(|error| DataError::restore_failed(error.to_string()))?;
        }
        fs::rename(&rollback_attachments, &paths.attachments_dir)
            .map_err(|error| DataError::restore_failed(error.to_string()))?;
    }
    if !paths.database_path.is_file() || !paths.attachments_dir.is_dir() {
        return Err(DataError::restore_failed("incomplete restore recovery"));
    }
    remove_database_sidecars(&paths.database_path);
    fs::remove_file(journal_path).map_err(|error| DataError::restore_failed(error.to_string()))
}

fn open_connection(paths: &DataPaths) -> Result<Connection, DataError> {
    let mut connection = Connection::open(&paths.database_path)
        .map_err(|error| DataError::database_open_failed(error.to_string()))?;
    configure_connection(&connection)?;
    migrate(&mut connection)?;
    backfill_legacy_photos(&connection)?;
    recover_interrupted_vocabulary_imports(&connection)?;
    verify_integrity(&connection)?;
    Ok(connection)
}

fn backfill_legacy_photos(connection: &Connection) -> Result<(), DataError> {
    connection
        .execute(
            "INSERT OR IGNORE INTO study_photos
             (attachment_id, study_date, study_date_confirmed, title, kind,
              memorized, created_at, updated_at, version)
             SELECT a.id,
                    coalesce(date(a.created_at, 'localtime'), date('now', 'localtime')),
                    0, a.original_name,
                    CASE WHEN EXISTS (
                        SELECT 1 FROM vocabulary_import_images v
                        WHERE v.attachment_id=a.id
                    ) THEN 'english' ELSE 'other' END,
                    0, a.created_at, a.updated_at, 1
             FROM attachments a
             WHERE a.deleted_at IS NULL
               AND a.media_type IN ('image/png', 'image/jpeg', 'image/webp')",
            [],
        )
        .map_err(|error| DataError::database_open_failed(error.to_string()))?;
    connection.execute(
        "INSERT INTO inbox_items (id,folder_id,attachment_id,title,note,kind,created_at,updated_at,version)
         SELECT lower(hex(randomblob(16))),NULL,p.attachment_id,
                CASE WHEN p.title <> '' THEN p.title ELSE a.original_name END,
                '', 'image',a.created_at,a.updated_at,1
         FROM study_photos p JOIN attachments a ON a.id=p.attachment_id
         WHERE a.deleted_at IS NULL AND NOT EXISTS (
           SELECT 1 FROM inbox_items i WHERE i.attachment_id=p.attachment_id
         )",
        [],
    ).map(|_| ()).map_err(|error| DataError::database_open_failed(error.to_string()))
}

fn recover_interrupted_vocabulary_imports(connection: &Connection) -> Result<(), DataError> {
    let now = Utc::now().to_rfc3339();
    connection
        .execute(
            "UPDATE vocabulary_import_sessions
             SET status='failed', error_code='VOCABULARY_RECOGNITION_INTERRUPTED',
                 updated_at=?1, version=version+1
             WHERE status='recognizing' AND deleted_at IS NULL",
            [now],
        )
        .map(|_| ())
        .map_err(|error| DataError::database_open_failed(error.to_string()))
}

fn remove_database_sidecars(database_path: &Path) {
    for suffix in ["-wal", "-shm"] {
        let sidecar =
            std::path::PathBuf::from(format!("{}{suffix}", database_path.to_string_lossy(),));
        let _ = fs::remove_file(sidecar);
    }
}

fn configure_connection(connection: &Connection) -> Result<(), DataError> {
    connection
        .pragma_update(None, "foreign_keys", true)
        .and_then(|_| connection.pragma_update(None, "journal_mode", "WAL"))
        .and_then(|_| connection.pragma_update(None, "synchronous", "NORMAL"))
        .map_err(|error| DataError::database_open_failed(error.to_string()))?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| DataError::database_open_failed(error.to_string()))
}

fn verify_integrity(connection: &Connection) -> Result<(), DataError> {
    let result: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| DataError::database_integrity_failed(error.to_string()))?;
    if result == "ok" {
        Ok(())
    } else {
        Err(DataError::database_integrity_failed(result))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reopening_indexes_older_images_once_without_claiming_they_were_memorized() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let photo_id = {
            let manager = DatabaseManager::open(paths.clone()).unwrap();
            let id = crate::data::attachments::import_image_bytes(
                &manager,
                b"\x89PNG\r\n\x1a\nlegacy".to_vec(),
                "image/png",
            )
            .unwrap()
            .id;
            manager
                .with_connection(|connection| {
                    connection
                        .execute("DELETE FROM inbox_items WHERE attachment_id=?1", [&id])
                        .map_err(DataError::from)?;
                    connection
                        .execute("DELETE FROM study_photos WHERE attachment_id=?1", [&id])
                        .map_err(DataError::from)?;
                    Ok(())
                })
                .unwrap();
            id
        };
        for _ in 0..2 {
            let manager = DatabaseManager::open(paths.clone()).unwrap();
            let row: (i64, i64, i64) = manager.with_connection(|connection| {
                connection
                    .query_row(
                        "SELECT count(*), coalesce(max(study_date_confirmed), -1), coalesce(max(memorized), -1)
                         FROM study_photos WHERE attachment_id=?1",
                        [&photo_id],
                        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                    )
                    .map_err(DataError::from)
            }).unwrap();
            assert_eq!(row, (1, 0, 0));
            let inbox_count: i64 = manager
                .with_connection(|connection| {
                    connection
                        .query_row(
                            "SELECT count(*) FROM inbox_items WHERE attachment_id=?1",
                            [&photo_id],
                            |row| row.get(0),
                        )
                        .map_err(DataError::from)
                })
                .unwrap();
            assert_eq!(inbox_count, 1);
        }
    }

    #[test]
    fn reopening_preserves_metadata_and_reports_ready() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().to_path_buf()).unwrap();
        {
            let manager = DatabaseManager::open(paths.clone()).unwrap();
            manager.set_metadata("probe", "kept").unwrap();
        }
        let manager = DatabaseManager::open(paths).unwrap();
        assert_eq!(
            manager.get_metadata("probe").unwrap().as_deref(),
            Some("kept"),
        );
        manager.health_check().unwrap();
    }

    #[test]
    fn every_partial_swap_failure_restores_original_storage_once() {
        for fail_at in [
            SwapStep::OriginalDatabaseMoved,
            SwapStep::OriginalAttachmentsMoved,
            SwapStep::StagedDatabaseMoved,
            SwapStep::StagedAttachmentsMoved,
        ] {
            let temp = tempfile::tempdir().unwrap();
            let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
            let manager = DatabaseManager::open(paths.clone()).unwrap();
            manager.set_metadata("sentinel", "original").unwrap();
            fs::write(paths.attachments_dir.join("original.pdf"), b"original").unwrap();

            let staged_database = temp.path().join("staged.db");
            let staged = Connection::open(&staged_database).unwrap();
            drop(staged);
            let staged_attachments = temp.path().join("staged-attachments");
            fs::create_dir(&staged_attachments).unwrap();
            fs::write(staged_attachments.join("new.pdf"), b"new").unwrap();

            let result = manager.replace_storage_with_move_hook(
                &staged_database,
                &staged_attachments,
                |step| {
                    if step == fail_at {
                        Err(DataError::restore_failed("injected move failure"))
                    } else {
                        Ok(())
                    }
                },
            );

            assert!(result.is_err(), "step {fail_at:?} must fail");
            assert_eq!(
                manager.get_metadata("sentinel").unwrap().as_deref(),
                Some("original"),
            );
            assert_eq!(
                fs::read(paths.attachments_dir.join("original.pdf")).unwrap(),
                b"original",
            );
            manager.health_check().unwrap();
        }
    }

    #[test]
    fn startup_recovers_a_swap_interrupted_after_originals_moved() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let manager = DatabaseManager::open(paths.clone()).unwrap();
        manager.set_metadata("sentinel", "original").unwrap();
        fs::write(paths.attachments_dir.join("original.pdf"), b"original").unwrap();
        drop(manager);

        let rollback_database = paths.root.join(".restore-rollback-test.db");
        let rollback_attachments = paths.root.join(".restore-rollback-test-attachments");
        write_restore_journal(&paths, &rollback_database, &rollback_attachments).unwrap();
        fs::rename(&paths.database_path, &rollback_database).unwrap();
        fs::rename(&paths.attachments_dir, &rollback_attachments).unwrap();
        fs::create_dir(&paths.attachments_dir).unwrap();

        let recovered = DatabaseManager::open(paths.clone()).unwrap();
        assert_eq!(
            recovered.get_metadata("sentinel").unwrap().as_deref(),
            Some("original"),
        );
        assert_eq!(
            fs::read(paths.attachments_dir.join("original.pdf")).unwrap(),
            b"original",
        );
        assert!(!restore_journal_path(&paths).exists());
    }

    #[test]
    fn startup_marks_interrupted_vocabulary_recognition_as_retryable_failure() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let manager = DatabaseManager::open(paths.clone()).unwrap();
        manager
            .with_connection(|connection| {
                connection
                    .execute(
                        "INSERT INTO vocabulary_import_sessions
                         (id, status, created_at, updated_at, version)
                         VALUES ('interrupted', 'recognizing', ?1, ?1, 1)",
                        [Utc::now().to_rfc3339()],
                    )
                    .map(|_| ())
                    .map_err(|error| DataError::database_open_failed(error.to_string()))
            })
            .unwrap();
        drop(manager);

        let reopened = DatabaseManager::open(paths).unwrap();
        let (status, error_code, version): (String, Option<String>, i64) = reopened
            .with_connection(|connection| {
                connection
                    .query_row(
                        "SELECT status, error_code, version FROM vocabulary_import_sessions
                         WHERE id='interrupted'",
                        [],
                        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                    )
                    .map_err(|error| DataError::database_open_failed(error.to_string()))
            })
            .unwrap();
        assert_eq!(status, "failed");
        assert_eq!(
            error_code.as_deref(),
            Some("VOCABULARY_RECOGNITION_INTERRUPTED")
        );
        assert_eq!(version, 2);
    }
}
