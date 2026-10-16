use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateWordInput {
    pub word: String,
    pub meaning: String,
    pub phonetic: Option<String>,
    pub part_of_speech: Option<String>,
    pub example_sentence: Option<String>,
    pub note: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum CreateWordOutcome {
    Created { word: WordDetail },
    Duplicate { word: WordDetail, deleted: bool },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum DuplicateResolution {
    EncounterOnly,
    AppendMeaning { meaning: String },
    RestoreAndAppend { meaning: Option<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResolveDuplicateInput {
    pub word_id: String,
    pub resolution: DuplicateResolution,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WordMeaning {
    pub id: String,
    pub meaning: String,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WordTag {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WordReviewState {
    pub next_review_at: String,
    pub interval_days: i64,
    pub last_result: Option<ReviewResult>,
    pub review_count: i64,
    pub lapse_count: i64,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WordDetail {
    pub id: String,
    pub display_text: String,
    pub phonetic: Option<String>,
    pub part_of_speech: Option<String>,
    pub example_sentence: Option<String>,
    pub note: Option<String>,
    pub meanings: Vec<WordMeaning>,
    pub tags: Vec<WordTag>,
    pub review_state: Option<WordReviewState>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WordListItem {
    pub id: String,
    pub display_text: String,
    pub primary_meaning: Option<String>,
    pub tags: Vec<WordTag>,
    pub next_review_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WordReviewFilter {
    Due,
    NeverReviewed,
    Scheduled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WordSort {
    Newest,
    Alphabetical,
    NextReview,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WordListQuery {
    pub search: Option<String>,
    pub tag: Option<String>,
    pub review_status: Option<WordReviewFilter>,
    pub created_from: Option<String>,
    pub created_to: Option<String>,
    #[serde(default)]
    pub include_deleted: bool,
    pub sort: WordSort,
    pub cursor: Option<String>,
    pub limit: Option<u32>,
    pub now: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WordListPage {
    pub items: Vec<WordListItem>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWordInput {
    pub id: String,
    pub version: i64,
    pub word: String,
    pub meanings: Vec<String>,
    pub phonetic: Option<String>,
    pub part_of_speech: Option<String>,
    pub example_sentence: Option<String>,
    pub note: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeleteWordsInput {
    pub word_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWordTagsInput {
    pub word_ids: Vec<String>,
    #[serde(default)]
    pub add: Vec<String>,
    #[serde(default)]
    pub remove: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleWordsInput {
    pub word_ids: Vec<String>,
    pub next_review_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    pub requested: usize,
    pub changed: usize,
    pub skipped: usize,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReviewDirection {
    EnToZh,
    ZhToEn,
}

impl ReviewDirection {
    pub fn as_db_value(self) -> &'static str {
        match self {
            Self::EnToZh => "en_to_zh",
            Self::ZhToEn => "zh_to_en",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ReviewResult {
    Known,
    Fuzzy,
    Unknown,
}

impl ReviewResult {
    pub fn as_db_value(self) -> &'static str {
        match self {
            Self::Known => "known",
            Self::Fuzzy => "fuzzy",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewQueueQuery {
    pub direction: ReviewDirection,
    pub limit: Option<u32>,
    #[serde(default)]
    pub word_ids: Vec<String>,
    pub now: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCard {
    pub word_id: String,
    pub prompt: String,
    pub answer: String,
    pub meanings: Vec<String>,
    pub direction: ReviewDirection,
    pub review_state_version: i64,
    pub prompted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubmitReviewInput {
    pub word_id: String,
    pub direction: ReviewDirection,
    pub result: ReviewResult,
    pub review_state_version: i64,
    pub prompted_at: String,
    pub answer_revealed_at: Option<String>,
    pub submitted_at: String,
    pub local_day_start: String,
    pub local_day_end: String,
    pub next_local_day_nine_utc: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RescheduleReviewInput {
    pub word_id: String,
    pub review_state_version: i64,
    pub next_review_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSubmission {
    pub word_id: String,
    pub next_review_at: String,
    pub interval_days: i64,
    pub review_state_version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SummaryQuery {
    pub day_start: String,
    pub day_end: String,
    pub now: String,
    pub week_start: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EnglishSummary {
    pub total_words: u64,
    pub learned_today: u64,
    pub due_today: u64,
    pub reviewed_today: u64,
    pub learned_this_week: u64,
    pub known_this_week: u64,
    pub fuzzy_this_week: u64,
    pub unknown_this_week: u64,
}
