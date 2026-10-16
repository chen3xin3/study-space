use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::data::error::DataError;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningItem {
    pub id: String,
    pub subject: String,
    pub collection: String,
    pub kind: String,
    pub title: String,
    pub content: String,
    pub answer: String,
    pub tags: Vec<String>,
    pub mastery: String,
    pub source: String,
    pub score: Option<f64>,
    pub max_score: Option<f64>,
    pub review_at: Option<String>,
    pub favorite: bool,
    pub last_opened_at: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub version: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLearningItemInput {
    pub subject: String,
    pub collection: String,
    pub kind: String,
    pub title: String,
    pub content: String,
    pub answer: String,
    pub tags: Vec<String>,
    pub mastery: String,
    pub source: String,
    pub score: Option<f64>,
    pub max_score: Option<f64>,
    pub review_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLearningItemInput {
    pub id: String,
    pub version: i64,
    #[serde(flatten)]
    pub item: CreateLearningItemInput,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningItemQuery {
    pub subject: Option<String>,
    pub collection: Option<String>,
    pub kind: Option<String>,
    pub mastery: Option<String>,
    pub search: Option<String>,
    pub favorite: Option<bool>,
    #[serde(default)]
    pub trash: bool,
}

struct RawLearningItem {
    id: String,
    subject: String,
    collection: String,
    kind: String,
    title: String,
    content: String,
    answer: String,
    tags_json: String,
    mastery: String,
    source: String,
    score: Option<f64>,
    max_score: Option<f64>,
    review_at: Option<String>,
    favorite: bool,
    last_opened_at: String,
    created_at: String,
    updated_at: String,
    deleted_at: Option<String>,
    version: i64,
}

impl RawLearningItem {
    fn into_item(self) -> Result<LearningItem, DataError> {
        let tags = serde_json::from_str(&self.tags_json)
            .map_err(|error| DataError::learning_item_invalid(error.to_string()))?;
        Ok(LearningItem {
            id: self.id,
            subject: self.subject,
            collection: self.collection,
            kind: self.kind,
            title: self.title,
            content: self.content,
            answer: self.answer,
            tags,
            mastery: self.mastery,
            source: self.source,
            score: self.score,
            max_score: self.max_score,
            review_at: self.review_at,
            favorite: self.favorite,
            last_opened_at: self.last_opened_at,
            created_at: self.created_at,
            updated_at: self.updated_at,
            deleted_at: self.deleted_at,
            version: self.version,
        })
    }
}

fn map_raw(row: &rusqlite::Row<'_>) -> rusqlite::Result<RawLearningItem> {
    Ok(RawLearningItem {
        id: row.get(0)?,
        subject: row.get(1)?,
        collection: row.get(2)?,
        kind: row.get(3)?,
        title: row.get(4)?,
        content: row.get(5)?,
        answer: row.get(6)?,
        tags_json: row.get(7)?,
        mastery: row.get(8)?,
        source: row.get(9)?,
        score: row.get(10)?,
        max_score: row.get(11)?,
        review_at: row.get(12)?,
        favorite: row.get(13)?,
        last_opened_at: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
        deleted_at: row.get(17)?,
        version: row.get(18)?,
    })
}

const SELECT: &str = "SELECT id,subject,collection,kind,title,content,answer,tags_json,mastery,source,score,max_score,review_at,favorite,last_opened_at,created_at,updated_at,deleted_at,version FROM learning_items";

fn valid_subject(value: &str) -> bool {
    matches!(
        value,
        "english" | "math" | "specialty" | "politics" | "other"
    )
}
fn valid_kind(value: &str) -> bool {
    matches!(
        value,
        "note" | "question" | "material" | "practice" | "exam"
    )
}
fn valid_mastery(value: &str) -> bool {
    matches!(value, "new" | "learning" | "familiar" | "mastered")
}
fn valid_collection(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 80
        && value
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
}

fn validate(input: &CreateLearningItemInput) -> Result<(), DataError> {
    let valid_score = match (input.score, input.max_score) {
        (Some(score), Some(max)) => score >= 0.0 && max > 0.0 && score <= max,
        (Some(score), None) => score >= 0.0,
        (None, Some(max)) => max > 0.0,
        (None, None) => true,
    };
    if !valid_subject(&input.subject)
        || !valid_collection(&input.collection)
        || !valid_kind(&input.kind)
        || !valid_mastery(&input.mastery)
        || input.title.trim().is_empty()
        || input.title.chars().count() > 120
        || input.content.chars().count() > 50_000
        || input.answer.chars().count() > 50_000
        || input.tags.len() > 20
        || (input.kind != "exam" && (input.score.is_some() || input.max_score.is_some()))
        || !valid_score
    {
        return Err(DataError::learning_item_invalid(
            "learning item fields are invalid",
        ));
    }
    Ok(())
}

pub fn get(connection: &Connection, id: &str) -> Result<LearningItem, DataError> {
    connection
        .query_row(&format!("{SELECT} WHERE id=?1"), [id], map_raw)
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                DataError::learning_item_not_found("learning item not found")
            }
            other => DataError::from(other),
        })?
        .into_item()
}

