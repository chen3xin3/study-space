use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DailyTask {
    pub id: String,
    pub local_date: String,
    pub title: String,
    pub learning_item_id: Option<String>,
    pub position: i64,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub version: i64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StudyTimerStatus {
    Running,
    Paused,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StudyTimer {
    pub id: String,
    pub status: StudyTimerStatus,
    pub current_started_at: Option<String>,
    pub accumulated_seconds: u64,
    pub ended_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DailyWindow {
    pub local_date: String,
    pub start_utc: String,
    pub end_utc: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CalendarMonthQuery {
    pub days: Vec<DailyWindow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CalendarDaySummary {
    pub local_date: String,
    pub total_tasks: u64,
    pub completed_tasks: u64,
    pub study_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DailyStudyPoint {
    pub local_date: String,
    pub seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSummary {
    pub tasks: Vec<DailyTask>,
    pub completed_tasks: u64,
    pub total_tasks: u64,
    pub today_seconds: u64,
    pub timer: Option<StudyTimer>,
    pub streak_days: u64,
    pub trend: Vec<DailyStudyPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DashboardDayQuery {
    pub local_date: String,
    pub day_start_utc: String,
    pub day_end_utc: String,
    pub seven_days: Vec<DailyWindow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateDailyTaskInput {
    pub local_date: String,
    pub title: String,
    #[serde(default)]
    pub learning_item_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VersionedIdInput {
    pub id: String,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SetTaskCompletedInput {
    pub id: String,
    pub version: i64,
    pub completed: bool,
}
