use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::data::ai::models::{ExpressionSuggestion, ReviewIssue, SentenceSuggestion};
use crate::data::error::DataError;

const MAX_LIST_ITEMS: usize = 200;
const MAX_SAFE_RAW_BYTES: usize = 500 * 1024;
const MAX_PROVIDER_BODY_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct ProviderConfig {
    pub api_url: String,
    pub model: String,
    pub api_key: String,
}

#[derive(Debug, Clone)]
pub struct ReviewPayload {
    pub title: String,
    pub prompt: Option<String>,
    pub scoring_criteria: Option<String>,
    pub body: String,
    pub image_data_urls: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct TransportRequest {
    pub url: String,
    pub authorization: String,
    pub body: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct TransportResponse {
    pub status: u16,
    pub body: String,
}

#[derive(Debug, Clone)]
pub enum TransportError {
    Timeout,
    Other(String),
}

pub trait AiTransport: Send + Sync {
    fn send(&self, request: TransportRequest) -> Result<TransportResponse, TransportError>;
}

pub struct ReqwestTransport {
    client: reqwest::blocking::Client,
}

impl ReqwestTransport {
    pub fn new() -> Result<Self, DataError> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|error| DataError::ai_provider_failed(error.to_string()))?;
        Ok(Self { client })
    }
}

impl AiTransport for ReqwestTransport {
    fn send(&self, request: TransportRequest) -> Result<TransportResponse, TransportError> {
        let response = self
            .client
            .post(request.url)
            .header(reqwest::header::AUTHORIZATION, request.authorization)
            .json(&request.body)
            .send()
            .map_err(|error| {
                if error.is_timeout() {
                    TransportError::Timeout
                } else {
                    TransportError::Other(error.to_string())
                }
            })?;
        let status = response.status().as_u16();
        let body = response.text().map_err(|error| {
            if error.is_timeout() {
                TransportError::Timeout
            } else {
                TransportError::Other(error.to_string())
            }
        })?;
        Ok(TransportResponse { status, body })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedReview {
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
    #[serde(skip)]
    pub safe_raw_response: String,
}

pub struct OpenAiCompatibleAdapter {
    config: ProviderConfig,
}

impl OpenAiCompatibleAdapter {
    pub fn new(config: ProviderConfig) -> Self {
        Self { config }
    }

    pub fn review(
        &self,
        transport: &dyn AiTransport,
        payload: ReviewPayload,
    ) -> Result<ParsedReview, DataError> {
        let request = TransportRequest {
            url: format!(
                "{}/chat/completions",
                self.config.api_url.trim_end_matches('/')
            ),
            authorization: format!("Bearer {}", self.config.api_key),
            body: build_request(&self.config.model, payload),
        };
        let response = transport.send(request).map_err(|error| match error {
            TransportError::Timeout => DataError::ai_timeout("provider request timed out"),
            TransportError::Other(message) => DataError::ai_provider_failed(message),
        })?;
        match response.status {
            200..=299 => {}
            401 | 403 => {
                return Err(DataError::ai_auth_failed(format!(
                    "provider returned {}",
                    response.status
                )))
            }
            429 => {
                return Err(DataError::ai_rate_limited(
                    "provider rate limit was reached",
                ))
            }
            status => {
                return Err(DataError::ai_provider_failed(format!(
                    "provider returned {status}"
                )))
            }
        }
        if response.body.len() > MAX_PROVIDER_BODY_BYTES {
            return Err(DataError::ai_response_invalid(
                "provider response exceeded the size limit",
            ));
        }
        let envelope: ChatResponse = serde_json::from_str(&response.body)
            .map_err(|error| DataError::ai_response_invalid(error.to_string()))?;
        let content = envelope
            .choices
            .into_iter()
            .next()
            .map(|choice| choice.message.content)
            .ok_or_else(|| DataError::ai_response_invalid("provider returned no choices"))?;
        let mut review = parse_review(&content)?;
        if !self.config.api_key.is_empty() {
            review.safe_raw_response = review
                .safe_raw_response
                .replace(&self.config.api_key, "[redacted]");
        }
        Ok(review)
    }
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Deserialize)]
struct ChatMessage {
    content: String,
}

pub fn parse_review(value: &str) -> Result<ParsedReview, DataError> {
    let json = strip_outer_fence(value.trim());
    let mut review: ParsedReview = serde_json::from_str(json)
        .map_err(|error| DataError::ai_response_invalid(error.to_string()))?;
    validate_review(&review)?;
    review.safe_raw_response = truncate_utf8(json, MAX_SAFE_RAW_BYTES);
    Ok(review)
}

fn build_request(model: &str, payload: ReviewPayload) -> serde_json::Value {
    let mut content = vec![serde_json::json!({
        "type": "text",
        "text": format!(
            "Title: {}\nPrompt: {}\nScoring criteria: {}\nEssay:\n{}",
            payload.title,
            payload.prompt.unwrap_or_default(),
            payload.scoring_criteria.unwrap_or_default(),
            payload.body,
        )
    })];
    for image in payload.image_data_urls.into_iter().take(4) {
        content.push(serde_json::json!({
            "type": "image_url",
            "image_url": {"url": image}
        }));
    }
    serde_json::json!({
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "Review the postgraduate English essay. Return only the required JSON fields."
            },
            {"role": "user", "content": content}
        ]
    })
}