pub fn list(
    connection: &Connection,
    query: LearningItemQuery,
) -> Result<Vec<LearningItem>, DataError> {
    let mut statement = connection
        .prepare(&format!(
            "{SELECT} WHERE (deleted_at IS NOT NULL)=?1 ORDER BY updated_at DESC,id DESC"
        ))
        .map_err(DataError::from)?;
    let items = statement
        .query_map([query.trash], map_raw)
        .map_err(DataError::from)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(DataError::from)?
        .into_iter()
        .map(RawLearningItem::into_item)
        .collect::<Result<Vec<_>, _>>()?;
    let search = query.search.unwrap_or_default().trim().to_lowercase();
    Ok(items
        .into_iter()
        .filter(|item| {
            query
                .subject
                .as_ref()
                .is_none_or(|value| &item.subject == value)
                && query
                    .collection
                    .as_ref()
                    .is_none_or(|value| &item.collection == value)
                && query.kind.as_ref().is_none_or(|value| &item.kind == value)
                && query
                    .mastery
                    .as_ref()
                    .is_none_or(|value| &item.mastery == value)
                && query.favorite.is_none_or(|value| item.favorite == value)
                && (search.is_empty()
                    || [
                        item.title.as_str(),
                        item.content.as_str(),
                        item.answer.as_str(),
                        item.source.as_str(),
                    ]
                    .into_iter()
                    .chain(item.tags.iter().map(String::as_str))
                    .any(|value| value.to_lowercase().contains(&search)))
        })
        .collect())
}

pub fn create(
    connection: &Connection,
    input: CreateLearningItemInput,
    now: &str,
) -> Result<LearningItem, DataError> {
    validate(&input)?;
    let id = Uuid::new_v4().to_string();
    let tags = serde_json::to_string(&input.tags)
        .map_err(|error| DataError::learning_item_invalid(error.to_string()))?;
    connection.execute(
        "INSERT INTO learning_items (id,subject,collection,kind,title,content,answer,tags_json,mastery,source,score,max_score,review_at,favorite,last_opened_at,created_at,updated_at,version) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,0,?14,?14,?14,1)",
        params![id,input.subject,input.collection,input.kind,input.title.trim(),input.content.trim(),input.answer.trim(),tags,input.mastery,input.source.trim(),input.score,input.max_score,input.review_at,now],
    ).map_err(DataError::from)?;
    get(connection, &id)
}

pub fn update(
    connection: &Connection,
    input: UpdateLearningItemInput,
    now: &str,
) -> Result<LearningItem, DataError> {
    validate(&input.item)?;
    let tags = serde_json::to_string(&input.item.tags)
        .map_err(|error| DataError::learning_item_invalid(error.to_string()))?;
    let count = connection.execute(
        "UPDATE learning_items SET subject=?1,collection=?2,kind=?3,title=?4,content=?5,answer=?6,tags_json=?7,mastery=?8,source=?9,score=?10,max_score=?11,review_at=?12,updated_at=?13,version=version+1 WHERE id=?14 AND version=?15",
        params![input.item.subject,input.item.collection,input.item.kind,input.item.title.trim(),input.item.content.trim(),input.item.answer.trim(),tags,input.item.mastery,input.item.source.trim(),input.item.score,input.item.max_score,input.item.review_at,now,input.id,input.version],
    ).map_err(DataError::from)?;
    if count != 1 {
        return Err(DataError::learning_item_conflict("learning item changed"));
    }
    get(connection, &input.id)
}

fn update_flag(
    connection: &Connection,
    id: &str,
    version: i64,
    clause: &str,
    value: bool,
    now: &str,
) -> Result<LearningItem, DataError> {
    let sql = format!("UPDATE learning_items SET {clause}=?1,updated_at=?2,version=version+1 WHERE id=?3 AND version=?4");
    let count = connection
        .execute(&sql, params![value, now, id, version])
        .map_err(DataError::from)?;
    if count != 1 {
        return Err(DataError::learning_item_conflict("learning item changed"));
    }
    get(connection, id)
}

pub fn set_favorite(
    connection: &Connection,
    id: &str,
    version: i64,
    favorite: bool,
    now: &str,
) -> Result<LearningItem, DataError> {
    update_flag(connection, id, version, "favorite", favorite, now)
}

pub fn set_deleted(
    connection: &Connection,
    id: &str,
    version: i64,
    deleted: bool,
    now: &str,
) -> Result<LearningItem, DataError> {
    let count = connection.execute(
        "UPDATE learning_items SET deleted_at=?1,updated_at=?2,version=version+1 WHERE id=?3 AND version=?4",
        params![if deleted { Some(now) } else { None },now,id,version],
    ).map_err(DataError::from)?;
    if count != 1 {
        return Err(DataError::learning_item_conflict("learning item changed"));
    }
    get(connection, id)
}

