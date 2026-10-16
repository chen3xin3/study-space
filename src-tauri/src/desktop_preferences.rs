use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DesktopPreferences {
    pub close_to_tray: bool,
    pub launch_at_startup: bool,
}

#[derive(Clone)]
pub struct DesktopPreferencesStore {
    path: PathBuf,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PreferenceLoadStatus {
    Primary,
    Backup,
    Missing,
    Defaults,
}

pub struct LoadedDesktopPreferences {
    pub preferences: DesktopPreferences,
    pub status: PreferenceLoadStatus,
}

impl DesktopPreferencesStore {
    pub fn new(root: &Path) -> Self {
        Self {
            path: root.join("desktop-preferences.json"),
        }
    }

    pub fn temporary_path(&self) -> PathBuf {
        self.path.with_extension("json.tmp")
    }

    pub fn backup_path(&self) -> PathBuf {
        self.path.with_extension("json.bak")
    }

    pub fn rollback_path(&self) -> PathBuf {
        self.path.with_extension("json.rollback")
    }

    fn read_valid(path: &Path) -> Option<DesktopPreferences> {
        fs::read_to_string(path)
            .ok()
            .and_then(|value| serde_json::from_str(&value).ok())
    }

    pub fn load_with_status(&self) -> LoadedDesktopPreferences {
        if let Some(preferences) = Self::read_valid(&self.path) {
            return LoadedDesktopPreferences {
                preferences,
                status: PreferenceLoadStatus::Primary,
            };
        }

        let backup_path = self.backup_path();
        let rollback_path = self.rollback_path();
        for recovery_path in [&backup_path, &rollback_path] {
            if let Some(preferences) = Self::read_valid(recovery_path) {
                if fs::copy(recovery_path, &self.path).is_ok() {
                    let _ = fs::remove_file(recovery_path);
                }
                return LoadedDesktopPreferences {
                    preferences,
                    status: PreferenceLoadStatus::Backup,
                };
            }
        }

        let status = if self.path.exists() || backup_path.exists() || rollback_path.exists() {
            PreferenceLoadStatus::Defaults
        } else {
            PreferenceLoadStatus::Missing
        };
        LoadedDesktopPreferences {
            preferences: DesktopPreferences::default(),
            status,
        }
    }

    pub fn save(&self, preferences: &DesktopPreferences) -> io::Result<()> {
        let bytes = serde_json::to_vec_pretty(preferences)?;
        let temporary_path = self.temporary_path();
        let backup_path = self.backup_path();
        let rollback_path = self.rollback_path();
        let _ = fs::remove_file(&temporary_path);

        let mut temporary = fs::File::create(&temporary_path)?;
        temporary.write_all(&bytes)?;
        temporary.sync_all()?;

        let had_primary = self.path.exists();
        let had_rollback = rollback_path.exists();
        if had_primary {
            let move_result = if had_rollback {
                fs::remove_file(&self.path)
            } else {
                fs::rename(&self.path, &rollback_path)
            };
            if let Err(error) = move_result {
                let _ = fs::remove_file(&temporary_path);
                return Err(error);
            }
        }
        if let Err(error) = fs::rename(&temporary_path, &self.path) {
            if had_rollback {
                let _ = fs::copy(&rollback_path, &self.path);
            } else if had_primary {
                let _ = fs::rename(&rollback_path, &self.path);
            }
            let _ = fs::remove_file(&temporary_path);
            return Err(error);
        }
        let _ = fs::remove_file(&backup_path);
        let _ = fs::remove_file(&rollback_path);
        Ok(())
    }
}

#[derive(Clone)]
pub struct DesktopPreferencesState {
    store: DesktopPreferencesStore,
    current: Arc<Mutex<DesktopPreferences>>,
}

impl DesktopPreferencesState {
    pub fn new_with_status(store: DesktopPreferencesStore) -> (Self, PreferenceLoadStatus) {
        let loaded = store.load_with_status();
        (
            Self {
                store,
                current: Arc::new(Mutex::new(loaded.preferences)),
            },
            loaded.status,
        )
    }

    pub fn get(&self) -> DesktopPreferences {
        self.current.lock().unwrap().clone()
    }

