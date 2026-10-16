use std::fs;
use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;

use crate::commands::data_commands::DataState;
use crate::diagnostics::DiagnosticState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticStatus {
    pub healthy: bool,
    pub app_version: String,
    pub log_directory: String,
    pub schema_version: usize,
    pub attachment_count: u64,
    pub recent_events: Vec<String>,
}

fn status_inner(
    diagnostics: &DiagnosticState,
    data: &DataState,
) -> Result<DiagnosticStatus, String> {
    let status = data
        .manager()
        .status()
        .map_err(|_| "本地数据状态读取失败。".to_string())?;
    Ok(DiagnosticStatus {
        healthy: true,
        app_version: env!("CARGO_PKG_VERSION").into(),
        log_directory: diagnostics.0.directory().to_string_lossy().into_owned(),
        schema_version: status.schema_version,
        attachment_count: status.attachment_count,
        recent_events: diagnostics.0.recent(20),
    })
}

#[tauri::command]
pub fn get_diagnostic_status(
    diagnostics: tauri::State<'_, DiagnosticState>,
    data: tauri::State<'_, DataState>,
) -> Result<DiagnosticStatus, String> {
    status_inner(diagnostics.inner(), data.inner())
}

#[tauri::command]
pub fn open_diagnostic_folder(
    diagnostics: tauri::State<'_, DiagnosticState>,
) -> Result<(), String> {
    Command::new("explorer")
        .arg(diagnostics.0.directory())
        .spawn()
        .map(|_| ())
        .map_err(|_| "日志目录打开失败。".into())
}

#[tauri::command]
pub fn export_diagnostic_report(
    destination: String,
    diagnostics: tauri::State<'_, DiagnosticState>,
    data: tauri::State<'_, DataState>,
) -> Result<(), String> {
    let status = status_inner(diagnostics.inner(), data.inner())?;
    let report = format!(
        "学习空间诊断报告\n版本: {}\n平台: Windows\n数据库版本: {}\n附件数量: {}\n状态: 正常\n\n最近事件:\n{}\n",
        status.app_version,
        status.schema_version,
        status.attachment_count,
        status.recent_events.join("\n"),
    );
    fs::write(PathBuf::from(destination), report).map_err(|_| "诊断报告导出失败。".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::database::DatabaseManager;
    use crate::data::paths::DataPaths;
    use crate::diagnostics::DiagnosticLog;

    #[test]
    fn status_contains_health_without_study_content() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app")).unwrap();
        let data = DataState::new(DatabaseManager::open(paths.clone()).unwrap());
        let diagnostics = DiagnosticState::new(DiagnosticLog::new(&paths.root).unwrap());
        diagnostics.0.append("startup_ready", "desktop").unwrap();
        let status = status_inner(&diagnostics, &data).unwrap();
        assert!(status.healthy);
        assert_eq!(status.attachment_count, 0);
        assert!(status.recent_events[0].contains("startup_ready"));
    }
}
