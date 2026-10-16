use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::data::error::DataError;
use crate::data::essays::models::{EssayType, ExamTrack};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EssayImportDraftStage {
    Draft,
    Review,
    Failed,
}

impl EssayImportDraftStage {
    fn as_str(self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Review => "review",
            Self::Failed => "failed",
        }
    }

    fn parse(value: &str) -> Result<Self, DataError> {
        match value {
            "draft" => Ok(Self::Draft),
            "review" => Ok(Self::Review),
            "failed" => Ok(Self::Failed),
            _ => Err(DataError::essay_operation_failed(format!(
                "unknown import draft stage {value}"
            ))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EssayImportDraft {
    pub id: String,
    pub stage: EssayImportDraftStage,
    pub title: String,
    pub body: String,
    pub translation: String,
    pub exam_track: Option<ExamTrack>,
    pub essay_type: EssayType,
    pub attachment_ids: Vec<String>,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEssayImportDraftInput {
    pub id: String,
    pub version: i64,
    pub stage: EssayImportDraftStage,
    pub title: String,
    pub body: String,
    pub translation: String,
    pub exam_track: Option<ExamTrack>,
    pub essay_type: EssayType,
    pub last_error: Option<String>,
}

pub fn create_draft(connection: &mut Connection, now: &str) -> Result<EssayImportDraft, DataError> {
    let id = Uuid::new_v4().to_string();
    connection.execute(
        "INSERT INTO essay_import_drafts
         (id,stage,title,body,translation,exam_track,essay_type,last_error,created_at,updated_at,version)
         VALUES (?1,'draft','','','',NULL,'custom',NULL,?2,?2,1)",
        params![id, now],
    ).map_err(draft_error)?;
    get_draft(connection, &id)
}

pub fn get_draft(connection: &Connection, id: &str) -> Result<EssayImportDraft, DataError> {
    let row = connection.query_row(
        "SELECT id,stage,title,body,translation,exam_track,essay_type,last_error,created_at,updated_at,version
         FROM essay_import_drafts WHERE id=?1",
        [id],
        |row| Ok((
            row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?,
            row.get::<_, String>(3)?, row.get::<_, String>(4)?, row.get::<_, Option<String>>(5)?,
            row.get::<_, String>(6)?, row.get::<_, Option<String>>(7)?, row.get::<_, String>(8)?,
            row.get::<_, String>(9)?, row.get::<_, i64>(10)?,
        )),
    ).optional().map_err(draft_error)?
        .ok_or_else(|| DataError::essay_not_found(format!("import draft {id} not found")))?;
    let mut statement = connection.prepare(
        "SELECT attachment_id FROM essay_import_draft_attachments WHERE draft_id=?1 ORDER BY position",
    ).map_err(draft_error)?;
    let attachment_ids = statement
        .query_map([id], |value| value.get(0))
        .map_err(draft_error)?
        .collect::<Result<Vec<String>, _>>()
        .map_err(draft_error)?;
    Ok(EssayImportDraft {
        id: row.0,
        stage: EssayImportDraftStage::parse(&row.1)?,
        title: row.2,
        body: row.3,
        translation: row.4,
        exam_track: parse_track(row.5.as_deref())?,
        essay_type: parse_type(&row.6)?,
        attachment_ids,
        last_error: row.7,
        created_at: row.8,
        updated_at: row.9,
        version: row.10,
    })
}

pub fn list_drafts(connection: &Connection) -> Result<Vec<EssayImportDraft>, DataError> {
    let mut statement = connection
        .prepare("SELECT id FROM essay_import_drafts ORDER BY updated_at DESC,id DESC")
        .map_err(draft_error)?;
    let ids = statement
        .query_map([], |row| row.get(0))
        .map_err(draft_error)?
        .collect::<Result<Vec<String>, _>>()
        .map_err(draft_error)?;
    ids.iter().map(|id| get_draft(connection, id)).collect()
}

pub fn update_draft(
    connection: &Connection,
    input: UpdateEssayImportDraftInput,
    now: &str,
) -> Result<EssayImportDraft, DataError> {
    validate_input(&input)?;
    let changed = connection
        .execute(
            "UPDATE essay_import_drafts SET stage=?1,title=?2,body=?3,translation=?4,exam_track=?5,
         essay_type=?6,last_error=?7,updated_at=?8,version=version+1 WHERE id=?9 AND version=?10",
            params![
                input.stage.as_str(),
                input.title.trim(),
                input.body,
                input.translation,
                input.exam_track.map(track_value),
                type_value(input.essay_type),
                input.last_error,
                now,
                input.id,
                input.version
            ],
        )
        .map_err(draft_error)?;
    if changed != 1 {
        return Err(draft_conflict(connection, &input.id)?);
    }
    get_draft(connection, &input.id)
}

pub fn add_attachment(
    connection: &mut Connection,
    draft_id: &str,
    version: i64,
    attachment_id: &str,
    now: &str,
) -> Result<EssayImportDraft, DataError> {
    let transaction = connection.transaction().map_err(draft_error)?;
    let count: i64 = transaction
        .query_row(
            "SELECT count(*) FROM essay_import_draft_attachments WHERE draft_id=?1",
            [draft_id],
            |row| row.get(0),
        )
        .map_err(draft_error)?;
    if count >= 4 {
        return Err(DataError::essay_invalid(
            "an import draft supports at most four images",
        ));
    }
    let exists: i64 = transaction
        .query_row(
            "SELECT count(*) FROM attachments WHERE id=?1 AND deleted_at IS NULL",
            [attachment_id],
            |row| row.get(0),
        )
        .map_err(draft_error)?;
    if exists != 1 {
        return Err(DataError::essay_invalid("draft attachment is unavailable"));
    }
    let changed = transaction.execute(
        "UPDATE essay_import_drafts SET updated_at=?1,version=version+1 WHERE id=?2 AND version=?3",
        params![now, draft_id, version],
    ).map_err(draft_error)?;
    if changed != 1 {
        return Err(draft_conflict(&transaction, draft_id)?);
    }
    transaction.execute(
        "INSERT INTO essay_import_draft_attachments (draft_id,attachment_id,position,created_at)
         VALUES (?1,?2,?3,?4)", params![draft_id, attachment_id, count, now],
    ).map_err(draft_error)?;
    let result = get_draft(&transaction, draft_id)?;
    transaction.commit().map_err(draft_error)?;
    Ok(result)
}

pub fn remove_attachment(
    connection: &mut Connection,
    draft_id: &str,
    version: i64,
    attachment_id: &str,
    now: &str,
) -> Result<EssayImportDraft, DataError> {
    let transaction = connection.transaction().map_err(draft_error)?;
    let changed = transaction.execute(
        "UPDATE essay_import_drafts SET updated_at=?1,version=version+1 WHERE id=?2 AND version=?3",
        params![now, draft_id, version],
    ).map_err(draft_error)?;
    if changed != 1 {
        return Err(draft_conflict(&transaction, draft_id)?);
    }
    let removed = transaction
        .execute(
            "DELETE FROM essay_import_draft_attachments WHERE draft_id=?1 AND attachment_id=?2",
            params![draft_id, attachment_id],
        )
        .map_err(draft_error)?;
    if removed != 1 {
        return Err(DataError::essay_invalid("draft image not found"));
    }
    let mut statement = transaction.prepare(
        "SELECT attachment_id FROM essay_import_draft_attachments WHERE draft_id=?1 ORDER BY position",
    ).map_err(draft_error)?;
    let ids = statement
        .query_map([draft_id], |row| row.get::<_, String>(0))
        .map_err(draft_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(draft_error)?;
    drop(statement);
    for (position, id) in ids.iter().enumerate() {
        transaction.execute(
            "UPDATE essay_import_draft_attachments SET position=?1 WHERE draft_id=?2 AND attachment_id=?3",
            params![position as i64, draft_id, id],
        ).map_err(draft_error)?;
    }
    let result = get_draft(&transaction, draft_id)?;
    transaction.commit().map_err(draft_error)?;
    Ok(result)
}

pub fn abandon_draft(
    connection: &mut Connection,
    draft_id: &str,
    version: i64,
) -> Result<Vec<String>, DataError> {
    let transaction = connection.transaction().map_err(draft_error)?;
    let current = get_draft(&transaction, draft_id)?;
    if current.version != version {
        return Err(DataError::essay_version_conflict("import draft changed"));
    }
    transaction
        .execute(
            "DELETE FROM essay_import_draft_attachments WHERE draft_id=?1",
            [draft_id],
        )
        .map_err(draft_error)?;
    let changed = transaction
        .execute(
            "DELETE FROM essay_import_drafts WHERE id=?1 AND version=?2",
            params![draft_id, version],
        )
        .map_err(draft_error)?;
    if changed != 1 {
        return Err(DataError::essay_version_conflict("import draft changed"));
    }
    transaction.commit().map_err(draft_error)?;
    Ok(current.attachment_ids)
}

fn validate_input(input: &UpdateEssayImportDraftInput) -> Result<(), DataError> {
    if input.version < 1
        || input.title.chars().count() > 120
        || input.body.chars().count() > 50_000
        || input.translation.chars().count() > 50_000
        || input
            .last_error
            .as_deref()
            .is_some_and(|value| value.chars().count() > 1_000)
    {
        return Err(DataError::essay_invalid("essay import draft is invalid"));
    }
    Ok(())
}

fn draft_conflict(connection: &Connection, id: &str) -> Result<DataError, DataError> {
    let exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM essay_import_drafts WHERE id=?1)",
            [id],
            |row| row.get(0),
        )
        .map_err(draft_error)?;
    Ok(if exists {
        DataError::essay_version_conflict("import draft changed")
    } else {
        DataError::essay_not_found("import draft not found")
    })
}

fn track_value(value: ExamTrack) -> &'static str {
    match value {
        ExamTrack::English1 => "english_1",
        ExamTrack::English2 => "english_2",
    }
}
fn type_value(value: EssayType) -> &'static str {
    match value {
        EssayType::Small => "small",
        EssayType::Large => "large",
        EssayType::Custom => "custom",
    }
}
fn parse_track(value: Option<&str>) -> Result<Option<ExamTrack>, DataError> {
    match value {
        None => Ok(None),
        Some("english_1") => Ok(Some(ExamTrack::English1)),
        Some("english_2") => Ok(Some(ExamTrack::English2)),
        Some(value) => Err(DataError::essay_operation_failed(format!(
            "unknown exam track {value}"
        ))),
    }
}
fn parse_type(value: &str) -> Result<EssayType, DataError> {
    match value {
        "small" => Ok(EssayType::Small),
        "large" => Ok(EssayType::Large),
        "custom" => Ok(EssayType::Custom),
        _ => Err(DataError::essay_operation_failed(format!(
            "unknown essay type {value}"
        ))),
    }
}
fn draft_error(error: rusqlite::Error) -> DataError {
    DataError::essay_operation_failed(error.to_string())
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    use super::*;
    use crate::data::migrations;

    const NOW: &str = "2026-10-04T08:00:00Z";
    const LATER: &str = "2026-10-04T08:01:00Z";

    fn database() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        migrations::migrate(&mut connection).unwrap();
        connection
    }

    fn insert_attachment(connection: &Connection, id: &str) {
        connection.execute(
            "INSERT INTO attachments
             (id,original_name,stored_name,media_type,byte_size,sha256,created_at,updated_at,version)
             VALUES (?1,'page.png',?2,'image/png',8,'hash',?3,?3,1)",
            params![id, format!("{id}.png"), NOW],
        ).unwrap();
    }

    #[test]
    fn creates_updates_lists_and_reopens_a_draft() {
        let mut connection = database();
        let created = create_draft(&mut connection, NOW).unwrap();
        assert_eq!(created.stage, EssayImportDraftStage::Draft);
        assert!(created.attachment_ids.is_empty());

        let updated = update_draft(
            &mut connection,
            UpdateEssayImportDraftInput {
                id: created.id.clone(),
                version: created.version,
                stage: EssayImportDraftStage::Review,
                title: "建议信".into(),
                body: "Dear Sir".into(),
                translation: "尊敬的先生".into(),
                exam_track: Some(ExamTrack::English1),
                essay_type: EssayType::Small,
                last_error: None,
            },
            LATER,
        )
        .unwrap();
        assert_eq!(updated.version, 2);
        assert_eq!(get_draft(&connection, &created.id).unwrap(), updated);
        assert_eq!(list_drafts(&connection).unwrap(), vec![updated]);
    }

    #[test]
    fn links_images_with_version_checks_and_abandons_the_draft() {
        let mut connection = database();
        insert_attachment(&connection, "image-1");
        let created = create_draft(&mut connection, NOW).unwrap();
        let linked = add_attachment(
            &mut connection,
            &created.id,
            created.version,
            "image-1",
            LATER,
        )
        .unwrap();
        assert_eq!(linked.attachment_ids, vec!["image-1"]);
        assert!(add_attachment(
            &mut connection,
            &created.id,
            created.version,
            "image-1",
            LATER
        )
        .is_err());

        let removed = abandon_draft(&mut connection, &created.id, linked.version).unwrap();
        assert_eq!(removed, vec!["image-1"]);
        assert!(get_draft(&connection, &created.id).is_err());
    }
}
