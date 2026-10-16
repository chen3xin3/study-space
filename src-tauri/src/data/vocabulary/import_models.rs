use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ImportStatus {
    Draft,
    Recognizing,
    Reviewing,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ImportConfidence {
    Confident,
    Uncertain,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ImportResolution {
    Create,
    EncounterOnly,
    AppendMeaning,
    RestoreAndAppend,
    Skip,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportImage {
    pub attachment_id: String,
    pub original_name: String,
    pub media_type: String,
    pub byte_size: u64,
    pub sort_order: i64,
    pub rotation_degrees: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportCandidate {
    pub id: String,
    pub word: String,
    pub meaning_or_note: Option<String>,
    pub confidence: ImportConfidence,
    pub source_attachment_id: Option<String>,
    pub source_line: Option<i64>,
    pub selected: bool,
    pub resolution: Option<ImportResolution>,
    pub created_at: String,
    pub updated_at: String,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportSessionDetail {
    pub id: String,
    pub status: ImportStatus,
    pub error_code: Option<String>,
    pub images: Vec<ImportImage>,
    pub candidates: Vec<ImportCandidate>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub deleted_at: Option<String>,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateImportSessionInput {
    pub attachment_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateImportCandidateInput {
    pub id: String,
    pub version: i64,
    pub word: String,
    pub meaning_or_note: Option<String>,
    pub confidence: ImportConfidence,
    pub selected: bool,
    pub resolution: Option<ImportResolution>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecognizedCandidate {
    pub word: String,
    pub meaning_or_note: Option<String>,
    pub confidence: ImportConfidence,
    pub image_index: usize,
    pub line: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecognitionResult {
    pub candidates: Vec<RecognizedCandidate>,
    pub unreadable_fragments: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DuplicatePreview {
    pub candidate_id: String,
    pub word: String,
    pub existing_word_id: Option<String>,
    pub existing_deleted: bool,
    pub existing_meanings: Vec<String>,
    pub same_batch_candidate_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BatchImportItem {
    pub candidate_id: String,
    pub candidate_version: i64,
    pub resolution: ImportResolution,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BatchImportInput {
    pub session_id: String,
    pub version: i64,
    pub items: Vec<BatchImportItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BatchImportResult {
    pub created: usize,
    pub appended: usize,
    pub restored: usize,
    pub skipped: usize,
    pub failed: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_enums_use_stable_snake_case_values() {
        assert_eq!(serde_json::to_value(ImportStatus::Draft).unwrap(), "draft");
        assert_eq!(
            serde_json::to_value(ImportConfidence::Uncertain).unwrap(),
            "uncertain"
        );
        assert_eq!(
            serde_json::to_value(ImportResolution::AppendMeaning).unwrap(),
            "append_meaning"
        );
    }

    #[test]
    fn import_candidate_uses_camel_case_json() {
        let candidate = ImportCandidate {
            id: "candidate-1".into(),
            word: "persist".into(),
            meaning_or_note: Some("坚持".into()),
            confidence: ImportConfidence::Uncertain,
            source_attachment_id: Some("image-1".into()),
            source_line: Some(2),
            selected: true,
            resolution: None,
            created_at: "2026-09-26T00:00:00Z".into(),
            updated_at: "2026-09-26T00:00:00Z".into(),
            version: 1,
        };
        let value = serde_json::to_value(candidate).unwrap();
        assert_eq!(value["meaningOrNote"], "坚持");
        assert_eq!(value["sourceAttachmentId"], "image-1");
        assert_eq!(value["sourceLine"], 2);
        assert!(value.get("meaning_or_note").is_none());
    }
}
