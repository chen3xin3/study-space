use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use uuid::Uuid;

use crate::data::ai::credentials::CredentialStore;
use crate::data::ai::models::{EssayAiReview, ReviewEssayInput};
use crate::data::ai::provider::{
    AiTransport, OpenAiCompatibleAdapter, ParsedReview, ProviderConfig, ReviewPayload,
};
use crate::data::error::DataError;
use crate::data::essays::attempts::get_attempt;
use crate::data::essays::models::AttemptStatus;

pub trait ConfirmedImageLoader: Send + Sync {
    fn load_data_url(&self, attachment_id: &str) -> Result<String, DataError>;
}

pub fn review_attempt(
    connection: &mut Connection,
    credentials: &dyn CredentialStore,
    transport: &dyn AiTransport,
    images: &dyn ConfirmedImageLoader,
    input: ReviewEssayInput,
    now: &str,
) -> Result<EssayAiReview, DataError> {
    let (enabled, provider_name, api_url, model) = connection
        .query_row(
            "SELECT enabled, provider_name, api_url, model FROM ai_settings WHERE singleton_id=1",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)? != 0,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .map_err(review_error)?;
    if !enabled {
        return Err(DataError::ai_disabled("AI setting is disabled"));
    }
    if provider_name.trim().is_empty() || api_url.trim().is_empty() || model.trim().is_empty() {
        return Err(DataError::ai_not_configured("AI settings are incomplete"));
    }

    let attempt = get_attempt(connection, &input.attempt_id)?;
    if attempt.status != AttemptStatus::Completed {
        return Err(DataError::essay_invalid(
            "only completed attempts can be reviewed",
        ));
    }
    if input.confirmed_attachment_ids.len() > 4 {
        return Err(DataError::essay_invalid(
            "at most four images can be confirmed",
        ));
    }
    let available: HashSet<_> = attempt.attachment_ids.iter().collect();
    let mut selected = HashSet::new();
    let mut image_data_urls = Vec::new();
    for id in &input.confirmed_attachment_ids {
        if !available.contains(id) || !selected.insert(id) {
            return Err(DataError::essay_invalid(
                "confirmed images must be unique attempt attachments",
            ));
        }
        image_data_urls.push(images.load_data_url(id)?);
    }
    let api_key = credentials
        .get_api_key()?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| DataError::ai_not_configured("AI API key is missing"))?;

    let request_id = Uuid::new_v4().to_string();
    connection
        .execute(
            "INSERT INTO ai_requests
             (id, feature, attempt_id, provider_name, model, status, retry_of, created_at, version)
             VALUES (?1, 'essay_review', ?2, ?3, ?4, 'pending', ?5, ?6, 1)",
            params![
                request_id,
                attempt.id,
                provider_name,
                model,
                input.retry_of,
                now
            ],
        )
        .map_err(review_error)?;

    let adapter = OpenAiCompatibleAdapter::new(ProviderConfig {
        api_url,
        model: model.clone(),
        api_key,
    });
    let result = adapter.review(
        transport,
        ReviewPayload {
            title: attempt.title,
            prompt: attempt.prompt,
            scoring_criteria: attempt.scoring_criteria,
            body: attempt.body,
            image_data_urls,
        },
    );
    let parsed = match result {
        Ok(result) => result,
        Err(error) => {
            connection
                .execute(
                    "UPDATE ai_requests SET status='failed', error_code=?1,
                     completed_at=?2, version=version+1 WHERE id=?3 AND status='pending'",
                    params![error.code(), now, request_id],
                )
                .map_err(review_error)?;
            return Err(error);
        }
    };
    save_success(
        connection,
        &request_id,
        &input.attempt_id,
        &provider_name,
        &model,
        parsed,
        now,
    )
}

