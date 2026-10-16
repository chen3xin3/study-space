use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExamTrack {
    #[serde(rename = "english_1")]
    English1,
    #[serde(rename = "english_2")]
    English2,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EssayType {
    Small,
    Large,
    Custom,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AttemptMode {
    Independent,
    Dictation,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AttemptStatus {
    Draft,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EssayCategory {
    pub id: String,
    pub name: String,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EssayExpression {
    pub id: String,
    pub expression: String,
    pub explanation: Option<String>,
    pub sort_order: i64,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EssayTag {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EssayDetail {
    pub id: String,
    pub title: String,
    pub body: String,
    pub translation: Option<String>,
    pub exam_track: Option<ExamTrack>,
    pub essay_type: EssayType,
    pub source: Option<String>,
    pub note: Option<String>,
    pub category: Option<EssayCategory>,
    pub expressions: Vec<EssayExpression>,
    pub tags: Vec<EssayTag>,
    pub source_photo_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExpressionInput {
    pub expression: String,
    pub explanation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CreateEssayInput {
    pub title: String,
    pub body: String,
    pub translation: Option<String>,
    pub exam_track: Option<ExamTrack>,
    pub essay_type: EssayType,
    pub source: Option<String>,
    pub note: Option<String>,
    pub category: Option<String>,
    pub expressions: Vec<ExpressionInput>,
    pub tags: Vec<String>,
    #[serde(default)]
    pub source_photo_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEssayInput {
    pub id: String,
    pub version: i64,
    pub title: String,
    pub body: String,
    pub translation: Option<String>,
    pub exam_track: Option<ExamTrack>,
    pub essay_type: EssayType,
    pub source: Option<String>,
    pub note: Option<String>,
    pub category: Option<String>,
    pub expressions: Vec<ExpressionInput>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EssayListQuery {
    pub search: Option<String>,
    pub category: Option<String>,
    pub tag: Option<String>,
    pub exam_track: Option<ExamTrack>,
    pub essay_type: Option<EssayType>,
    pub cursor: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EssayListItem {
    pub id: String,
    pub title: String,
    pub excerpt: String,
    pub exam_track: Option<ExamTrack>,
    pub essay_type: EssayType,
    pub category: Option<EssayCategory>,
    pub tags: Vec<EssayTag>,
    pub updated_at: String,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EssayListPage {
    pub items: Vec<EssayListItem>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CreateAttemptInput {
    pub mode: AttemptMode,
    pub source_essay_id: Option<String>,
    pub title: String,
    pub prompt: Option<String>,
    pub scoring_criteria: Option<String>,
    pub body: String,
    pub note: Option<String>,
    pub exam_track: Option<ExamTrack>,
    pub essay_type: EssayType,
    pub attachment_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAttemptInput {
    pub id: String,
    pub version: i64,
    pub title: String,
    pub prompt: Option<String>,
    pub scoring_criteria: Option<String>,
    pub body: String,
    pub note: Option<String>,
    pub exam_track: Option<ExamTrack>,
    pub essay_type: EssayType,
    pub attachment_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AttemptDetail {
    pub id: String,
    pub mode: AttemptMode,
    pub source_essay_id: Option<String>,
    pub title: String,
    pub prompt: Option<String>,
    pub scoring_criteria: Option<String>,
    pub body: String,
    pub note: Option<String>,
    pub exam_track: Option<ExamTrack>,
    pub essay_type: EssayType,
    pub status: AttemptStatus,
    pub attachment_ids: Vec<String>,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AttemptListPage {
    pub items: Vec<AttemptDetail>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DictationChange {
    pub kind: String,
    pub expected: String,
    pub actual: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DictationComparison {
    pub changed_segments: usize,
    pub changes: Vec<DictationChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EssaySummary {
    pub essay_count: u64,
    pub draft_count: u64,
    pub writing_count: u64,
    pub last_ai_review_at: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn essay_enums_use_stable_snake_case_values() {
        assert_eq!(
            serde_json::to_value(ExamTrack::English1).unwrap(),
            "english_1"
        );
        assert_eq!(serde_json::to_value(EssayType::Small).unwrap(), "small");
        assert_eq!(
            serde_json::to_value(AttemptMode::Independent).unwrap(),
            "independent"
        );
        assert_eq!(
            serde_json::to_value(AttemptStatus::Completed).unwrap(),
            "completed"
        );
    }

    #[test]
    fn essay_detail_uses_camel_case_json() {
        let detail = EssayDetail {
            id: "essay-1".into(),
            title: "A letter".into(),
            body: "Dear Sir".into(),
            translation: None,
            exam_track: Some(ExamTrack::English1),
            essay_type: EssayType::Small,
            source: None,
            note: None,
            category: None,
            expressions: vec![],
            tags: vec![],
            source_photo_ids: vec![],
            created_at: "2026-09-25T00:00:00Z".into(),
            updated_at: "2026-09-25T00:00:00Z".into(),
            deleted_at: None,
            version: 1,
        };
        let value = serde_json::to_value(detail).unwrap();
        assert_eq!(value["examTrack"], "english_1");
        assert_eq!(value["essayType"], "small");
        assert_eq!(value["createdAt"], "2026-09-25T00:00:00Z");
        assert!(value.get("exam_track").is_none());
    }
}
