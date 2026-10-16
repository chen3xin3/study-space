use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};

use crate::error::AppError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredTask {
    pub id: String,
    pub title: String,
    pub subject: String,
    pub completed: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i64,
    pub deleted_at: Option<i64>,
}

const TASK_COLUMNS: &str =
    "id, title, subject, completed, created_at, updated_at, version, deleted_at";

fn storage(error: rusqlite::Error) -> AppError {
    AppError::storage(error.to_string())
}

fn map_task(row: &Row<'_>) -> rusqlite::Result<StoredTask> {
    Ok(StoredTask {
        id: row.get(0)?,
        title: row.get(1)?,
        subject: row.get(2)?,
        completed: row.get::<_, i64>(3)? != 0,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        version: row.get(6)?,
        deleted_at: row.get(7)?,
    })
}

pub fn in_transaction<T>(
    connection: &mut Connection,
    operation: impl FnOnce(&Transaction<'_>) -> Result<T, AppError>,
) -> Result<T, AppError> {
    let transaction = connection.transaction().map_err(storage)?;
    match operation(&transaction) {
        Ok(value) => {
            transaction.commit().map_err(storage)?;
            Ok(value)
        }
        Err(error) => {
            transaction.rollback().map_err(storage)?;
            Err(error)
        }
    }
}

pub fn create_task(
    connection: &Connection,
    id: &str,
    title: &str,
    subject: &str,
    timestamp: i64,
) -> Result<StoredTask, AppError> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::invalid_title());
    }
    connection
        .execute(
            "INSERT INTO study_tasks (id, title, subject, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)",
            params![id, title, subject, timestamp],
        )
        .map_err(storage)?;
    get_task(connection, id)?.ok_or_else(AppError::not_found)
}

pub fn get_task(connection: &Connection, id: &str) -> Result<Option<StoredTask>, AppError> {
    connection
        .query_row(
            &format!("SELECT {TASK_COLUMNS} FROM study_tasks WHERE id = ?1"),
            params![id],
            map_task,
        )
        .optional()
        .map_err(storage)
}

pub fn list_tasks(connection: &Connection) -> Result<Vec<StoredTask>, AppError> {
    let mut statement = connection
        .prepare(&format!(
            "SELECT {TASK_COLUMNS} FROM study_tasks
             WHERE deleted_at IS NULL ORDER BY created_at ASC, id ASC"
        ))
        .map_err(storage)?;
    let rows = statement.query_map([], map_task).map_err(storage)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(storage)
}

pub fn update_task_title(
    connection: &Connection,
    id: &str,
    title: &str,
    timestamp: i64,
) -> Result<StoredTask, AppError> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::invalid_title());
    }
    let changed = connection
        .execute(
            "UPDATE study_tasks
             SET title = ?1, updated_at = ?2, version = version + 1
             WHERE id = ?3 AND deleted_at IS NULL",
            params![title, timestamp, id],
        )
        .map_err(storage)?;
    if changed == 0 {
        return Err(AppError::not_found());
    }
    get_task(connection, id)?.ok_or_else(AppError::not_found)
}

pub fn update_task_title_if_version(
    connection: &Connection,
    id: &str,
    title: &str,
    expected_version: i64,
    timestamp: i64,
) -> Result<StoredTask, AppError> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::invalid_title());
    }
    let changed = connection
        .execute(
            "UPDATE study_tasks
             SET title = ?1, updated_at = ?2, version = version + 1
             WHERE id = ?3 AND version = ?4 AND deleted_at IS NULL",
            params![title, timestamp, id, expected_version],
        )
        .map_err(storage)?;
    if changed == 0 {
        return match get_task(connection, id)? {
            Some(task) if task.deleted_at.is_none() => Err(AppError::version_conflict()),
            _ => Err(AppError::not_found()),
        };
    }
    get_task(connection, id)?.ok_or_else(AppError::not_found)
}

pub fn soft_delete_task(
    connection: &Connection,
    id: &str,
    expected_version: i64,
    timestamp: i64,
) -> Result<StoredTask, AppError> {
    let changed = connection
        .execute(
            "UPDATE study_tasks
             SET deleted_at = ?1, updated_at = ?1, version = version + 1
             WHERE id = ?2 AND version = ?3 AND deleted_at IS NULL",
            params![timestamp, id, expected_version],
        )
        .map_err(storage)?;
    if changed == 0 {
        return match get_task(connection, id)? {
            Some(task) if task.deleted_at.is_none() => Err(AppError::version_conflict()),
            _ => Err(AppError::not_found()),
        };
    }
    get_task(connection, id)?.ok_or_else(AppError::not_found)
}

