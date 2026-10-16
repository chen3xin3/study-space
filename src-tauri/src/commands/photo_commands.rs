use crate::commands::data_commands::{run_blocking, DataState};
use crate::data::error::DataError;
use crate::data::photo_archive::{
    self, ImportPhotoInput, PermanentDeletePhotoResult, PhotoImage, PhotoListPage,
    PhotoMutationInput, PhotoRecord, SetPhotoDeletedInput, UpdatePhotoInput,
};

fn import_study_photo_inner(
    state: &DataState,
    input: ImportPhotoInput,
) -> Result<PhotoRecord, DataError> {
    photo_archive::import_photo(state.manager(), input)
}

fn list_study_photos_inner(
    state: &DataState,
    kind: Option<&str>,
    trash: bool,
    limit: usize,
    cursor: Option<&str>,
) -> Result<PhotoListPage, DataError> {
    photo_archive::list_photo_page_by_state(state.manager(), kind, trash, limit, cursor)
}

fn read_study_photo_inner(state: &DataState, attachment_id: &str) -> Result<PhotoImage, DataError> {
    photo_archive::read_photo(state.manager(), attachment_id)
}

#[tauri::command]
pub async fn import_study_photo(
    input: ImportPhotoInput,
    state: tauri::State<'_, DataState>,
) -> Result<PhotoRecord, DataError> {
    let state = state.inner().clone();
    run_blocking(move || import_study_photo_inner(&state, input)).await
}

#[tauri::command]
pub async fn list_study_photos(
    kind: Option<String>,
    trash: bool,
    limit: usize,
    cursor: Option<String>,
    state: tauri::State<'_, DataState>,
) -> Result<PhotoListPage, DataError> {
    let state = state.inner().clone();
    run_blocking(move || list_study_photos_inner(&state, kind.as_deref(), trash, limit, cursor.as_deref()))
        .await
}

#[tauri::command]
pub async fn set_study_photo_deleted(
    input: SetPhotoDeletedInput,
    state: tauri::State<'_, DataState>,
) -> Result<PhotoRecord, DataError> {
    let state = state.inner().clone();
    run_blocking(move || photo_archive::set_photo_deleted(
        state.manager(),
        &input.attachment_id,
        input.version,
        input.deleted,
    )).await
}

#[tauri::command]
pub async fn delete_study_photo_permanently(
    input: PhotoMutationInput,
    state: tauri::State<'_, DataState>,
) -> Result<PermanentDeletePhotoResult, DataError> {
    let state = state.inner().clone();
    run_blocking(move || photo_archive::permanently_delete_photo(
        state.manager(),
        &input.attachment_id,
        input.version,
    )).await
}

#[tauri::command]
pub async fn update_study_photo(
    input: UpdatePhotoInput,
    state: tauri::State<'_, DataState>,
) -> Result<PhotoRecord, DataError> {
    let state = state.inner().clone();
    run_blocking(move || photo_archive::update_photo(state.manager(), input)).await
}

#[tauri::command]
pub async fn read_study_photo(
    attachment_id: String,
    state: tauri::State<'_, DataState>,
) -> Result<PhotoImage, DataError> {
    let state = state.inner().clone();
    run_blocking(move || read_study_photo_inner(&state, &attachment_id)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::database::DatabaseManager;
    use crate::data::paths::DataPaths;

    #[test]
    fn command_layer_imports_lists_and_reads_a_photo() {
        let temp = tempfile::tempdir().unwrap();
        let state = DataState::new(
            DatabaseManager::open(DataPaths::from_root(temp.path().join("app")).unwrap()).unwrap(),
        );
        let bytes = b"\x89PNG\r\n\x1a\nphoto".to_vec();
        let saved = import_study_photo_inner(
            &state,
            ImportPhotoInput {
                bytes: bytes.clone(),
                media_type: "image/png".into(),
                original_name: None,
                study_date: "2020-09-27".into(),
                title: "单词纸".into(),
                kind: "english".into(),
            },
        )
        .unwrap();
        let listed = list_study_photos_inner(&state, Some("english"), false, 24, None).unwrap();
        assert_eq!(listed.items[0].attachment_id, saved.attachment_id);
        assert_eq!(
            read_study_photo_inner(&state, &saved.attachment_id)
                .unwrap()
                .bytes,
            bytes
        );
    }
}
