use std::sync::Mutex;

use crate::data::error::DataError;

// Keep the legacy keyring service stable so upgrades can still read keys saved
// by earlier application versions. This identifier is not shown in the UI.
const KEYRING_SERVICE: &str = "com.codex.my-postgraduate-study-space";
const KEYRING_USER: &str = "ai-api-key";

pub trait CredentialStore: Send + Sync {
    fn set_api_key(&self, value: &str) -> Result<(), DataError>;
    fn get_api_key(&self) -> Result<Option<String>, DataError>;
    fn delete_api_key(&self) -> Result<(), DataError>;
}

#[derive(Debug, Default)]
pub struct MemoryCredentialStore {
    value: Mutex<Option<String>>,
}

impl CredentialStore for MemoryCredentialStore {
    fn set_api_key(&self, value: &str) -> Result<(), DataError> {
        validate_api_key(value)?;
        *self
            .value
            .lock()
            .map_err(|error| DataError::ai_credential_failed(error.to_string()))? =
            Some(value.trim().to_owned());
        Ok(())
    }

    fn get_api_key(&self) -> Result<Option<String>, DataError> {
        self.value
            .lock()
            .map(|value| value.clone())
            .map_err(|error| DataError::ai_credential_failed(error.to_string()))
    }

    fn delete_api_key(&self) -> Result<(), DataError> {
        *self
            .value
            .lock()
            .map_err(|error| DataError::ai_credential_failed(error.to_string()))? = None;
        Ok(())
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct KeyringCredentialStore;

impl KeyringCredentialStore {
    fn entry() -> Result<keyring::Entry, DataError> {
        keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|error| DataError::ai_credential_failed(error.to_string()))
    }
}

impl CredentialStore for KeyringCredentialStore {
    fn set_api_key(&self, value: &str) -> Result<(), DataError> {
        validate_api_key(value)?;
        Self::entry()?
            .set_password(value.trim())
            .map_err(|error| DataError::ai_credential_failed(error.to_string()))
    }

    fn get_api_key(&self) -> Result<Option<String>, DataError> {
        match Self::entry()?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(DataError::ai_credential_failed(error.to_string())),
        }
    }

    fn delete_api_key(&self) -> Result<(), DataError> {
        match Self::entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(DataError::ai_credential_failed(error.to_string())),
        }
    }
}

fn validate_api_key(value: &str) -> Result<(), DataError> {
    let length = value.trim().chars().count();
    if length == 0 || length > 4_096 {
        return Err(DataError::ai_credential_failed(
            "API key must contain 1 to 4096 characters",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_store_sets_reads_and_deletes_without_serializing_secrets() {
        let store = MemoryCredentialStore::default();
        store.set_api_key("sk-private").unwrap();
        assert_eq!(store.get_api_key().unwrap().as_deref(), Some("sk-private"));
        store.delete_api_key().unwrap();
        assert_eq!(store.get_api_key().unwrap(), None);
    }

    #[test]
    fn blank_keys_are_rejected() {
        let store = MemoryCredentialStore::default();
        assert_eq!(
            store.set_api_key("  ").unwrap_err().code(),
            "AI_CREDENTIAL_FAILED"
        );
    }
}
