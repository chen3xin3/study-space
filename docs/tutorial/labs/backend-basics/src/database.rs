use rusqlite::{params, Connection};

pub fn create_schema(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "CREATE TABLE study_tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL CHECK (length(trim(title)) > 0),
            subject TEXT NOT NULL CHECK (subject IN ('english', 'math', 'politics', 'specialty', 'other')),
            completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            deleted_at INTEGER
        );
        CREATE INDEX idx_study_tasks_created_at ON study_tasks(created_at);",
    )
}

pub fn insert_task(
    connection: &Connection,
    id: &str,
    title: &str,
    subject: &str,
    timestamp: i64,
) -> rusqlite::Result<()> {
    connection.execute(
        "INSERT INTO study_tasks (id, title, subject, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        params![id, title, subject, timestamp],
    )?;
    Ok(())
}

pub fn list_titles(connection: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut statement = connection.prepare(
        "SELECT title FROM study_tasks WHERE deleted_at IS NULL ORDER BY created_at ASC, id ASC",
    )?;
    let rows = statement.query_map([], |row| row.get(0))?;
    rows.collect()
}

pub fn rename_task(connection: &Connection, id: &str, title: &str) -> rusqlite::Result<()> {
    connection.execute(
        "UPDATE study_tasks SET title = ?1, version = version + 1 WHERE id = ?2",
        params![title, id],
    )?;
    Ok(())
}

pub fn delete_task(connection: &Connection, id: &str) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM study_tasks WHERE id = ?1", params![id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::{create_schema, delete_task, insert_task, list_titles, rename_task};

    fn database() -> Connection {
        let connection = Connection::open_in_memory().expect("应创建内存数据库");
        create_schema(&connection).expect("应创建表");
        connection
    }

    #[test]
    fn schema_creates_the_study_tasks_table() {
        let connection = database();
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'study_tasks'",
                [],
                |row| row.get(0),
            )
            .expect("应查询表");
        assert_eq!(count, 1);
    }

    #[test]
    fn parameterized_insert_preserves_quotes_in_titles() {
        let connection = database();
        insert_task(&connection, "2", "O'Reilly 阅读", "english", 20).unwrap();
        assert_eq!(list_titles(&connection).unwrap(), vec!["O'Reilly 阅读"]);
    }

    #[test]
    fn select_orders_then_update_and_delete_change_rows() {
        let connection = database();
        insert_task(&connection, "late", "第二条", "math", 20).unwrap();
        insert_task(&connection, "early", "第一条", "politics", 10).unwrap();
        assert_eq!(list_titles(&connection).unwrap(), vec!["第一条", "第二条"]);

        rename_task(&connection, "early", "更新后的第一条").unwrap();
        delete_task(&connection, "late").unwrap();
        assert_eq!(list_titles(&connection).unwrap(), vec!["更新后的第一条"]);
    }
}
