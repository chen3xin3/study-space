use std::collections::{HashMap, HashSet};
use std::fs;
use std::sync::Arc;

use base64::Engine;
use chrono::Utc;
use rusqlite::Connection;
use serde::Deserialize;

use crate::commands::data_commands::{run_blocking, DataState};
use crate::data::ai::credentials::CredentialStore;
use crate::data::ai::models::{
    EssayAiReview, MaterialOrganizationSuggestion, OrganizePhotoMaterialInput,
    OrganizeTextMaterialInput, PhotoOrganizationSuggestion, ReviewEssayInput, SafeAiSettings,
    UpdateAiSettingsInput,
};
use crate::data::ai::material_organization::MaterialOrganizationAdapter;
use crate::data::ai::provider::AiTransport;
use crate::data::ai::provider::ProviderConfig;
use crate::data::ai::{essay_recognition, review, settings};
use crate::data::error::DataError;

#[derive(Clone)]
pub struct AiState {
    credentials: Arc<dyn CredentialStore>,
    transport: Arc<dyn AiTransport>,
}

impl AiState {
    pub fn new(credentials: Arc<dyn CredentialStore>, transport: Arc<dyn AiTransport>) -> Self {
        Self {
            credentials,
            transport,
        }
    }

    pub(crate) fn credentials(&self) -> &dyn CredentialStore {
        self.credentials.as_ref()
    }

    pub(crate) fn transport(&self) -> &dyn AiTransport {
        self.transport.as_ref()
    }
}

struct LoadedImages {
    values: HashMap<String, String>,
}

impl review::ConfirmedImageLoader for LoadedImages {
    fn load_data_url(&self, attachment_id: &str) -> Result<String, DataError> {
        self.values
            .get(attachment_id)
            .cloned()
            .ok_or_else(|| DataError::essay_invalid("confirmed image could not be loaded"))
    }
}

