use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Clone, Error, PartialEq, Eq, Serialize)]
#[error("{message}")]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
    #[serde(skip)]
    pub internal: Option<String>,
}

impl AppError {
    pub fn invalid_name() -> Self {
        Self {
            code: "invalid_name",
            message: "请输入姓名".to_owned(),
            internal: None,
        }
    }

    pub fn invalid_title() -> Self {
        Self {
            code: "invalid_title",
            message: "请输入任务标题".to_owned(),
            internal: None,
        }
    }

    pub fn storage(internal: impl Into<String>) -> Self {
        Self {
            code: "storage_failed",
            message: "暂时无法读取学习数据".to_owned(),
            internal: Some(internal.into()),
        }
    }

    pub fn not_found() -> Self {
        Self {
            code: "not_found",
            message: "没有找到这条学习任务".to_owned(),
            internal: None,
        }
    }

    pub fn version_conflict() -> Self {
        Self {
            code: "version_conflict",
            message: "这条任务已在别处更新，请刷新后重试".to_owned(),
            internal: None,
        }
    }

    pub fn backup_invalid(internal: impl Into<String>) -> Self {
        Self {
            code: "backup_invalid",
            message: "这个备份文件无效或已损坏".to_owned(),
            internal: Some(internal.into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::AppError;

    #[test]
    fn public_error_json_omits_internal_details() {
        let error = AppError::storage("C:\\private\\study.db could not be opened");
        let json = serde_json::to_value(error).expect("错误应可序列化");
        assert_eq!(json["code"], "storage_failed");
        assert_eq!(json["message"], "暂时无法读取学习数据");
        assert!(json.get("internal").is_none());
        assert!(!json.to_string().contains("private"));
    }
}
