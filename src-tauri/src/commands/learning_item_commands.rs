use chrono::Utc;

use crate::commands::data_commands::{run_blocking, DataState};
use crate::data::error::DataError;
use crate::data::learning_items::{
    self, CreateLearningItemInput, LearningItem, LearningItemQuery, UpdateLearningItemInput,
};

#[tauri::command]
pub async fn list_learning_items(
    query: LearningItemQuery,
    state: tauri::State<'_, DataState>,
) -> Result<Vec<LearningItem>, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state
            .manager()
            .with_connection(|connection| learning_items::list(connection, query))
    })
    .await
}

#[tauri::command]
pub async fn get_learning_item(
    id: String,
    state: tauri::State<'_, DataState>,
) -> Result<LearningItem, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state
            .manager()
            .with_connection(|connection| learning_items::get(connection, &id))
    })
    .await
}

#[tauri::command]
pub async fn create_learning_item(
    input: CreateLearningItemInput,
    state: tauri::State<'_, DataState>,
) -> Result<LearningItem, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection(|connection| {
            learning_items::create(connection, input, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn update_learning_item(
    input: UpdateLearningItemInput,
    state: tauri::State<'_, DataState>,
) -> Result<LearningItem, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection(|connection| {
            learning_items::update(connection, input, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn set_learning_item_favorite(
    id: String,
    version: i64,
    favorite: bool,
    state: tauri::State<'_, DataState>,
) -> Result<LearningItem, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection(|connection| {
            learning_items::set_favorite(
                connection,
                &id,
                version,
                favorite,
                &Utc::now().to_rfc3339(),
            )
        })
    })
    .await
}

#[tauri::command]
pub async fn set_learning_item_deleted(
    id: String,
    version: i64,
    deleted: bool,
    state: tauri::State<'_, DataState>,
) -> Result<LearningItem, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection(|connection| {
            learning_items::set_deleted(connection, &id, version, deleted, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn touch_learning_item_opened(
    id: String,
    version: i64,
    state: tauri::State<'_, DataState>,
) -> Result<LearningItem, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection(|connection| {
            learning_items::touch_opened(connection, &id, version, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn delete_learning_item_permanently(
    id: String,
    version: i64,
    state: tauri::State<'_, DataState>,
) -> Result<(), DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection(|connection| {
            learning_items::delete_permanently(connection, &id, version)
        })
    })
    .await
}
