use std::collections::HashSet;

use serde::Deserialize;

use crate::data::ai::models::{
    MaterialOrganizationSuggestion, OrganizeTextMaterialInput, PhotoOrganizationSuggestion,
};
use crate::data::ai::provider::{
    AiTransport, ProviderConfig, TransportError, TransportRequest, TransportResponse,
};
use crate::data::error::DataError;

const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const MAX_TITLE_CHARS: usize = 120;
const MAX_COLLECTION_CHARS: usize = 80;
const MAX_TAGS: usize = 20;
const MAX_TAG_CHARS: usize = 30;
const MAX_SUMMARY_CHARS: usize = 2_000;
const MAX_KEY_POINTS: usize = 12;
const MAX_KEY_POINT_CHARS: usize = 300;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ChatMessage {
    content: String,
}

pub struct MaterialOrganizationAdapter {
    config: ProviderConfig,
}

impl MaterialOrganizationAdapter {
    pub fn new(config: ProviderConfig) -> Self {
        Self { config }
    }

    pub fn organize_text(
        &self,
        transport: &dyn AiTransport,
        input: OrganizeTextMaterialInput,
    ) -> Result<MaterialOrganizationSuggestion, DataError> {
        let content = serde_json::to_string(&input)
            .map_err(|error| DataError::ai_response_invalid(error.to_string()))?;
        let response = self.send(
            transport,
            "Organize one postgraduate study material. Return only JSON with title, subject, collection, kind, tags, summary, and keyPoints. Use concise Chinese. Do not invent facts.",
            serde_json::Value::String(content),
        )?;
        parse_text_suggestion(&response)
    }

    pub fn organize_photo(
        &self,
        transport: &dyn AiTransport,
        image: String,
    ) -> Result<PhotoOrganizationSuggestion, DataError> {
        if !is_supported_image(&image) {
            return Err(DataError::ai_response_invalid(
                "material organization requires one PNG, JPEG, or WebP image",
            ));
        }
        let content = serde_json::json!([
            {
                "type": "text",
                "text": "Organize this one learning photo. Return only JSON with title, kind, and summary. kind must be english, essay, or other. Use concise Chinese."
            },
            {"type": "image_url", "image_url": {"url": image}}
        ]);
        let response = self.send(
            transport,
            "Classify one user-confirmed learning photo without inventing content.",
            content,
        )?;
        parse_photo_suggestion(&response)
    }

    fn send(
        &self,
        transport: &dyn AiTransport,
        system_prompt: &str,
        content: serde_json::Value,
    ) -> Result<String, DataError> {
        let response = transport
            .send(TransportRequest {
                url: format!(
                    "{}/chat/completions",
                    self.config.api_url.trim_end_matches('/')
                ),
                authorization: format!("Bearer {}", self.config.api_key),
                body: serde_json::json!({
                    "model": self.config.model,
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": content}
                    ]
                }),
            })
            .map_err(|error| match error {
                TransportError::Timeout => DataError::ai_timeout("material organization timed out"),
                TransportError::Other(message) => DataError::ai_provider_failed(redact_sensitive(
                    &message,
                    &self.config.api_key,
                )),
            })?;
        provider_content(response)
    }
}

fn provider_content(response: TransportResponse) -> Result<String, DataError> {
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
    if response.body.len() > MAX_RESPONSE_BYTES {
        return Err(DataError::ai_response_invalid(
            "provider response exceeded the size limit",
        ));
    }
    let envelope: ChatResponse = serde_json::from_str(&response.body)
        .map_err(|error| DataError::ai_response_invalid(error.to_string()))?;
    envelope
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content)
        .ok_or_else(|| DataError::ai_response_invalid("provider returned no choices"))
}

pub fn parse_text_suggestion(
    value: &str,
) -> Result<MaterialOrganizationSuggestion, DataError> {
    if value.len() > MAX_RESPONSE_BYTES {
        return Err(DataError::ai_response_invalid(
            "material suggestion exceeded the size limit",
        ));
    }
    let mut parsed: MaterialOrganizationSuggestion =
        serde_json::from_str(strip_outer_fence(value.trim()))
            .map_err(|error| DataError::ai_response_invalid(error.to_string()))?;
    trim_text_suggestion(&mut parsed);
    validate_text_suggestion(&parsed)?;
    Ok(parsed)
}

pub fn parse_photo_suggestion(value: &str) -> Result<PhotoOrganizationSuggestion, DataError> {
    if value.len() > MAX_RESPONSE_BYTES {
        return Err(DataError::ai_response_invalid(
            "photo suggestion exceeded the size limit",
        ));
    }
    let mut parsed: PhotoOrganizationSuggestion =
        serde_json::from_str(strip_outer_fence(value.trim()))
            .map_err(|error| DataError::ai_response_invalid(error.to_string()))?;
    parsed.title = parsed.title.trim().to_owned();
    parsed.kind = parsed.kind.trim().to_owned();
    parsed.summary = parsed.summary.trim().to_owned();
    if parsed.title.is_empty()
        || parsed.title.chars().count() > MAX_TITLE_CHARS
        || !matches!(parsed.kind.as_str(), "english" | "essay" | "other")
        || parsed.summary.chars().count() > MAX_SUMMARY_CHARS
    {
        return Err(DataError::ai_response_invalid(
            "photo suggestion contains invalid values",
        ));
    }
    Ok(parsed)
}

