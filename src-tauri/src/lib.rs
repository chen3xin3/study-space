mod commands;
mod data;
mod desktop_preferences;
#[cfg(desktop)]
mod desktop_runtime;
mod diagnostics;
mod sync;

use std::sync::Arc;

use commands::ai_commands::{
    confirm_ai_review, delete_ai_api_key, get_ai_review, get_ai_settings, recognize_essay_images,
    organize_photo_material, organize_text_material, retry_ai_review, review_essay, set_ai_api_key,
    update_ai_settings, AiState,
};
use commands::dashboard_commands::{
    create_daily_task, delete_daily_task, end_study_timer, get_calendar_month,
    get_dashboard_summary, pause_study_timer, resume_study_timer, set_daily_task_completed,
    start_study_timer,
};
use commands::data_commands::{
    create_backup, get_data_status, import_attachment, import_attachment_bytes, inspect_backup,
    read_backup_bytes, restore_backup, stage_backup_bytes, DataState,
};
use commands::desktop_commands::{get_desktop_preferences, update_desktop_preferences};
use commands::diagnostic_commands::{
    export_diagnostic_report, get_diagnostic_status, open_diagnostic_folder,
};
use commands::essay_commands::{
    abandon_essay_import_draft, add_essay_import_draft_image, compare_essay_dictation,
    complete_essay_attempt, complete_essay_import_draft, copy_essay_attempt, create_essay,
    create_essay_attempt, create_essay_import_draft, delete_essays, get_essay, get_essay_attempt,
    get_essay_import_draft, get_essay_summary, list_essay_attempts, list_essay_import_drafts,
    list_essays, remove_essay_import_draft_image, update_essay, update_essay_attempt,
    update_essay_import_draft,
};
use commands::focus_commands::{
    add_focus_interruption, complete_focus_review, create_focus_preset, delete_focus_preset,
    get_active_focus, get_focus_session_detail, list_focus_history, list_focus_interruptions,
    list_focus_presets, set_focus_phase, start_focus_session, update_focus_preset,
};
use commands::focus_plan_commands::{
    create_focus_plan, delete_focus_plan, list_focus_plans, reorder_focus_plans,
    set_focus_plan_completed, update_focus_plan,
};
use commands::inbox_commands::{
    create_inbox_folder, create_inbox_note, import_inbox_file, list_inbox_folders,
    list_inbox_items, move_inbox_item, read_inbox_file, rename_inbox_folder,
    set_inbox_item_deleted,
};
use commands::learning_item_commands::{
    create_learning_item, delete_learning_item_permanently, get_learning_item, list_learning_items,
    set_learning_item_deleted, set_learning_item_favorite, touch_learning_item_opened,
    update_learning_item,
};
use commands::sync_commands::{
    get_lan_sync_send_status, inspect_lan_sync_source, receive_lan_sync_backup,
    restore_lan_sync_backup, start_lan_sync_send, stop_lan_sync_send, SyncState,
};
use commands::photo_commands::{
    delete_study_photo_permanently, import_study_photo, list_study_photos, read_study_photo,
    set_study_photo_deleted, update_study_photo,
};
use commands::vocabulary_commands::{
    create_word, delete_words, get_english_summary, get_word, get_word_review_queue, list_words,
    reschedule_word_review, resolve_duplicate_word, schedule_words_for_today, submit_word_review,
    update_word, update_word_tags,
};
use commands::vocabulary_import_commands::{
    commit_vocabulary_import, create_vocabulary_import, delete_vocabulary_import,
    get_vocabulary_import, import_clipboard_image, list_open_vocabulary_imports,
    preview_vocabulary_import_duplicates, recognize_vocabulary_import, retry_vocabulary_import,
    rotate_vocabulary_import_image, update_vocabulary_import_candidate,
};
use data::ai::credentials::KeyringCredentialStore;
use data::ai::provider::ReqwestTransport;
use data::database::DatabaseManager;
use data::paths::DataPaths;
use desktop_preferences::{DesktopPreferencesState, DesktopPreferencesStore, PreferenceLoadStatus};
#[cfg(desktop)]
use desktop_runtime::{install_tray, show_main_window};
use diagnostics::{DiagnosticLog, DiagnosticState};
use tauri::Manager;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

