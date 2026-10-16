use chrono::{Datelike, Days, Local, NaiveTime, TimeZone, Utc};
use rusqlite::Connection;

use crate::commands::data_commands::{run_blocking, DataState};
use crate::data::error::DataError;
use crate::data::vocabulary::models::{
    BatchResult, CreateWordInput, CreateWordOutcome, DeleteWordsInput, EnglishSummary,
    RescheduleReviewInput, ResolveDuplicateInput, ReviewCard, ReviewQueueQuery, ReviewSubmission,
    ScheduleWordsInput, SubmitReviewInput, SummaryQuery, UpdateWordInput, UpdateWordTagsInput,
    WordDetail, WordListPage, WordListQuery,
};
use crate::data::vocabulary::{repository, review};

fn read<T>(
    state: &DataState,
    operation: impl FnOnce(&Connection) -> Result<T, DataError>,
) -> Result<T, DataError> {
    let _guard = state.manager().lock_operation()?;
    state.manager().with_connection(operation)
}

fn write<T>(
    state: &DataState,
    operation: impl FnOnce(&mut Connection) -> Result<T, DataError>,
) -> Result<T, DataError> {
    let _guard = state.manager().lock_operation()?;
    state.manager().with_connection_mut(operation)
}

fn now_and_initial_review() -> Result<(String, String), DataError> {
    let now = Local::now();
    let tomorrow = now
        .date_naive()
        .checked_add_days(Days::new(1))
        .ok_or_else(|| DataError::word_invalid("tomorrow is out of range"))?;
    let local_nine = tomorrow.and_time(NaiveTime::from_hms_opt(9, 0, 0).unwrap());
    let initial = Local
        .from_local_datetime(&local_nine)
        .earliest()
        .ok_or_else(|| DataError::word_invalid("local 09:00 is unavailable"))?;
    Ok((
        now.with_timezone(&Utc).to_rfc3339(),
        initial.with_timezone(&Utc).to_rfc3339(),
    ))
}

fn summary_query() -> Result<SummaryQuery, DataError> {
    let now = Local::now();
    let day_start_local = now
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .and_then(|value| Local.from_local_datetime(&value).earliest())
        .ok_or_else(|| DataError::word_invalid("local day start is unavailable"))?;
    let day_end_local = day_start_local + chrono::Duration::days(1);
    let week_start_local =
        day_start_local - chrono::Duration::days(now.weekday().num_days_from_monday().into());
    Ok(SummaryQuery {
        day_start: day_start_local.with_timezone(&Utc).to_rfc3339(),
        day_end: day_end_local.with_timezone(&Utc).to_rfc3339(),
        now: now.with_timezone(&Utc).to_rfc3339(),
        week_start: week_start_local.with_timezone(&Utc).to_rfc3339(),
    })
}

#[tauri::command]
pub async fn create_word(
    input: CreateWordInput,
    state: tauri::State<'_, DataState>,
) -> Result<CreateWordOutcome, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let (now, initial) = now_and_initial_review()?;
        write(&state, |connection| {
            repository::create_word(connection, input, &now, &initial)
        })
    })
    .await
}

#[tauri::command]
pub async fn resolve_duplicate_word(
    input: ResolveDuplicateInput,
    state: tauri::State<'_, DataState>,
) -> Result<WordDetail, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let (now, initial) = now_and_initial_review()?;
        write(&state, |connection| {
            repository::resolve_duplicate(connection, input, &now, &initial)
        })
    })
    .await
}

#[tauri::command]
pub async fn get_word(
    word_id: String,
    state: tauri::State<'_, DataState>,
) -> Result<WordDetail, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        read(&state, |connection| {
            repository::get_word(connection, &word_id)
        })
    })
    .await
}

#[tauri::command]
pub async fn list_words(
    query: WordListQuery,
    state: tauri::State<'_, DataState>,
) -> Result<WordListPage, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        read(&state, |connection| {
            repository::list_words(connection, query)
        })
    })
    .await
}

#[tauri::command]
pub async fn update_word(
    input: UpdateWordInput,
    state: tauri::State<'_, DataState>,
) -> Result<WordDetail, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let now = Utc::now().to_rfc3339();
        write(&state, |connection| {
            repository::update_word(connection, input, &now)
        })
    })
    .await
}

#[tauri::command]
pub async fn delete_words(
    input: DeleteWordsInput,
    state: tauri::State<'_, DataState>,
) -> Result<BatchResult, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let now = Utc::now().to_rfc3339();
        write(&state, |connection| {
            repository::delete_words(connection, input, &now)
        })
    })
    .await
}

#[tauri::command]
pub async fn update_word_tags(
    input: UpdateWordTagsInput,
    state: tauri::State<'_, DataState>,
) -> Result<BatchResult, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let now = Utc::now().to_rfc3339();
        write(&state, |connection| {
            repository::update_word_tags(connection, input, &now)
        })
    })
    .await
}

#[tauri::command]
pub async fn schedule_words_for_today(
    input: ScheduleWordsInput,
    state: tauri::State<'_, DataState>,
) -> Result<BatchResult, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let now = Utc::now().to_rfc3339();
        write(&state, |connection| {
            repository::schedule_words_for_today(connection, input, &now)
        })
    })
    .await
}

#[tauri::command]
pub async fn get_word_review_queue(
    query: ReviewQueueQuery,
    state: tauri::State<'_, DataState>,
) -> Result<Vec<ReviewCard>, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        read(&state, |connection| {
            review::get_review_queue(connection, query)
        })
    })
    .await
}

#[tauri::command]
pub async fn submit_word_review(
    input: SubmitReviewInput,
    state: tauri::State<'_, DataState>,
) -> Result<ReviewSubmission, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        write(&state, |connection| {
            review::submit_review(connection, input)
        })
    })
    .await
}

#[tauri::command]
pub async fn reschedule_word_review(
    input: RescheduleReviewInput,
    state: tauri::State<'_, DataState>,
) -> Result<ReviewSubmission, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        write(&state, |connection| {
            review::reschedule_review(connection, input)
        })
    })
    .await
}

#[tauri::command]
pub async fn get_english_summary(
    state: tauri::State<'_, DataState>,
) -> Result<EnglishSummary, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let query = summary_query()?;
        read(&state, |connection| {
            repository::get_english_summary(connection, query)
        })
    })
    .await
}
