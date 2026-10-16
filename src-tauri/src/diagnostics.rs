use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;

const MAX_LOG_LINES: usize = 500;

#[derive(Clone)]
pub struct DiagnosticLog {
    directory: PathBuf,
    log_path: PathBuf,
}

impl DiagnosticLog {
    pub fn new(app_data_root: &Path) -> io::Result<Self> {
        let directory = app_data_root.join("diagnostics");
        fs::create_dir_all(&directory)?;
        Ok(Self {
            log_path: directory.join("desktop.log"),
            directory,
        })
    }

    pub fn directory(&self) -> &Path {
        &self.directory
    }

    pub fn append(&self, event: &str, detail: &str) -> io::Result<()> {
        let existing = fs::read_to_string(&self.log_path).unwrap_or_default();
        let mut lines: Vec<String> = existing.lines().map(str::to_owned).collect();
        lines.push(format!(
            "{} {} {}",
            chrono::Utc::now().to_rfc3339(),
            sanitize_event(event),
            sanitize_event(detail)
        ));
        fs::write(
            &self.log_path,
            trim_log(lines, MAX_LOG_LINES).join("\n") + "\n",
        )
    }

    pub fn recent(&self, count: usize) -> Vec<String> {
        let lines = fs::read_to_string(&self.log_path)
            .unwrap_or_default()
            .lines()
            .map(str::to_owned)
            .collect();
        trim_log(lines, count)
    }
}

#[derive(Clone)]
pub struct DiagnosticState(pub Arc<DiagnosticLog>);

impl DiagnosticState {
    pub fn new(log: DiagnosticLog) -> Self {
        Self(Arc::new(log))
    }
}

pub fn install_panic_hook(log: DiagnosticLog) {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|value| format!("{}:{}", value.file(), value.line()))
            .unwrap_or_else(|| "unknown location".into());
        let _ = log.append("panic", &location);
        previous(info);
    }));
}

pub fn sanitize_event(value: &str) -> String {
    let single_line = value.replace(['\r', '\n'], " ");
    let lower = single_line.to_ascii_lowercase();
    let sanitized = if let Some(index) = lower.find("authorization: bearer") {
        format!("{}Authorization: Bearer [redacted]", &single_line[..index])
    } else if let Some(index) = lower.find("api_key=") {
        format!("{}api_key=[redacted]", &single_line[..index])
    } else {
        single_line
    };
    sanitized.chars().take(400).collect()
}

pub fn trim_log(mut lines: Vec<String>, limit: usize) -> Vec<String> {
    if lines.len() > limit {
        lines.drain(..lines.len() - limit);
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::{sanitize_event, trim_log, DiagnosticLog};

    #[test]
    fn sanitizes_multiline_events_and_secret_like_values() {
        let sanitized = sanitize_event("failed\nAuthorization: Bearer private-token");
        assert!(!sanitized.contains('\n'));
        assert!(!sanitized.contains("private-token"));
        assert!(sanitized.contains("[redacted]"));
    }

    #[test]
    fn retains_only_the_newest_log_lines() {
        let lines = vec!["one".into(), "two".into(), "three".into(), "four".into()];
        assert_eq!(trim_log(lines, 3), vec!["two", "three", "four"]);
    }

    #[test]
    fn writes_and_reads_recent_events() {
        let temp = tempfile::tempdir().unwrap();
        let log = DiagnosticLog::new(temp.path()).unwrap();
        log.append("startup", "ready").unwrap();
        assert!(log.recent(1)[0].contains("startup ready"));
    }
}
