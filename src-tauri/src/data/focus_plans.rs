use std::collections::HashSet;

use chrono::{Datelike, NaiveDate, Weekday};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::data::error::DataError;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusPlan {
    pub id: String,
    pub local_date: String,
    pub title: String,
    pub subject: String,
    pub estimated_cycles: i64,
    pub completed_cycles: i64,
    pub repeat_rule: String,
    pub linked_daily_task_id: Option<String>,
    pub learning_item_id: Option<String>,
    pub completed_at: Option<String>,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
    pub version: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFocusPlanInput {
    pub local_date: String,
    pub title: String,
    pub subject: String,
    pub estimated_cycles: i64,
    pub repeat_rule: String,
    pub linked_daily_task_id: Option<String>,
    #[serde(default)]
    pub learning_item_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFocusPlanInput {
    pub id: String,
    pub version: i64,
    pub local_date: String,
    pub title: String,
    pub subject: String,
    pub estimated_cycles: i64,
    pub repeat_rule: String,
    pub linked_daily_task_id: Option<String>,
    #[serde(default)]
    pub learning_item_id: Option<String>,
}

fn valid_subject(value: &str) -> bool {
    matches!(
        value,
        "english" | "math" | "specialty" | "politics" | "other"
    )
}

fn valid_repeat_rule(value: &str) -> bool {
    matches!(value, "none" | "daily" | "weekdays" | "weekly")
}

fn parse_date(value: &str) -> Result<NaiveDate, DataError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|error| DataError::dashboard_invalid(error.to_string()))
}

fn validate_fields(
    local_date: &str,
    title: &str,
    subject: &str,
    estimated_cycles: i64,
    repeat_rule: &str,
) -> Result<(), DataError> {
    parse_date(local_date)?;
    let title = title.trim();
    if title.is_empty()
        || title.chars().count() > 80
        || !valid_subject(subject)
        || !(1..=24).contains(&estimated_cycles)
        || !valid_repeat_rule(repeat_rule)
    {
        return Err(DataError::dashboard_invalid("focus plan is invalid"));
    }
    Ok(())
}

fn map_plan(row: &rusqlite::Row<'_>) -> rusqlite::Result<FocusPlan> {
    Ok(FocusPlan {
        id: row.get(0)?,
        local_date: row.get(1)?,
        title: row.get(2)?,
        subject: row.get(3)?,
        estimated_cycles: row.get(4)?,
        completed_cycles: row.get(5)?,
        repeat_rule: row.get(6)?,
        linked_daily_task_id: row.get(7)?,
        learning_item_id: row.get(8)?,
        completed_at: row.get(9)?,
        position: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        version: row.get(13)?,
    })
}

fn get(connection: &Connection, id: &str) -> Result<FocusPlan, DataError> {
    connection
        .query_row(
            "SELECT id,local_date,title,subject,estimated_cycles,completed_cycles,
                    repeat_rule,linked_daily_task_id,learning_item_id,completed_at,position,
                    created_at,updated_at,version
             FROM focus_plans WHERE id=?1",
            [id],
            map_plan,
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                DataError::dashboard_not_found("focus plan not found")
            }
            other => DataError::from(other),
        })
}

fn read_day(connection: &Connection, local_date: &str) -> Result<Vec<FocusPlan>, DataError> {
    let mut statement = connection
        .prepare(
            "SELECT id,local_date,title,subject,estimated_cycles,completed_cycles,
                    repeat_rule,linked_daily_task_id,learning_item_id,completed_at,position,
                    created_at,updated_at,version
             FROM focus_plans WHERE local_date=?1 ORDER BY position,created_at,id",
        )
        .map_err(DataError::from)?;
    let plans = statement
        .query_map([local_date], map_plan)
        .map_err(DataError::from)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(DataError::from)?;
    Ok(plans)
}

