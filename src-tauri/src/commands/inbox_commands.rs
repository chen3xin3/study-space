use crate::commands::data_commands::{run_blocking, DataState};
use crate::data::error::DataError;
use crate::data::inbox::{self, ImportInboxFileInput, InboxFile, InboxFolder, InboxItem};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxIdInput {
    id: String,
    version: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameFolderInput {
    id: String,
    version: i64,
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveInboxInput {
    id: String,
    version: i64,
    folder_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteInput {
    title: String,
    note: String,
    folder_id: Option<String>,
}

#[tauri::command]
pub async fn list_inbox_folders(
    state: tauri::State<'_, DataState>,
) -> Result<Vec<InboxFolder>, DataError> {
    let state = state.inner().clone();
    run_blocking(move || state.manager().with_connection(inbox::list_folders)).await
}
#[tauri::command]
pub async fn create_inbox_folder(
    name: String,
    state: tauri::State<'_, DataState>,
) -> Result<InboxFolder, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        state
            .manager()
            .with_connection(|db| inbox::create_folder(db, &name))
    })
    .await
}
#[tauri::command]
pub async fn rename_inbox_folder(
    input: RenameFolderInput,
    state: tauri::State<'_, DataState>,
) -> Result<(), DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        state
            .manager()
            .with_connection(|db| inbox::rename_folder(db, &input.id, input.version, &input.name))
    })
    .await
}
#[tauri::command]
pub async fn list_inbox_items(
    folder_id: Option<String>,
    trash: bool,
    offset: usize,
    state: tauri::State<'_, DataState>,
) -> Result<Vec<InboxItem>, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        state
            .manager()
            .with_connection(|db| inbox::list_items_page(db, folder_id.as_deref(), trash, offset))
    })
    .await
}
#[tauri::command]
pub async fn create_inbox_note(
    input: CreateNoteInput,
    state: tauri::State<'_, DataState>,
) -> Result<(), DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        state.manager().with_connection(|db| {
            inbox::create_note(db, &input.title, &input.note, input.folder_id.as_deref())
        })
    })
    .await
}
#[tauri::command]
pub async fn import_inbox_file(
    input: ImportInboxFileInput,
    state: tauri::State<'_, DataState>,
) -> Result<(), DataError> {
    let state = state.inner().clone();
    run_blocking(move || inbox::import_file(state.manager(), input)).await
}
#[tauri::command]
pub async fn move_inbox_item(
    input: MoveInboxInput,
    state: tauri::State<'_, DataState>,
) -> Result<(), DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        state.manager().with_connection(|db| {
            inbox::move_item(db, &input.id, input.version, input.folder_id.as_deref())
        })
    })
    .await
}
#[tauri::command]
pub async fn set_inbox_item_deleted(
    input: InboxIdInput,
    deleted: bool,
    state: tauri::State<'_, DataState>,
) -> Result<(), DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        state
            .manager()
            .with_connection(|db| inbox::set_deleted(db, &input.id, input.version, deleted))
    })
    .await
}
#[tauri::command]
pub async fn read_inbox_file(
    item_id: String,
    state: tauri::State<'_, DataState>,
) -> Result<InboxFile, DataError> {
    let state = state.inner().clone();
    run_blocking(move || inbox::read_file(state.manager(), &item_id)).await
}
