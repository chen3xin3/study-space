use crate::error::AppError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StudySubject {
    English,
    Math,
    Politics,
    Specialty,
    Other,
}

impl StudySubject {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::English => "english",
            Self::Math => "math",
            Self::Politics => "politics",
            Self::Specialty => "specialty",
            Self::Other => "other",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyTask {
    pub id: String,
    pub title: String,
    pub subject: StudySubject,
    pub completed: bool,
}

impl StudyTask {
    pub fn new(
        id: impl Into<String>,
        title: &str,
        subject: StudySubject,
    ) -> Result<Self, AppError> {
        let title = title.trim();
        if title.is_empty() {
            return Err(AppError::invalid_title());
        }

        Ok(Self {
            id: id.into(),
            title: title.to_owned(),
            subject,
            completed: false,
        })
    }

    pub fn completed_copy(&self) -> Self {
        Self {
            completed: true,
            ..self.clone()
        }
    }
}

pub fn find_task<'a>(tasks: &'a [StudyTask], id: &str) -> Option<&'a StudyTask> {
    tasks.iter().find(|task| task.id == id)
}

#[cfg(test)]
mod tests {
    use super::{find_task, StudySubject, StudyTask};

    fn task() -> StudyTask {
        StudyTask::new("task-1", "  整理阅读错题  ", StudySubject::English)
            .expect("有效任务应创建成功")
    }

    #[test]
    fn task_construction_trims_the_title() {
        assert_eq!(task().title, "整理阅读错题");
    }

    #[test]
    fn task_construction_rejects_a_blank_title() {
        let error =
            StudyTask::new("task-1", "   ", StudySubject::Math).expect_err("空标题应被拒绝");
        assert_eq!(error.code, "invalid_title");
    }

    #[test]
    fn completing_a_task_returns_a_new_value() {
        let original = task();
        let completed = original.completed_copy();
        assert!(!original.completed);
        assert!(completed.completed);
        assert_eq!(completed.id, original.id);
    }

    #[test]
    fn task_lookup_uses_option_for_missing_values() {
        let tasks = vec![task()];
        assert_eq!(
            find_task(&tasks, "task-1").map(|task| task.title.as_str()),
            Some("整理阅读错题")
        );
        assert!(find_task(&tasks, "missing").is_none());
    }

    #[test]
    fn subjects_have_stable_wire_values() {
        assert_eq!(StudySubject::English.as_str(), "english");
        assert_eq!(StudySubject::Specialty.as_str(), "specialty");
    }

    #[test]
    fn task_round_trips_through_camel_case_json() {
        let json = serde_json::to_string(&task()).expect("任务应可序列化");
        assert!(json.contains("\"subject\":\"english\""));
        assert!(json.contains("\"completed\":false"));
        let restored: StudyTask = serde_json::from_str(&json).expect("任务应可反序列化");
        assert_eq!(restored, task());
    }
}
