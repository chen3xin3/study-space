use chrono::{DateTime, Duration};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::data::dashboard::models::StudyTimer;
use crate::data::dashboard::repository;
use crate::data::error::DataError;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartFocusInput {
    pub mode: String,
    pub subject: String,
    pub goal: String,
    pub work_seconds: i64,
    pub break_seconds: i64,
    pub long_break_seconds: i64,
    pub cycles_per_set: i64,
    pub long_break_after_cycles: i64,
    pub auto_start_break: bool,
    pub auto_start_work: bool,
    pub plan_id: Option<String>,
    pub preset_id: Option<String>,
    #[serde(default)]
    pub learning_item_id: Option<String>,
    #[serde(default)]
    pub daily_task_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusSession {
    pub timer: StudyTimer,
    pub mode: String,
    pub subject: String,
    pub goal: String,
    pub work_seconds: i64,
    pub break_seconds: i64,
    pub phase: String,
    pub phase_started_at: String,
    pub cycle_number: i64,
    pub cycle_start_seconds: i64,
    pub long_break_seconds: i64,
    pub cycles_per_set: i64,
    pub long_break_after_cycles: i64,
    pub auto_start_break: bool,
    pub auto_start_work: bool,
    pub plan_id: Option<String>,
    pub preset_id: Option<String>,
    pub learning_item_id: Option<String>,
    pub daily_task_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusPreset {
    pub id: String,
    pub name: String,
    pub mode: String,
    pub work_seconds: i64,
    pub short_break_seconds: i64,
    pub long_break_seconds: i64,
    pub cycles_per_set: i64,
    pub long_break_after_cycles: i64,
    pub auto_start_break: bool,
    pub auto_start_work: bool,
    pub created_at: String,
    pub updated_at: String,
    pub version: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFocusPresetInput {
    pub name: String,
    pub mode: String,
    pub work_seconds: i64,
    pub short_break_seconds: i64,
    pub long_break_seconds: i64,
    pub cycles_per_set: i64,
    pub long_break_after_cycles: i64,
    pub auto_start_break: bool,
    pub auto_start_work: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFocusPresetInput {
    pub id: String,
    pub version: i64,
    pub name: String,
    pub mode: String,
    pub work_seconds: i64,
    pub short_break_seconds: i64,
    pub long_break_seconds: i64,
    pub cycles_per_set: i64,
    pub long_break_after_cycles: i64,
    pub auto_start_break: bool,
    pub auto_start_work: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusHistoryItem {
    pub timer_id: String,
    pub started_at: String,
    pub ended_at: String,
    pub study_seconds: i64,
    pub mode: String,
    pub subject: String,
    pub goal: String,
    pub learning_item_id: Option<String>,
    pub daily_task_id: Option<String>,
}

fn valid_mode(value: &str) -> bool {
    matches!(value, "open" | "pomodoro")
}
fn valid_subject(value: &str) -> bool {
    matches!(
        value,
        "english" | "math" | "specialty" | "politics" | "other"
    )
}

fn valid_cycle_settings(
    mode: &str,
    work_seconds: i64,
    short_break_seconds: i64,
    long_break_seconds: i64,
    cycles_per_set: i64,
    long_break_after_cycles: i64,
) -> bool {
    valid_mode(mode)
        && (60..=14400).contains(&work_seconds)
        && (0..=3600).contains(&short_break_seconds)
        && (0..=7200).contains(&long_break_seconds)
        && (1..=12).contains(&cycles_per_set)
        && (1..=12).contains(&long_break_after_cycles)
        && long_break_after_cycles <= cycles_per_set
}

fn linked_record_exists(
    connection: &Connection,
    table: &str,
    id: Option<&str>,
) -> Result<bool, DataError> {
    let Some(id) = id else { return Ok(true) };
    let sql = match table {
        "focus_plans" => "SELECT EXISTS(SELECT 1 FROM focus_plans WHERE id=?1)",
        "focus_presets" => "SELECT EXISTS(SELECT 1 FROM focus_presets WHERE id=?1)",
        "daily_tasks" => "SELECT EXISTS(SELECT 1 FROM daily_tasks WHERE id=?1 AND deleted_at IS NULL)",
        _ => return Ok(false),
    };
    connection
        .query_row(sql, [id], |row| row.get::<_, bool>(0))
        .map_err(DataError::from)
}

pub fn start_focus(
    connection: &mut Connection,
    input: StartFocusInput,
    now: &str,
) -> Result<FocusSession, DataError> {
    if !valid_mode(&input.mode)
        || !valid_subject(&input.subject)
        || input.goal.chars().count() > 120
        || !valid_cycle_settings(
            &input.mode,
            input.work_seconds,
            input.break_seconds,
            input.long_break_seconds,
            input.cycles_per_set,
            input.long_break_after_cycles,
        )
    {
        return Err(DataError::dashboard_invalid("focus settings are invalid"));
    }
    if !linked_record_exists(connection, "focus_plans", input.plan_id.as_deref())?
        || !linked_record_exists(connection, "focus_presets", input.preset_id.as_deref())?
        || !linked_record_exists(connection, "daily_tasks", input.daily_task_id.as_deref())?
    {
        return Err(DataError::dashboard_not_found(
            "focus plan or preset not found",
        ));
    }
    let transaction = connection.transaction().map_err(DataError::from)?;
    let timer = repository::start_timer(&transaction, now)?;
    transaction
        .execute(
            "INSERT INTO focus_sessions (timer_id, mode, subject, goal, work_seconds,
         break_seconds, phase, phase_started_at, cycle_number, cycle_start_seconds,
         created_at, updated_at, long_break_seconds, cycles_per_set,
         long_break_after_cycles, auto_start_break, auto_start_work, plan_id, preset_id,
         learning_item_id, daily_task_id)
         VALUES (?1,?2,?3,?4,?5,?6,'work',?7,1,0,?7,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)",
            params![
                timer.id,
                input.mode,
                input.subject,
                input.goal.trim(),
                input.work_seconds,
                input.break_seconds,
                now,
                input.long_break_seconds,
                input.cycles_per_set,
                input.long_break_after_cycles,
                input.auto_start_break,
                input.auto_start_work,
                input.plan_id,
                input.preset_id,
                input.learning_item_id,
                input.daily_task_id,
            ],
        )
        .map_err(DataError::from)?;
    transaction.commit().map_err(DataError::from)?;
    Ok(FocusSession {
        timer,
        mode: input.mode,
        subject: input.subject,
        goal: input.goal.trim().into(),
        work_seconds: input.work_seconds,
        break_seconds: input.break_seconds,
        phase: "work".into(),
        phase_started_at: now.into(),
        cycle_number: 1,
        cycle_start_seconds: 0,
        long_break_seconds: input.long_break_seconds,
        cycles_per_set: input.cycles_per_set,
        long_break_after_cycles: input.long_break_after_cycles,
        auto_start_break: input.auto_start_break,
        auto_start_work: input.auto_start_work,
        plan_id: input.plan_id,
        preset_id: input.preset_id,
        learning_item_id: input.learning_item_id,
        daily_task_id: input.daily_task_id,
    })
}

pub fn get_active(connection: &Connection) -> Result<Option<FocusSession>, DataError> {
    let Some(timer) = repository::get_open_timer(connection)? else {
        return Ok(None);
    };
    let metadata = connection
        .query_row(
            "SELECT mode, subject, goal, work_seconds, break_seconds, phase,
                phase_started_at, cycle_number, cycle_start_seconds,
                long_break_seconds, cycles_per_set, long_break_after_cycles,
                auto_start_break, auto_start_work, plan_id, preset_id, learning_item_id, daily_task_id
         FROM focus_sessions WHERE timer_id=?1",
            [&timer.id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, i64>(8)?,
                    row.get::<_, i64>(9)?,
                    row.get::<_, i64>(10)?,
                    row.get::<_, i64>(11)?,
                    row.get::<_, bool>(12)?,
                    row.get::<_, bool>(13)?,
                    row.get::<_, Option<String>>(14)?,
                    row.get::<_, Option<String>>(15)?,
                    row.get::<_, Option<String>>(16)?,
                    row.get::<_, Option<String>>(17)?,
                ))
            },
        )
        .optional()
        .map_err(DataError::from)?;
    let (
        mode,
        subject,
        goal,
        work_seconds,
        break_seconds,
        phase,
        phase_started_at,
        cycle_number,
        cycle_start_seconds,
        long_break_seconds,
        cycles_per_set,
        long_break_after_cycles,
        auto_start_break,
        auto_start_work,
        plan_id,
        preset_id,
        learning_item_id,
        daily_task_id,
    ) = metadata.unwrap_or_else(|| {
        (
            "open".into(),
            "other".into(),
            "".into(),
            1500,
            0,
            "work".into(),
            timer.created_at.clone(),
            1,
            0,
            900,
            4,
            4,
            false,
            false,
            None,
            None,
            None,
            None,
        )
    });
    Ok(Some(FocusSession {
        timer,
        mode,
        subject,
        goal,
        work_seconds,
        break_seconds,
        phase,
        phase_started_at,
        cycle_number,
        cycle_start_seconds,
        long_break_seconds,
        cycles_per_set,
        long_break_after_cycles,
        auto_start_break,
        auto_start_work,
        plan_id,
        preset_id,
        learning_item_id,
        daily_task_id,
    }))
}

pub fn next_break_seconds(session: &FocusSession) -> i64 {
    if session.cycle_number % session.long_break_after_cycles == 0 {
        session.long_break_seconds
    } else {
        session.break_seconds
    }
}

pub fn settle_expired_work(connection: &mut Connection, now: &str) -> Result<(), DataError> {
    let Some(active) = get_active(connection)? else {
        return Ok(());
    };
    if active.mode != "pomodoro"
        || active.phase != "work"
        || active.timer.status != crate::data::dashboard::models::StudyTimerStatus::Running
    {
        return Ok(());
    }
    let started = active
        .timer
        .current_started_at
        .as_deref()
        .ok_or_else(|| DataError::dashboard_invalid("running focus has no start"))?;
    let started = DateTime::parse_from_rfc3339(started)
        .map_err(|error| DataError::dashboard_invalid(error.to_string()))?;
    let now = DateTime::parse_from_rfc3339(now)
        .map_err(|error| DataError::dashboard_invalid(error.to_string()))?;
    let already = i64::try_from(active.timer.accumulated_seconds)
        .map_err(|error| DataError::dashboard_invalid(error.to_string()))?
        - active.cycle_start_seconds;
    let remaining = (active.work_seconds - already).max(0);
    let deadline = started + Duration::seconds(remaining);
    if now < deadline {
        return Ok(());
    }
    let deadline_text = deadline.to_rfc3339();
    let paused = repository::pause_timer(
        connection,
        &active.timer.id,
        active.timer.version,
        &deadline_text,
    )?;
    set_phase(
        connection,
        &active.timer.id,
        "break",
        &deadline_text,
        active.cycle_number,
        i64::try_from(paused.accumulated_seconds)
            .map_err(|error| DataError::dashboard_invalid(error.to_string()))?,
    )
}

pub fn set_phase(
    connection: &Connection,
    timer_id: &str,
    phase: &str,
    now: &str,
    cycle_number: i64,
    cycle_start_seconds: i64,
) -> Result<(), DataError> {
    if !matches!(phase, "work" | "break") || cycle_number < 1 || cycle_start_seconds < 0 {
        return Err(DataError::dashboard_invalid("focus phase is invalid"));
    }
    let count = connection
        .execute(
            "UPDATE focus_sessions SET phase=?1, phase_started_at=?2, cycle_number=?3,
         cycle_start_seconds=?4, updated_at=?2 WHERE timer_id=?5",
            params![phase, now, cycle_number, cycle_start_seconds, timer_id],
        )
        .map_err(DataError::from)?;
    if count != 1 {
        return Err(DataError::dashboard_not_found("focus session not found"));
    }
    Ok(())
}

fn validate_preset(
    name: &str,
    mode: &str,
    work_seconds: i64,
    short_break_seconds: i64,
    long_break_seconds: i64,
    cycles_per_set: i64,
    long_break_after_cycles: i64,
) -> Result<(), DataError> {
    let name = name.trim();
    if name.is_empty()
        || name.chars().count() > 40
        || !valid_cycle_settings(
            mode,
            work_seconds,
            short_break_seconds,
            long_break_seconds,
            cycles_per_set,
            long_break_after_cycles,
        )
    {
        return Err(DataError::dashboard_invalid("focus preset is invalid"));
    }
    Ok(())
}

fn map_preset(row: &rusqlite::Row<'_>) -> rusqlite::Result<FocusPreset> {
    Ok(FocusPreset {
        id: row.get(0)?,
        name: row.get(1)?,
        mode: row.get(2)?,
        work_seconds: row.get(3)?,
        short_break_seconds: row.get(4)?,
        long_break_seconds: row.get(5)?,
        cycles_per_set: row.get(6)?,
        long_break_after_cycles: row.get(7)?,
        auto_start_break: row.get(8)?,
        auto_start_work: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        version: row.get(12)?,
    })
}

fn get_preset(connection: &Connection, id: &str) -> Result<FocusPreset, DataError> {
    connection
        .query_row(
            "SELECT id,name,mode,work_seconds,short_break_seconds,long_break_seconds,
                    cycles_per_set,long_break_after_cycles,auto_start_break,auto_start_work,
                    created_at,updated_at,version
             FROM focus_presets WHERE id=?1",
            [id],
            map_preset,
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                DataError::dashboard_not_found("focus preset not found")
            }
            other => DataError::from(other),
        })
}