pub fn create(
    connection: &Connection,
    input: CreateFocusPlanInput,
    now: &str,
) -> Result<FocusPlan, DataError> {
    validate_fields(
        &input.local_date,
        &input.title,
        &input.subject,
        input.estimated_cycles,
        &input.repeat_rule,
    )?;
    let id = Uuid::new_v4().to_string();
    let position: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(position)+1,0) FROM focus_plans WHERE local_date=?1",
            [&input.local_date],
            |row| row.get(0),
        )
        .map_err(DataError::from)?;
    connection
        .execute(
            "INSERT INTO focus_plans
               (id,local_date,title,subject,estimated_cycles,completed_cycles,
                repeat_rule,linked_daily_task_id,learning_item_id,position,created_at,updated_at,version)
             VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,?9,?10,?10,1)",
            params![
                id,
                input.local_date,
                input.title.trim(),
                input.subject,
                input.estimated_cycles,
                input.repeat_rule,
                input.linked_daily_task_id,
                input.learning_item_id,
                position,
                now
            ],
        )
        .map_err(DataError::from)?;
    get(connection, &id)
}

pub fn update(
    connection: &Connection,
    input: UpdateFocusPlanInput,
    now: &str,
) -> Result<FocusPlan, DataError> {
    validate_fields(
        &input.local_date,
        &input.title,
        &input.subject,
        input.estimated_cycles,
        &input.repeat_rule,
    )?;
    let count = connection
        .execute(
            "UPDATE focus_plans
             SET local_date=?1,title=?2,subject=?3,estimated_cycles=?4,
                 repeat_rule=?5,linked_daily_task_id=?6,learning_item_id=?7,updated_at=?8,version=version+1
             WHERE id=?9 AND version=?10",
            params![
                input.local_date,
                input.title.trim(),
                input.subject,
                input.estimated_cycles,
                input.repeat_rule,
                input.linked_daily_task_id,
                input.learning_item_id,
                now,
                input.id,
                input.version
            ],
        )
        .map_err(DataError::from)?;
    if count != 1 {
        return Err(DataError::dashboard_conflict("focus plan changed"));
    }
    get(connection, &input.id)
}

pub fn set_completed(
    connection: &Connection,
    id: &str,
    version: i64,
    completed: bool,
    now: &str,
) -> Result<FocusPlan, DataError> {
    let completed_at = completed.then_some(now);
    let count = connection
        .execute(
            "UPDATE focus_plans
             SET completed_at=?1,updated_at=?2,version=version+1
             WHERE id=?3 AND version=?4",
            params![completed_at, now, id, version],
        )
        .map_err(DataError::from)?;
    if count != 1 {
        return Err(DataError::dashboard_conflict("focus plan changed"));
    }
    get(connection, id)
}

pub fn remove(connection: &Connection, id: &str, version: i64) -> Result<(), DataError> {
    let count = connection
        .execute(
            "DELETE FROM focus_plans WHERE id=?1 AND version=?2",
            params![id, version],
        )
        .map_err(DataError::from)?;
    if count != 1 {
        return Err(DataError::dashboard_conflict("focus plan changed"));
    }
    Ok(())
}

fn repeat_is_due(rule: &str, source_date: NaiveDate, target_date: NaiveDate) -> bool {
    match rule {
        "daily" => true,
        "weekdays" => !matches!(target_date.weekday(), Weekday::Sat | Weekday::Sun),
        "weekly" => source_date.weekday() == target_date.weekday(),
        _ => false,
    }
}