fn validate_review(review: &ParsedReview) -> Result<(), DataError> {
    if review.rationale.trim().is_empty()
        || review.content_analysis.trim().is_empty()
        || review.optimized_essay.trim().is_empty()
    {
        return Err(DataError::ai_response_invalid(
            "review is missing required text",
        ));
    }
    match (review.reference_score, review.max_score) {
        (None, None) => {}
        (Some(score), Some(maximum))
            if score.is_finite()
                && maximum.is_finite()
                && score >= 0.0
                && score <= maximum
                && maximum > 0.0
                && maximum <= 100.0 => {}
        _ => {
            return Err(DataError::ai_response_invalid(
                "review score is outside the accepted range",
            ))
        }
    }
    for length in [
        review.grammar_issues.len(),
        review.wording_issues.len(),
        review.sentence_suggestions.len(),
        review.expressions.len(),
    ] {
        if length > MAX_LIST_ITEMS {
            return Err(DataError::ai_response_invalid(
                "review contains too many list items",
            ));
        }
    }
    Ok(())
}

fn strip_outer_fence(value: &str) -> &str {
    if !value.starts_with("```") || !value.ends_with("```") {
        return value;
    }
    let Some(first_newline) = value.find('\n') else {
        return value;
    };
    value[first_newline + 1..value.len() - 3].trim()
}

fn truncate_utf8(value: &str, max_bytes: usize) -> String {
    if value.len() <= max_bytes {
        return value.to_owned();
    }
    let mut end = max_bytes;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    value[..end].to_owned()
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    const VALID_REVIEW: &str = r#"{
      "referenceScore":13,"maxScore":15,"rationale":"Clear rationale",
      "grammarIssues":[],"wordingIssues":[],"contentAnalysis":"Complete",
      "sentenceSuggestions":[],"optimizedEssay":"Improved essay",
      "expressions":[],"recognizedText":null
    }"#;

    struct FakeTransport {
        result: Result<TransportResponse, TransportError>,
        requests: Mutex<Vec<TransportRequest>>,
    }

    impl FakeTransport {
        fn response(status: u16, body: String) -> Self {
            Self {
                result: Ok(TransportResponse { status, body }),
                requests: Mutex::new(vec![]),
            }
        }

        fn timeout() -> Self {
            Self {
                result: Err(TransportError::Timeout),
                requests: Mutex::new(vec![]),
            }
        }
    }

    impl AiTransport for FakeTransport {
        fn send(&self, request: TransportRequest) -> Result<TransportResponse, TransportError> {
            self.requests.lock().unwrap().push(request);
            self.result.clone()
        }
    }

    fn adapter() -> OpenAiCompatibleAdapter {
        OpenAiCompatibleAdapter::new(ProviderConfig {
            api_url: "https://api.example.com/v1".into(),
            model: "review-model".into(),
            api_key: "secret".into(),
        })
    }

    fn payload() -> ReviewPayload {
        ReviewPayload {
            title: "Practice".into(),
            prompt: Some("Write a letter".into()),
            scoring_criteria: None,
            body: "Dear Sir".into(),
            image_data_urls: vec!["data:image/png;base64,AAAA".into()],
        }
    }

    fn wrapped(content: &str) -> String {
        serde_json::json!({"choices":[{"message":{"content":content}}]}).to_string()
    }

    #[test]
    fn sends_bearer_text_and_confirmed_images_then_parses_review() {
        let transport = FakeTransport::response(200, wrapped(VALID_REVIEW));
        let result = adapter().review(&transport, payload()).unwrap();
        assert_eq!(result.reference_score, Some(13.0));
        assert!(!result.safe_raw_response.contains("secret"));
        let requests = transport.requests.lock().unwrap();
        assert_eq!(requests[0].authorization, "Bearer secret");
        let body = requests[0].body.to_string();
        assert!(body.contains("Dear Sir"));
        assert!(body.contains("data:image/png;base64,AAAA"));
    }

    #[test]
    fn accepts_one_outer_markdown_fence_and_rejects_invalid_payloads() {
        let fenced = format!("```json\n{VALID_REVIEW}\n```");
        assert_eq!(parse_review(&fenced).unwrap().max_score, Some(15.0));
        assert_eq!(
            parse_review("not json").unwrap_err().code(),
            "AI_RESPONSE_INVALID"
        );
        assert_eq!(
            parse_review("{}").unwrap_err().code(),
            "AI_RESPONSE_INVALID"
        );
        let invalid_score = VALID_REVIEW.replace("\"referenceScore\":13", "\"referenceScore\":16");
        assert_eq!(
            parse_review(&invalid_score).unwrap_err().code(),
            "AI_RESPONSE_INVALID"
        );
    }

    #[test]
    fn maps_provider_status_and_transport_failures() {
        for (status, code) in [
            (401, "AI_AUTH_FAILED"),
            (403, "AI_AUTH_FAILED"),
            (429, "AI_RATE_LIMITED"),
            (500, "AI_PROVIDER_FAILED"),
        ] {
            let transport = FakeTransport::response(status, "failure".into());
            assert_eq!(
                adapter().review(&transport, payload()).unwrap_err().code(),
                code
            );
        }
        assert_eq!(
            adapter()
                .review(&FakeTransport::timeout(), payload())
                .unwrap_err()
                .code(),
            "AI_TIMEOUT"
        );
    }

    #[test]
    fn rejects_oversized_lists_and_bounds_safe_raw_response() {
        let mut value: serde_json::Value = serde_json::from_str(VALID_REVIEW).unwrap();
        value["grammarIssues"] = serde_json::Value::Array(vec![
            serde_json::json!({"original":"a","suggestion":"b","explanation":"c"});
            201
        ]);
        assert_eq!(
            parse_review(&value.to_string()).unwrap_err().code(),
            "AI_RESPONSE_INVALID"
        );
        let padded = VALID_REVIEW.replace("Clear rationale", &"x".repeat(600_000));
        let parsed = parse_review(&padded).unwrap();
        assert!(parsed.safe_raw_response.len() <= 500 * 1024);
    }
}
