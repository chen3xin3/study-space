use serde::Deserialize;

use crate::data::ai::provider::{AiTransport, ProviderConfig, TransportError, TransportRequest};
use crate::data::error::DataError;
use crate::data::vocabulary::import_models::{
    ImportConfidence, RecognitionResult, RecognizedCandidate,
};

const MAX_IMAGES: usize = 4;
const MAX_CANDIDATES: usize = 100;
const MAX_FRAGMENTS: usize = 100;
const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const MAX_WORD_CHARS: usize = 100;
const MAX_NOTE_CHARS: usize = 2_000;
const MAX_FRAGMENT_CHARS: usize = 500;

pub struct VocabularyRecognitionAdapter {
    config: ProviderConfig,
}

impl VocabularyRecognitionAdapter {
    pub fn new(config: ProviderConfig) -> Self {
        Self { config }
    }

    pub fn recognize(
        &self,
        transport: &dyn AiTransport,
        image_data_urls: Vec<String>,
    ) -> Result<RecognitionResult, DataError> {
        validate_images(&image_data_urls)?;
        let image_count = image_data_urls.len();
        let request = TransportRequest {
            url: format!(
                "{}/chat/completions",
                self.config.api_url.trim_end_matches('/')
            ),
            authorization: format!("Bearer {}", self.config.api_key),
            body: build_request(&self.config.model, image_data_urls),
        };
        let response = transport.send(request).map_err(|error| match error {
            TransportError::Timeout => DataError::ai_timeout("recognition request timed out"),
            TransportError::Other(message) => DataError::vocabulary_recognition_failed(
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
                return Err(DataError::vocabulary_recognition_failed(format!(
                    "provider returned {status}"
                )))
            }
        }
        if response.body.len() > MAX_RESPONSE_BYTES {
            return Err(DataError::vocabulary_recognition_failed(
                "provider response exceeded the size limit",
            ));
        }
        let envelope: ChatResponse = serde_json::from_str(&response.body)
            .map_err(|error| DataError::vocabulary_recognition_failed(error.to_string()))?;
        let content = envelope
            .choices
            .into_iter()
            .next()
            .map(|choice| choice.message.content)
            .ok_or_else(|| {
                DataError::vocabulary_recognition_failed("provider returned no choices")
            })?;
        let sanitized = redact_sensitive(&content, &self.config.api_key);
        parse_recognition(&sanitized, image_count)
    }
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
                character.is_whitespace() || matches!(character, '\"' | '\'' | ')' | ']')
            })
            .map(|offset| start + offset)
            .unwrap_or(sanitized.len());
        sanitized.replace_range(start..end, "[redacted-image]");
    }
    sanitized
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
struct RecognitionEnvelope {
    candidates: Vec<RecognitionCandidateValue>,
    unreadable_fragments: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecognitionCandidateValue {
    word: String,
    meaning_or_note: Option<String>,
    confidence: ImportConfidence,
    image_index: usize,
    line: Option<i64>,
}

pub fn parse_recognition(value: &str, image_count: usize) -> Result<RecognitionResult, DataError> {
    if image_count == 0 || image_count > MAX_IMAGES || value.len() > MAX_RESPONSE_BYTES {
        return Err(DataError::vocabulary_recognition_failed(
            "recognition input is outside accepted limits",
        ));
    }
    let json = strip_outer_fence(value.trim());
    let envelope: RecognitionEnvelope = serde_json::from_str(json)
        .map_err(|error| DataError::vocabulary_recognition_failed(error.to_string()))?;
    if envelope.candidates.len() > MAX_CANDIDATES
        || envelope.unreadable_fragments.len() > MAX_FRAGMENTS
    {
        return Err(DataError::vocabulary_recognition_failed(
            "recognition returned too many items",
        ));
    }
    let mut candidates = Vec::with_capacity(envelope.candidates.len());
    for candidate in envelope.candidates {
        let word = candidate.word.trim().to_owned();
        let note = candidate
            .meaning_or_note
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty());
        if word.is_empty()
            || word.chars().count() > MAX_WORD_CHARS
            || word.chars().any(char::is_control)
            || note
                .as_ref()
                .is_some_and(|value| value.chars().count() > MAX_NOTE_CHARS)
            || candidate.image_index >= image_count
            || candidate.line.is_some_and(|line| line < 0)
        {
            return Err(DataError::vocabulary_recognition_failed(
                "recognition candidate is invalid",
            ));
        }
        candidates.push(RecognizedCandidate {
            word,
            meaning_or_note: note,
            confidence: candidate.confidence,
            image_index: candidate.image_index,
            line: candidate.line,
        });
    }
    let unreadable_fragments = envelope
        .unreadable_fragments
        .into_iter()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if unreadable_fragments
        .iter()
        .any(|value| value.chars().count() > MAX_FRAGMENT_CHARS)
    {
        return Err(DataError::vocabulary_recognition_failed(
            "unreadable fragment is too long",
        ));
    }
    Ok(RecognitionResult {
        candidates,
        unreadable_fragments,
    })
}

fn validate_images(values: &[String]) -> Result<(), DataError> {
    if values.is_empty()
        || values.len() > MAX_IMAGES
        || values.iter().any(|value| {
            !value.starts_with("data:image/png;base64,")
                && !value.starts_with("data:image/jpeg;base64,")
                && !value.starts_with("data:image/webp;base64,")
        })
    {
        return Err(DataError::vocabulary_import_invalid(
            "recognition requires one to four PNG, JPEG, or WebP images",
        ));
    }
    Ok(())
}

