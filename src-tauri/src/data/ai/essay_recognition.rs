use serde::{Deserialize, Serialize};

use crate::data::ai::provider::{AiTransport, ProviderConfig, TransportError, TransportRequest};
use crate::data::error::DataError;

const MAX_IMAGES: usize = 4;
const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const MAX_TITLE_CHARS: usize = 200;
const MAX_BODY_CHARS: usize = 50_000;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EssayImageRecognition {
    pub title: String,
    pub body: String,
    pub translation: Option<String>,
}

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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecognitionValue {
    title: String,
    body: String,
    translation: Option<String>,
}

pub struct EssayRecognitionAdapter {
    config: ProviderConfig,
}

impl EssayRecognitionAdapter {
    pub fn new(config: ProviderConfig) -> Self {
        Self { config }
    }

    pub fn recognize(
        &self,
        transport: &dyn AiTransport,
        images: Vec<String>,
    ) -> Result<EssayImageRecognition, DataError> {
        validate_images(&images)?;
        let response = transport
            .send(TransportRequest {
                url: format!(
                    "{}/chat/completions",
                    self.config.api_url.trim_end_matches('/')
                ),
                authorization: format!("Bearer {}", self.config.api_key),
                body: build_request(&self.config.model, images),
            })
            .map_err(|error| match error {
                TransportError::Timeout => DataError::ai_timeout("essay recognition timed out"),
                TransportError::Other(message) => DataError::essay_operation_failed(
                    redact_sensitive(&message, &self.config.api_key),
                ),
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
                return Err(DataError::essay_operation_failed(format!(
                    "provider returned {status}"
                )))
            }
        }
        if response.body.len() > MAX_RESPONSE_BYTES {
            return Err(DataError::essay_operation_failed(
                "provider response exceeded the size limit",
            ));
        }
        let envelope: ChatResponse = serde_json::from_str(&response.body)
            .map_err(|error| DataError::essay_operation_failed(error.to_string()))?;
        let content = envelope
            .choices
            .into_iter()
            .next()
            .map(|choice| choice.message.content)
            .ok_or_else(|| DataError::essay_operation_failed("provider returned no choices"))?;
        parse_recognition(&redact_sensitive(&content, &self.config.api_key))
    }
}

pub fn parse_recognition(value: &str) -> Result<EssayImageRecognition, DataError> {
    if value.len() > MAX_RESPONSE_BYTES {
        return Err(DataError::essay_operation_failed(
            "recognition response exceeded the size limit",
        ));
    }
    let json = strip_outer_fence(value.trim());
    let parsed: RecognitionValue = serde_json::from_str(json)
        .map_err(|error| DataError::essay_operation_failed(error.to_string()))?;
    let title = parsed.title.trim().to_owned();
    let body = parsed.body.trim().to_owned();
    let translation = parsed
        .translation
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    if title.is_empty()
        || title.chars().count() > MAX_TITLE_CHARS
        || body.is_empty()
        || body.chars().count() > MAX_BODY_CHARS
    {
        return Err(DataError::essay_operation_failed(
            "recognized essay is empty or too long",
        ));
    }
    Ok(EssayImageRecognition {
        title,
        body,
        translation,
    })
}

fn validate_images(images: &[String]) -> Result<(), DataError> {
    if images.is_empty()
        || images.len() > MAX_IMAGES
        || images.iter().any(|value| {
            !value.starts_with("data:image/png;base64,")
                && !value.starts_with("data:image/jpeg;base64,")
                && !value.starts_with("data:image/webp;base64,")
        })
    {
        return Err(DataError::essay_invalid(
            "recognition requires one to four PNG, JPEG, or WebP images",
        ));
    }
    Ok(())
}

fn build_request(model: &str, images: Vec<String>) -> serde_json::Value {
    let mut content = vec![serde_json::json!({
        "type": "text",
        "text": "Transcribe the handwritten English essay conservatively. Return only JSON with title, body, and translation. Preserve paragraphs and punctuation. Do not guess unreadable text; use [unclear]. translation may be null."
    })];
    for image in images {
        content.push(serde_json::json!({ "type": "image_url", "image_url": { "url": image } }));
    }
    serde_json::json!({
        "model": model,
        "temperature": 0,
        "response_format": { "type": "json_object" },
        "messages": [
            { "role": "system", "content": "You accurately transcribe handwritten postgraduate English essays without inventing text." },
            { "role": "user", "content": content }
        ]
    })
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
    use super::*;

    #[test]
    fn parses_and_trims_a_strict_essay_transcription() {
        let parsed = parse_recognition(
            r#"{"title":"  A Letter  ","body":"  Dear Sir,\nThank you.  ","translation":null}"#,
        )
        .unwrap();
        assert_eq!(parsed.title, "A Letter");
        assert_eq!(parsed.body, "Dear Sir,\nThank you.");
        assert_eq!(parsed.translation, None);
    }

    #[test]
    fn rejects_an_empty_transcription() {
        let error = parse_recognition(r#"{"title":"Photo essay","body":" ","translation":null}"#)
            .unwrap_err();
        assert_eq!(error.code(), "ESSAY_OPERATION_FAILED");
    }
}