pub fn touch_opened(
    connection: &Connection,
    id: &str,
    version: i64,
    now: &str,
) -> Result<LearningItem, DataError> {
    let count = connection.execute(
        "UPDATE learning_items SET last_opened_at=?1,updated_at=?1,version=version+1 WHERE id=?2 AND version=?3",
        params![now,id,version],
    ).map_err(DataError::from)?;
    if count != 1 {
        return Err(DataError::learning_item_conflict("learning item changed"));
    }
    get(connection, id)
}

pub fn delete_permanently(
    connection: &Connection,
    id: &str,
    version: i64,
) -> Result<(), DataError> {
    let item = get(connection, id)?;
    if item.version != version {
        return Err(DataError::learning_item_conflict("learning item changed"));
    }
    if item.deleted_at.is_none() {
        return Err(DataError::learning_item_invalid(
            "learning item is not in trash",
        ));
    }
    connection
        .execute(
            "DELETE FROM learning_items WHERE id=?1 AND version=?2",
            params![id, version],
        )
        .map_err(DataError::from)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::*;
    use crate::data::migrations::migrate;

    fn draft(title: &str) -> CreateLearningItemInput {
        CreateLearningItemInput {
            subject: "math".into(),
            collection: "wrong-questions".into(),
            kind: "question".into(),
            title: title.into(),
            content: "求一个重要极限".into(),
            answer: "使用洛必达法则".into(),
            tags: vec!["高数".into()],
            mastery: "learning".into(),
            source: "第一章".into(),
            score: None,
            max_score: None,
            review_at: Some("2026-10-10".into()),
        }
    }

    fn database() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        connection
    }

    #[test]
    fn create_search_favorite_delete_restore_and_conflict() {
        let connection = database();
        let created = create(&connection, draft("极限错题"), "2026-10-03T08:00:00Z").unwrap();
        let query = LearningItemQuery {
            subject: Some("math".into()),
            search: Some("洛必达".into()),
            ..Default::default()
        };
        assert_eq!(list(&connection, query).unwrap().len(), 1);

        let favorite = set_favorite(
            &connection,
            &created.id,
            created.version,
            true,
            "2026-10-03T08:01:00Z",
        )
        .unwrap();
        assert!(favorite.favorite);
        let deleted = set_deleted(
            &connection,
            &favorite.id,
            favorite.version,
            true,
            "2026-10-03T08:02:00Z",
        )
        .unwrap();
        assert_eq!(
            list(
                &connection,
                LearningItemQuery {
                    trash: true,
                    ..Default::default()
                }
            )
            .unwrap()
            .len(),
            1
        );
        let restored = set_deleted(
            &connection,
            &deleted.id,
            deleted.version,
            false,
            "2026-10-03T08:03:00Z",
        )
        .unwrap();
        assert!(restored.deleted_at.is_none());

        let stale = UpdateLearningItemInput {
            id: restored.id,
            version: 1,
            item: draft("过期修改"),
        };
        assert_eq!(
            update(&connection, stale, "2026-10-03T08:04:00Z")
                .unwrap_err()
                .code(),
            "LEARNING_ITEM_CONFLICT"
        );
    }

    #[test]
    fn update_touch_and_permanent_delete_require_current_versions() {
        let connection = database();
        let created = create(&connection, draft("导数错题"), "2026-10-03T09:00:00Z").unwrap();
        let updated = update(
            &connection,
            UpdateLearningItemInput {
                id: created.id.clone(),
                version: created.version,
                item: draft("导数复盘"),
            },
            "2026-10-03T09:01:00Z",
        )
        .unwrap();
        assert_eq!(updated.title, "导数复盘");
        let opened = touch_opened(
            &connection,
            &updated.id,
            updated.version,
            "2026-10-03T09:02:00Z",
        )
        .unwrap();
        assert_eq!(opened.last_opened_at, "2026-10-03T09:02:00Z");
        assert_eq!(
            delete_permanently(&connection, &opened.id, opened.version)
                .unwrap_err()
                .code(),
            "LEARNING_ITEM_INVALID"
        );
        let deleted = set_deleted(
            &connection,
            &opened.id,
            opened.version,
            true,
            "2026-10-03T09:03:00Z",
        )
        .unwrap();
        delete_permanently(&connection, &deleted.id, deleted.version).unwrap();
        assert_eq!(
            get(&connection, &deleted.id).unwrap_err().code(),
            "LEARNING_ITEM_NOT_FOUND"
        );
    }

    #[test]
    fn rejects_invalid_exam_scores_and_empty_titles() {
        let connection = database();
        assert_eq!(
            create(&connection, draft(" "), "2026-10-03T10:00:00Z")
                .unwrap_err()
                .code(),
            "LEARNING_ITEM_INVALID"
        );
        let mut exam = draft("数学模拟考试");
        exam.kind = "exam".into();
        exam.collection = "exams".into();
        exam.score = Some(120.0);
        exam.max_score = Some(100.0);
        assert_eq!(
            create(&connection, exam, "2026-10-03T10:00:00Z")
                .unwrap_err()
                .code(),
            "LEARNING_ITEM_INVALID"
        );
    }
}
