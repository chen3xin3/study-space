use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiRequestStatus {
    Pending,
    Succeeded,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SafeAiSettings {
    pub enabled: bool,
    pub provider_name: String,
    pub api_url: String,
    pub model: String,
    pub has_api_key: bool,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAiSettingsInput {
    pub enabled: bool,
    pub provider_name: String,
    pub api_url: String,
    pub model: String,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewIssue {
    pub original: String,
    pub suggestion: String,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SentenceSuggestion {
    pub original: String,
    pub revised: String,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExpressionSuggestion {
    pub expression: String,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EssayAiReview {
    pub id: String,
    pub request_id: String,
    pub attempt_id: String,
    pub reference_score: Option<f64>,
    pub max_score: Option<f64>,
    pub rationale: String,
    pub grammar_issues: Vec<ReviewIssue>,
    pub wording_issues: Vec<ReviewIssue>,
    pub content_analysis: String,
    pub sentence_suggestions: Vec<SentenceSuggestion>,
    pub optimized_essay: String,
    pub expressions: Vec<ExpressionSuggestion>,
    pub recognized_text: Option<String>,
    pub provider_name: String,
    pub model: String,
    pub confirmed_at: Option<String>,
    pub created_at: String,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewEssayInput {
    pub attempt_id: String,
    pub confirmed_attachment_ids: Vec<String>,
    pub retry_of: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub provider_name: String,
    pub model: String,
    pub reachable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OrganizeTextMaterialInput {
    pub subject: String,
    pub collection: String,
    pub kind: String,
    pub title: String,
    pub content: String,
    pub answer: String,
    pub source: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OrganizePhotoMaterialInput {
    pub attachment_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MaterialOrganizationSuggestion {
    pub title: String,
    pub subject: String,
    pub collection: String,
    pub kind: String,
    pub tags: Vec<String>,
    pub summary: String,
    pub key_points: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PhotoOrganizationSuggestion {
    pub title: String,
    pub kind: String,
    pub summary: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_settings_never_have_an_api_key_field() {
        let settings = SafeAiSettings {
            enabled: false,
            provider_name: String::new(),
            api_url: String::new(),
            model: String::new(),
            has_api_key: false,
            version: 1,
        };
        let value = serde_json::to_value(settings).unwrap();
        assert_eq!(value["hasApiKey"], false);
        assert!(value.get("apiKey").is_none());
        assert!(value.get("api_key").is_none());
    }

    #[test]
    fn request_status_and_review_use_stable_json() {
        assert_eq!(
            serde_json::to_value(AiRequestStatus::Pending).unwrap(),
            "pending"
        );
        let review = EssayAiReview {
            id: "review-1".into(),
            request_id: "request-1".into(),
            attempt_id: "attempt-1".into(),
            reference_score: Some(13.0),
            max_score: Some(15.0),
            rationale: "清楚".into(),
            grammar_issues: vec![],
            wording_issues: vec![],
            content_analysis: "完整".into(),
            sentence_suggestions: vec![],
            optimized_essay: "Improved".into(),
            expressions: vec![],
            recognized_text: None,
            provider_name: "Compatible".into(),
            model: "model".into(),
            confirmed_at: None,
            created_at: "2026-09-25T00:00:00Z".into(),
            version: 1,
        };
        let value = serde_json::to_value(review).unwrap();
        assert_eq!(value["referenceScore"], 13.0);
        assert_eq!(value["providerName"], "Compatible");
        assert!(value.get("safeRawResponse").is_none());
    }
}