pub fn list_presets(connection: &Connection) -> Result<Vec<FocusPreset>, DataError> {
    let mut statement = connection
        .prepare(
            "SELECT id,name,mode,work_seconds,short_break_seconds,long_break_seconds,
                    cycles_per_set,long_break_after_cycles,auto_start_break,auto_start_work,
                    created_at,updated_at,version
             FROM focus_presets
             ORDER BY id LIKE 'builtin-%' DESC, created_at, id",
        )
        .map_err(DataError::from)?;
    let presets = statement
        .query_map([], map_preset)
        .map_err(DataError::from)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(DataError::from)?;
    Ok(presets)
}

pub fn create_preset(
    connection: &Connection,
    input: CreateFocusPresetInput,
    now: &str,
) -> Result<FocusPreset, DataError> {
    validate_preset(
        &input.name,
        &input.mode,
        input.work_seconds,
        input.short_break_seconds,
        input.long_break_seconds,
        input.cycles_per_set,
        input.long_break_after_cycles,
    )?;
    let id = Uuid::new_v4().to_string();
    connection
        .execute(
            "INSERT INTO focus_presets
               (id,name,mode,work_seconds,short_break_seconds,long_break_seconds,
                cycles_per_set,long_break_after_cycles,auto_start_break,auto_start_work,
                created_at,updated_at,version)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11,1)",
            params![
                id,
                input.name.trim(),
                input.mode,
                input.work_seconds,
                input.short_break_seconds,
                input.long_break_seconds,
                input.cycles_per_set,
                input.long_break_after_cycles,
                input.auto_start_break,
                input.auto_start_work,
                now,
            ],
        )
        .map_err(DataError::from)?;
    get_preset(connection, &id)
}