fn trim_text_suggestion(value: &mut MaterialOrganizationSuggestion) {
    value.title = value.title.trim().to_owned();
    value.subject = value.subject.trim().to_owned();
    value.collection = value.collection.trim().to_owned();
    value.kind = value.kind.trim().to_owned();
    value.summary = value.summary.trim().to_owned();
    let mut seen = HashSet::new();
    value.tags = value
        .tags
        .drain(..)
        .map(|tag| tag.trim().to_owned())
        .filter(|tag| !tag.is_empty() && seen.insert(tag.clone()))
        .collect();
    value.key_points = value
        .key_points
        .drain(..)
        .map(|point| point.trim().to_owned())
        .filter(|point| !point.is_empty())
        .collect();
}

fn validate_text_suggestion(value: &MaterialOrganizationSuggestion) -> Result<(), DataError> {
    let valid = !value.title.is_empty()
        && value.title.chars().count() <= MAX_TITLE_CHARS
        && matches!(
            value.subject.as_str(),
            "english" | "math" | "specialty" | "politics" | "other"
        )
        && value.collection.chars().count() <= MAX_COLLECTION_CHARS
        && matches!(
            value.kind.as_str(),
            "note" | "question" | "material" | "practice" | "exam"
        )
        && value.tags.len() <= MAX_TAGS
        && value
            .tags
            .iter()
            .all(|tag| tag.chars().count() <= MAX_TAG_CHARS)
        && value.summary.chars().count() <= MAX_SUMMARY_CHARS
        && value.key_points.len() <= MAX_KEY_POINTS
        && value
            .key_points
            .iter()
            .all(|point| point.chars().count() <= MAX_KEY_POINT_CHARS);
    if !valid {
        return Err(DataError::ai_response_invalid(
            "material suggestion contains invalid values",
        ));
    }
    Ok(())
}

fn is_supported_image(value: &str) -> bool {
    value.starts_with("data:image/png;base64,")
        || value.starts_with("data:image/jpeg;base64,")
        || value.starts_with("data:image/webp;base64,")
}

