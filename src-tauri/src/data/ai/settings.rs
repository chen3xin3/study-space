use rusqlite::{params, Connection};

use crate::data::ai::credentials::CredentialStore;
use crate::data::ai::models::{SafeAiSettings, UpdateAiSettingsInput};
use crate::data::error::DataError;

pub fn get_safe_settings(
    connection: &Connection,
    credentials: &dyn CredentialStore,
) -> Result<SafeAiSettings, DataError> {
    let mut settings = connection
        .query_row(
            "SELECT enabled, provider_name, api_url, model, version
             FROM ai_settings WHERE singleton_id=1",
            [],
            |row| {
                Ok(SafeAiSettings {
                    enabled: row.get::<_, i64>(0)? != 0,
                    provider_name: row.get(1)?,
                    api_url: row.get(2)?,
                    model: row.get(3)?,
                    has_api_key: false,
                    version: row.get(4)?,
                })
            },
        )
        .map_err(|error| DataError::ai_not_configured(error.to_string()))?;
    settings.has_api_key = credentials.get_api_key()?.is_some();
    Ok(settings)
}

pub fn update_ai_settings(
    connection: &mut Connection,
    credentials: &dyn CredentialStore,
    input: UpdateAiSettingsInput,
    now: &str,
) -> Result<SafeAiSettings, DataError> {
    validate_settings(&input)?;
    let changed = connection
        .execute(
            "UPDATE ai_settings
             SET enabled=?1, provider_name=?2, api_url=?3, model=?4,
                 updated_at=?5, version=version+1
             WHERE singleton_id=1 AND version=?6",
            params![
                i64::from(input.enabled),
                input.provider_name.trim(),
                input.api_url.trim(),
                input.model.trim(),
                now,
                input.version,
            ],
        )
        .map_err(|error| DataError::ai_not_configured(error.to_string()))?;
    if changed == 0 {
        return Err(DataError::essay_version_conflict(
            "AI settings changed before this update",
        ));
    }
    get_safe_settings(connection, credentials)
}

fn validate_settings(input: &UpdateAiSettingsInput) -> Result<(), DataError> {
    let provider_length = input.provider_name.trim().chars().count();
    let model_length = input.model.trim().chars().count();
    if provider_length == 0 || provider_length > 100 {
        return Err(DataError::ai_not_configured(
            "provider name must contain 1 to 100 characters",
        ));
    }
    if model_length == 0 || model_length > 100 {
        return Err(DataError::ai_not_configured(
            "model must contain 1 to 100 characters",
        ));
    }
    validate_api_url(input.api_url.trim())
}

fn validate_api_url(value: &str) -> Result<(), DataError> {
    if value.is_empty() || value.contains('#') {
        return Err(DataError::ai_not_configured(
            "API URL is empty or contains a fragment",
        ));
    }
    let (scheme, remainder) = value
        .split_once("://")
        .ok_or_else(|| DataError::ai_not_configured("API URL has no scheme"))?;
    if remainder.is_empty() || remainder.contains('@') {
        return Err(DataError::ai_not_configured(
            "API URL contains credentials or has no host",
        ));
    }
    let authority = remainder
        .split(['/', '?'])
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if authority.is_empty() {
        return Err(DataError::ai_not_configured("API URL has no host"));
    }
    match scheme.to_ascii_lowercase().as_str() {
        "https" => Ok(()),
        "http" if is_loopback_authority(&authority) => Ok(()),
        "http" => Err(DataError::ai_not_configured(
            "unencrypted HTTP is allowed only for loopback services",
        )),
        _ => Err(DataError::ai_not_configured(
            "API URL must use HTTPS or loopback HTTP",
        )),
    }
}

fn is_loopback_authority(value: &str) -> bool {
    value == "localhost"
        || value.starts_with("localhost:")
        || value == "127.0.0.1"
        || value.starts_with("127.0.0.1:")
        || value == "[::1]"
        || value.starts_with("[::1]:")
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::*;
    use crate::data::ai::credentials::{CredentialStore, MemoryCredentialStore};
    use crate::data::ai::models::UpdateAiSettingsInput;
    use crate::data::migrations::migrate;

    const NOW: &str = "2026-09-25T06:00:00Z";

    fn setup() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        connection
    }

    fn input(url: &str) -> UpdateAiSettingsInput {
        UpdateAiSettingsInput {
            enabled: true,
            provider_name: "OpenAI compatible".into(),
            api_url: url.into(),
            model: "review-model".into(),
            version: 1,
        }
    }

    #[test]
    fn safe_settings_report_key_presence_without_leaking_the_key() {
        let mut connection = setup();
        let store = MemoryCredentialStore::default();
        store.set_api_key("sk-private").unwrap();
        let saved = update_ai_settings(
            &mut connection,
            &store,
            input("https://api.example.com/v1"),
            NOW,
        )
        .unwrap();
        assert!(saved.has_api_key);
        let json = serde_json::to_string(&saved).unwrap();
        assert!(!json.contains("sk-private"));
        let database_text: String = connection
            .query_row(
                "SELECT provider_name || ' ' || api_url || ' ' || model FROM ai_settings",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!database_text.contains("sk-private"));
        let safe = get_safe_settings(&connection, &store).unwrap();
        assert!(safe.has_api_key);
    }

    #[test]
    fn validates_urls_and_uses_optimistic_versions() {
        let mut connection = setup();
        let store = MemoryCredentialStore::default();
        for url in [
            "http://example.com/v1",
            "ftp://localhost/v1",
            "https://user:pass@example.com/v1",
            "https://example.com/v1#secret",
        ] {
            assert_eq!(
                update_ai_settings(&mut connection, &store, input(url), NOW)
                    .unwrap_err()
                    .code(),
                "AI_NOT_CONFIGURED"
            );
        }
        assert!(update_ai_settings(
            &mut connection,
            &store,
            input("http://127.0.0.1:11434/v1"),
            NOW,
        )
        .is_ok());
        assert_eq!(
            update_ai_settings(
                &mut connection,
                &store,
                input("https://api.example.com/v1"),
                NOW,
            )
            .unwrap_err()
            .code(),
            "ESSAY_VERSION_CONFLICT"
        );
    }
}