pub fn retry_review(
    connection: &mut Connection,
    credentials: &dyn CredentialStore,
    transport: &dyn AiTransport,
    images: &dyn ConfirmedImageLoader,
    request_id: &str,
    now: &str,
) -> Result<EssayAiReview, DataError> {
    let attempt_id = connection
        .query_row(
            "SELECT attempt_id FROM ai_requests WHERE id=?1",
            [request_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(review_error)?
        .ok_or_else(|| DataError::essay_not_found("AI request not found"))?;
    review_attempt(
        connection,
        credentials,
        transport,
        images,
        ReviewEssayInput {
            attempt_id,
            confirmed_attachment_ids: vec![],
            retry_of: Some(request_id.to_owned()),
        },
        now,
    )
}

pub fn confirm_review(
    connection: &mut Connection,
    review_id: &str,
    version: i64,
    now: &str,
) -> Result<EssayAiReview, DataError> {
    let changed = connection
        .execute(
            "UPDATE essay_ai_reviews SET confirmed_at=?1, version=version+1
             WHERE id=?2 AND version=?3 AND confirmed_at IS NULL",
            params![now, review_id, version],
        )
        .map_err(review_error)?;
    if changed == 0 {
        return Err(DataError::essay_version_conflict(
            "AI review changed before confirmation",
        ));
    }
    get_review(connection, review_id)
}

fn save_success(
    connection: &mut Connection,
    request_id: &str,
    attempt_id: &str,
    provider_name: &str,
    model: &str,
    parsed: ParsedReview,
    now: &str,
) -> Result<EssayAiReview, DataError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(review_error)?;
    let review_id = Uuid::new_v4().to_string();
    transaction
        .execute(
            "INSERT INTO essay_ai_reviews
             (id, request_id, attempt_id, reference_score, max_score, rationale,
              grammar_json, wording_json, content_analysis, sentence_suggestions_json,
              optimized_essay, expressions_json, recognized_text, safe_raw_response,
              provider_name, model, created_at, version)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,1)",
            params![
                review_id,
                request_id,
                attempt_id,
                parsed.reference_score,
                parsed.max_score,
                parsed.rationale,
                json(&parsed.grammar_issues)?,
                json(&parsed.wording_issues)?,
                parsed.content_analysis,
                json(&parsed.sentence_suggestions)?,
                parsed.optimized_essay,
                json(&parsed.expressions)?,
                parsed.recognized_text,
                parsed.safe_raw_response,
                provider_name,
                model,
                now,
            ],
        )
        .map_err(review_error)?;
    transaction
        .execute(
            "UPDATE ai_requests SET status='succeeded', completed_at=?1, version=version+1
             WHERE id=?2 AND status='pending'",
            params![now, request_id],
        )
        .map_err(review_error)?;
    transaction.commit().map_err(review_error)?;
    get_review(connection, &review_id)
}

pub fn get_review(connection: &Connection, id: &str) -> Result<EssayAiReview, DataError> {
    connection
        .query_row(
            "SELECT id, request_id, attempt_id, reference_score, max_score, rationale,
                    grammar_json, wording_json, content_analysis, sentence_suggestions_json,
                    optimized_essay, expressions_json, recognized_text, provider_name, model,
                    confirmed_at, created_at, version
             FROM essay_ai_reviews WHERE id=?1",
            [id],
            |row| {
                let grammar: String = row.get(6)?;
                let wording: String = row.get(7)?;
                let sentences: String = row.get(9)?;
                let expressions: String = row.get(11)?;
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<f64>>(3)?,
                    row.get::<_, Option<f64>>(4)?,
                    row.get::<_, String>(5)?,
                    grammar,
                    wording,
                    row.get::<_, String>(8)?,
                    sentences,
                    row.get::<_, String>(10)?,
                    expressions,
                    row.get::<_, Option<String>>(12)?,
                    row.get::<_, String>(13)?,
                    row.get::<_, String>(14)?,
                    row.get::<_, Option<String>>(15)?,
                    row.get::<_, String>(16)?,
                    row.get::<_, i64>(17)?,
                ))
            },
        )
        .map_err(review_error)
        .and_then(|value| {
            Ok(EssayAiReview {
                id: value.0,
                request_id: value.1,
                attempt_id: value.2,
                reference_score: value.3,
                max_score: value.4,
                rationale: value.5,
                grammar_issues: from_json(&value.6)?,
                wording_issues: from_json(&value.7)?,
                content_analysis: value.8,
                sentence_suggestions: from_json(&value.9)?,
                optimized_essay: value.10,
                expressions: from_json(&value.11)?,
                recognized_text: value.12,
                provider_name: value.13,
                model: value.14,
                confirmed_at: value.15,
                created_at: value.16,
                version: value.17,
            })
        })
}

fn json<T: serde::Serialize>(value: &T) -> Result<String, DataError> {
    serde_json::to_string(value).map_err(|error| DataError::ai_response_invalid(error.to_string()))
}

fn from_json<T: serde::de::DeserializeOwned>(value: &str) -> Result<T, DataError> {
    serde_json::from_str(value).map_err(|error| DataError::ai_response_invalid(error.to_string()))
}

