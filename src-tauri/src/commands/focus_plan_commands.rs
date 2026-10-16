use chrono::Utc;
use serde::Deserialize;

use crate::commands::data_commands::{run_blocking, DataState};
use crate::data::error::DataError;
use crate::data::focus_plans::{self, CreateFocusPlanInput, FocusPlan, UpdateFocusPlanInput};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusPlanCompletionInput {
    id: String,
    version: i64,
    completed: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusPlanVersionInput {
    id: String,
    version: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderFocusPlansInput {
    local_date: String,
    ordered_ids: Vec<String>,
}

#[tauri::command]
pub async fn list_focus_plans(
    local_date: String,
    state: tauri::State<'_, DataState>,
) -> Result<Vec<FocusPlan>, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection_mut(|connection| {
            focus_plans::list_for_day(connection, &local_date, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn create_focus_plan(
    input: CreateFocusPlanInput,
    state: tauri::State<'_, DataState>,
) -> Result<FocusPlan, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection(|connection| {
            focus_plans::create(connection, input, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn update_focus_plan(
    input: UpdateFocusPlanInput,
    state: tauri::State<'_, DataState>,
) -> Result<FocusPlan, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection(|connection| {
            focus_plans::update(connection, input, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn set_focus_plan_completed(
    input: FocusPlanCompletionInput,
    state: tauri::State<'_, DataState>,
) -> Result<FocusPlan, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection(|connection| {
            focus_plans::set_completed(
                connection,
                &input.id,
                input.version,
                input.completed,
                &Utc::now().to_rfc3339(),
            )
        })
    })
    .await
}

#[tauri::command]
pub async fn delete_focus_plan(
    input: FocusPlanVersionInput,
    state: tauri::State<'_, DataState>,
) -> Result<(), DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state
            .manager()
            .with_connection(|connection| focus_plans::remove(connection, &input.id, input.version))
    })
    .await
}

#[tauri::command]
pub async fn reorder_focus_plans(
    input: ReorderFocusPlansInput,
    state: tauri::State<'_, DataState>,
) -> Result<Vec<FocusPlan>, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection_mut(|connection| {
            focus_plans::reorder(
                connection,
                &input.local_date,
                &input.ordered_ids,
                &Utc::now().to_rfc3339(),
            )
        })
    })
    .await
}