pub fn update_preset(
    connection: &Connection,
    input: UpdateFocusPresetInput,
    now: &str,
) -> Result<FocusPreset, DataError> {
    if input.id.starts_with("builtin-") {
        return Err(DataError::dashboard_invalid(
            "built-in focus presets cannot be edited",
        ));
    }
    validate_preset(
        &input.name,
        &input.mode,
        input.work_seconds,
        input.short_break_seconds,
        input.long_break_seconds,
        input.cycles_per_set,
        input.long_break_after_cycles,
    )?;
    let changed = connection
        .execute(
            "UPDATE focus_presets
             SET name=?1,mode=?2,work_seconds=?3,short_break_seconds=?4,
                 long_break_seconds=?5,cycles_per_set=?6,long_break_after_cycles=?7,
                 auto_start_break=?8,auto_start_work=?9,updated_at=?10,version=version+1
             WHERE id=?11 AND version=?12",
            params![
                input.name.trim(),
                input.mode,
                input.work_seconds,
                input.short_break_seconds,
                input.long_break_seconds,
                input.cycles_per_set,
                input.long_break_after_cycles,
                input.auto_start_break,
                input.auto_start_work,
                now,
                input.id,
                input.version,
            ],
        )
        .map_err(DataError::from)?;
    if changed != 1 {
        return Err(DataError::dashboard_conflict("focus preset changed"));
    }
    get_preset(connection, &input.id)
}