fn redact_sensitive(value: &str, api_key: &str) -> String {
    let mut sanitized = if api_key.is_empty() {
        value.to_owned()
    } else {
        value.replace(api_key, "[redacted]")
    };
    while let Some(start) = sanitized.find("data:image/") {
        let end = sanitized[start..]
            .find(|character: char| {
                character.is_whitespace() || matches!(character, '"' | '\'' | ')' | ']')
            })
            .map(|offset| start + offset)
            .unwrap_or(sanitized.len());
        sanitized.replace_range(start..end, "[redacted-image]");
    }
    sanitized
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

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;
    use crate::data::ai::models::OrganizeTextMaterialInput;
    use crate::data::ai::provider::{
        AiTransport, ProviderConfig, TransportError, TransportRequest, TransportResponse,
    };

    const VALID_TEXT: &str = r#"{
      "title":"极限计算与洛必达法则",
      "subject":"math",
      "collection":"notes-examples",
      "kind":"note",
      "tags":["高数","极限"],
      "summary":"整理极限计算的判断顺序。",
      "keyPoints":["先判断未定式","满足条件时再使用洛必达法则"]
    }"#;

    const VALID_PHOTO: &str = r#"{
      "title":"英语作文批改记录",
      "kind":"essay",
      "summary":"一页包含教师批注的英语作文。"
    }"#;

    #[derive(Default)]
    struct FakeTransport {
        response: Option<Result<TransportResponse, TransportError>>,
        requests: Mutex<Vec<TransportRequest>>,
    }

    impl AiTransport for FakeTransport {
        fn send(&self, request: TransportRequest) -> Result<TransportResponse, TransportError> {
            self.requests.lock().unwrap().push(request);
            self.response.clone().unwrap()
        }
    }

    fn adapter() -> MaterialOrganizationAdapter {
        MaterialOrganizationAdapter::new(ProviderConfig {
            api_url: "https://api.example.com/v1".into(),
            model: "vision-model".into(),
            api_key: "private-secret".into(),
        })
    }

    fn wrapped(content: &str) -> String {
        serde_json::json!({"choices":[{"message":{"content":content}}]}).to_string()
    }

    #[test]
    fn parses_strict_text_and_photo_suggestions() {
        let text = parse_text_suggestion(&format!("```json\n{VALID_TEXT}\n```")).unwrap();
        assert_eq!(text.title, "极限计算与洛必达法则");
        assert_eq!(text.tags, vec!["高数", "极限"]);
        assert_eq!(text.key_points.len(), 2);

        let photo = parse_photo_suggestion(VALID_PHOTO).unwrap();
        assert_eq!(photo.kind, "essay");
        assert_eq!(photo.title, "英语作文批改记录");
    }

    #[test]
    fn rejects_invalid_enums_and_bounded_lists() {
        for invalid in [
            VALID_TEXT.replace(r#""subject":"math""#, r#""subject":"history""#),
            VALID_TEXT.replace(r#""kind":"note""#, r#""kind":"chat""#),
            VALID_TEXT.replace(
                r#""title":"极限计算与洛必达法则""#,
                &format!(r#""title":"{}""#, "题".repeat(121)),
            ),
        ] {
            assert_eq!(
                parse_text_suggestion(&invalid).unwrap_err().code(),
                "AI_RESPONSE_INVALID"
            );
        }

        let too_many_tags = serde_json::json!({
            "title": "资料",
            "subject": "math",
            "collection": "notes-examples",
            "kind": "note",
            "tags": (0..21).map(|index| format!("标签{index}")).collect::<Vec<_>>(),
            "summary": "摘要",
            "keyPoints": []
        });
        assert_eq!(
            parse_text_suggestion(&too_many_tags.to_string())
                .unwrap_err()
                .code(),
            "AI_RESPONSE_INVALID"
        );
    }

    #[test]
    fn rejects_invalid_photo_kind_and_too_many_key_points() {
        assert_eq!(
            parse_photo_suggestion(&VALID_PHOTO.replace("essay", "exam"))
                .unwrap_err()
                .code(),
            "AI_RESPONSE_INVALID"
        );
        let too_many_points = serde_json::json!({
            "title": "资料",
            "subject": "politics",
            "collection": "knowledge",
            "kind": "note",
            "tags": [],
            "summary": "摘要",
            "keyPoints": (0..13).map(|index| format!("重点{index}")).collect::<Vec<_>>()
        });
        assert_eq!(
            parse_text_suggestion(&too_many_points.to_string())
                .unwrap_err()
                .code(),
            "AI_RESPONSE_INVALID"
        );
    }

    #[test]
    fn sends_only_the_current_text_or_one_confirmed_image() {
        let text_transport = FakeTransport {
            response: Some(Ok(TransportResponse {
                status: 200,
                body: wrapped(VALID_TEXT),
            })),
            ..Default::default()
        };
        adapter()
            .organize_text(
                &text_transport,
                OrganizeTextMaterialInput {
                    subject: "math".into(),
                    collection: "notes-examples".into(),
                    kind: "note".into(),
                    title: "极限".into(),
                    content: "只发送这一条资料".into(),
                    answer: String::new(),
                    source: "高数教材".into(),
                    tags: vec!["高数".into()],
                },
            )
            .unwrap();
        let text_body = text_transport.requests.lock().unwrap()[0].body.to_string();
        assert!(text_body.contains("只发送这一条资料"));
        assert!(!text_body.contains("private-secret"));

        let photo_transport = FakeTransport {
            response: Some(Ok(TransportResponse {
                status: 200,
                body: wrapped(VALID_PHOTO),
            })),
            ..Default::default()
        };
        adapter()
            .organize_photo(
                &photo_transport,
                "data:image/png;base64,ONLY_THIS_IMAGE".into(),
            )
            .unwrap();
        let photo_body = photo_transport.requests.lock().unwrap()[0].body.to_string();
        assert_eq!(photo_body.matches("data:image/png;base64,").count(), 1);
        assert!(photo_body.contains("ONLY_THIS_IMAGE"));
    }

    #[test]
    fn maps_provider_failures_without_leaking_secrets_or_images() {
        for (status, code) in [
            (401, "AI_AUTH_FAILED"),
            (403, "AI_AUTH_FAILED"),
            (429, "AI_RATE_LIMITED"),
            (500, "AI_PROVIDER_FAILED"),
        ] {
            let transport = FakeTransport {
                response: Some(Ok(TransportResponse {
                    status,
                    body: "failure".into(),
                })),
                ..Default::default()
            };
            assert_eq!(
                adapter()
                    .organize_photo(&transport, "data:image/png;base64,PRIVATE".into())
                    .unwrap_err()
                    .code(),
                code
            );
        }

        let transport = FakeTransport {
            response: Some(Err(TransportError::Other(
                "private-secret data:image/png;base64,PRIVATE failed".into(),
            ))),
            ..Default::default()
        };
        let error = adapter()
            .organize_photo(&transport, "data:image/png;base64,PRIVATE".into())
            .unwrap_err();
        assert!(!error.internal().contains("private-secret"));
        assert!(!error.internal().contains("PRIVATE"));
    }
}