fn review_error(error: rusqlite::Error) -> DataError {
    DataError::ai_provider_failed(error.to_string())
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use rusqlite::Connection;

    use super::*;
    use crate::data::ai::credentials::{CredentialStore, MemoryCredentialStore};
    use crate::data::ai::models::ReviewEssayInput;
    use crate::data::ai::provider::{
        AiTransport, TransportError, TransportRequest, TransportResponse,
    };
    use crate::data::essays::attempts::{complete_attempt, create_attempt, update_attempt};
    use crate::data::essays::models::{
        AttemptMode, CreateAttemptInput, EssayType, UpdateAttemptInput,
    };
    use crate::data::migrations::migrate;

    const NOW: &str = "2026-09-25T07:00:00Z";
    const LATER: &str = "2026-09-25T08:00:00Z";
    const REVIEW_JSON: &str = r#"{"referenceScore":13,"maxScore":15,
      "rationale":"Clear","grammarIssues":[],"wordingIssues":[],
      "contentAnalysis":"Complete","sentenceSuggestions":[],
      "optimizedEssay":"Improved","expressions":[],"recognizedText":null}"#;

    struct CountingTransport {
        calls: AtomicUsize,
        status: u16,
    }

    impl CountingTransport {
        fn success() -> Self {
            Self {
                calls: AtomicUsize::new(0),
                status: 200,
            }
        }
    }

    impl AiTransport for CountingTransport {
        fn send(&self, _request: TransportRequest) -> Result<TransportResponse, TransportError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(TransportResponse {
                status: self.status,
                body: serde_json::json!({
                    "choices": [{"message": {"content": REVIEW_JSON}}]
                })
                .to_string(),
            })
        }
    }

    struct EmptyImages;
    impl ConfirmedImageLoader for EmptyImages {
        fn load_data_url(
            &self,
            _attachment_id: &str,
        ) -> Result<String, crate::data::error::DataError> {
            unreachable!()
        }
    }

    fn setup() -> (Connection, String) {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        migrate(&mut connection).unwrap();
        let attempt = create_attempt(
            &mut connection,
            CreateAttemptInput {
                mode: AttemptMode::Independent,
                source_essay_id: None,
                title: "Practice".into(),
                prompt: None,
                scoring_criteria: None,
                body: "Draft".into(),
                note: None,
                exam_track: None,
                essay_type: EssayType::Small,
                attachment_ids: vec![],
            },
            NOW,
        )
        .unwrap();
        let saved = update_attempt(
            &mut connection,
            UpdateAttemptInput {
                id: attempt.id.clone(),
                version: attempt.version,
                title: attempt.title,
                prompt: None,
                scoring_criteria: None,
                body: "Final essay".into(),
                note: None,
                exam_track: None,
                essay_type: EssayType::Small,
                attachment_ids: vec![],
            },
            NOW,
        )
        .unwrap();
        complete_attempt(&mut connection, saved.id.clone(), saved.version, NOW).unwrap();
        (connection, saved.id)
    }

    fn input(attempt_id: &str) -> ReviewEssayInput {
        ReviewEssayInput {
            attempt_id: attempt_id.into(),
            confirmed_attachment_ids: vec![],
            retry_of: None,
        }
    }

    #[test]
    fn disabled_ai_never_reads_credentials_or_calls_provider() {
        let (mut connection, attempt_id) = setup();
        let credentials = MemoryCredentialStore::default();
        let transport = CountingTransport::success();
        let error = review_attempt(
            &mut connection,
            &credentials,
            &transport,
            &EmptyImages,
            input(&attempt_id),
            NOW,
        )
        .unwrap_err();
        assert_eq!(error.code(), "AI_DISABLED");
        assert_eq!(transport.calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn success_and_retry_preserve_two_immutable_reviews() {
        let (mut connection, attempt_id) = setup();
        connection
            .execute(
                "UPDATE ai_settings SET enabled=1, provider_name='Compatible',
             api_url='https://api.example.com/v1', model='review-model' WHERE singleton_id=1",
                [],
            )
            .unwrap();
        let credentials = MemoryCredentialStore::default();
        credentials.set_api_key("secret").unwrap();
        let transport = CountingTransport::success();
        let first = review_attempt(
            &mut connection,
            &credentials,
            &transport,
            &EmptyImages,
            input(&attempt_id),
            NOW,
        )
        .unwrap();
        let second = retry_review(
            &mut connection,
            &credentials,
            &transport,
            &EmptyImages,
            &first.request_id,
            LATER,
        )
        .unwrap();
        assert_ne!(first.id, second.id);
        assert_ne!(first.request_id, second.request_id);
        let count: i64 = connection
            .query_row("SELECT count(*) FROM essay_ai_reviews", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 2);
        let confirmed = confirm_review(&mut connection, &first.id, first.version, LATER).unwrap();
        assert_eq!(confirmed.confirmed_at.as_deref(), Some(LATER));
    }

    #[test]
    fn provider_failure_marks_only_the_request_failed() {
        let (mut connection, attempt_id) = setup();
        connection
            .execute(
                "UPDATE ai_settings SET enabled=1, provider_name='Compatible',
             api_url='https://api.example.com/v1', model='review-model' WHERE singleton_id=1",
                [],
            )
            .unwrap();
        let credentials = MemoryCredentialStore::default();
        credentials.set_api_key("secret").unwrap();
        let transport = CountingTransport {
            calls: AtomicUsize::new(0),
            status: 500,
        };
        assert_eq!(
            review_attempt(
                &mut connection,
                &credentials,
                &transport,
                &EmptyImages,
                input(&attempt_id),
                NOW,
            )
            .unwrap_err()
            .code(),
            "AI_PROVIDER_FAILED"
        );
        let state: (String, Option<String>) = connection
            .query_row("SELECT status, error_code FROM ai_requests", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .unwrap();
        assert_eq!(state.0, "failed");
        assert_eq!(state.1.as_deref(), Some("AI_PROVIDER_FAILED"));
        assert_eq!(
            connection
                .query_row("SELECT count(*) FROM essay_ai_reviews", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
}
