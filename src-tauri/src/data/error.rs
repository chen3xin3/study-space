use serde::Serialize;

#[derive(Debug, Serialize, thiserror::Error)]
#[error("{message}")]
pub struct DataError {
    code: String,
    message: String,
    #[serde(skip)]
    internal: String,
}

impl DataError {
    fn new(code: &str, message: &str, internal: impl Into<String>) -> Self {
        Self {
            code: code.to_owned(),
            message: message.to_owned(),
            internal: internal.into(),
        }
    }

    pub fn code(&self) -> &str {
        &self.code
    }

    pub fn internal(&self) -> &str {
        &self.internal
    }

    pub fn data_directory_unavailable(internal: impl Into<String>) -> Self {
        Self::new(
            "DATA_DIRECTORY_UNAVAILABLE",
            "无法准备本地数据目录。",
            internal,
        )
    }

    pub fn database_open_failed(internal: impl Into<String>) -> Self {
        Self::new("DATABASE_OPEN_FAILED", "无法打开本地数据库。", internal)
    }

    pub fn database_migration_failed(internal: impl Into<String>) -> Self {
        Self::new(
            "DATABASE_MIGRATION_FAILED",
            "数据库升级未能完成。",
            internal,
        )
    }

    pub fn database_integrity_failed(internal: impl Into<String>) -> Self {
        Self::new(
            "DATABASE_INTEGRITY_FAILED",
            "本地数据库完整性检查失败。",
            internal,
        )
    }

    pub fn attachment_invalid(internal: impl Into<String>) -> Self {
        Self::new("ATTACHMENT_INVALID", "所选文件无法导入。", internal)
    }

    pub fn attachment_too_large(internal: impl Into<String>) -> Self {
        Self::new(
            "ATTACHMENT_TOO_LARGE",
            "文件超过 100 MB，无法导入。",
            internal,
        )
    }

    pub fn backup_create_failed(internal: impl Into<String>) -> Self {
        Self::new("BACKUP_CREATE_FAILED", "完整备份创建失败。", internal)
    }

    pub fn backup_invalid(internal: impl Into<String>) -> Self {
        Self::new("BACKUP_INVALID", "所选备份文件无效或已损坏。", internal)
    }

    pub fn restore_failed(internal: impl Into<String>) -> Self {
        Self::new("RESTORE_FAILED", "恢复未能完成，当前数据已保留。", internal)
    }

    pub fn sync_address_invalid(internal: impl Into<String>) -> Self {
        Self::new("SYNC_ADDRESS_INVALID", "请输入发送端显示的局域网地址。", internal)
    }

    pub fn sync_connection_failed(internal: impl Into<String>) -> Self {
        Self::new("SYNC_CONNECTION_FAILED", "无法连接发送设备，请检查两台设备是否在同一网络。", internal)
    }

    pub fn sync_pairing_failed(internal: impl Into<String>) -> Self {
        Self::new("SYNC_PAIRING_FAILED", "连接码错误、已过期或已经使用。", internal)
    }

    pub fn sync_protocol_incompatible(internal: impl Into<String>) -> Self {
        Self::new("SYNC_PROTOCOL_INCOMPATIBLE", "两台设备的互联版本不兼容，请更新应用。", internal)
    }

    pub fn sync_too_large(internal: impl Into<String>) -> Self {
        Self::new("SYNC_TOO_LARGE", "要接收的数据超过当前支持的大小。", internal)
    }

    pub fn sync_checksum_mismatch(internal: impl Into<String>) -> Self {
        Self::new("SYNC_CHECKSUM_MISMATCH", "传输校验失败，本机数据没有改变。", internal)
    }

    pub fn sync_transfer_failed(internal: impl Into<String>) -> Self {
        Self::new("SYNC_TRANSFER_FAILED", "数据传输中断，本机数据没有改变。", internal)
    }

    pub fn word_invalid(internal: impl Into<String>) -> Self {
        Self::new("WORD_INVALID", "单词信息不完整或格式不正确。", internal)
    }

    pub fn word_not_found(internal: impl Into<String>) -> Self {
        Self::new("WORD_NOT_FOUND", "没有找到这个单词。", internal)
    }

    pub fn word_version_conflict(internal: impl Into<String>) -> Self {
        Self::new(
            "WORD_VERSION_CONFLICT",
            "这个单词已在其他位置更新，请重新读取后再保存。",
            internal,
        )
    }

