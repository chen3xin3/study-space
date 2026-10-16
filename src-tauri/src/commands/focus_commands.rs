use chrono::Utc;
use serde::Deserialize;

use crate::commands::data_commands::{run_blocking, DataState};
use crate::data::error::DataError;
use crate::data::focus::{
    self, CreateFocusPresetInput, FocusHistoryItem, FocusPreset, FocusSession, StartFocusInput,
    UpdateFocusPresetInput,
};
use crate::data::focus_sessions::{
    self, AddInterruptionInput, CompleteFocusReviewInput, FocusInterruption, FocusSessionDetail,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhaseInput {
    timer_id: String,
    phase: String,
    cycle_number: i64,
    cycle_start_seconds: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusPresetVersionInput {
    id: String,
    version: i64,
}

#[tauri::command]
pub async fn start_focus_session(
    input: StartFocusInput,
    state: tauri::State<'_, DataState>,
) -> Result<FocusSession, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection_mut(|connection| {
            focus::start_focus(connection, input, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn get_active_focus(
    state: tauri::State<'_, DataState>,
) -> Result<Option<FocusSession>, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection_mut(|connection| {
            focus::settle_expired_work(connection, &Utc::now().to_rfc3339())?;
            focus::get_active(connection)
        })
    })
    .await
}

#[tauri::command]
pub async fn set_focus_phase(
    input: PhaseInput,
    state: tauri::State<'_, DataState>,
) -> Result<(), DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection(|connection| {
            focus::set_phase(
                connection,
                &input.timer_id,
                &input.phase,
                &Utc::now().to_rfc3339(),
                input.cycle_number,
                input.cycle_start_seconds,
            )
        })
    })
    .await
}

#[tauri::command]
pub async fn list_focus_history(
    offset: usize,
    state: tauri::State<'_, DataState>,
) -> Result<Vec<FocusHistoryItem>, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state
            .manager()
            .with_connection(|connection| focus::list_history_page(connection, 30, offset))
    })
    .await
}

#[tauri::command]
pub async fn list_focus_presets(
    state: tauri::State<'_, DataState>,
) -> Result<Vec<FocusPreset>, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection(focus::list_presets)
    })
    .await
}

#[tauri::command]
pub async fn create_focus_preset(
    input: CreateFocusPresetInput,
    state: tauri::State<'_, DataState>,
) -> Result<FocusPreset, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection(|connection| {
            focus::create_preset(connection, input, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn update_focus_preset(
    input: UpdateFocusPresetInput,
    state: tauri::State<'_, DataState>,
) -> Result<FocusPreset, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection(|connection| {
            focus::update_preset(connection, input, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn delete_focus_preset(
    input: FocusPresetVersionInput,
    state: tauri::State<'_, DataState>,
) -> Result<(), DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection(|connection| {
            focus::delete_preset(connection, &input.id, input.version)
        })
    })
    .await
}

#[tauri::command]
pub async fn add_focus_interruption(
    input: AddInterruptionInput,
    state: tauri::State<'_, DataState>,
) -> Result<FocusInterruption, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection(|connection| {
            focus_sessions::add_interruption(connection, input, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn list_focus_interruptions(
    timer_id: String,
    state: tauri::State<'_, DataState>,
) -> Result<Vec<FocusInterruption>, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state
            .manager()
            .with_connection(|connection| focus_sessions::list_interruptions(connection, &timer_id))
    })
    .await
}

#[tauri::command]
pub async fn complete_focus_review(
    input: CompleteFocusReviewInput,
    state: tauri::State<'_, DataState>,
) -> Result<FocusSessionDetail, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection_mut(|connection| {
            focus_sessions::complete_with_review(connection, input, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn get_focus_session_detail(
    timer_id: String,
    state: tauri::State<'_, DataState>,
) -> Result<FocusSessionDetail, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state
            .manager()
            .with_connection(|connection| focus_sessions::get_session_detail(connection, &timer_id))
    })
    .await
}
