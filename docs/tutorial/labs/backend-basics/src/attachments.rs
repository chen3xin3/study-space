use std::fs;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::error::AppError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedAttachment {
    pub stored_name: String,
    pub path: PathBuf,
    pub byte_size: u64,
    pub sha256: String,
}

fn sha256(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn safe_stored_name(id: &str, original_name: &str) -> Result<String, AppError> {
    let safe_id: String = id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .collect();
    if safe_id.is_empty() {
        return Err(AppError::storage("attachment id has no safe characters"));
    }
    let extension = Path::new(original_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|value| {
            !value.is_empty()
                && value.len() <= 10
                && value
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric())
        });
    Ok(match extension {
        Some(extension) => format!("{safe_id}.{extension}"),
        None => safe_id,
    })
}

pub fn import_bytes(
    managed_root: &Path,
    id: &str,
    original_name: &str,
    bytes: &[u8],
) -> Result<ManagedAttachment, AppError> {
    fs::create_dir_all(managed_root).map_err(|error| AppError::storage(error.to_string()))?;
    let stored_name = safe_stored_name(id, original_name)?;
    let path = managed_root.join(&stored_name);
    if !path.starts_with(managed_root) {
        return Err(AppError::storage("attachment escaped managed root"));
    }
    fs::write(&path, bytes).map_err(|error| AppError::storage(error.to_string()))?;
    Ok(ManagedAttachment {
        stored_name,
        path,
        byte_size: u64::try_from(bytes.len())
            .map_err(|error| AppError::storage(error.to_string()))?,
        sha256: sha256(bytes),
    })
}

pub fn verify_attachment(attachment: &ManagedAttachment) -> Result<bool, AppError> {
    let bytes = fs::read(&attachment.path).map_err(|error| AppError::storage(error.to_string()))?;
    Ok(
        u64::try_from(bytes.len()).ok() == Some(attachment.byte_size)
            && sha256(&bytes) == attachment.sha256,
    )
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::{import_bytes, verify_attachment};

    #[test]
    fn imported_files_get_safe_managed_names_and_hashes() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("attachments");
        let attachment =
            import_bytes(&root, "photo-1", "../../英语试卷.JPG", b"image bytes").unwrap();

        assert_eq!(attachment.stored_name, "photo-1.jpg");
        assert!(attachment.path.starts_with(&root));
        assert_eq!(fs::read(&attachment.path).unwrap(), b"image bytes");
        assert!(verify_attachment(&attachment).unwrap());
    }

    #[test]
    fn changed_attachment_fails_sha256_verification() {
        let temp = tempdir().unwrap();
        let attachment = import_bytes(temp.path(), "paper", "paper.pdf", b"original").unwrap();
        fs::write(&attachment.path, b"changed").unwrap();
        assert!(!verify_attachment(&attachment).unwrap());
    }
}