fn runtime_label(is_mobile: bool) -> &'static str {
    if is_mobile { "android" } else { "desktop" }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
            if let Some(diagnostics) = app.try_state::<DiagnosticState>() {
                let _ = diagnostics.0.append("second_instance", "main window restored");
            }
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        show_main_window(app);
                    }
                })
                .build(),
        );

    builder
        .setup(|app| {
            let paths = DataPaths::from_app(app.handle())?;
            let diagnostics = DiagnosticLog::new(&paths.root)?;
            diagnostics::install_panic_hook(diagnostics.clone());
            let _ = diagnostics.append("startup_begin", runtime_label(cfg!(mobile)));
            let (preferences, preference_status) =
                DesktopPreferencesState::new_with_status(DesktopPreferencesStore::new(&paths.root));
            match preference_status {
                PreferenceLoadStatus::Backup => {
                    let _ = diagnostics.append("preferences_recovered", "backup");
                }
                PreferenceLoadStatus::Defaults => {
                    let _ = diagnostics.append("preferences_reset", "invalid files");
                }
                PreferenceLoadStatus::Primary | PreferenceLoadStatus::Missing => {}
            }
            let manager = match DatabaseManager::open(paths) {
                Ok(manager) => manager,
                Err(error) => {
                    let _ = diagnostics.append("startup_failed", "database unavailable");
                    return Err(error.into());
                }
            };
            app.manage(DataState::new(manager));
            app.manage(DiagnosticState::new(diagnostics.clone()));
            app.manage(preferences);
            app.manage(AiState::new(
                Arc::new(KeyringCredentialStore),
                Arc::new(ReqwestTransport::new()?),
            ));
            app.manage(SyncState::new());
            #[cfg(desktop)]
            {
                install_tray(app)?;
                if let Err(error) = app.global_shortcut().register("Ctrl+Shift+Space") {
                    let _ = diagnostics.append("shortcut_unavailable", &error.to_string());
                }
            }
            let _ = diagnostics.append("startup_ready", runtime_label(cfg!(mobile)));
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(desktop)]
            {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let state = window.state::<DesktopPreferencesState>();
                    if state.get().close_to_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
            #[cfg(mobile)]
            let _ = (window, event);
        })
        .invoke_handler(tauri::generate_handler![
            get_data_status,
            import_attachment,
            import_attachment_bytes,
            import_study_photo,
            list_study_photos,
            update_study_photo,
            read_study_photo,
            set_study_photo_deleted,
            delete_study_photo_permanently,
            create_backup,
            read_backup_bytes,
            stage_backup_bytes,
            inspect_backup,
            restore_backup,
            get_diagnostic_status,
            open_diagnostic_folder,
            export_diagnostic_report,
            get_desktop_preferences,
            update_desktop_preferences,
            create_word,
            resolve_duplicate_word,
            get_word,
            list_words,
            update_word,
            delete_words,
            update_word_tags,
            schedule_words_for_today,
            get_word_review_queue,
            submit_word_review,
            reschedule_word_review,
            get_english_summary,
            create_essay,
            get_essay,
            list_essays,
            update_essay,
            delete_essays,
            create_essay_attempt,
            get_essay_attempt,
            update_essay_attempt,
            complete_essay_attempt,
            copy_essay_attempt,
            list_essay_attempts,
            compare_essay_dictation,
            get_essay_summary,
            create_essay_import_draft,
            get_essay_import_draft,
            list_essay_import_drafts,
            add_essay_import_draft_image,
            remove_essay_import_draft_image,
            update_essay_import_draft,
            abandon_essay_import_draft,
            complete_essay_import_draft,
            get_ai_settings,
            update_ai_settings,
            set_ai_api_key,
            delete_ai_api_key,
            review_essay,
            recognize_essay_images,
            organize_text_material,
            organize_photo_material,
            retry_ai_review,
            get_ai_review,
            confirm_ai_review,
            create_vocabulary_import,
            get_vocabulary_import,
            list_open_vocabulary_imports,
            rotate_vocabulary_import_image,
            recognize_vocabulary_import,
            retry_vocabulary_import,
            update_vocabulary_import_candidate,
            preview_vocabulary_import_duplicates,
            commit_vocabulary_import,
            delete_vocabulary_import,
            import_clipboard_image,
            get_dashboard_summary,
            get_calendar_month,
            create_daily_task,
            set_daily_task_completed,
            delete_daily_task,
            start_study_timer,
            pause_study_timer,
            resume_study_timer,
            end_study_timer,
            start_focus_session,
            get_active_focus,
            set_focus_phase,
            list_focus_history,
            list_focus_presets,
            create_focus_preset,
            update_focus_preset,
            delete_focus_preset,
            add_focus_interruption,
            list_focus_interruptions,
            complete_focus_review,
            get_focus_session_detail,
            list_focus_plans,
            create_focus_plan,
            update_focus_plan,
            set_focus_plan_completed,
            delete_focus_plan,
            reorder_focus_plans,
            list_inbox_folders,
            create_inbox_folder,
            rename_inbox_folder,
            list_inbox_items,
            create_inbox_note,
            import_inbox_file,
            move_inbox_item,
            set_inbox_item_deleted,
            read_inbox_file,
            list_learning_items,
            get_learning_item,
            create_learning_item,
            update_learning_item,
            set_learning_item_favorite,
            set_learning_item_deleted,
            touch_learning_item_opened,
            delete_learning_item_permanently,
            start_lan_sync_send,
            get_lan_sync_send_status,
            stop_lan_sync_send,
            inspect_lan_sync_source,
            receive_lan_sync_backup,
            restore_lan_sync_backup,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Study Space");
}

#[cfg(test)]
mod platform_tests {
    use super::runtime_label;

    #[test]
    fn labels_mobile_startup_as_android() {
        assert_eq!(runtime_label(true), "android");
        assert_eq!(runtime_label(false), "desktop");
    }

    #[test]
    fn android_release_configuration_is_versioned_with_the_source() {
        let config: serde_json::Value = serde_json::from_str(include_str!(
            "../tauri.android.conf.json"
        ))
        .expect("Android Tauri configuration must be valid JSON");

        assert_eq!(config["productName"], "学习空间");
        assert_eq!(config["version"], "0.6.0");
        assert_eq!(config["bundle"]["android"]["minSdkVersion"], 28);
        assert_eq!(config["bundle"]["android"]["versionCode"], 6000);
    }
}
