use chrono::{DateTime, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use uuid::Uuid;

use crate::data::dashboard::models::{
    CalendarDaySummary, CalendarMonthQuery, CreateDailyTaskInput, DailyStudyPoint, DailyTask,
    DashboardDayQuery, DashboardSummary, StudyTimer, StudyTimerStatus,
};
use crate::data::error::DataError;

pub fn create_task(
    connection: &mut Connection,
    input: CreateDailyTaskInput,
    now: &str,
) -> Result<DailyTask, DataError> {
    validate_local_date(&input.local_date)?;
    let title = input.title.trim();
    if title.is_empty() || title.chars().count() > 200 {
        return Err(DataError::dashboard_invalid("task title length is invalid"));
    }
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(operation_error)?;
    let position: i64 = transaction
        .query_row(
            "SELECT coalesce(max(position), -1) + 1 FROM daily_tasks
             WHERE local_date=?1 AND deleted_at IS NULL",
            [&input.local_date],
            |row| row.get(0),
        )
        .map_err(operation_error)?;
    let id = Uuid::new_v4().to_string();
    transaction
        .execute(
            "INSERT INTO daily_tasks
             (id, local_date, title, learning_item_id, position, created_at, updated_at, version)
             VALUES (?1,?2,?3,?4,?5,?6,?6,1)",
            params![id, input.local_date, title, input.learning_item_id, position, now],
        )
        .map_err(operation_error)?;
    let task = get_task(&transaction, &id)?;
    transaction.commit().map_err(operation_error)?;
    Ok(task)
}

pub fn list_tasks(connection: &Connection, local_date: &str) -> Result<Vec<DailyTask>, DataError> {
    validate_local_date(local_date)?;
    let mut statement = connection
        .prepare(
            "SELECT id, local_date, title, learning_item_id, position, completed_at, created_at, updated_at, version
             FROM daily_tasks WHERE local_date=?1 AND deleted_at IS NULL
             ORDER BY completed_at IS NOT NULL, position, created_at, id",
        )
        .map_err(operation_error)?;
    let tasks = statement
        .query_map([local_date], map_task)
        .map_err(operation_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(operation_error)?;
    Ok(tasks)
}

pub fn set_task_completed(
    connection: &mut Connection,
    id: &str,
    version: i64,
    completed: bool,
    now: &str,
) -> Result<DailyTask, DataError> {
    let completed_at = completed.then_some(now);
    let changed = connection
        .execute(
            "UPDATE daily_tasks SET completed_at=?1, updated_at=?2, version=version+1
             WHERE id=?3 AND version=?4 AND deleted_at IS NULL",
            params![completed_at, now, id, version],
        )
        .map_err(operation_error)?;
    if changed == 0 {
        return task_conflict_or_missing(connection, id);
    }
    get_task(connection, id)
}

pub fn delete_task(
    connection: &mut Connection,
    id: &str,
    version: i64,
    now: &str,
) -> Result<(), DataError> {
    let changed = connection
        .execute(
            "UPDATE daily_tasks SET deleted_at=?1, updated_at=?1, version=version+1
             WHERE id=?2 AND version=?3 AND deleted_at IS NULL",
            params![now, id, version],
        )
        .map_err(operation_error)?;
    if changed == 0 {
        return task_conflict_or_missing(connection, id);
    }
    Ok(())
}

pub fn start_timer(connection: &Connection, now: &str) -> Result<StudyTimer, DataError> {
    parse_timestamp(now)?;
    if get_open_timer(connection)?.is_some() {
        return Err(DataError::dashboard_conflict(
            "an open study timer already exists",
        ));
    }
    let id = Uuid::new_v4().to_string();
    connection
        .execute(
            "INSERT INTO study_timers
             (id, status, current_started_at, accumulated_seconds, created_at, updated_at, version)
             VALUES (?1,'running',?2,0,?2,?2,1)",
            params![id, now],
        )
        .map_err(operation_error)?;
    get_timer(connection, &id)
}

pub fn pause_timer(
    connection: &mut Connection,
    id: &str,
    version: i64,
    now: &str,
) -> Result<StudyTimer, DataError> {
    finish_running_segment(connection, id, version, now, StudyTimerStatus::Paused)
}

pub fn resume_timer(
    connection: &mut Connection,
    id: &str,
    version: i64,
    now: &str,
) -> Result<StudyTimer, DataError> {
    parse_timestamp(now)?;
    let current = get_timer(connection, id)?;
    if current.version != version {
        return Err(DataError::dashboard_conflict("timer version conflict"));
    }
    if current.status != StudyTimerStatus::Paused {
        return Err(DataError::dashboard_invalid(
            "only a paused timer can resume",
        ));
    }
    let phase: Option<String> = connection
        .query_row(
            "SELECT phase FROM focus_sessions WHERE timer_id=?1",
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(operation_error)?;
    if phase.as_deref() == Some("break") {
        return Err(DataError::dashboard_invalid(
            "resume the next focus cycle from the focus page",
        ));
    }
    let changed = connection
        .execute(
            "UPDATE study_timers SET status='running', current_started_at=?1,
             updated_at=?1, version=version+1 WHERE id=?2 AND version=?3 AND status='paused'",
            params![now, id, version],
        )
        .map_err(operation_error)?;
    if changed == 0 {
        return Err(DataError::dashboard_conflict("timer changed before resume"));
    }
    get_timer(connection, id)
}

pub fn end_timer(
    connection: &mut Connection,
    id: &str,
    version: i64,
    now: &str,
) -> Result<StudyTimer, DataError> {
    let current = get_timer(connection, id)?;
    match current.status {
        StudyTimerStatus::Running => {
            finish_running_segment(connection, id, version, now, StudyTimerStatus::Completed)
        }
        StudyTimerStatus::Paused => {
            parse_timestamp(now)?;
            if current.version != version {
                return Err(DataError::dashboard_conflict("timer version conflict"));
            }
            connection
                .execute(
                    "UPDATE study_timers SET status='completed', ended_at=?1,
                     updated_at=?1, version=version+1
                     WHERE id=?2 AND version=?3 AND status='paused'",
                    params![now, id, version],
                )
                .map_err(operation_error)?;
            get_timer(connection, id)
        }
        StudyTimerStatus::Completed => Err(DataError::dashboard_invalid("timer already ended")),
    }
}

pub fn get_dashboard_summary(
    connection: &Connection,
    query: &DashboardDayQuery,
    now: &str,
) -> Result<DashboardSummary, DataError> {
    if query.seven_days.len() != 7 {
        return Err(DataError::dashboard_invalid(
            "seven daily windows are required",
        ));
    }
    validate_local_date(&query.local_date)?;
    parse_timestamp(&query.day_start_utc)?;
    parse_timestamp(&query.day_end_utc)?;
    let now_value = parse_timestamp(now)?;
    let tasks = list_tasks(connection, &query.local_date)?;
    let completed_tasks = tasks
        .iter()
        .filter(|task| task.completed_at.is_some())
        .count() as u64;
    let total_tasks = tasks.len() as u64;

    let mut segments = Vec::new();
    let mut statement = connection
        .prepare("SELECT started_at, ended_at FROM study_timer_segments")
        .map_err(operation_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(operation_error)?;
    for row in rows {
        let (start, end) = row.map_err(operation_error)?;
        segments.push((parse_timestamp(&start)?, parse_timestamp(&end)?));
    }
    let timer = get_open_timer(connection)?;
    if let Some(active) = timer
        .as_ref()
        .filter(|timer| timer.status == StudyTimerStatus::Running)
    {
        let started = active
            .current_started_at
            .as_deref()
            .ok_or_else(|| DataError::dashboard_invalid("running timer has no start time"))?;
        let started = parse_timestamp(started)?;
        if now_value < started {
            return Err(DataError::dashboard_invalid(
                "system time moved before timer start",
            ));
        }
        segments.push((started, now_value));
    }

    let mut trend = Vec::with_capacity(7);
    for window in &query.seven_days {
        validate_local_date(&window.local_date)?;
        let start = parse_timestamp(&window.start_utc)?;
        let end = parse_timestamp(&window.end_utc)?;
        if end <= start {
            return Err(DataError::dashboard_invalid(
                "daily window must end after it starts",
            ));
        }
        let seconds = segments
            .iter()
            .map(|(segment_start, segment_end)| {
                overlap_seconds(*segment_start, *segment_end, start, end)
            })
            .sum();
        trend.push(DailyStudyPoint {
            local_date: window.local_date.clone(),
            seconds,
        });
    }
    let today_seconds = trend
        .iter()
        .find(|point| point.local_date == query.local_date)
        .map(|point| point.seconds)
        .unwrap_or(0);
    let mut reversed = trend.iter().rev();
    let first = reversed.next();
    let streak_days = if first.is_some_and(|point| point.seconds >= 60) {
        1 + reversed.take_while(|point| point.seconds >= 60).count() as u64
    } else {
        reversed.take_while(|point| point.seconds >= 60).count() as u64
    };
    Ok(DashboardSummary {
        tasks,
        completed_tasks,
        total_tasks,
        today_seconds,
        timer,
        streak_days,
        trend,
    })
}

pub fn get_calendar_month_summary(
    connection: &Connection,
    query: &CalendarMonthQuery,
    now: &str,
) -> Result<Vec<CalendarDaySummary>, DataError> {
    if query.days.is_empty() || query.days.len() > 42 {
        return Err(DataError::dashboard_invalid(
            "calendar query requires between 1 and 42 daily windows",
        ));
    }
    let now_value = parse_timestamp(now)?;
    let mut parsed_windows = Vec::with_capacity(query.days.len());
    let mut previous_local_date = None;
    for (index, window) in query.days.iter().enumerate() {
        let local_date = NaiveDate::parse_from_str(&window.local_date, "%Y-%m-%d")
            .map_err(|error| DataError::dashboard_invalid(error.to_string()))?;
        if previous_local_date.is_some_and(|previous| local_date <= previous) {
            return Err(DataError::dashboard_invalid(
                "calendar local dates must be strictly increasing",
            ));
        }
        previous_local_date = Some(local_date);
        let start = parse_timestamp(&window.start_utc)?;
        let end = parse_timestamp(&window.end_utc)?;
        if end <= start {
            return Err(DataError::dashboard_invalid(
                "daily window must end after it starts",
            ));
        }
        if index > 0 {
            let (previous_start, previous_end) = parsed_windows[index - 1];
            if start < previous_end || start <= previous_start {
                return Err(DataError::dashboard_invalid(
                    "calendar windows must be ordered and non-overlapping",
                ));
            }
        }
        parsed_windows.push((start, end));
    }

    let first_date = &query.days.first().expect("non-empty checked").local_date;
    let last_date = &query.days.last().expect("non-empty checked").local_date;
    let mut summaries = query
        .days
        .iter()
        .map(|day| CalendarDaySummary {
            local_date: day.local_date.clone(),
            total_tasks: 0,
            completed_tasks: 0,
            study_seconds: 0,
        })
        .collect::<Vec<_>>();

    let mut task_statement = connection
        .prepare(
            "SELECT local_date, count(*), sum(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END)
             FROM daily_tasks
             WHERE deleted_at IS NULL AND local_date BETWEEN ?1 AND ?2
             GROUP BY local_date",
        )
        .map_err(operation_error)?;
    let task_rows = task_statement
        .query_map(params![first_date, last_date], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(operation_error)?;
    for row in task_rows {
        let (local_date, total, completed) = row.map_err(operation_error)?;
        if let Some(summary) = summaries
            .iter_mut()
            .find(|summary| summary.local_date == local_date)
        {
            summary.total_tasks = u64::try_from(total).unwrap_or_default();
            summary.completed_tasks = u64::try_from(completed).unwrap_or_default();
        }
    }

    let range_start = parsed_windows.first().expect("non-empty checked").0;
    let range_end = parsed_windows.last().expect("non-empty checked").1;
    let mut segments = Vec::new();
    let mut segment_statement = connection
        .prepare(
            "SELECT started_at, ended_at FROM study_timer_segments
             WHERE ended_at > ?1 AND started_at < ?2",
        )
        .map_err(operation_error)?;
    let segment_rows = segment_statement
        .query_map(
            params![range_start.to_rfc3339(), range_end.to_rfc3339()],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(operation_error)?;
    for row in segment_rows {
        let (start, end) = row.map_err(operation_error)?;
        segments.push((parse_timestamp(&start)?, parse_timestamp(&end)?));
    }
    if let Some(active) =
        get_open_timer(connection)?.filter(|timer| timer.status == StudyTimerStatus::Running)
    {
        let started = active
            .current_started_at
            .as_deref()
            .ok_or_else(|| DataError::dashboard_invalid("running timer has no start time"))?;
        let started = parse_timestamp(started)?;
        if now_value < started {
            return Err(DataError::dashboard_invalid(
                "system time moved before timer start",
            ));
        }
        segments.push((started, now_value));
    }

    for (summary, (window_start, window_end)) in
        summaries.iter_mut().zip(parsed_windows.into_iter())
    {
        summary.study_seconds = segments
            .iter()
            .map(|(segment_start, segment_end)| {
                overlap_seconds(*segment_start, *segment_end, window_start, window_end)
            })
            .sum();
    }
    Ok(summaries)
}

fn finish_running_segment(
    connection: &mut Connection,
    id: &str,
    version: i64,
    now: &str,
    next_status: StudyTimerStatus,
) -> Result<StudyTimer, DataError> {
    let current = get_timer(connection, id)?;
    if current.version != version {
        return Err(DataError::dashboard_conflict("timer version conflict"));
    }
    if current.status != StudyTimerStatus::Running {
        return Err(DataError::dashboard_invalid("timer is not running"));
    }
    let started_text = current
        .current_started_at
        .as_deref()
        .ok_or_else(|| DataError::dashboard_invalid("running timer has no start time"))?;
    let started = parse_timestamp(started_text)?;
    let ended = parse_timestamp(now)?;
    if ended < started {
        return Err(DataError::dashboard_invalid(
            "system time moved before timer start",
        ));
    }
    let duration = u64::try_from((ended - started).num_seconds())
        .map_err(|error| DataError::dashboard_invalid(error.to_string()))?;
    let duration_db =
        i64::try_from(duration).map_err(|error| DataError::dashboard_invalid(error.to_string()))?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(operation_error)?;
    transaction
        .execute(
            "INSERT INTO study_timer_segments
             (id, timer_id, started_at, ended_at, duration_seconds, created_at)
             VALUES (?1,?2,?3,?4,?5,?4)",
            params![
                Uuid::new_v4().to_string(),
                id,
                started_text,
                now,
                duration_db
            ],
        )
        .map_err(operation_error)?;
    let status = match next_status {
        StudyTimerStatus::Paused => "paused",
        StudyTimerStatus::Completed => "completed",
        StudyTimerStatus::Running => unreachable!(),
    };
    let ended_at = (next_status == StudyTimerStatus::Completed).then_some(now);
    let changed = transaction
        .execute(
            "UPDATE study_timers SET status=?1, current_started_at=NULL,
             accumulated_seconds=accumulated_seconds+?2, ended_at=?3,
             updated_at=?4, version=version+1
             WHERE id=?5 AND version=?6 AND status='running'",
            params![status, duration_db, ended_at, now, id, version],
        )
        .map_err(operation_error)?;
    if changed == 0 {
        return Err(DataError::dashboard_conflict(
            "timer changed before segment ended",
        ));
    }
    let timer = get_timer(&transaction, id)?;
    transaction.commit().map_err(operation_error)?;
    Ok(timer)
}

pub(crate) fn get_timer(connection: &Connection, id: &str) -> Result<StudyTimer, DataError> {
    connection
        .query_row(
            "SELECT id, status, current_started_at, accumulated_seconds, ended_at,
                    created_at, updated_at, version FROM study_timers WHERE id=?1",
            [id],
            map_timer,
        )
        .optional()
        .map_err(operation_error)?
        .ok_or_else(|| DataError::dashboard_not_found(format!("timer {id} not found")))
}

pub(crate) fn get_open_timer(connection: &Connection) -> Result<Option<StudyTimer>, DataError> {
    connection
        .query_row(
            "SELECT id, status, current_started_at, accumulated_seconds, ended_at,
                    created_at, updated_at, version FROM study_timers
             WHERE status IN ('running','paused') LIMIT 1",
            [],
            map_timer,
        )
        .optional()
        .map_err(operation_error)
}

fn map_timer(row: &rusqlite::Row<'_>) -> rusqlite::Result<StudyTimer> {
    let status: String = row.get(1)?;
    let accumulated: i64 = row.get(3)?;
    Ok(StudyTimer {
        id: row.get(0)?,
        status: match status.as_str() {
            "running" => StudyTimerStatus::Running,
            "paused" => StudyTimerStatus::Paused,
            "completed" => StudyTimerStatus::Completed,
            _ => return Err(rusqlite::Error::InvalidQuery),
        },
        current_started_at: row.get(2)?,
        accumulated_seconds: u64::try_from(accumulated).unwrap_or_default(),
        ended_at: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        version: row.get(7)?,
    })
}

fn parse_timestamp(value: &str) -> Result<DateTime<Utc>, DataError> {
    DateTime::parse_from_rfc3339(value)
        .map(|parsed| parsed.with_timezone(&Utc))
        .map_err(|error| DataError::dashboard_invalid(error.to_string()))
}

fn overlap_seconds(
    segment_start: DateTime<Utc>,
    segment_end: DateTime<Utc>,
    window_start: DateTime<Utc>,
    window_end: DateTime<Utc>,
) -> u64 {
    let start = segment_start.max(window_start);
    let end = segment_end.min(window_end);
    if end <= start {
        0
    } else {
        u64::try_from((end - start).num_seconds()).unwrap_or_default()
    }
}

fn get_task(connection: &Connection, id: &str) -> Result<DailyTask, DataError> {
    connection
        .query_row(
            "SELECT id, local_date, title, learning_item_id, position, completed_at, created_at, updated_at, version
             FROM daily_tasks WHERE id=?1 AND deleted_at IS NULL",
            [id],
            map_task,
        )
        .optional()
        .map_err(operation_error)?
        .ok_or_else(|| DataError::dashboard_not_found(format!("task {id} not found")))
}

fn map_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<DailyTask> {
    Ok(DailyTask {
        id: row.get(0)?,
        local_date: row.get(1)?,
        title: row.get(2)?,
        learning_item_id: row.get(3)?,
        position: row.get(4)?,
        completed_at: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        version: row.get(8)?,
    })
}

fn task_conflict_or_missing<T>(connection: &Connection, id: &str) -> Result<T, DataError> {
    let exists = connection
        .query_row(
            "SELECT 1 FROM daily_tasks WHERE id=?1 AND deleted_at IS NULL",
            [id],
            |_| Ok(()),
        )
        .optional()
        .map_err(operation_error)?
        .is_some();
    if exists {
        Err(DataError::dashboard_conflict(format!(
            "task {id} version conflict"
        )))
    } else {
        Err(DataError::dashboard_not_found(format!(
            "task {id} not found"
        )))
    }
}

fn validate_local_date(value: &str) -> Result<(), DataError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map(|_| ())
        .map_err(|error| DataError::dashboard_invalid(error.to_string()))
}

fn operation_error(error: rusqlite::Error) -> DataError {
    DataError::database_open_failed(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::dashboard::models::{
        CalendarMonthQuery, CreateDailyTaskInput, DailyWindow, DashboardDayQuery, StudyTimerStatus,
    };
    use crate::data::migrations::migrate;

    const NOW: &str = "2026-09-27T01:00:00Z";
    const LATER: &str = "2026-09-27T02:00:00Z";

    fn setup() -> rusqlite::Connection {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        connection
    }

    #[test]
    fn daily_tasks_create_complete_and_soft_delete() {
        let mut connection = setup();
        let first = create_task(
            &mut connection,
            CreateDailyTaskInput {
                local_date: "2026-09-27".into(),
                title: "背 30 个单词".into(),
                learning_item_id: None,
            },
            NOW,
        )
        .unwrap();
        let second = create_task(
            &mut connection,
            CreateDailyTaskInput {
                local_date: "2026-09-27".into(),
                title: "数学刷题".into(),
                learning_item_id: None,
            },
            NOW,
        )
        .unwrap();
        let completed =
            set_task_completed(&mut connection, &first.id, first.version, true, LATER).unwrap();
        assert!(completed.completed_at.is_some());
        let tasks = list_tasks(&connection, "2026-09-27").unwrap();
        assert_eq!(
            tasks
                .iter()
                .map(|task| task.id.as_str())
                .collect::<Vec<_>>(),
            vec![second.id.as_str(), first.id.as_str()]
        );
        delete_task(&mut connection, &second.id, second.version, LATER).unwrap();
        assert_eq!(list_tasks(&connection, "2026-09-27").unwrap().len(), 1);
    }

    #[test]
    fn daily_tasks_validate_titles_and_versions() {
        let mut connection = setup();
        assert_eq!(
            create_task(
                &mut connection,
                CreateDailyTaskInput {
                    local_date: "2026-09-27".into(),
                    title: "  ".into(),
                    learning_item_id: None,
                },
                NOW,
            )
            .unwrap_err()
            .code(),
            "DASHBOARD_INVALID"
        );
        let task = create_task(
            &mut connection,
            CreateDailyTaskInput {
                local_date: "2026-09-27".into(),
                title: "英语作文".into(),
                learning_item_id: None,
            },
            NOW,
        )
        .unwrap();
        assert_eq!(
            set_task_completed(&mut connection, &task.id, task.version + 1, true, LATER)
                .unwrap_err()
                .code(),
            "DASHBOARD_CONFLICT"
        );
    }

    #[test]
    fn timer_pauses_resumes_and_ends_without_losing_segments() {
        let mut connection = setup();
        let running = start_timer(&mut connection, "2026-09-27T01:00:00Z").unwrap();
        let paused = pause_timer(
            &mut connection,
            &running.id,
            running.version,
            "2026-09-27T01:30:00Z",
        )
        .unwrap();
        assert_eq!(paused.accumulated_seconds, 1800);
        let resumed = resume_timer(
            &mut connection,
            &paused.id,
            paused.version,
            "2026-09-27T02:00:00Z",
        )
        .unwrap();
        let ended = end_timer(
            &mut connection,
            &resumed.id,
            resumed.version,
            "2026-09-27T02:15:00Z",
        )
        .unwrap();
        assert_eq!(ended.accumulated_seconds, 2700);
        assert_eq!(ended.status, StudyTimerStatus::Completed);
    }

    #[test]
    fn timer_rejects_parallel_and_backward_time() {
        let mut connection = setup();
        let running = start_timer(&mut connection, "2026-09-27T01:00:00Z").unwrap();
        assert_eq!(
            start_timer(&mut connection, "2026-09-27T01:05:00Z")
                .unwrap_err()
                .code(),
            "DASHBOARD_CONFLICT"
        );
        assert_eq!(
            pause_timer(
                &mut connection,
                &running.id,
                running.version,
                "2026-09-27T00:59:00Z",
            )
            .unwrap_err()
            .code(),
            "DASHBOARD_INVALID"
        );
    }

    #[test]
    fn timer_summary_splits_midnight_and_counts_streak() {
        let mut connection = setup();
        let first = start_timer(&mut connection, "2026-09-25T15:59:00Z").unwrap();
        end_timer(
            &mut connection,
            &first.id,
            first.version,
            "2026-09-25T16:01:00Z",
        )
        .unwrap();
        let second = start_timer(&mut connection, "2026-09-26T16:10:00Z").unwrap();
        end_timer(
            &mut connection,
            &second.id,
            second.version,
            "2026-09-26T16:11:00Z",
        )
        .unwrap();
        let window = |local_date: &str, start_utc: &str, end_utc: &str| DailyWindow {
            local_date: local_date.into(),
            start_utc: start_utc.into(),
            end_utc: end_utc.into(),
        };
        let query = DashboardDayQuery {
            local_date: "2026-09-27".into(),
            day_start_utc: "2026-09-26T16:00:00Z".into(),
            day_end_utc: "2026-09-27T16:00:00Z".into(),
            seven_days: vec![
                window("2026-09-21", "2026-09-20T16:00:00Z", "2026-09-21T16:00:00Z"),
                window("2026-09-22", "2026-09-21T16:00:00Z", "2026-09-22T16:00:00Z"),
                window("2026-09-23", "2026-09-22T16:00:00Z", "2026-09-23T16:00:00Z"),
                window("2026-09-24", "2026-09-23T16:00:00Z", "2026-09-24T16:00:00Z"),
                window("2026-09-25", "2026-09-24T16:00:00Z", "2026-09-25T16:00:00Z"),
                window("2026-09-26", "2026-09-25T16:00:00Z", "2026-09-26T16:00:00Z"),
                window("2026-09-27", "2026-09-26T16:00:00Z", "2026-09-27T16:00:00Z"),
            ],
        };
        let summary = get_dashboard_summary(&connection, &query, "2026-09-27T01:00:00Z").unwrap();
        assert_eq!(summary.trend[4].seconds, 60);
        assert_eq!(summary.trend[5].seconds, 60);
        assert_eq!(summary.trend[6].seconds, 60);
        assert_eq!(summary.today_seconds, 60);
        assert_eq!(summary.streak_days, 3);
    }

    #[test]
    fn calendar_month_groups_tasks_and_splits_study_time_by_local_day() {
        let mut connection = setup();
        let first = create_task(
            &mut connection,
            CreateDailyTaskInput {
                local_date: "2026-09-27".into(),
                title: "背单词".into(),
                learning_item_id: None,
            },
            "2026-09-27T01:00:00Z",
        )
        .unwrap();
        set_task_completed(
            &mut connection,
            &first.id,
            first.version,
            true,
            "2026-09-27T01:01:00Z",
        )
        .unwrap();
        create_task(
            &mut connection,
            CreateDailyTaskInput {
                local_date: "2026-09-28".into(),
                title: "作文默写".into(),
                learning_item_id: None,
            },
            "2026-09-27T01:02:00Z",
        )
        .unwrap();
        let timer = start_timer(&mut connection, "2026-09-27T15:50:00Z").unwrap();
        end_timer(
            &mut connection,
            &timer.id,
            timer.version,
            "2026-09-27T16:10:00Z",
        )
        .unwrap();

        let window = |local_date: &str, start_utc: &str, end_utc: &str| DailyWindow {
            local_date: local_date.into(),
            start_utc: start_utc.into(),
            end_utc: end_utc.into(),
        };
        let summary = get_calendar_month_summary(
            &connection,
            &CalendarMonthQuery {
                days: vec![
                    window("2026-09-26", "2026-09-25T16:00:00Z", "2026-09-26T16:00:00Z"),
                    window("2026-09-27", "2026-09-26T16:00:00Z", "2026-09-27T16:00:00Z"),
                    window("2026-09-28", "2026-09-27T16:00:00Z", "2026-09-28T16:00:00Z"),
                ],
            },
            "2026-09-28T02:00:00Z",
        )
        .unwrap();
        assert_eq!(summary[1].total_tasks, 1);
        assert_eq!(summary[1].completed_tasks, 1);
        assert_eq!(summary[1].study_seconds, 600);
        assert_eq!(summary[2].total_tasks, 1);
        assert_eq!(summary[2].study_seconds, 600);
    }

    #[test]
    fn calendar_month_counts_active_timer_only_until_now_and_rejects_too_many_days() {
        let mut connection = setup();
        start_timer(&mut connection, "2026-09-27T16:00:00Z").unwrap();
        let active = get_calendar_month_summary(
            &connection,
            &CalendarMonthQuery {
                days: vec![DailyWindow {
                    local_date: "2026-09-28".into(),
                    start_utc: "2026-09-27T16:00:00Z".into(),
                    end_utc: "2026-09-28T16:00:00Z".into(),
                }],
            },
            "2026-09-27T16:10:00Z",
        )
        .unwrap();
        assert_eq!(active[0].study_seconds, 600);

        let window = |day: usize| DailyWindow {
            local_date: format!("2026-10-{:02}", day + 1),
            start_utc: format!("2026-10-{:02}T00:00:00Z", day + 1),
            end_utc: format!("2026-10-{:02}T23:59:59Z", day + 1),
        };
        let too_many = CalendarMonthQuery {
            days: (0..43).map(window).collect(),
        };
        assert_eq!(
            get_calendar_month_summary(&connection, &too_many, "2026-09-27T16:10:00Z")
                .unwrap_err()
                .code(),
            "DASHBOARD_INVALID"
        );
    }

    #[test]
    fn calendar_month_rejects_duplicate_or_reversed_local_dates() {
        let connection = setup();
        let window = |local_date: &str, start: &str, end: &str| DailyWindow {
            local_date: local_date.into(),
            start_utc: start.into(),
            end_utc: end.into(),
        };
        for days in [
            vec![
                window("2026-09-28", "2026-09-27T16:00:00Z", "2026-09-28T16:00:00Z"),
                window("2026-09-28", "2026-09-28T16:00:00Z", "2026-09-29T16:00:00Z"),
            ],
            vec![
                window("2026-09-29", "2026-09-27T16:00:00Z", "2026-09-28T16:00:00Z"),
                window("2026-09-28", "2026-09-28T16:00:00Z", "2026-09-29T16:00:00Z"),
            ],
        ] {
            assert_eq!(
                get_calendar_month_summary(
                    &connection,
                    &CalendarMonthQuery { days },
                    "2026-09-28T02:00:00Z"
                )
                .unwrap_err()
                .code(),
                "DASHBOARD_INVALID"
            );
        }
    }
}