fn generate_repeating_plans(
    connection: &mut Connection,
    local_date: &str,
    now: &str,
) -> Result<(), DataError> {
    let target_date = parse_date(local_date)?;
    let sources = {
        let mut statement = connection
            .prepare(
                "SELECT id,local_date,title,subject,estimated_cycles,repeat_rule,linked_daily_task_id
                 FROM focus_plans
                 WHERE local_date < ?1 AND repeat_rule <> 'none' AND id NOT LIKE 'repeat:%'
                 ORDER BY local_date,id",
            )
            .map_err(DataError::from)?;
        let plans = statement
            .query_map([local_date], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                ))
            })
            .map_err(DataError::from)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(DataError::from)?;
        plans
    };
    let transaction = connection.transaction().map_err(DataError::from)?;
    let mut position: i64 = transaction
        .query_row(
            "SELECT COALESCE(MAX(position)+1,0) FROM focus_plans WHERE local_date=?1",
            [local_date],
            |row| row.get(0),
        )
        .map_err(DataError::from)?;
    for (source_id, source_local_date, title, subject, cycles, rule, linked_task) in sources {
        let source_date = parse_date(&source_local_date)?;
        if !repeat_is_due(&rule, source_date, target_date) {
            continue;
        }
        let generated_id = format!("repeat:{source_id}:{local_date}");
        let inserted = transaction
            .execute(
                "INSERT OR IGNORE INTO focus_plans
                   (id,local_date,title,subject,estimated_cycles,completed_cycles,
                    repeat_rule,linked_daily_task_id,position,created_at,updated_at,version)
                 VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,?9,?9,1)",
                params![
                    generated_id,
                    local_date,
                    title,
                    subject,
                    cycles,
                    rule,
                    linked_task,
                    position,
                    now
                ],
            )
            .map_err(DataError::from)?;
        if inserted == 1 {
            position += 1;
        }
    }
    transaction.commit().map_err(DataError::from)
}

pub fn list_for_day(
    connection: &mut Connection,
    local_date: &str,
    now: &str,
) -> Result<Vec<FocusPlan>, DataError> {
    parse_date(local_date)?;
    generate_repeating_plans(connection, local_date, now)?;
    read_day(connection, local_date)
}

