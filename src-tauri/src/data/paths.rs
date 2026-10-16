use std::fs;
use std::path::PathBuf;

use tauri::Manager;

use crate::data::error::DataError;

#[derive(Debug, Clone)]
pub struct DataPaths {
    pub root: PathBuf,
    pub database_path: PathBuf,
    pub attachments_dir: PathBuf,
    pub backups_dir: PathBuf,
    pub restore_staging_dir: PathBuf,
}

impl DataPaths {
    pub fn from_root(root: PathBuf) -> Result<Self, DataError> {
        let paths = Self {
            database_path: root.join("study-space.db"),
            attachments_dir: root.join("attachments"),
            backups_dir: root.join("backups"),
            restore_staging_dir: root.join("restore-staging"),
            root,
        };
        for directory in [
            &paths.root,
            &paths.attachments_dir,
            &paths.backups_dir,
            &paths.restore_staging_dir,
        ] {
            fs::create_dir_all(directory)
                .map_err(|error| DataError::data_directory_unavailable(error.to_string()))?;
        }
        Ok(paths)
    }

    pub fn from_app<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<Self, DataError> {
        let root = app
            .path()
            .app_data_dir()
            .map_err(|error| DataError::data_directory_unavailable(error.to_string()))?;
        Self::from_root(root)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_every_managed_directory_under_the_supplied_root() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().to_path_buf()).unwrap();
        assert!(paths.attachments_dir.is_dir());
        assert!(paths.backups_dir.is_dir());
        assert!(paths.restore_staging_dir.is_dir());
        assert_eq!(paths.database_path, temp.path().join("study-space.db"));
    }
}