    pub fn vocabulary_operation_failed(internal: impl Into<String>) -> Self {
        Self::new(
            "VOCABULARY_OPERATION_FAILED",
            "单词操作未能完成，请稍后重试。",
            internal,
        )
    }

    pub fn vocabulary_import_invalid(internal: impl Into<String>) -> Self {
        Self::new(
            "VOCABULARY_IMPORT_INVALID",
            "拍照录入内容不完整或格式不正确。",
            internal,
        )
    }

    pub fn vocabulary_import_not_found(internal: impl Into<String>) -> Self {
        Self::new(
            "VOCABULARY_IMPORT_NOT_FOUND",
            "没有找到这次拍照录入记录。",
            internal,
        )
    }

    pub fn vocabulary_import_conflict(internal: impl Into<String>) -> Self {
        Self::new(
            "VOCABULARY_IMPORT_CONFLICT",
            "拍照录入内容已发生变化，请重新读取。",
            internal,
        )
    }

    pub fn vocabulary_recognition_failed(internal: impl Into<String>) -> Self {
        Self::new(
            "VOCABULARY_RECOGNITION_FAILED",
            "手写单词识别未能完成，请保留照片后重试。",
            internal,
        )
    }

    pub fn dashboard_invalid(internal: impl Into<String>) -> Self {
        Self::new(
            "DASHBOARD_INVALID",
            "首页数据不完整或格式不正确。",
            internal,
        )
    }

    pub fn dashboard_not_found(internal: impl Into<String>) -> Self {
        Self::new("DASHBOARD_NOT_FOUND", "没有找到这条首页记录。", internal)
    }

    pub fn dashboard_conflict(internal: impl Into<String>) -> Self {
        Self::new(
            "DASHBOARD_CONFLICT",
            "首页数据已发生变化，请重新读取。",
            internal,
        )
    }

    pub fn learning_item_invalid(internal: impl Into<String>) -> Self {
        Self::new(
            "LEARNING_ITEM_INVALID",
            "学习内容不完整或格式不正确。",
            internal,
        )
    }

    pub fn learning_item_not_found(internal: impl Into<String>) -> Self {
        Self::new(
            "LEARNING_ITEM_NOT_FOUND",
            "没有找到这条学习内容。",
            internal,
        )
    }

    pub fn learning_item_conflict(internal: impl Into<String>) -> Self {
        Self::new(
            "LEARNING_ITEM_CONFLICT",
            "学习内容已发生变化，请重新读取后再保存。",
            internal,
        )
    }

    pub fn essay_invalid(internal: impl Into<String>) -> Self {
        Self::new("ESSAY_INVALID", "作文信息不完整或格式不正确。", internal)
    }

    pub fn essay_not_found(internal: impl Into<String>) -> Self {
        Self::new("ESSAY_NOT_FOUND", "没有找到这条作文资料。", internal)
    }

    pub fn essay_version_conflict(internal: impl Into<String>) -> Self {
        Self::new(
            "ESSAY_VERSION_CONFLICT",
            "这条作文资料已在其他位置更新，请重新读取后再保存。",
            internal,
        )
    }

    pub fn essay_operation_failed(internal: impl Into<String>) -> Self {
        Self::new(
            "ESSAY_OPERATION_FAILED",
            "作文操作未能完成，请稍后重试。",
            internal,
        )
    }

    pub fn ai_disabled(internal: impl Into<String>) -> Self {
        Self::new("AI_DISABLED", "AI 学习助手当前已关闭。", internal)
    }

    pub fn ai_not_configured(internal: impl Into<String>) -> Self {
        Self::new("AI_NOT_CONFIGURED", "请先完成 AI 服务配置。", internal)
    }

    pub fn ai_credential_failed(internal: impl Into<String>) -> Self {
        Self::new(
            "AI_CREDENTIAL_FAILED",
            "AI 密钥的安全存储操作失败。",
            internal,
        )
    }

    pub fn ai_auth_failed(internal: impl Into<String>) -> Self {
        Self::new(
            "AI_AUTH_FAILED",
            "AI 服务身份验证失败，请检查密钥。",
            internal,
        )
    }

    pub fn ai_rate_limited(internal: impl Into<String>) -> Self {
        Self::new(
            "AI_RATE_LIMITED",
            "AI 服务请求过于频繁，请稍后重试。",
            internal,
        )
    }

