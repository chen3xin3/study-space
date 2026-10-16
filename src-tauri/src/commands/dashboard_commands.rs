use chrono::Utc;

use crate::commands::data_commands::{run_blocking, DataState};
use crate::data::dashboard::models::{
    CalendarDaySummary, CalendarMonthQuery, CreateDailyTaskInput, DailyTask, DashboardDayQuery,
    DashboardSummary, SetTaskCompletedInput, StudyTimer, VersionedIdInput,
};
use crate::data::dashboard::repository;
use crate::data::error::DataError;
use crate::data::focus;

#[tauri::command]
pub async fn get_dashboard_summary(
    query: DashboardDayQuery,
    state: tauri::State<'_, DataState>,
) -> Result<DashboardSummary, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection_mut(|connection| {
            focus::settle_expired_work(connection, &Utc::now().to_rfc3339())?;
            repository::get_dashboard_summary(connection, &query, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn get_calendar_month(
    query: CalendarMonthQuery,
    state: tauri::State<'_, DataState>,
) -> Result<Vec<CalendarDaySummary>, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection_mut(|connection| {
            focus::settle_expired_work(connection, &Utc::now().to_rfc3339())?;
            repository::get_calendar_month_summary(connection, &query, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn create_daily_task(
    input: CreateDailyTaskInput,
    state: tauri::State<'_, DataState>,
) -> Result<DailyTask, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection_mut(|connection| {
            repository::create_task(connection, input, &Utc::now().to_rfc3339())
        })
    })
    .await
}

#[tauri::command]
pub async fn set_daily_task_completed(
    input: SetTaskCompletedInput,
    state: tauri::State<'_, DataState>,
) -> Result<DailyTask, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection_mut(|connection| {
            repository::set_task_completed(
                connection,
                &input.id,
                input.version,
                input.completed,
                &Utc::now().to_rfc3339(),
            )
        })
    })
    .await
}

#[tauri::command]
pub async fn delete_daily_task(
    input: VersionedIdInput,
    state: tauri::State<'_, DataState>,
) -> Result<(), DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state.manager().with_connection_mut(|connection| {
            repository::delete_task(
                connection,
                &input.id,
                input.version,
                &Utc::now().to_rfc3339(),
            )
        })
    })
    .await
}

#[tauri::command]
pub async fn start_study_timer(
    now: String,
    state: tauri::State<'_, DataState>,
) -> Result<StudyTimer, DataError> {
    let state = state.inner().clone();
    run_blocking(move || {
        let _guard = state.manager().lock_operation()?;
        state
            .manager()
            .with_connection_mut(|connection| repository::start_timer(connection, &now))
    })
    .await
}

macro_rules! timer_command {
    ($name:ident, $operation:ident) => {
        #[tauri::command]
        pub async fn $name(
            input: VersionedIdInput,
            now: String,
            state: tauri::State<'_, DataState>,
        ) -> Result<StudyTimer, DataError> {
            let state = state.inner().clone();
            run_blocking(move || {
                let _guard = state.manager().lock_operation()?;
                state.manager().with_connection_mut(|connection| {
                    focus::settle_expired_work(connection, &now)?;
                    repository::$operation(connection, &input.id, input.version, &now)
                })
            })
            .await
        }
    };
}

timer_command!(pause_study_timer, pause_timer);
timer_command!(resume_study_timer, resume_timer);
timer_command!(end_study_timer, end_timer);
