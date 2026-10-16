use std::fs;
use std::path::{Component, PathBuf};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use chrono::Utc;
use rusqlite::OptionalExtension;

use crate::data::ai::credentials::CredentialStore;
use crate::data::ai::provider::{AiTransport, ProviderConfig};
use crate::data::ai::vocabulary_recognition::VocabularyRecognitionAdapter;
use crate::data::database::DatabaseManager;
use crate::data::error::DataError;
use crate::data::vocabulary::import_models::{
    ImportSessionDetail, ImportStatus, RecognitionResult,
};
use crate::data::vocabulary::import_repository;

const MAX_IMAGE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct PreparedVocabularyRecognition {
    pub session_id: String,
    pub session_version: i64,
    pub image_paths: Vec<PathBuf>,
    pub image_media_types: Vec<String>,
    api_url: String,
    model: String,
}

pub fn prepare_recognition(
    manager: &DatabaseManager,
    session_id: &str,
    version: i64,
) -> Result<PreparedVocabularyRecognition, DataError> {
    let _operation = manager.lock_operation()?;
    let attachments_dir = manager.paths().attachments_dir.clone();
    manager.with_connection_mut(|connection| {
        let (enabled, provider_name, api_url, model) = connection
            .query_row(
                "SELECT enabled, provider_name, api_url, model
                 FROM ai_settings WHERE singleton_id=1",
                [],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)? != 0,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                },
            )
            .map_err(|error| DataError::ai_not_configured(error.to_string()))?;
        if !enabled {
            return Err(DataError::ai_disabled("AI setting is disabled"));
        }
        if provider_name.trim().is_empty() || api_url.trim().is_empty() || model.trim().is_empty() {
            return Err(DataError::ai_not_configured("AI settings are incomplete"));
        }

        let current = import_repository::get_session(connection, session_id)?;
        if current.version != version {
            return Err(DataError::vocabulary_import_conflict(
                "session version changed before recognition",
            ));
        }
        if !matches!(current.status, ImportStatus::Draft | ImportStatus::Failed) {
            return Err(DataError::vocabulary_import_invalid(
                "only draft or failed sessions can start recognition",
            ));
        }
        let recognizing = import_repository::set_recognizing(
            connection,
            session_id,
            version,
            &Utc::now().to_rfc3339(),
        )?;

        let mut image_paths = Vec::with_capacity(recognizing.images.len());
        let mut image_media_types = Vec::with_capacity(recognizing.images.len());
        for image in &recognizing.images {
            let record = connection
                .query_row(
                    "SELECT stored_name, media_type FROM attachments
                     WHERE id=?1 AND deleted_at IS NULL",
                    [&image.attachment_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .optional()
                .map_err(|error| DataError::vocabulary_recognition_failed(error.to_string()))?
                .ok_or_else(|| {
                    DataError::vocabulary_recognition_failed("session image is unavailable")
                })?;
            let stored_path = std::path::Path::new(&record.0);
            if stored_path.components().count() != 1
                || !matches!(stored_path.components().next(), Some(Component::Normal(_)))
            {
                return Err(DataError::vocabulary_recognition_failed(
                    "session image has an unsafe managed path",
                ));
            }
            image_paths.push(attachments_dir.join(stored_path));
            image_media_types.push(record.1);
        }

        Ok(PreparedVocabularyRecognition {
            session_id: recognizing.id,
            session_version: recognizing.version,
            image_paths,
            image_media_types,
            api_url,
            model,
        })
    })
}

pub fn call_recognition(
    prepared: PreparedVocabularyRecognition,
    credentials: &dyn CredentialStore,
    transport: &dyn AiTransport,
) -> Result<RecognitionResult, DataError> {
    let api_key = credentials
        .get_api_key()?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| DataError::ai_not_configured("AI API key is missing"))?;
    let mut image_data_urls = Vec::with_capacity(prepared.image_paths.len());
    for (path, media_type) in prepared.image_paths.iter().zip(&prepared.image_media_types) {
        let bytes = fs::read(path).map_err(|error| {
            DataError::vocabulary_recognition_failed(format!("read managed image: {error}"))
        })?;
        if bytes.is_empty() || bytes.len() as u64 > MAX_IMAGE_BYTES {
            return Err(DataError::vocabulary_recognition_failed(
                "managed image is empty or exceeds the size limit",
            ));
        }
        image_data_urls.push(format!(
            "data:{media_type};base64,{}",
            STANDARD.encode(bytes)
        ));
    }
    VocabularyRecognitionAdapter::new(ProviderConfig {
        api_url: prepared.api_url,
        model: prepared.model,
        api_key,
    })
    .recognize(transport, image_data_urls)
}