fn build_request(model: &str, images: Vec<String>) -> serde_json::Value {
    let mut content = vec![serde_json::json!({
        "type": "text",
        "text": "Read handwritten English vocabulary from these images. Return only JSON with candidates and unreadableFragments. Do not guess unreadable words. Mark doubtful handwriting as uncertain. meaningOrNote may contain a nearby Chinese note."
    })];
    for image in images {
        content.push(serde_json::json!({
            "type": "image_url",
            "image_url": {"url": image}
        }));
    }
    serde_json::json!({
        "model": model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "You transcribe handwritten English vocabulary conservatively."
            },
            {"role": "user", "content": content}
        ]
    })
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
    use crate::data::ai::provider::{
        AiTransport, ProviderConfig, TransportError, TransportRequest, TransportResponse,
    };

    const VALID: &str = r#"{
      "candidates":[
        {"word":"persist","meaningOrNote":"坚持","confidence":"confident","imageIndex":0,"line":1},
        {"word":"diligent","meaningOrNote":null,"confidence":"uncertain","imageIndex":1,"line":2}
      ],
      "unreadableFragments":["third line"]
    }"#;

    struct FakeTransport {
        response: Result<TransportResponse, TransportError>,
        requests: Mutex<Vec<TransportRequest>>,
    }

    impl AiTransport for FakeTransport {
        fn send(&self, request: TransportRequest) -> Result<TransportResponse, TransportError> {
            self.requests.lock().unwrap().push(request);
            self.response.clone()
        }
    }

    fn adapter() -> VocabularyRecognitionAdapter {
        VocabularyRecognitionAdapter::new(ProviderConfig {
            api_url: "https://api.example.com/v1".into(),
            model: "vision-model".into(),
            api_key: "private-secret".into(),
        })
    }

    fn wrapped(content: &str) -> String {
        serde_json::json!({"choices":[{"message":{"content":content}}]}).to_string()
    }

    #[test]
    fn parses_strict_candidates_and_unreadable_fragments() {
        let parsed = parse_recognition(VALID, 2).unwrap();
        assert_eq!(parsed.candidates[0].word, "persist");
        assert_eq!(
            parsed.candidates[0].meaning_or_note.as_deref(),
            Some("坚持")
        );
        assert_eq!(parsed.candidates[1].image_index, 1);
        assert_eq!(parsed.unreadable_fragments, vec!["third line"]);
    }

    #[test]
    fn rejects_invalid_candidates_and_bounds_lists() {
        for invalid in [
            "{}".to_owned(),
            VALID.replace(r#""imageIndex":1"#, r#""imageIndex":2"#),
            VALID.replace(r#""word":"persist""#, r#""word":"""#),
            VALID.replace(r#""line":1"#, r#""line":-1"#),
        ] {
            assert_eq!(
                parse_recognition(&invalid, 2).unwrap_err().code(),
                "VOCABULARY_RECOGNITION_FAILED"
            );
        }
        let too_many = serde_json::json!({
            "candidates": (0..101).map(|index| serde_json::json!({
                "word": format!("word{index}"),
                "meaningOrNote": null,
                "confidence": "confident",
                "imageIndex": 0,
                "line": index
            })).collect::<Vec<_>>(),
            "unreadableFragments": []
        });
        assert_eq!(
            parse_recognition(&too_many.to_string(), 1)
                .unwrap_err()
                .code(),
            "VOCABULARY_RECOGNITION_FAILED"
        );
    }

    #[test]
    fn sends_only_images_and_maps_provider_errors() {
        let transport = FakeTransport {
            response: Ok(TransportResponse {
                status: 200,
                body: wrapped(VALID),
            }),
            requests: Mutex::new(vec![]),
        };
        let result = adapter()
            .recognize(
                &transport,
                vec![
                    "data:image/png;base64,AAAA".into(),
                    "data:image/jpeg;base64,BBBB".into(),
                ],
            )
            .unwrap();
        assert_eq!(result.candidates.len(), 2);
        let request = &transport.requests.lock().unwrap()[0];
        assert_eq!(request.authorization, "Bearer private-secret");
        let body = request.body.to_string();
        assert!(body.contains("data:image/png;base64,AAAA"));
        assert!(body.contains("data:image/jpeg;base64,BBBB"));
        assert!(!body.contains("private-secret"));

        for (status, code) in [
            (401, "AI_AUTH_FAILED"),
            (403, "AI_AUTH_FAILED"),
            (429, "AI_RATE_LIMITED"),
            (500, "VOCABULARY_RECOGNITION_FAILED"),
        ] {
            let failing = FakeTransport {
                response: Ok(TransportResponse {
                    status,
                    body: "failure".into(),
                }),
                requests: Mutex::new(vec![]),
            };
            assert_eq!(
                adapter()
                    .recognize(&failing, vec!["data:image/png;base64,AAAA".into()])
                    .unwrap_err()
                    .code(),
                code
            );
        }
    }

    #[test]
    fn redacts_api_keys_and_photo_content_from_transport_errors() {
        let transport = FakeTransport {
            response: Err(TransportError::Other(
                "request private-secret data:image/png;base64,VERY_PRIVATE_IMAGE failed".into(),
            )),
            requests: Mutex::new(vec![]),
        };
        let error = adapter()
            .recognize(&transport, vec!["data:image/png;base64,AAAA".into()])
            .unwrap_err();
        assert!(!error.internal().contains("private-secret"));
        assert!(!error.internal().contains("VERY_PRIVATE_IMAGE"));
        assert!(error.internal().contains("[redacted]"));
        assert!(error.internal().contains("[redacted-image]"));
    }
}
