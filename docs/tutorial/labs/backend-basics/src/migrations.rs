use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};

use crate::error::AppError;

const VERSION_ONE: &str = r#"
CREATE TABLE study_tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    subject TEXT NOT NULL CHECK (subject IN ('english', 'math', 'politics', 'specialty', 'other')),
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
"#;

const VERSION_TWO: &str = r#"
ALTER TABLE study_tasks ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE study_tasks ADD COLUMN deleted_at INTEGER;
CREATE INDEX idx_study_tasks_active_created
ON study_tasks(deleted_at, created_at, id);
"#;

fn all_migrations() -> Migrations<'static> {
    Migrations::new(vec![M::up(VERSION_ONE), M::up(VERSION_TWO)])
}

pub fn migrate(connection: &mut Connection) -> Result<(), AppError> {
    all_migrations()
        .to_latest(connection)
        .map_err(|error| AppError::storage(error.to_string()))
}

pub fn schema_version(connection: &Connection) -> Result<usize, AppError> {
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| AppError::storage(error.to_string()))?;
    usize::try_from(version).map_err(|error| AppError::storage(error.to_string()))
}

#[cfg(test)]
fn migrate_to_version_one(connection: &mut Connection) -> Result<(), AppError> {
    Migrations::new(vec![M::up(VERSION_ONE)])
        .to_latest(connection)
        .map_err(|error| AppError::storage(error.to_string()))
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::{migrate, schema_version};

    #[test]
    fn version_one_database_upgrades_without_losing_rows() {
        let mut connection = Connection::open_in_memory().unwrap();
        super::migrate_to_version_one(&mut connection).unwrap();
        connection
            .execute(
                "INSERT INTO study_tasks
             (id, title, subject, completed, created_at, updated_at)
             VALUES ('legacy', '旧任务', 'math', 0, 10, 10)",
                [],
            )
            .unwrap();

        migrate(&mut connection).unwrap();

        assert_eq!(schema_version(&connection).unwrap(), 2);
        let row: (String, i64, Option<i64>) = connection
            .query_row(
                "SELECT title, version, deleted_at FROM study_tasks WHERE id = 'legacy'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(row, ("旧任务".to_owned(), 1, None));
    }

    #[test]
    fn running_migrations_twice_is_safe() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        migrate(&mut connection).unwrap();
        assert_eq!(schema_version(&connection).unwrap(), 2);
    }
}