pub fn reorder(
    connection: &mut Connection,
    local_date: &str,
    ordered_ids: &[String],
    now: &str,
) -> Result<Vec<FocusPlan>, DataError> {
    parse_date(local_date)?;
    let existing = read_day(connection, local_date)?;
    let existing_ids = existing
        .iter()
        .map(|plan| plan.id.as_str())
        .collect::<HashSet<_>>();
    let requested_ids = ordered_ids
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    if existing_ids != requested_ids || requested_ids.len() != ordered_ids.len() {
        return Err(DataError::dashboard_invalid(
            "focus plan order must include every plan exactly once",
        ));
    }
    let transaction = connection.transaction().map_err(DataError::from)?;
    for (position, id) in ordered_ids.iter().enumerate() {
        transaction
            .execute(
                "UPDATE focus_plans
                 SET position=?1,updated_at=?2,version=version+1
                 WHERE id=?3 AND local_date=?4",
                params![position as i64, now, id, local_date],
            )
            .map_err(DataError::from)?;
    }
    transaction.commit().map_err(DataError::from)?;
    read_day(connection, local_date)
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::*;
    use crate::data::migrations::migrate;

    const NOW: &str = "2026-10-02T08:00:00+08:00";

    fn database() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        connection
    }

    fn input(title: &str, local_date: &str, repeat_rule: &str) -> CreateFocusPlanInput {
        CreateFocusPlanInput {
            local_date: local_date.into(),
            title: title.into(),
            subject: "english".into(),
            estimated_cycles: 3,
            repeat_rule: repeat_rule.into(),
            linked_daily_task_id: None,
            learning_item_id: None,
        }
    }

    #[test]
    fn creates_updates_completes_and_deletes_a_plan_with_version_checks() {
        let mut connection = database();
        let created = create(&connection, input("英语精读", "2026-10-02", "none"), NOW).unwrap();
        assert_eq!(created.title, "英语精读");
        assert_eq!(created.position, 0);
        assert_eq!(created.version, 1);

        let updated = update(
            &connection,
            UpdateFocusPlanInput {
                id: created.id.clone(),
                version: created.version,
                local_date: "2026-10-02".into(),
                title: "英语阅读复盘".into(),
                subject: "english".into(),
                estimated_cycles: 4,
                repeat_rule: "weekdays".into(),
                linked_daily_task_id: None,
                learning_item_id: None,
            },
            "2026-10-02T08:01:00+08:00",
        )
        .unwrap();
        assert_eq!(updated.title, "英语阅读复盘");
        assert_eq!(updated.version, 2);
        assert_eq!(
            update(
                &connection,
                UpdateFocusPlanInput {
                    id: created.id.clone(),
                    version: 1,
                    local_date: "2026-10-02".into(),
                    title: "过期保存".into(),
                    subject: "english".into(),
                    estimated_cycles: 1,
                    repeat_rule: "none".into(),
                    linked_daily_task_id: None,
                    learning_item_id: None,
                },
                NOW
            )
            .unwrap_err()
            .code(),
            "DASHBOARD_CONFLICT"
        );

        let completed = set_completed(
            &connection,
            &updated.id,
            updated.version,
            true,
            "2026-10-02T09:00:00+08:00",
        )
        .unwrap();
        assert!(completed.completed_at.is_some());
        assert_eq!(completed.version, 3);
        remove(&connection, &completed.id, completed.version).unwrap();
        assert!(list_for_day(&mut connection, "2026-10-02", NOW)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn rejects_invalid_plan_fields() {
        let connection = database();
        for invalid in [
            input("", "2026-10-02", "none"),
            input("任务", "2026/10/02", "none"),
            input("任务", "2026-10-02", "sometimes"),
        ] {
            assert_eq!(
                create(&connection, invalid, NOW).unwrap_err().code(),
                "DASHBOARD_INVALID"
            );
        }
        let mut too_many = input("任务", "2026-10-02", "none");
        too_many.estimated_cycles = 25;
        assert_eq!(
            create(&connection, too_many, NOW).unwrap_err().code(),
            "DASHBOARD_INVALID"
        );
    }

    #[test]
    fn reorders_every_plan_for_the_day_atomically() {
        let mut connection = database();
        let first = create(&connection, input("第一项", "2026-10-02", "none"), NOW).unwrap();
        let second = create(&connection, input("第二项", "2026-10-02", "none"), NOW).unwrap();
        let ordered = reorder(
            &mut connection,
            "2026-10-02",
            &[second.id.clone(), first.id.clone()],
            "2026-10-02T08:02:00+08:00",
        )
        .unwrap();
        assert_eq!(
            ordered
                .iter()
                .map(|plan| plan.title.as_str())
                .collect::<Vec<_>>(),
            vec!["第二项", "第一项"]
        );
        assert_eq!(
            ordered.iter().map(|plan| plan.position).collect::<Vec<_>>(),
            vec![0, 1]
        );
        assert_eq!(
            reorder(&mut connection, "2026-10-02", &[first.id], NOW)
                .unwrap_err()
                .code(),
            "DASHBOARD_INVALID"
        );
    }

    #[test]
    fn generates_daily_repeats_once_per_source_and_date() {
        let mut connection = database();
        let source = create(&connection, input("英语精读", "2026-10-02", "daily"), NOW).unwrap();

        let first =
            list_for_day(&mut connection, "2026-10-03", "2026-10-03T07:00:00+08:00").unwrap();
        let second =
            list_for_day(&mut connection, "2026-10-03", "2026-10-03T07:01:00+08:00").unwrap();

        assert_eq!(first.len(), 1);
        assert_eq!(second.len(), 1);
        assert_eq!(first[0].id, format!("repeat:{}:2026-10-03", source.id));
        assert_eq!(first[0].repeat_rule, "daily");
    }

    #[test]
    fn weekday_and_weekly_repeats_only_generate_on_eligible_days() {
        let mut connection = database();
        create(
            &connection,
            input("工作日任务", "2026-10-02", "weekdays"),
            NOW,
        )
        .unwrap();
        create(&connection, input("每周任务", "2026-10-02", "weekly"), NOW).unwrap();

        assert!(list_for_day(&mut connection, "2026-10-03", NOW)
            .unwrap()
            .is_empty());
        assert!(list_for_day(&mut connection, "2026-10-05", NOW)
            .unwrap()
            .iter()
            .any(|plan| plan.title == "工作日任务"));
        let next_thursday = list_for_day(&mut connection, "2026-10-09", NOW).unwrap();
        assert!(next_thursday.iter().any(|plan| plan.title == "工作日任务"));
        assert!(next_thursday.iter().any(|plan| plan.title == "每周任务"));
    }
}
