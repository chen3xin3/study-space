use crate::desktop_preferences::{
    set_launch_at_startup, DesktopPreferences, DesktopPreferencesState,
};

#[tauri::command]
pub fn get_desktop_preferences(
    state: tauri::State<'_, DesktopPreferencesState>,
) -> DesktopPreferences {
    state.get()
}

#[tauri::command]
pub fn update_desktop_preferences(
    preferences: DesktopPreferences,
    state: tauri::State<'_, DesktopPreferencesState>,
) -> Result<DesktopPreferences, String> {
    set_launch_at_startup(preferences.launch_at_startup)?;
    state
        .update(preferences)
        .map_err(|_| "桌面偏好保存失败。".to_string())
}