pub fn finalize_recognition(
    manager: &DatabaseManager,
    prepared: &PreparedVocabularyRecognition,
    result: Result<RecognitionResult, DataError>,
    now: &str,
) -> Result<ImportSessionDetail, DataError> {
    let _operation = manager.lock_operation()?;
    manager.with_connection_mut(|connection| match result {
        Ok(recognized) => import_repository::replace_candidates(
            connection,
            &prepared.session_id,
            prepared.session_version,
            recognized.candidates,
            now,
        ),
        Err(error) => import_repository::mark_failed(
            connection,
            &prepared.session_id,
            prepared.session_version,
            error.code(),
            now,
        ),
    })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use rusqlite::params;
    use tempfile::TempDir;

    use super::*;
    use crate::data::ai::credentials::CredentialStore;
    use crate::data::ai::provider::{
        AiTransport, TransportError, TransportRequest, TransportResponse,
    };
    use crate::data::database::DatabaseManager;
    use crate::data::error::DataError;
    use crate::data::paths::DataPaths;
    use crate::data::vocabulary::import_models::ImportStatus;
    use crate::data::vocabulary::import_repository;

    const NOW: &str = "2026-09-27T01:00:00Z";
    const LATER: &str = "2026-09-27T02:00:00Z";

    struct CountingCredentials {
        calls: AtomicUsize,
    }

    impl CountingCredentials {
        fn new() -> Self {
            Self {
                calls: AtomicUsize::new(0),
            }
        }
    }

    impl CredentialStore for CountingCredentials {
        fn set_api_key(&self, _value: &str) -> Result<(), DataError> {
            unreachable!()
        }

        fn get_api_key(&self) -> Result<Option<String>, DataError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(Some("secret".into()))
        }

        fn delete_api_key(&self) -> Result<(), DataError> {
            unreachable!()
        }
    }

    struct CountingTransport {
        calls: AtomicUsize,
        result: Result<TransportResponse, TransportError>,
    }

    impl CountingTransport {
        fn success() -> Self {
            let content = serde_json::json!({
                "candidates": [{
                    "word": "persist",
                    "meaningOrNote": "坚持",
                    "confidence": "confident",
                    "imageIndex": 0,
                    "line": 1
                }],
                "unreadableFragments": []
            })
            .to_string();
            Self {
                calls: AtomicUsize::new(0),
                result: Ok(TransportResponse {
                    status: 200,
                    body: serde_json::json!({
                        "choices": [{"message": {"content": content}}]
                    })
                    .to_string(),
                }),
            }
        }

        fn timeout() -> Self {
            Self {
                calls: AtomicUsize::new(0),
                result: Err(TransportError::Timeout),
            }
        }
    }

    impl AiTransport for CountingTransport {
        fn send(&self, _request: TransportRequest) -> Result<TransportResponse, TransportError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            self.result.clone()
        }
    }

    fn setup(enabled: bool) -> (TempDir, DatabaseManager, String, i64) {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app-data")).unwrap();
        let manager = DatabaseManager::open(paths.clone()).unwrap();
        fs::write(
            paths.attachments_dir.join("selected.png"),
            b"selected image",
        )
        .unwrap();
        fs::write(paths.attachments_dir.join("other.png"), b"other image").unwrap();
        let session = manager
            .with_connection_mut(|connection| {
                for (id, stored_name) in [("selected", "selected.png"), ("other", "other.png")] {
                    connection
                        .execute(
                            "INSERT INTO attachments
                             (id, original_name, stored_name, media_type, byte_size, sha256,
                              created_at, updated_at, version)
                             VALUES (?1, ?2, ?2, 'image/png', 14, 'hash', ?3, ?3, 1)",
                            params![id, stored_name, NOW],
                        )
                        .map_err(DataError::from)?;
                }
                if enabled {
                    connection
                        .execute(
                            "UPDATE ai_settings SET enabled=1, provider_name='Compatible',
                             api_url='https://api.example.com/v1', model='vision-model'",
                            [],
                        )
                        .map_err(DataError::from)?;
                }
                import_repository::create_session(connection, vec!["selected".into()], NOW)
            })
            .unwrap();
        (temp, manager, session.id, session.version)
    }

    #[test]
    fn disabled_ai_stops_before_credentials_or_transport() {
        let (_temp, manager, session_id, version) = setup(false);
        let credentials = CountingCredentials::new();
        let transport = CountingTransport::success();

        let error = prepare_recognition(&manager, &session_id, version).unwrap_err();

        assert_eq!(error.code(), "AI_DISABLED");
        assert_eq!(credentials.calls.load(Ordering::SeqCst), 0);
        assert_eq!(transport.calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn recognizes_only_session_images_and_moves_to_reviewing() {
        let (_temp, manager, session_id, version) = setup(true);
        let credentials = CountingCredentials::new();
        let transport = CountingTransport::success();

        let prepared = prepare_recognition(&manager, &session_id, version).unwrap();
        assert_eq!(prepared.image_paths.len(), 1);
        assert!(prepared.image_paths[0].ends_with("selected.png"));
        let result = call_recognition(prepared.clone(), &credentials, &transport);
        let finalized = finalize_recognition(&manager, &prepared, result, LATER).unwrap();

        assert_eq!(finalized.status, ImportStatus::Reviewing);
        assert_eq!(finalized.candidates[0].word, "persist");
        assert_eq!(credentials.calls.load(Ordering::SeqCst), 1);
        assert_eq!(transport.calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn failed_recognition_keeps_images_and_can_retry_same_session() {
        let (_temp, manager, session_id, version) = setup(true);
        let credentials = CountingCredentials::new();
        let failed_transport = CountingTransport::timeout();

        let first = prepare_recognition(&manager, &session_id, version).unwrap();
        let failed = call_recognition(first.clone(), &credentials, &failed_transport);
        let session = finalize_recognition(&manager, &first, failed, LATER).unwrap();
        assert_eq!(session.status, ImportStatus::Failed);
        assert_eq!(session.error_code.as_deref(), Some("AI_TIMEOUT"));
        assert_eq!(session.images.len(), 1);

        let retry = prepare_recognition(&manager, &session_id, session.version).unwrap();
        let successful =
            call_recognition(retry.clone(), &credentials, &CountingTransport::success());
        let reviewing = finalize_recognition(&manager, &retry, successful, LATER).unwrap();
        assert_eq!(reviewing.status, ImportStatus::Reviewing);
        assert_eq!(reviewing.images[0].attachment_id, "selected");
    }
}