pub fn delete_preset(connection: &Connection, id: &str, version: i64) -> Result<(), DataError> {
    if id.starts_with("builtin-") {
        return Err(DataError::dashboard_invalid(
            "built-in focus presets cannot be deleted",
        ));
    }
    let changed = connection
        .execute(
            "DELETE FROM focus_presets WHERE id=?1 AND version=?2",
            params![id, version],
        )
        .map_err(DataError::from)?;
    if changed != 1 {
        return Err(DataError::dashboard_conflict("focus preset changed"));
    }
    Ok(())
}

pub fn list_history(
    connection: &Connection,
    limit: usize,
) -> Result<Vec<FocusHistoryItem>, DataError> {
    list_history_page(connection, limit, 0)
}

pub fn list_history_page(
    connection: &Connection,
    limit: usize,
    offset: usize,
) -> Result<Vec<FocusHistoryItem>, DataError> {
    let mut statement = connection
        .prepare(
            "SELECT t.id, t.created_at, t.ended_at, t.accumulated_seconds,
                coalesce(f.mode,'open'), coalesce(f.subject,'other'), coalesce(f.goal,''),
                f.learning_item_id, f.daily_task_id
         FROM study_timers t LEFT JOIN focus_sessions f ON f.timer_id=t.id
         WHERE t.status='completed' AND t.ended_at IS NOT NULL
         ORDER BY t.ended_at DESC, t.id DESC LIMIT ?1 OFFSET ?2",
        )
        .map_err(DataError::from)?;
    let history = statement
        .query_map(
            params![limit.clamp(1, 50) as i64, offset.min(100_000) as i64],
            |row| {
                Ok(FocusHistoryItem {
                    timer_id: row.get(0)?,
                    started_at: row.get(1)?,
                    ended_at: row.get(2)?,
                    study_seconds: row.get(3)?,
                    mode: row.get(4)?,
                    subject: row.get(5)?,
                    goal: row.get(6)?,
                    learning_item_id: row.get(7)?,
                    daily_task_id: row.get(8)?,
                })
            },
        )
        .map_err(DataError::from)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(DataError::from)?;
    Ok(history)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::dashboard::repository;
    use crate::data::migrations::migrate;

    #[test]
    fn focus_session_reuses_the_single_study_timer_and_has_history() {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        migrate(&mut connection).unwrap();
        let started = start_focus(
            &mut connection,
            StartFocusInput {
                mode: "pomodoro".into(),
                subject: "english".into(),
                goal: "背单词".into(),
                work_seconds: 1500,
                break_seconds: 300,
                long_break_seconds: 900,
                cycles_per_set: 4,
                long_break_after_cycles: 4,
                auto_start_break: false,
                auto_start_work: false,
                plan_id: None,
                preset_id: Some("builtin-25-5".into()),
                learning_item_id: None,
                daily_task_id: None,
            },
            "2026-09-30T01:00:00Z",
        )
        .unwrap();
        assert_eq!(
            started.timer.status,
            crate::data::dashboard::models::StudyTimerStatus::Running
        );
        assert!(start_focus(
            &mut connection,
            StartFocusInput {
                mode: "open".into(),
                subject: "other".into(),
                goal: "".into(),
                work_seconds: 1500,
                break_seconds: 0,
                long_break_seconds: 0,
                cycles_per_set: 1,
                long_break_after_cycles: 1,
                auto_start_break: false,
                auto_start_work: false,
                plan_id: None,
                preset_id: None,
                learning_item_id: None,
                daily_task_id: None,
            },
            "2026-09-30T01:01:00Z"
        )
        .is_err());
        let paused = repository::pause_timer(
            &mut connection,
            &started.timer.id,
            started.timer.version,
            "2026-09-30T01:25:00Z",
        )
        .unwrap();
        set_phase(
            &connection,
            &started.timer.id,
            "break",
            "2026-09-30T01:25:00Z",
            1,
            1500,
        )
        .unwrap();
        repository::end_timer(
            &mut connection,
            &paused.id,
            paused.version,
            "2026-09-30T01:30:00Z",
        )
        .unwrap();
        let history = list_history(&connection, 20).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].study_seconds, 1500);
        assert_eq!(history[0].subject, "english");
    }
    #[test]
    fn pomodoro_deadline_stops_study_seconds_even_when_checked_late() {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        migrate(&mut connection).unwrap();
        start_focus(
            &mut connection,
            StartFocusInput {
                mode: "pomodoro".into(),
                subject: "english".into(),
                goal: "阅读".into(),
                work_seconds: 1500,
                break_seconds: 300,
                long_break_seconds: 900,
                cycles_per_set: 4,
                long_break_after_cycles: 4,
                auto_start_break: false,
                auto_start_work: false,
                plan_id: None,
                preset_id: Some("builtin-25-5".into()),
                learning_item_id: None,
                daily_task_id: None,
            },
            "2026-09-30T01:00:00Z",
        )
        .unwrap();
        settle_expired_work(&mut connection, "2026-09-30T02:00:00Z").unwrap();
        let active = get_active(&connection).unwrap().unwrap();
        assert_eq!(active.phase, "break");
        assert_eq!(active.timer.accumulated_seconds, 1500);
        assert_eq!(
            active.timer.status,
            crate::data::dashboard::models::StudyTimerStatus::Paused
        );
    }

    #[test]
    fn custom_cycle_configuration_survives_active_session_reload() {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        migrate(&mut connection).unwrap();

        let started = start_focus(
            &mut connection,
            StartFocusInput {
                mode: "pomodoro".into(),
                subject: "math".into(),
                goal: "完成高数例题".into(),
                work_seconds: 5400,
                break_seconds: 600,
                long_break_seconds: 1800,
                cycles_per_set: 3,
                long_break_after_cycles: 3,
                auto_start_break: true,
                auto_start_work: true,
                plan_id: None,
                preset_id: Some("builtin-90-20".into()),
                learning_item_id: None,
                daily_task_id: None,
            },
            "2026-10-02T01:00:00Z",
        )
        .unwrap();

        let restored = get_active(&connection).unwrap().unwrap();
        assert_eq!(restored.timer.id, started.timer.id);
        assert_eq!(restored.long_break_seconds, 1800);
        assert_eq!(restored.cycles_per_set, 3);
        assert_eq!(restored.long_break_after_cycles, 3);
        assert!(restored.auto_start_break);
        assert!(restored.auto_start_work);
        assert_eq!(restored.preset_id.as_deref(), Some("builtin-90-20"));
        assert_eq!(next_break_seconds(&restored), 600);
        set_phase(
            &connection,
            &restored.timer.id,
            "work",
            "2026-10-02T02:00:00Z",
            3,
            0,
        )
        .unwrap();
        let third_cycle = get_active(&connection).unwrap().unwrap();
        assert_eq!(next_break_seconds(&third_cycle), 1800);
    }

    #[test]
    fn rejects_out_of_range_cycles_and_missing_links() {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        let invalid = StartFocusInput {
            mode: "pomodoro".into(),
            subject: "english".into(),
            goal: "阅读".into(),
            work_seconds: 1500,
            break_seconds: 300,
            long_break_seconds: 900,
            cycles_per_set: 13,
            long_break_after_cycles: 4,
            auto_start_break: false,
            auto_start_work: false,
            plan_id: None,
            preset_id: None,
            learning_item_id: None,
            daily_task_id: None,
        };
        assert_eq!(
            start_focus(&mut connection, invalid, "2026-10-02T01:00:00Z")
                .unwrap_err()
                .code(),
            "DASHBOARD_INVALID"
        );

        let missing_link = StartFocusInput {
            mode: "pomodoro".into(),
            subject: "english".into(),
            goal: "阅读".into(),
            work_seconds: 1500,
            break_seconds: 300,
            long_break_seconds: 900,
            cycles_per_set: 4,
            long_break_after_cycles: 4,
            auto_start_break: false,
            auto_start_work: false,
            plan_id: Some("missing-plan".into()),
            preset_id: None,
            learning_item_id: None,
            daily_task_id: None,
        };
        assert_eq!(
            start_focus(&mut connection, missing_link, "2026-10-02T01:00:00Z")
                .unwrap_err()
                .code(),
            "DASHBOARD_NOT_FOUND"
        );
    }

    #[test]
    fn lists_builtin_presets_and_manages_custom_presets() {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        let builtins = list_presets(&connection).unwrap();
        assert_eq!(
            builtins
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["builtin-25-5", "builtin-50-10", "builtin-90-20"]
        );

        let created = create_preset(
            &connection,
            CreateFocusPresetInput {
                name: "冲刺方案".into(),
                mode: "pomodoro".into(),
                work_seconds: 3600,
                short_break_seconds: 600,
                long_break_seconds: 1800,
                cycles_per_set: 3,
                long_break_after_cycles: 3,
                auto_start_break: true,
                auto_start_work: false,
            },
            "2026-10-02T01:00:00Z",
        )
        .unwrap();
        let updated = update_preset(
            &connection,
            UpdateFocusPresetInput {
                id: created.id.clone(),
                version: created.version,
                name: "冲刺方案 2".into(),
                mode: "pomodoro".into(),
                work_seconds: 4200,
                short_break_seconds: 600,
                long_break_seconds: 1800,
                cycles_per_set: 3,
                long_break_after_cycles: 3,
                auto_start_break: true,
                auto_start_work: true,
            },
            "2026-10-02T01:01:00Z",
        )
        .unwrap();
        assert_eq!(updated.name, "冲刺方案 2");
        assert!(updated.auto_start_work);
        delete_preset(&connection, &updated.id, updated.version).unwrap();
        assert_eq!(list_presets(&connection).unwrap().len(), 3);
        assert_eq!(
            delete_preset(&connection, "builtin-25-5", 1)
                .unwrap_err()
                .code(),
            "DASHBOARD_INVALID"
        );
    }
}