    pub fn update(&self, preferences: DesktopPreferences) -> io::Result<DesktopPreferences> {
        self.store.save(&preferences)?;
        *self.current.lock().unwrap() = preferences.clone();
        Ok(preferences)
    }
}

pub fn startup_value(executable: &Path) -> String {
    format!("\"{}\"", executable.to_string_lossy())
}

#[cfg(windows)]
pub fn set_launch_at_startup(enabled: bool) -> Result<(), String> {
    use std::io::ErrorKind;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    const VALUE_NAME: &str = "MyPostgraduateStudySpace";
    let current_user = RegKey::predef(HKEY_CURRENT_USER);
    let (run, _) = current_user
        .create_subkey(RUN_KEY)
        .map_err(|_| "开机启动设置失败。".to_string())?;
    if enabled {
        let executable = std::env::current_exe().map_err(|_| "程序路径读取失败。".to_string())?;
        run.set_value(VALUE_NAME, &startup_value(&executable))
            .map_err(|_| "开机启动设置失败。".to_string())
    } else {
        match run.delete_value(VALUE_NAME) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(_) => Err("开机启动设置失败。".to_string()),
        }
    }
}

#[cfg(not(windows))]
pub fn set_launch_at_startup(_enabled: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{startup_value, DesktopPreferences, DesktopPreferencesStore, PreferenceLoadStatus};

    #[test]
    fn defaults_are_opt_in() {
        let preferences = DesktopPreferences::default();
        assert!(!preferences.close_to_tray);
        assert!(!preferences.launch_at_startup);
    }

    #[test]
    fn preferences_survive_a_reload() {
        let temp = tempfile::tempdir().unwrap();
        let store = DesktopPreferencesStore::new(temp.path());
        store
            .save(&DesktopPreferences {
                close_to_tray: true,
                launch_at_startup: false,
            })
            .unwrap();
        assert!(store.load_with_status().preferences.close_to_tray);
    }

    #[test]
    fn valid_backup_recovers_a_corrupt_primary_file() {
        let temp = tempfile::tempdir().unwrap();
        let store = DesktopPreferencesStore::new(temp.path());
        let expected = DesktopPreferences {
            close_to_tray: true,
            launch_at_startup: false,
        };
        store.save(&expected).unwrap();
        std::fs::copy(&store.path, store.backup_path()).unwrap();
        std::fs::write(&store.path, "not-json").unwrap();

        let loaded = store.load_with_status();

        assert_eq!(loaded.preferences, expected);
        assert_eq!(loaded.status, PreferenceLoadStatus::Backup);
    }

    #[test]
    fn recovery_keeps_the_backup_when_primary_repair_is_blocked() {
        let temp = tempfile::tempdir().unwrap();
        let store = DesktopPreferencesStore::new(temp.path());
        let expected = DesktopPreferences {
            close_to_tray: true,
            launch_at_startup: false,
        };
        store.save(&expected).unwrap();
        std::fs::copy(&store.path, store.backup_path()).unwrap();
        std::fs::write(&store.path, "not-json").unwrap();
        let mut permissions = std::fs::metadata(&store.path).unwrap().permissions();
        permissions.set_readonly(true);
        std::fs::set_permissions(&store.path, permissions).unwrap();

        let loaded = store.load_with_status();

        assert_eq!(loaded.preferences, expected);
        assert!(store.backup_path().exists());
        let mut permissions = std::fs::metadata(&store.path).unwrap().permissions();
        permissions.set_readonly(false);
        std::fs::set_permissions(&store.path, permissions).unwrap();
    }

    #[test]
    fn interrupted_replacement_recovers_the_rollback_file() {
        let temp = tempfile::tempdir().unwrap();
        let store = DesktopPreferencesStore::new(temp.path());
        let expected = DesktopPreferences {
            close_to_tray: true,
            launch_at_startup: true,
        };
        store.save(&expected).unwrap();
        std::fs::rename(&store.path, store.rollback_path()).unwrap();

        let loaded = store.load_with_status();

        assert_eq!(loaded.preferences, expected);
        assert_eq!(loaded.status, PreferenceLoadStatus::Backup);
    }

    #[test]
    fn save_replaces_the_primary_and_cleans_recovery_files() {
        let temp = tempfile::tempdir().unwrap();
        let store = DesktopPreferencesStore::new(temp.path());
        store.save(&DesktopPreferences::default()).unwrap();
        store
            .save(&DesktopPreferences {
                close_to_tray: true,
                launch_at_startup: true,
            })
            .unwrap();

        assert!(store.load_with_status().preferences.close_to_tray);
        assert!(!store.temporary_path().exists());
        assert!(!store.backup_path().exists());
        assert!(!store.rollback_path().exists());
    }

    #[test]
    fn startup_registry_value_quotes_paths_with_spaces() {
        assert_eq!(
            startup_value(std::path::Path::new("C:\\Study App\\app.exe")),
            "\"C:\\Study App\\app.exe\""
        );
    }
}