    pub fn ai_timeout(internal: impl Into<String>) -> Self {
        Self::new("AI_TIMEOUT", "AI 服务响应超时，请稍后重试。", internal)
    }

    pub fn ai_provider_failed(internal: impl Into<String>) -> Self {
        Self::new("AI_PROVIDER_FAILED", "AI 服务暂时无法完成操作。", internal)
    }

    pub fn ai_response_invalid(internal: impl Into<String>) -> Self {
        Self::new(
            "AI_RESPONSE_INVALID",
            "AI 返回的结果格式不完整，请重试。",
            internal,
        )
    }
}

impl From<std::io::Error> for DataError {
    fn from(value: std::io::Error) -> Self {
        Self::data_directory_unavailable(value.to_string())
    }
}

impl From<rusqlite::Error> for DataError {
    fn from(value: rusqlite::Error) -> Self {
        Self::database_open_failed(value.to_string())
    }
}

impl From<rusqlite_migration::Error> for DataError {
    fn from(value: rusqlite_migration::Error) -> Self {
        Self::database_migration_failed(value.to_string())
    }
}

impl From<zip::result::ZipError> for DataError {
    fn from(value: zip::result::ZipError) -> Self {
        Self::backup_invalid(value.to_string())
    }
}

impl From<serde_json::Error> for DataError {
    fn from(value: serde_json::Error) -> Self {
        Self::backup_invalid(value.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_a_stable_error_code_without_internal_details() {
        let error = DataError::attachment_invalid("private internal detail");
        let value = serde_json::to_value(error).unwrap();
        assert_eq!(value["code"], "ATTACHMENT_INVALID");
        assert_eq!(value["message"], "所选文件无法导入。");
        assert!(value.get("internal").is_none());
    }

    #[test]
    fn essay_and_ai_errors_have_stable_public_codes() {
        let errors = [
            DataError::essay_invalid("private"),
            DataError::essay_not_found("private"),
            DataError::essay_version_conflict("private"),
            DataError::essay_operation_failed("private"),
            DataError::ai_disabled("private"),
            DataError::ai_not_configured("private"),
            DataError::ai_credential_failed("private"),
            DataError::ai_auth_failed("private"),
            DataError::ai_rate_limited("private"),
            DataError::ai_timeout("private"),
            DataError::ai_provider_failed("private"),
            DataError::ai_response_invalid("private"),
        ];
        let expected = [
            "ESSAY_INVALID",
            "ESSAY_NOT_FOUND",
            "ESSAY_VERSION_CONFLICT",
            "ESSAY_OPERATION_FAILED",
            "AI_DISABLED",
            "AI_NOT_CONFIGURED",
            "AI_CREDENTIAL_FAILED",
            "AI_AUTH_FAILED",
            "AI_RATE_LIMITED",
            "AI_TIMEOUT",
            "AI_PROVIDER_FAILED",
            "AI_RESPONSE_INVALID",
        ];
        for (error, expected_code) in errors.into_iter().zip(expected) {
            let value = serde_json::to_value(error).unwrap();
            assert_eq!(value["code"], expected_code);
            assert!(value.get("internal").is_none());
        }
    }

    #[test]
    fn generic_ai_errors_are_not_limited_to_essay_review() {
        let provider = serde_json::to_value(DataError::ai_provider_failed("private")).unwrap();
        let invalid = serde_json::to_value(DataError::ai_response_invalid("private")).unwrap();
        assert_eq!(provider["message"], "AI 服务暂时无法完成操作。");
        assert_eq!(invalid["message"], "AI 返回的结果格式不完整，请重试。");
    }

    #[test]
    fn vocabulary_import_errors_have_stable_public_codes() {
        let errors = [
            DataError::vocabulary_import_invalid("private"),
            DataError::vocabulary_import_not_found("private"),
            DataError::vocabulary_import_conflict("private"),
            DataError::vocabulary_recognition_failed("private"),
        ];
        let expected = [
            "VOCABULARY_IMPORT_INVALID",
            "VOCABULARY_IMPORT_NOT_FOUND",
            "VOCABULARY_IMPORT_CONFLICT",
            "VOCABULARY_RECOGNITION_FAILED",
        ];
        for (error, expected_code) in errors.into_iter().zip(expected) {
            let value = serde_json::to_value(error).unwrap();
            assert_eq!(value["code"], expected_code);
            assert!(value.get("internal").is_none());
        }
    }
}