fn load_confirmed_images(state: &DataState, ids: &[String]) -> Result<LoadedImages, DataError> {
    let mut values = HashMap::new();
    state.manager().with_connection(|connection| {
        for id in ids {
            let (stored_name, media_type): (String, String) = connection
                .query_row(
                    "SELECT stored_name, media_type FROM attachments
                     WHERE id=?1 AND deleted_at IS NULL",
                    [id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(|error| DataError::essay_invalid(error.to_string()))?;
            if !matches!(
                media_type.as_str(),
                "image/png" | "image/jpeg" | "image/webp"
            ) {
                return Err(DataError::essay_invalid(
                    "AI attachments must be PNG or JPEG images",
                ));
            }
            let bytes = fs::read(state.manager().paths().attachments_dir.join(stored_name))
                .map_err(|error| DataError::essay_invalid(error.to_string()))?;
            if bytes.len() > 10 * 1024 * 1024 {
                return Err(DataError::essay_invalid("AI image exceeds the 10 MB limit"));
            }
            let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
            values.insert(id.clone(), format!("data:{media_type};base64,{encoded}"));
        }
        Ok(())
    })?;
    Ok(LoadedImages { values })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecognizeEssayImagesInput {
    attachment_ids: Vec<String>,
}

#[tauri::command]
pub async fn recognize_essay_images(
    input: RecognizeEssayImagesInput,
    data: tauri::State<'_, DataState>,
    ai: tauri::State<'_, AiState>,
) -> Result<essay_recognition::EssayImageRecognition, DataError> {
    let data = data.inner().clone();
    let ai = ai.inner().clone();
    run_blocking(move || {
        if input.attachment_ids.is_empty()
            || input.attachment_ids.len() > 4
            || input.attachment_ids.iter().any(|id| id.trim().is_empty())
            || input.attachment_ids.iter().collect::<HashSet<_>>().len()
                != input.attachment_ids.len()
        {
            return Err(DataError::essay_invalid(
                "essay recognition attachment ids are invalid",
            ));
        }
        let images = load_confirmed_images(&data, &input.attachment_ids)?;
        let (enabled, api_url, model) = data.manager().with_connection(|connection| {
            connection
                .query_row(
                    "SELECT enabled, api_url, model FROM ai_settings WHERE singleton_id=1",
                    [],
                    |row| {
                        Ok((
                            row.get::<_, i64>(0)? != 0,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                        ))
                    },
                )
                .map_err(|error| DataError::ai_not_configured(error.to_string()))
        })?;
        if !enabled {
            return Err(DataError::ai_disabled("AI setting is disabled"));
        }
        if api_url.trim().is_empty() || model.trim().is_empty() {
            return Err(DataError::ai_not_configured("AI settings are incomplete"));
        }
        let api_key = ai
            .credentials()
            .get_api_key()?
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| DataError::ai_not_configured("AI API key is missing"))?;
        let image_data_urls =
            input
                .attachment_ids
                .iter()
                .map(|id| {
                    images.values.get(id).cloned().ok_or_else(|| {
                        DataError::essay_invalid("confirmed image could not be loaded")
                    })
                })
                .collect::<Result<Vec<_>, _>>()?;
        essay_recognition::EssayRecognitionAdapter::new(ProviderConfig {
            api_url,
            model,
            api_key,
        })
        .recognize(ai.transport(), image_data_urls)
    })
    .await
}

fn review_essay_inner(
    data: &DataState,
    ai: &AiState,
    input: ReviewEssayInput,
    now: &str,
) -> Result<EssayAiReview, DataError> {
    let _operation = data.manager().lock_operation()?;
    let images = load_confirmed_images(data, &input.confirmed_attachment_ids)?;
    let mut connection = Connection::open(&data.manager().paths().database_path)
        .map_err(|error| DataError::database_open_failed(error.to_string()))?;
    connection
        .execute_batch("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;")
        .map_err(|error| DataError::database_open_failed(error.to_string()))?;
    review::review_attempt(
        &mut connection,
        ai.credentials.as_ref(),
        ai.transport.as_ref(),
        &images,
        input,
        now,
    )
}

fn material_provider_config(data: &DataState, ai: &AiState) -> Result<ProviderConfig, DataError> {
    let (enabled, api_url, model) = data.manager().with_connection(|connection| {
        connection
            .query_row(
                "SELECT enabled, api_url, model FROM ai_settings WHERE singleton_id=1",
                [],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)? != 0,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .map_err(|error| DataError::ai_not_configured(error.to_string()))
    })?;
    if !enabled {
        return Err(DataError::ai_disabled("AI setting is disabled"));
    }
    if api_url.trim().is_empty() || model.trim().is_empty() {
        return Err(DataError::ai_not_configured("AI settings are incomplete"));
    }
    let api_key = ai
        .credentials()
        .get_api_key()?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| DataError::ai_not_configured("AI API key is missing"))?;
    Ok(ProviderConfig {
        api_url,
        model,
        api_key,
    })
}

fn organize_text_material_inner(
    data: &DataState,
    ai: &AiState,
    input: OrganizeTextMaterialInput,
) -> Result<MaterialOrganizationSuggestion, DataError> {
    let config = material_provider_config(data, ai)?;
    let total_chars = input.subject.chars().count()
        + input.collection.chars().count()
        + input.kind.chars().count()
        + input.title.chars().count()
        + input.content.chars().count()
        + input.answer.chars().count()
        + input.source.chars().count()
        + input.tags.iter().map(|tag| tag.chars().count()).sum::<usize>();
    if total_chars > 50_000 || input.tags.len() > 20 {
        return Err(DataError::ai_response_invalid(
            "material input exceeds organization limits",
        ));
    }
    MaterialOrganizationAdapter::new(config).organize_text(ai.transport(), input)
}

fn organize_photo_material_inner(
    data: &DataState,
    ai: &AiState,
    input: OrganizePhotoMaterialInput,
) -> Result<PhotoOrganizationSuggestion, DataError> {
    let config = material_provider_config(data, ai)?;
    if input.attachment_id.trim().is_empty() {
        return Err(DataError::essay_invalid(
            "confirmed image attachment id is empty",
        ));
    }
    let images = load_confirmed_images(data, std::slice::from_ref(&input.attachment_id))?;
    let image = images
        .values
        .get(&input.attachment_id)
        .cloned()
        .ok_or_else(|| DataError::essay_invalid("confirmed image could not be loaded"))?;
    MaterialOrganizationAdapter::new(config).organize_photo(ai.transport(), image)
}

#[tauri::command]
pub async fn organize_text_material(
    input: OrganizeTextMaterialInput,
    data: tauri::State<'_, DataState>,
    ai: tauri::State<'_, AiState>,
) -> Result<MaterialOrganizationSuggestion, DataError> {
    let data = data.inner().clone();
    let ai = ai.inner().clone();
    run_blocking(move || organize_text_material_inner(&data, &ai, input)).await
}

#[tauri::command]
pub async fn organize_photo_material(
    input: OrganizePhotoMaterialInput,
    data: tauri::State<'_, DataState>,
    ai: tauri::State<'_, AiState>,
) -> Result<PhotoOrganizationSuggestion, DataError> {
    let data = data.inner().clone();
    let ai = ai.inner().clone();
    run_blocking(move || organize_photo_material_inner(&data, &ai, input)).await
}

#[tauri::command]
pub async fn get_ai_settings(
    data: tauri::State<'_, DataState>,
    ai: tauri::State<'_, AiState>,
) -> Result<SafeAiSettings, DataError> {
    let data = data.inner().clone();
    let ai = ai.inner().clone();
    run_blocking(move || {
        let _operation = data.manager().lock_operation()?;
        data.manager().with_connection(|connection| {
            settings::get_safe_settings(connection, ai.credentials.as_ref())
        })
    })
    .await
}

#[tauri::command]
pub async fn update_ai_settings(
    input: UpdateAiSettingsInput,
    data: tauri::State<'_, DataState>,
    ai: tauri::State<'_, AiState>,
) -> Result<SafeAiSettings, DataError> {
    let data = data.inner().clone();
    let ai = ai.inner().clone();
    run_blocking(move || {
        let _operation = data.manager().lock_operation()?;
        let now = Utc::now().to_rfc3339();
        data.manager().with_connection_mut(|connection| {
            settings::update_ai_settings(connection, ai.credentials.as_ref(), input, &now)
        })
    })
    .await
}

#[tauri::command]
pub async fn set_ai_api_key(
    api_key: String,
    data: tauri::State<'_, DataState>,
    ai: tauri::State<'_, AiState>,
) -> Result<SafeAiSettings, DataError> {
    let data = data.inner().clone();
    let ai = ai.inner().clone();
    run_blocking(move || {
        ai.credentials.set_api_key(&api_key)?;
        data.manager().with_connection(|connection| {
            settings::get_safe_settings(connection, ai.credentials.as_ref())
        })
    })
    .await
}

#[tauri::command]
pub async fn delete_ai_api_key(
    data: tauri::State<'_, DataState>,
    ai: tauri::State<'_, AiState>,
) -> Result<SafeAiSettings, DataError> {
    let data = data.inner().clone();
    let ai = ai.inner().clone();
    run_blocking(move || {
        ai.credentials.delete_api_key()?;
        data.manager().with_connection(|connection| {
            settings::get_safe_settings(connection, ai.credentials.as_ref())
        })
    })
    .await
}

#[tauri::command]
pub async fn review_essay(
    input: ReviewEssayInput,
    data: tauri::State<'_, DataState>,
    ai: tauri::State<'_, AiState>,
) -> Result<EssayAiReview, DataError> {
    let data = data.inner().clone();
    let ai = ai.inner().clone();
    run_blocking(move || review_essay_inner(&data, &ai, input, &Utc::now().to_rfc3339())).await
}

#[tauri::command]
pub async fn retry_ai_review(
    request_id: String,
    data: tauri::State<'_, DataState>,
    ai: tauri::State<'_, AiState>,
) -> Result<EssayAiReview, DataError> {
    let data = data.inner().clone();
    let ai = ai.inner().clone();
    run_blocking(move || {
        let _operation = data.manager().lock_operation()?;
        let mut connection = Connection::open(&data.manager().paths().database_path)
            .map_err(|error| DataError::database_open_failed(error.to_string()))?;
        let images = LoadedImages {
            values: HashMap::new(),
        };
        review::retry_review(
            &mut connection,
            ai.credentials.as_ref(),
            ai.transport.as_ref(),
            &images,
            &request_id,
            &Utc::now().to_rfc3339(),
        )
    })
    .await
}

#[tauri::command]
pub async fn get_ai_review(
    review_id: String,
    data: tauri::State<'_, DataState>,
) -> Result<EssayAiReview, DataError> {
    let data = data.inner().clone();
    run_blocking(move || {
        let _operation = data.manager().lock_operation()?;
        data.manager()
            .with_connection(|connection| review::get_review(connection, &review_id))
    })
    .await
}

#[tauri::command]
pub async fn confirm_ai_review(
    review_id: String,
    version: i64,
    data: tauri::State<'_, DataState>,
) -> Result<EssayAiReview, DataError> {
    let data = data.inner().clone();
    run_blocking(move || {
        let _operation = data.manager().lock_operation()?;
        data.manager().with_connection_mut(|connection| {
            review::confirm_review(connection, &review_id, version, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use crate::commands::data_commands::DataState;
    use crate::data::ai::credentials::{CredentialStore, MemoryCredentialStore};
    use crate::data::ai::models::{
        OrganizePhotoMaterialInput, OrganizeTextMaterialInput, ReviewEssayInput,
    };
    use crate::data::ai::provider::{
        AiTransport, TransportError, TransportRequest, TransportResponse,
    };
    use crate::data::database::DatabaseManager;
    use crate::data::paths::DataPaths;

    use super::*;

    struct CountingTransport(AtomicUsize);

    impl AiTransport for CountingTransport {
        fn send(&self, _request: TransportRequest) -> Result<TransportResponse, TransportError> {
            self.0.fetch_add(1, Ordering::SeqCst);
            unreachable!()
        }
    }

    #[test]
    fn disabled_ai_command_stops_before_transport() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let data = DataState::new(DatabaseManager::open(paths).unwrap());
        let transport = Arc::new(CountingTransport(AtomicUsize::new(0)));
        let ai = AiState::new(
            Arc::new(MemoryCredentialStore::default()),
            transport.clone(),
        );

        let error = review_essay_inner(
            &data,
            &ai,
            ReviewEssayInput {
                attempt_id: "missing".into(),
                confirmed_attachment_ids: vec![],
                retry_of: None,
            },
            "2026-09-26T00:00:00Z",
        )
        .unwrap_err();

        assert_eq!(error.code(), "AI_DISABLED");
        assert_eq!(transport.0.load(Ordering::SeqCst), 0);
    }

    fn text_input() -> OrganizeTextMaterialInput {
        OrganizeTextMaterialInput {
            subject: "math".into(),
            collection: "notes-examples".into(),
            kind: "note".into(),
            title: "极限".into(),
            content: "整理极限计算".into(),
            answer: String::new(),
            source: "高数教材".into(),
            tags: vec!["高数".into()],
        }
    }

    #[test]
    fn disabled_text_organization_never_calls_transport() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let data = DataState::new(DatabaseManager::open(paths).unwrap());
        let transport = Arc::new(CountingTransport(AtomicUsize::new(0)));
        let ai = AiState::new(
            Arc::new(MemoryCredentialStore::default()),
            transport.clone(),
        );

        let error = organize_text_material_inner(&data, &ai, text_input()).unwrap_err();

        assert_eq!(error.code(), "AI_DISABLED");
        assert_eq!(transport.0.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn oversized_text_organization_stops_before_transport() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let manager = DatabaseManager::open(paths).unwrap();
        manager
            .with_connection(|connection| {
                connection.execute(
                    "UPDATE ai_settings SET enabled=1, api_url='https://api.example.com/v1', model='model' WHERE singleton_id=1",
                    [],
                )?;
                Ok(())
            })
            .unwrap();
        let data = DataState::new(manager);
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials.set_api_key("secret").unwrap();
        let transport = Arc::new(CountingTransport(AtomicUsize::new(0)));
        let ai = AiState::new(credentials, transport.clone());
        let mut input = text_input();
        input.content = "字".repeat(50_001);

        let error = organize_text_material_inner(&data, &ai, input).unwrap_err();

        assert_eq!(error.code(), "AI_RESPONSE_INVALID");
        assert_eq!(transport.0.load(Ordering::SeqCst), 0);
    }

    struct RecordingTransport {
        requests: std::sync::Mutex<Vec<TransportRequest>>,
    }

    impl AiTransport for RecordingTransport {
        fn send(&self, request: TransportRequest) -> Result<TransportResponse, TransportError> {
            self.requests.lock().unwrap().push(request);
            Ok(TransportResponse {
                status: 200,
                body: serde_json::json!({
                    "choices": [{"message": {"content": r#"{"title":"英语作文批注","kind":"essay","summary":"教师批改过的作文。"}"#}}]
                })
                .to_string(),
            })
        }
    }

    #[test]
    fn photo_organization_loads_only_the_confirmed_managed_attachment() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let manager = DatabaseManager::open(paths).unwrap();
        manager
            .with_connection(|connection| {
                connection.execute(
                    "UPDATE ai_settings SET enabled=1, api_url='https://api.example.com/v1', model='model' WHERE singleton_id=1",
                    [],
                )?;
                Ok(())
            })
            .unwrap();
        let attachment = crate::data::attachments::import_image_bytes(
            &manager,
            b"\x89PNG\r\n\x1a\nmanaged-image".to_vec(),
            "image/png",
        )
        .unwrap();
        let data = DataState::new(manager);
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials.set_api_key("secret").unwrap();
        let transport = Arc::new(RecordingTransport {
            requests: std::sync::Mutex::new(Vec::new()),
        });
        let ai = AiState::new(credentials, transport.clone());

        let result = organize_photo_material_inner(
            &data,
            &ai,
            OrganizePhotoMaterialInput {
                attachment_id: attachment.id,
            },
        )
        .unwrap();

        assert_eq!(result.kind, "essay");
        let requests = transport.requests.lock().unwrap();
        assert_eq!(requests.len(), 1);
        let body = requests[0].body.to_string();
        assert_eq!(body.matches("data:image/png;base64,").count(), 1);
    }

    #[test]
    fn unknown_photo_is_rejected_before_transport() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let manager = DatabaseManager::open(paths).unwrap();
        manager
            .with_connection(|connection| {
                connection.execute(
                    "UPDATE ai_settings SET enabled=1, api_url='https://api.example.com/v1', model='model' WHERE singleton_id=1",
                    [],
                )?;
                Ok(())
            })
            .unwrap();
        let data = DataState::new(manager);
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials.set_api_key("secret").unwrap();
        let transport = Arc::new(CountingTransport(AtomicUsize::new(0)));
        let ai = AiState::new(credentials, transport.clone());

        let error = organize_photo_material_inner(
            &data,
            &ai,
            OrganizePhotoMaterialInput {
                attachment_id: "missing".into(),
            },
        )
        .unwrap_err();

        assert_eq!(error.code(), "ESSAY_INVALID");
        assert_eq!(transport.0.load(Ordering::SeqCst), 0);
    }
}