pub fn restore_task(
    connection: &Connection,
    id: &str,
    expected_version: i64,
    timestamp: i64,
) -> Result<StoredTask, AppError> {
    let changed = connection
        .execute(
            "UPDATE study_tasks
             SET deleted_at = NULL, updated_at = ?1, version = version + 1
             WHERE id = ?2 AND version = ?3 AND deleted_at IS NOT NULL",
            params![timestamp, id, expected_version],
        )
        .map_err(storage)?;
    if changed == 0 {
        return match get_task(connection, id)? {
            Some(_) => Err(AppError::version_conflict()),
            None => Err(AppError::not_found()),
        };
    }
    get_task(connection, id)?.ok_or_else(AppError::not_found)
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::database::create_schema;

    use super::{
        create_task, get_task, in_transaction, list_tasks, restore_task, soft_delete_task,
        update_task_title, update_task_title_if_version,
    };

    fn database() -> Connection {
        let connection = Connection::open_in_memory().expect("应创建内存数据库");
        create_schema(&connection).expect("应创建表");
        connection
    }

    #[test]
    fn repository_creates_and_reads_a_task() {
        let connection = database();
        let created = create_task(&connection, "task-1", "整理错题", "math", 10).unwrap();
        assert_eq!(created.title, "整理错题");
        assert_eq!(created.version, 1);
        assert_eq!(get_task(&connection, "task-1").unwrap(), Some(created));
    }

    #[test]
    fn repository_lists_tasks_in_creation_order() {
        let connection = database();
        create_task(&connection, "later", "第二条", "english", 20).unwrap();
        create_task(&connection, "earlier", "第一条", "politics", 10).unwrap();
        let tasks = list_tasks(&connection).unwrap();
        assert_eq!(
            tasks
                .iter()
                .map(|task| task.id.as_str())
                .collect::<Vec<_>>(),
            vec!["earlier", "later"]
        );
    }

    #[test]
    fn repository_updates_a_task_and_increments_version() {
        let connection = database();
        create_task(&connection, "task-1", "旧标题", "math", 10).unwrap();
        let updated = update_task_title(&connection, "task-1", "新标题", 20).unwrap();
        assert_eq!(updated.title, "新标题");
        assert_eq!(updated.version, 2);
    }

    #[test]
    fn repository_returns_none_or_not_found_for_missing_rows() {
        let connection = database();
        assert_eq!(get_task(&connection, "missing").unwrap(), None);
        let error = update_task_title(&connection, "missing", "新标题", 20).unwrap_err();
        assert_eq!(error.code, "not_found");
    }

    #[test]
    fn repository_turns_bad_row_data_into_a_storage_error() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE study_tasks (
                id TEXT, title TEXT, subject TEXT, completed TEXT,
                created_at INTEGER, updated_at INTEGER, version INTEGER, deleted_at INTEGER
            );
            INSERT INTO study_tasks VALUES ('bad', '损坏记录', 'math', '不是数字', 1, 1, 1, NULL);",
            )
            .unwrap();
        let error = list_tasks(&connection).unwrap_err();
        assert_eq!(error.code, "storage_failed");
    }

    #[test]
    fn soft_deleted_tasks_are_hidden_and_can_be_restored() {
        let connection = database();
        create_task(&connection, "task-1", "可恢复任务", "math", 10).unwrap();

        let deleted = soft_delete_task(&connection, "task-1", 1, 20).unwrap();
        assert_eq!(deleted.deleted_at, Some(20));
        assert!(list_tasks(&connection).unwrap().is_empty());

        let restored = restore_task(&connection, "task-1", deleted.version, 30).unwrap();
        assert_eq!(restored.deleted_at, None);
        assert_eq!(list_tasks(&connection).unwrap(), vec![restored]);
    }

    #[test]
    fn stale_versions_are_rejected_without_overwriting_newer_data() {
        let connection = database();
        create_task(&connection, "task-1", "最初标题", "math", 10).unwrap();

        let updated =
            update_task_title_if_version(&connection, "task-1", "第一个窗口的修改", 1, 20).unwrap();
        assert_eq!(updated.version, 2);

        let error =
            update_task_title_if_version(&connection, "task-1", "第二个窗口的旧修改", 1, 30)
                .unwrap_err();
        assert_eq!(error.code, "version_conflict");
        assert_eq!(
            get_task(&connection, "task-1").unwrap().unwrap().title,
            "第一个窗口的修改"
        );
    }

    #[test]
    fn transaction_commits_all_steps_or_rolls_them_all_back() {
        let mut connection = database();
        in_transaction(&mut connection, |transaction| {
            transaction
                .execute(
                    "INSERT INTO study_tasks
                 (id, title, subject, created_at, updated_at)
                 VALUES ('committed', '完整操作', 'math', 10, 10)",
                    [],
                )
                .map_err(|error| crate::error::AppError::storage(error.to_string()))?;
            Ok(())
        })
        .unwrap();

        let result: Result<(), crate::error::AppError> =
            in_transaction(&mut connection, |transaction| {
                transaction
                    .execute(
                        "INSERT INTO study_tasks
                     (id, title, subject, created_at, updated_at)
                     VALUES ('rolled-back', '不应保留', 'math', 20, 20)",
                        [],
                    )
                    .map_err(|error| crate::error::AppError::storage(error.to_string()))?;
                Err(crate::error::AppError::invalid_title())
            });
        assert_eq!(result.unwrap_err().code, "invalid_title");
        assert!(get_task(&connection, "committed").unwrap().is_some());
        assert!(get_task(&connection, "rolled-back").unwrap().is_none());
    }
}
