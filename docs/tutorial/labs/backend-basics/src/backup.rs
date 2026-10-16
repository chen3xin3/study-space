use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use sha2::{Digest, Sha256};

use crate::error::AppError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackupInfo {
    pub path: PathBuf,
    pub sha256: String,
}

fn hash_file(path: &Path) -> Result<String, AppError> {
    let bytes = fs::read(path).map_err(|error| AppError::storage(error.to_string()))?;
    Ok(hex::encode(Sha256::digest(bytes)))
}

pub fn create_backup(source: &Connection, target: &Path) -> Result<BackupInfo, AppError> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| AppError::storage(error.to_string()))?;
    }
    source
        .backup("main", target, None)
        .map_err(|error| AppError::storage(error.to_string()))?;
    let sha256 = validate_backup(target)?;
    Ok(BackupInfo {
        path: target.to_path_buf(),
        sha256,
    })
}

pub fn validate_backup(path: &Path) -> Result<String, AppError> {
    let connection =
        Connection::open(path).map_err(|error| AppError::backup_invalid(error.to_string()))?;
    let result: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| AppError::backup_invalid(error.to_string()))?;
    if result != "ok" {
        return Err(AppError::backup_invalid(result));
    }
    hash_file(path)
        .map_err(|error| AppError::backup_invalid(error.internal.unwrap_or(error.message)))
}

pub fn restore_with_protection(
    current_database: &Path,
    candidate_backup: &Path,
    protective_backup: &Path,
) -> Result<(), AppError> {
    validate_backup(candidate_backup)?;
    let current =
        Connection::open(current_database).map_err(|error| AppError::storage(error.to_string()))?;
    create_backup(&current, protective_backup)?;
    drop(current);
    fs::copy(candidate_backup, current_database)
        .map_err(|error| AppError::storage(error.to_string()))?;
    validate_backup(current_database)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use rusqlite::Connection;
    use tempfile::tempdir;

    use crate::database::{create_schema, insert_task};

    use super::{create_backup, restore_with_protection, validate_backup};

    fn database(path: &std::path::Path, title: &str) {
        let connection = Connection::open(path).unwrap();
        create_schema(&connection).unwrap();
        insert_task(&connection, "task-1", title, "math", 10).unwrap();
    }

    #[test]
    fn backup_is_a_consistent_verified_sqlite_snapshot() {
        let temp = tempdir().unwrap();
        let source_path = temp.path().join("source.db");
        let backup_path = temp.path().join("backup.db");
        database(&source_path, "备份前的任务");
        let source = Connection::open(&source_path).unwrap();

        let info = create_backup(&source, &backup_path).unwrap();

        assert_eq!(info.sha256.len(), 64);
        assert_eq!(validate_backup(&backup_path).unwrap(), info.sha256);
        let backup = Connection::open(&backup_path).unwrap();
        let title: String = backup
            .query_row(
                "SELECT title FROM study_tasks WHERE id = 'task-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(title, "备份前的任务");
    }

    #[test]
    fn corrupt_backup_is_rejected() {
        let temp = tempdir().unwrap();
        let corrupt = temp.path().join("corrupt.db");
        fs::write(&corrupt, b"not a sqlite database").unwrap();
        assert_eq!(
            validate_backup(&corrupt).unwrap_err().code,
            "backup_invalid"
        );
    }

    #[test]
    fn restore_creates_a_protective_backup_before_replacing_current_data() {
        let temp = tempdir().unwrap();
        let current = temp.path().join("current.db");
        let candidate = temp.path().join("candidate.db");
        let protective = temp.path().join("before-restore.db");
        database(&current, "当前数据");
        database(&candidate, "准备恢复的数据");

        restore_with_protection(&current, &candidate, &protective).unwrap();

        let restored = Connection::open(&current).unwrap();
        let restored_title: String = restored
            .query_row(
                "SELECT title FROM study_tasks WHERE id = 'task-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(restored_title, "准备恢复的数据");
        let protected = Connection::open(&protective).unwrap();
        let protected_title: String = protected
            .query_row(
                "SELECT title FROM study_tasks WHERE id = 'task-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(protected_title, "当前数据");
    }
}
