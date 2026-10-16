use chrono::DateTime;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::data::dashboard::models::{StudyTimer, StudyTimerStatus};
use crate::data::dashboard::repository;
use crate::data::error::DataError;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusInterruption {
    pub id: String,
    pub timer_id: String,
    pub reason: String,
    pub note: String,
    pub elapsed_seconds: i64,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddInterruptionInput {
    pub timer_id: String,
    pub reason: String,
    pub note: String,
    pub elapsed_seconds: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusReview {
    pub timer_id: String,
    pub plan_completed: bool,
    pub completed_cycles: i64,
    pub focus_rating: i64,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteFocusReviewInput {
    pub timer_id: String,
    pub timer_version: i64,
    pub plan_completed: bool,
    pub completed_cycles: i64,
    pub focus_rating: i64,
    pub note: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusSessionDetail {
    pub timer: StudyTimer,
    pub review: FocusReview,
    pub interruptions: Vec<FocusInterruption>,
}

fn valid_reason(value: &str) -> bool {
    matches!(
        value,
        "phone" | "urgent" | "environment" | "physical" | "other"
    )
}

fn map_interruption(row: &rusqlite::Row<'_>) -> rusqlite::Result<FocusInterruption> {
    Ok(FocusInterruption {
        id: row.get(0)?,
        timer_id: row.get(1)?,
        reason: row.get(2)?,
        note: row.get(3)?,
        elapsed_seconds: row.get(4)?,
        created_at: row.get(5)?,
    })
}

fn list_interruptions_from(
    connection: &Connection,
    timer_id: &str,
) -> Result<Vec<FocusInterruption>, DataError> {
    let mut statement = connection
        .prepare(
            "SELECT id,timer_id,reason,note,elapsed_seconds,created_at
             FROM focus_interruptions WHERE timer_id=?1 ORDER BY created_at,id",
        )
        .map_err(DataError::from)?;
    let interruptions = statement
        .query_map([timer_id], map_interruption)
        .map_err(DataError::from)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(DataError::from)?;
    Ok(interruptions)
}

pub fn add_interruption(
    connection: &Connection,
    input: AddInterruptionInput,
    now: &str,
) -> Result<FocusInterruption, DataError> {
    if !valid_reason(&input.reason) || input.note.chars().count() > 120 || input.elapsed_seconds < 0
    {
        return Err(DataError::dashboard_invalid(
            "focus interruption is invalid",
        ));
    }
    let active: bool = connection
        .query_row(
            "SELECT EXISTS(
               SELECT 1 FROM focus_sessions f JOIN study_timers t ON t.id=f.timer_id
               WHERE f.timer_id=?1 AND t.status IN ('running','paused')
             )",
            [&input.timer_id],
            |row| row.get(0),
        )
        .map_err(DataError::from)?;
    if !active {
        return Err(DataError::dashboard_not_found(
            "active focus session not found",
        ));
    }
    let interruption = FocusInterruption {
        id: Uuid::new_v4().to_string(),
        timer_id: input.timer_id,
        reason: input.reason,
        note: input.note.trim().into(),
        elapsed_seconds: input.elapsed_seconds,
        created_at: now.into(),
    };
    connection
        .execute(
            "INSERT INTO focus_interruptions
               (id,timer_id,reason,note,elapsed_seconds,created_at)
             VALUES (?1,?2,?3,?4,?5,?6)",
            params![
                interruption.id,
                interruption.timer_id,
                interruption.reason,
                interruption.note,
                interruption.elapsed_seconds,
                interruption.created_at,
            ],
        )
        .map_err(DataError::from)?;
    Ok(interruption)
}

pub fn list_interruptions(
    connection: &Connection,
    timer_id: &str,
) -> Result<Vec<FocusInterruption>, DataError> {
    list_interruptions_from(connection, timer_id)
}

pub fn get_session_detail(
    connection: &Connection,
    timer_id: &str,
) -> Result<FocusSessionDetail, DataError> {
    let timer = repository::get_timer(connection, timer_id)?;
    let review = connection
        .query_row(
            "SELECT timer_id,plan_completed,completed_cycles,focus_rating,note,created_at
             FROM focus_reviews WHERE timer_id=?1",
            [timer_id],
            |row| {
                Ok(FocusReview {
                    timer_id: row.get(0)?,
                    plan_completed: row.get(1)?,
                    completed_cycles: row.get(2)?,
                    focus_rating: row.get(3)?,
                    note: row.get(4)?,
                    created_at: row.get(5)?,
                })
            },
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                DataError::dashboard_not_found("focus review not found")
            }
            other => DataError::from(other),
        })?;
    let interruptions = list_interruptions_from(connection, timer_id)?;
    Ok(FocusSessionDetail {
        timer,
        review,
        interruptions,
    })
}

fn complete_timer_in_transaction(
    connection: &Connection,
    timer_id: &str,
    timer_version: i64,
    now: &str,
) -> Result<StudyTimer, DataError> {
    let current = repository::get_timer(connection, timer_id)?;
    if current.version != timer_version {
        return Err(DataError::dashboard_conflict("timer version conflict"));
    }
    match current.status {
        StudyTimerStatus::Completed => {
            return Err(DataError::dashboard_invalid("timer already ended"));
        }
        StudyTimerStatus::Paused => {
            let changed = connection
                .execute(
                    "UPDATE study_timers
                     SET status='completed',ended_at=?1,updated_at=?1,version=version+1
                     WHERE id=?2 AND version=?3 AND status='paused'",
                    params![now, timer_id, timer_version],
                )
                .map_err(DataError::from)?;
            if changed != 1 {
                return Err(DataError::dashboard_conflict("timer changed before review"));
            }
        }
        StudyTimerStatus::Running => {
            let started_at = current
                .current_started_at
                .as_deref()
                .ok_or_else(|| DataError::dashboard_invalid("running timer has no start"))?;
            let started = DateTime::parse_from_rfc3339(started_at)
                .map_err(|error| DataError::dashboard_invalid(error.to_string()))?;
            let ended = DateTime::parse_from_rfc3339(now)
                .map_err(|error| DataError::dashboard_invalid(error.to_string()))?;
            let duration = (ended - started).num_seconds();
            if duration < 0 {
                return Err(DataError::dashboard_invalid(
                    "review time precedes timer start",
                ));
            }
            connection
                .execute(
                    "INSERT INTO study_timer_segments
                       (id,timer_id,started_at,ended_at,duration_seconds,created_at)
                     VALUES (?1,?2,?3,?4,?5,?4)",
                    params![
                        Uuid::new_v4().to_string(),
                        timer_id,
                        started_at,
                        now,
                        duration
                    ],
                )
                .map_err(DataError::from)?;
            let changed = connection
                .execute(
                    "UPDATE study_timers
                     SET status='completed',current_started_at=NULL,
                         accumulated_seconds=accumulated_seconds+?1,
                         ended_at=?2,updated_at=?2,version=version+1
                     WHERE id=?3 AND version=?4 AND status='running'",
                    params![duration, now, timer_id, timer_version],
                )
                .map_err(DataError::from)?;
            if changed != 1 {
                return Err(DataError::dashboard_conflict("timer changed before review"));
            }
        }
    }
    repository::get_timer(connection, timer_id)
}

pub fn complete_with_review(
    connection: &mut Connection,
    input: CompleteFocusReviewInput,
    now: &str,
) -> Result<FocusSessionDetail, DataError> {
    if !(1..=5).contains(&input.focus_rating)
        || !(0..=24).contains(&input.completed_cycles)
        || input.note.chars().count() > 300
    {
        return Err(DataError::dashboard_invalid("focus review is invalid"));
    }
    let transaction = connection.transaction().map_err(DataError::from)?;
    let timer =
        complete_timer_in_transaction(&transaction, &input.timer_id, input.timer_version, now)?;
    let review = FocusReview {
        timer_id: input.timer_id.clone(),
        plan_completed: input.plan_completed,
        completed_cycles: input.completed_cycles,
        focus_rating: input.focus_rating,
        note: input.note.trim().into(),
        created_at: now.into(),
    };
    transaction
        .execute(
            "INSERT INTO focus_reviews
               (timer_id,plan_completed,completed_cycles,focus_rating,note,created_at)
             VALUES (?1,?2,?3,?4,?5,?6)",
            params![
                review.timer_id,
                review.plan_completed,
                review.completed_cycles,
                review.focus_rating,
                review.note,
                review.created_at,
            ],
        )
        .map_err(DataError::from)?;
    let (plan_id, daily_task_id): (Option<String>, Option<String>) = transaction
        .query_row(
            "SELECT plan_id,daily_task_id FROM focus_sessions WHERE timer_id=?1",
            [&input.timer_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(DataError::from)?;
    if let Some(plan_id) = plan_id {
        transaction
            .execute(
                "UPDATE focus_plans
                 SET completed_cycles=completed_cycles+?1,
                     completed_at=CASE WHEN ?2 THEN COALESCE(completed_at,?3) ELSE completed_at END,
                     updated_at=?3,version=version+1
                 WHERE id=?4",
                params![input.completed_cycles, input.plan_completed, now, plan_id],
            )
            .map_err(DataError::from)?;
    }
    if input.plan_completed {
        if let Some(daily_task_id) = daily_task_id {
            transaction
                .execute(
                    "UPDATE daily_tasks
                     SET completed_at=?1,updated_at=?1,version=version+1
                     WHERE id=?2 AND completed_at IS NULL AND deleted_at IS NULL",
                    params![now, daily_task_id],
                )
                .map_err(DataError::from)?;
        }
    }
    let changed = transaction
        .execute(
            "UPDATE focus_sessions SET phase='finished',updated_at=?1 WHERE timer_id=?2",
            params![now, input.timer_id],
        )
        .map_err(DataError::from)?;
    if changed != 1 {
        return Err(DataError::dashboard_not_found("focus session not found"));
    }
    let interruptions = list_interruptions_from(&transaction, &input.timer_id)?;
    transaction.commit().map_err(DataError::from)?;
    Ok(FocusSessionDetail {
        timer,
        review,
        interruptions,
    })
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::*;
    use crate::data::dashboard::models::{CreateDailyTaskInput, StudyTimerStatus};
    use crate::data::dashboard::repository;
    use crate::data::focus::{self, StartFocusInput};
    use crate::data::focus_plans::{self, CreateFocusPlanInput};
    use crate::data::migrations::migrate;

    fn database() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        migrate(&mut connection).unwrap();
        connection
    }

    fn start_linked(connection: &mut Connection) -> (String, i64, String) {
        let plan = focus_plans::create(
            connection,
            CreateFocusPlanInput {
                local_date: "2026-10-02".into(),
                title: "英语精读".into(),
                subject: "english".into(),
                estimated_cycles: 2,
                repeat_rule: "none".into(),
                linked_daily_task_id: None,
                learning_item_id: None,
            },
            "2026-10-02T00:55:00Z",
        )
        .unwrap();
        let session = focus::start_focus(
            connection,
            StartFocusInput {
                mode: "pomodoro".into(),
                subject: "english".into(),
                goal: "英语精读".into(),
                work_seconds: 1500,
                break_seconds: 300,
                long_break_seconds: 900,
                cycles_per_set: 4,
                long_break_after_cycles: 4,
                auto_start_break: false,
                auto_start_work: false,
                plan_id: Some(plan.id.clone()),
                preset_id: Some("builtin-25-5".into()),
                learning_item_id: None,
                daily_task_id: None,
            },
            "2026-10-02T01:00:00Z",
        )
        .unwrap();
        (session.timer.id, session.timer.version, plan.id)
    }

    #[test]
    fn records_interruptions_in_time_order() {
        let mut connection = database();
        let (timer_id, _, _) = start_linked(&mut connection);
        let first = add_interruption(
            &connection,
            AddInterruptionInput {
                timer_id: timer_id.clone(),
                reason: "phone".into(),
                note: "看了一眼消息".into(),
                elapsed_seconds: 300,
            },
            "2026-10-02T01:05:00Z",
        )
        .unwrap();
        add_interruption(
            &connection,
            AddInterruptionInput {
                timer_id: timer_id.clone(),
                reason: "environment".into(),
                note: "室外施工".into(),
                elapsed_seconds: 600,
            },
            "2026-10-02T01:10:00Z",
        )
        .unwrap();

        let interruptions = list_interruptions(&connection, &timer_id).unwrap();
        assert_eq!(interruptions.len(), 2);
        assert_eq!(interruptions[0].id, first.id);
        assert_eq!(interruptions[1].reason, "environment");
        assert_eq!(interruptions[1].elapsed_seconds, 600);
    }

    #[test]
    fn review_completion_ends_timer_and_updates_plan_in_one_result() {
        let mut connection = database();
        let (timer_id, timer_version, plan_id) = start_linked(&mut connection);
        add_interruption(
            &connection,
            AddInterruptionInput {
                timer_id: timer_id.clone(),
                reason: "phone".into(),
                note: "".into(),
                elapsed_seconds: 600,
            },
            "2026-10-02T01:10:00Z",
        )
        .unwrap();

        let detail = complete_with_review(
            &mut connection,
            CompleteFocusReviewInput {
                timer_id: timer_id.clone(),
                timer_version,
                plan_completed: true,
                completed_cycles: 1,
                focus_rating: 4,
                note: "阅读完成".into(),
            },
            "2026-10-02T01:25:00Z",
        )
        .unwrap();

        assert_eq!(detail.timer.status, StudyTimerStatus::Completed);
        assert_eq!(detail.timer.accumulated_seconds, 1500);
        assert_eq!(detail.review.focus_rating, 4);
        assert_eq!(detail.interruptions.len(), 1);
        let restored = get_session_detail(&connection, &timer_id).unwrap();
        assert_eq!(restored.review.note, "阅读完成");
        assert_eq!(restored.interruptions.len(), 1);
        let plan = connection
            .query_row(
                "SELECT completed_cycles,completed_at FROM focus_plans WHERE id=?1",
                [&plan_id],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .unwrap();
        assert_eq!(plan.0, 1);
        assert!(plan.1.is_some());
        let phase: String = connection
            .query_row(
                "SELECT phase FROM focus_sessions WHERE timer_id=?1",
                [&timer_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(phase, "finished");
    }

    #[test]
    fn completed_review_marks_the_linked_daily_task_done() {
        let mut connection = database();
        let task = repository::create_task(
            &mut connection,
            CreateDailyTaskInput {
                local_date: "2026-10-02".into(),
                title: "重做英语错题".into(),
                learning_item_id: None,
            },
            "2026-10-02T00:50:00Z",
        )
        .unwrap();
        let session = focus::start_focus(
            &mut connection,
            StartFocusInput {
                mode: "pomodoro".into(),
                subject: "english".into(),
                goal: "重做英语错题".into(),
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
                daily_task_id: Some(task.id.clone()),
            },
            "2026-10-02T01:00:00Z",
        )
        .unwrap();

        complete_with_review(
            &mut connection,
            CompleteFocusReviewInput {
                timer_id: session.timer.id,
                timer_version: session.timer.version,
                plan_completed: true,
                completed_cycles: 1,
                focus_rating: 4,
                note: "完成".into(),
            },
            "2026-10-02T01:25:00Z",
        )
        .unwrap();

        let completed_at: Option<String> = connection
            .query_row(
                "SELECT completed_at FROM daily_tasks WHERE id=?1",
                [&task.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(completed_at.as_deref(), Some("2026-10-02T01:25:00Z"));
    }

    #[test]
    fn review_failure_rolls_back_timer_and_plan_changes() {
        let mut connection = database();
        let (timer_id, timer_version, plan_id) = start_linked(&mut connection);
        connection
            .execute(
                "INSERT INTO focus_reviews
               (timer_id,plan_completed,completed_cycles,focus_rating,note,created_at)
             VALUES (?1,0,0,3,'existing','2026-10-02T01:01:00Z')",
                [&timer_id],
            )
            .unwrap();

        assert!(complete_with_review(
            &mut connection,
            CompleteFocusReviewInput {
                timer_id: timer_id.clone(),
                timer_version,
                plan_completed: true,
                completed_cycles: 1,
                focus_rating: 5,
                note: "should fail".into(),
            },
            "2026-10-02T01:25:00Z"
        )
        .is_err());

        assert_eq!(
            repository::get_timer(&connection, &timer_id)
                .unwrap()
                .status,
            StudyTimerStatus::Running
        );
        let cycles: i64 = connection
            .query_row(
                "SELECT completed_cycles FROM focus_plans WHERE id=?1",
                [&plan_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(cycles, 0);
    }

    #[test]
    fn validates_interruption_and_review_fields() {
        let mut connection = database();
        let (timer_id, timer_version, _) = start_linked(&mut connection);
        assert_eq!(
            add_interruption(
                &connection,
                AddInterruptionInput {
                    timer_id: timer_id.clone(),
                    reason: "unknown".into(),
                    note: "".into(),
                    elapsed_seconds: 0,
                },
                "2026-10-02T01:01:00Z"
            )
            .unwrap_err()
            .code(),
            "DASHBOARD_INVALID"
        );
        assert_eq!(
            complete_with_review(
                &mut connection,
                CompleteFocusReviewInput {
                    timer_id,
                    timer_version,
                    plan_completed: false,
                    completed_cycles: 0,
                    focus_rating: 6,
                    note: "".into(),
                },
                "2026-10-02T01:02:00Z"
            )
            .unwrap_err()
            .code(),
            "DASHBOARD_INVALID"
        );
    }
}
