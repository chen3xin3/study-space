use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use uuid::Uuid;

use crate::data::error::DataError;
use crate::data::essays::models::{
    CreateEssayInput, EssayCategory, EssayDetail, EssayExpression, EssayListItem, EssayListPage,
    EssayListQuery, EssayTag, EssayType, ExamTrack, ExpressionInput, UpdateEssayInput,
};

const MAX_TITLE_CHARS: usize = 200;
const MAX_BODY_CHARS: usize = 50_000;
const MAX_EXPRESSIONS: usize = 100;
const MAX_TAGS: usize = 30;
const MAX_DELETE_IDS: usize = 100;

pub fn create_essay(
    connection: &mut Connection,
    input: CreateEssayInput,
    now: &str,
) -> Result<EssayDetail, DataError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(essay_error)?;
    let detail = create_essay_in_transaction(&transaction, input, now)?;
    transaction.commit().map_err(essay_error)?;
    Ok(detail)
}

pub(crate) fn create_essay_in_transaction(
    transaction: &Transaction<'_>,
    input: CreateEssayInput,
    now: &str,
) -> Result<EssayDetail, DataError> {
    validate_essay(&input.title, &input.body, &input.expressions, &input.tags)?;
    let id = Uuid::new_v4().to_string();
    let category_id = ensure_category(&transaction, input.category.as_deref(), now)?;
    transaction
        .execute(
            "INSERT INTO essays
             (id, title, body, translation, exam_track, essay_type, source, note, category_id,
              created_at, updated_at, version)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, 1)",
            params![
                id,
                input.title.trim(),
                input.body.trim(),
                clean_optional(input.translation),
                input.exam_track.map(track_db),
                essay_type_db(input.essay_type),
                clean_optional(input.source),
                clean_optional(input.note),
                category_id,
                now,
            ],
        )
        .map_err(essay_error)?;
    insert_expressions(&transaction, &id, &input.expressions, now)?;
    replace_tags(&transaction, &id, &input.tags, now)?;
    if input.source_photo_ids.len() > 4
        || input.source_photo_ids.iter().collect::<HashSet<_>>().len()
            != input.source_photo_ids.len()
    {
        return Err(DataError::attachment_invalid(
            "essay source photos are invalid",
        ));
    }
    for (position, photo_id) in input.source_photo_ids.iter().enumerate() {
        let valid: i64 = transaction
            .query_row(
                "SELECT count(*) FROM attachments WHERE id=?1 AND deleted_at IS NULL
             AND media_type IN ('image/png','image/jpeg','image/webp')",
                [photo_id],
                |row| row.get(0),
            )
            .map_err(essay_error)?;
        if valid != 1 {
            return Err(DataError::attachment_invalid(
                "essay source photo not found",
            ));
        }
        transaction.execute(
            "INSERT INTO essay_photo_sources (essay_id, attachment_id, sort_order) VALUES (?1,?2,?3)",
            params![id, photo_id, position as i64],
        ).map_err(essay_error)?;
    }
    let detail = get_essay(&transaction, &id)?;
    Ok(detail)
}

pub fn get_essay(connection: &Connection, id: &str) -> Result<EssayDetail, DataError> {
    let base = connection
        .query_row(
            "SELECT id, title, body, translation, exam_track, essay_type, source, note,
                    category_id, created_at, updated_at, deleted_at, version
             FROM essays WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, String>(10)?,
                    row.get::<_, Option<String>>(11)?,
                    row.get::<_, i64>(12)?,
                ))
            },
        )
        .optional()
        .map_err(essay_error)?
        .ok_or_else(|| DataError::essay_not_found(format!("essay {id} not found")))?;

    let category = match base.8.as_deref() {
        Some(category_id) => connection
            .query_row(
                "SELECT id, name, version FROM essay_categories
                 WHERE id = ?1 AND deleted_at IS NULL",
                [category_id],
                |row| {
                    Ok(EssayCategory {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        version: row.get(2)?,
                    })
                },
            )
            .optional()
            .map_err(essay_error)?,
        None => None,
    };

    let mut expression_statement = connection
        .prepare(
            "SELECT id, expression, explanation, sort_order, version
             FROM essay_expressions
             WHERE essay_id = ?1 AND deleted_at IS NULL
             ORDER BY sort_order, id",
        )
        .map_err(essay_error)?;
    let expressions = expression_statement
        .query_map([id], |row| {
            Ok(EssayExpression {
                id: row.get(0)?,
                expression: row.get(1)?,
                explanation: row.get(2)?,
                sort_order: row.get(3)?,
                version: row.get(4)?,
            })
        })
        .map_err(essay_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(essay_error)?;

    let mut tag_statement = connection
        .prepare(
            "SELECT t.id, t.name
             FROM essay_tags t
             JOIN essay_tag_relations r ON r.tag_id = t.id
             WHERE r.essay_id = ?1 AND t.deleted_at IS NULL
             ORDER BY r.rowid",
        )
        .map_err(essay_error)?;
    let tags = tag_statement
        .query_map([id], |row| {
            Ok(EssayTag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(essay_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(essay_error)?;

    let mut photo_statement = connection
        .prepare(
            "SELECT s.attachment_id FROM essay_photo_sources s
         JOIN attachments a ON a.id=s.attachment_id
         WHERE s.essay_id=?1 AND a.deleted_at IS NULL ORDER BY s.sort_order",
        )
        .map_err(essay_error)?;
    let source_photo_ids = photo_statement
        .query_map([id], |row| row.get(0))
        .map_err(essay_error)?
        .collect::<Result<Vec<String>, _>>()
        .map_err(essay_error)?;

    Ok(EssayDetail {
        id: base.0,
        title: base.1,
        body: base.2,
        translation: base.3,
        exam_track: parse_track(base.4)?,
        essay_type: parse_essay_type(base.5)?,
        source: base.6,
        note: base.7,
        category,
        expressions,
        tags,
        source_photo_ids,
        created_at: base.9,
        updated_at: base.10,
        deleted_at: base.11,
        version: base.12,
    })
}

pub fn list_essays(
    connection: &Connection,
    query: EssayListQuery,
) -> Result<EssayListPage, DataError> {
    let limit = query.limit.unwrap_or(50).clamp(1, 50);
    let search = clean_search(query.search);
    let category = query.category.as_deref().map(normalize_name);
    let tag = query.tag.as_deref().map(normalize_name);
    let track = query.exam_track.map(track_db).map(str::to_owned);
    let essay_type = query.essay_type.map(essay_type_db).map(str::to_owned);
    let (cursor_time, cursor_id) = parse_cursor(query.cursor.as_deref())?;
    let mut statement = connection
        .prepare(
            "SELECT e.id
             FROM essays e
             LEFT JOIN essay_categories c ON c.id = e.category_id AND c.deleted_at IS NULL
             WHERE e.deleted_at IS NULL
               AND (?1 IS NULL OR lower(e.title) LIKE ?1 OR lower(e.body) LIKE ?1
                    OR lower(coalesce(e.translation, '')) LIKE ?1
                    OR lower(coalesce(e.note, '')) LIKE ?1
                    OR lower(coalesce(c.name, '')) LIKE ?1
                    OR EXISTS (
                      SELECT 1 FROM essay_expressions x
                      WHERE x.essay_id = e.id AND x.deleted_at IS NULL
                        AND (lower(x.expression) LIKE ?1 OR lower(coalesce(x.explanation, '')) LIKE ?1)
                    )
                    OR EXISTS (
                      SELECT 1 FROM essay_tag_relations r
                      JOIN essay_tags t ON t.id = r.tag_id
                      WHERE r.essay_id = e.id AND t.deleted_at IS NULL AND lower(t.name) LIKE ?1
                    ))
               AND (?2 IS NULL OR c.normalized_name = ?2)
               AND (?3 IS NULL OR EXISTS (
                    SELECT 1 FROM essay_tag_relations r
                    JOIN essay_tags t ON t.id = r.tag_id
                    WHERE r.essay_id = e.id AND t.deleted_at IS NULL AND t.normalized_name = ?3
               ))
               AND (?4 IS NULL OR e.exam_track = ?4)
               AND (?5 IS NULL OR e.essay_type = ?5)
               AND (?6 IS NULL OR e.updated_at < ?6 OR (e.updated_at = ?6 AND e.id > ?7))
             ORDER BY e.updated_at DESC, e.id ASC
             LIMIT ?8",
        )
        .map_err(essay_error)?;
    let ids = statement
        .query_map(
            params![
                search,
                category,
                tag,
                track,
                essay_type,
                cursor_time,
                cursor_id,
                (limit + 1) as i64,
            ],
            |row| row.get::<_, String>(0),
        )
        .map_err(essay_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(essay_error)?;
    let has_more = ids.len() > limit;
    let mut items = Vec::with_capacity(ids.len().min(limit));
    for id in ids.into_iter().take(limit) {
        let detail = get_essay(connection, &id)?;
        items.push(EssayListItem {
            id: detail.id,
            title: detail.title,
            excerpt: detail.body.chars().take(160).collect(),
            exam_track: detail.exam_track,
            essay_type: detail.essay_type,
            category: detail.category,
            tags: detail.tags,
            updated_at: detail.updated_at,
            version: detail.version,
        });
    }
    let next_cursor = if has_more {
        items
            .last()
            .map(|item| format!("{}\u{1f}{}", item.updated_at, item.id))
    } else {
        None
    };
    Ok(EssayListPage { items, next_cursor })
}

pub fn update_essay(
    connection: &mut Connection,
    input: UpdateEssayInput,
    now: &str,
) -> Result<EssayDetail, DataError> {
    validate_essay(&input.title, &input.body, &input.expressions, &input.tags)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(essay_error)?;
    let current_version = transaction
        .query_row(
            "SELECT version FROM essays WHERE id = ?1 AND deleted_at IS NULL",
            [&input.id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(essay_error)?
        .ok_or_else(|| DataError::essay_not_found(format!("essay {} not found", input.id)))?;
    if current_version != input.version {
        return Err(DataError::essay_version_conflict(format!(
            "essay {} expected version {}, found {current_version}",
            input.id, input.version
        )));
    }
    let category_id = ensure_category(&transaction, input.category.as_deref(), now)?;
    let changed = transaction
        .execute(
            "UPDATE essays
             SET title=?1, body=?2, translation=?3, exam_track=?4, essay_type=?5,
                 source=?6, note=?7, category_id=?8, updated_at=?9, version=version+1
             WHERE id=?10 AND version=?11 AND deleted_at IS NULL",
            params![
                input.title.trim(),
                input.body.trim(),
                clean_optional(input.translation),
                input.exam_track.map(track_db),
                essay_type_db(input.essay_type),
                clean_optional(input.source),
                clean_optional(input.note),
                category_id,
                now,
                input.id,
                input.version,
            ],
        )
        .map_err(essay_error)?;
    if changed == 0 {
        return Err(DataError::essay_version_conflict(
            "essay changed during update",
        ));
    }
    transaction
        .execute(
            "UPDATE essay_expressions
             SET deleted_at=?1, updated_at=?1, version=version+1
             WHERE essay_id=?2 AND deleted_at IS NULL",
            params![now, input.id],
        )
        .map_err(essay_error)?;
    insert_expressions(&transaction, &input.id, &input.expressions, now)?;
    replace_tags(&transaction, &input.id, &input.tags, now)?;
    let detail = get_essay(&transaction, &input.id)?;
    transaction.commit().map_err(essay_error)?;
    Ok(detail)
}

pub fn delete_essays(
    connection: &mut Connection,
    ids: Vec<String>,
    now: &str,
) -> Result<usize, DataError> {
    if ids.is_empty() || ids.len() > MAX_DELETE_IDS {
        return Err(DataError::essay_invalid(format!(
            "delete requires 1 to {MAX_DELETE_IDS} ids"
        )));
    }
    let unique: HashSet<_> = ids.iter().collect();
    if unique.len() != ids.len() || ids.iter().any(|id| id.trim().is_empty()) {
        return Err(DataError::essay_invalid(
            "delete ids must be unique and non-empty",
        ));
    }
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(essay_error)?;
    let mut changed = 0;
    for id in ids {
        changed += transaction
            .execute(
                "UPDATE essays SET deleted_at=?1, updated_at=?1, version=version+1
                 WHERE id=?2 AND deleted_at IS NULL",
                params![now, id],
            )
            .map_err(essay_error)?;
    }
    transaction.commit().map_err(essay_error)?;
    Ok(changed)
}

fn ensure_category(
    transaction: &Transaction<'_>,
    name: Option<&str>,
    now: &str,
) -> Result<Option<String>, DataError> {
    let Some(display_name) = name.map(collapse_spaces).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let normalized = normalize_name(&display_name);
    if let Some(id) = transaction
        .query_row(
            "SELECT id FROM essay_categories WHERE normalized_name=?1 AND deleted_at IS NULL",
            [&normalized],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(essay_error)?
    {
        return Ok(Some(id));
    }
    let id = Uuid::new_v4().to_string();
    transaction
        .execute(
            "INSERT INTO essay_categories
             (id, name, normalized_name, created_at, updated_at, version)
             VALUES (?1, ?2, ?3, ?4, ?4, 1)",
            params![id, display_name, normalized, now],
        )
        .map_err(essay_error)?;
    Ok(Some(id))
}

fn insert_expressions(
    transaction: &Transaction<'_>,
    essay_id: &str,
    expressions: &[ExpressionInput],
    now: &str,
) -> Result<(), DataError> {
    for (index, value) in expressions.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO essay_expressions
                 (id, essay_id, expression, explanation, sort_order, created_at, updated_at, version)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, 1)",
                params![
                    Uuid::new_v4().to_string(),
                    essay_id,
                    value.expression.trim(),
                    clean_optional(value.explanation.clone()),
                    index as i64,
                    now,
                ],
            )
            .map_err(essay_error)?;
    }
    Ok(())
}

fn replace_tags(
    transaction: &Transaction<'_>,
    essay_id: &str,
    tags: &[String],
    now: &str,
) -> Result<(), DataError> {
    transaction
        .execute(
            "DELETE FROM essay_tag_relations WHERE essay_id=?1",
            [essay_id],
        )
        .map_err(essay_error)?;
    let mut seen = HashSet::new();
    for tag in tags {
        let display_name = collapse_spaces(tag);
        let normalized = normalize_name(&display_name);
        if display_name.is_empty() || !seen.insert(normalized.clone()) {
            continue;
        }
        let tag_id = if let Some(id) = transaction
            .query_row(
                "SELECT id FROM essay_tags WHERE normalized_name=?1 AND deleted_at IS NULL",
                [&normalized],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(essay_error)?
        {
            id
        } else {
            let id = Uuid::new_v4().to_string();
            transaction
                .execute(
                    "INSERT INTO essay_tags
                     (id, name, normalized_name, created_at, updated_at, version)
                     VALUES (?1, ?2, ?3, ?4, ?4, 1)",
                    params![id, display_name, normalized, now],
                )
                .map_err(essay_error)?;
            id
        };
        transaction
            .execute(
                "INSERT INTO essay_tag_relations (essay_id, tag_id, created_at)
                 VALUES (?1, ?2, ?3)",
                params![essay_id, tag_id, now],
            )
            .map_err(essay_error)?;
    }
    Ok(())
}

fn validate_essay(
    title: &str,
    body: &str,
    expressions: &[ExpressionInput],
    tags: &[String],
) -> Result<(), DataError> {
    let title_len = title.trim().chars().count();
    let body_len = body.trim().chars().count();
    if title_len == 0 || title_len > MAX_TITLE_CHARS {
        return Err(DataError::essay_invalid("title length is invalid"));
    }
    if body_len == 0 || body_len > MAX_BODY_CHARS {
        return Err(DataError::essay_invalid("body length is invalid"));
    }
    if expressions.len() > MAX_EXPRESSIONS
        || expressions
            .iter()
            .any(|value| value.expression.trim().is_empty())
    {
        return Err(DataError::essay_invalid("expressions are invalid"));
    }
    if tags.len() > MAX_TAGS || tags.iter().any(|tag| collapse_spaces(tag).is_empty()) {
        return Err(DataError::essay_invalid("tags are invalid"));
    }
    Ok(())
}

fn clean_optional(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty())
}

fn clean_search(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_lowercase())
        .filter(|text| !text.is_empty())
        .map(|text| format!("%{text}%"))
}

fn collapse_spaces(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_name(value: &str) -> String {
    collapse_spaces(value).to_lowercase()
}

fn parse_cursor(value: Option<&str>) -> Result<(Option<String>, Option<String>), DataError> {
    match value {
        None => Ok((None, None)),
        Some(value) => value
            .split_once('\u{1f}')
            .map(|(time, id)| (Some(time.to_owned()), Some(id.to_owned())))
            .ok_or_else(|| DataError::essay_invalid("invalid essay cursor")),
    }
}

fn track_db(value: ExamTrack) -> &'static str {
    match value {
        ExamTrack::English1 => "english_1",
        ExamTrack::English2 => "english_2",
    }
}

fn parse_track(value: Option<String>) -> Result<Option<ExamTrack>, DataError> {
    value
        .map(|value| match value.as_str() {
            "english_1" => Ok(ExamTrack::English1),
            "english_2" => Ok(ExamTrack::English2),
            _ => Err(DataError::essay_operation_failed(format!(
                "unknown exam track {value}"
            ))),
        })
        .transpose()
}

fn essay_type_db(value: EssayType) -> &'static str {
    match value {
        EssayType::Small => "small",
        EssayType::Large => "large",
        EssayType::Custom => "custom",
    }
}

fn parse_essay_type(value: String) -> Result<EssayType, DataError> {
    match value.as_str() {
        "small" => Ok(EssayType::Small),
        "large" => Ok(EssayType::Large),
        "custom" => Ok(EssayType::Custom),
        _ => Err(DataError::essay_operation_failed(format!(
            "unknown essay type {value}"
        ))),
    }
}

fn essay_error(error: rusqlite::Error) -> DataError {
    DataError::essay_operation_failed(error.to_string())
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::*;
    use crate::data::essays::models::{
        CreateEssayInput, EssayListQuery, EssayType, ExamTrack, ExpressionInput, UpdateEssayInput,
    };
    use crate::data::migrations::migrate;

    const NOW: &str = "2026-09-25T01:00:00Z";
    const LATER: &str = "2026-09-25T02:00:00Z";

    fn setup() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        migrate(&mut connection).unwrap();
        connection
    }

    fn input(title: &str, body: &str) -> CreateEssayInput {
        CreateEssayInput {
            title: title.into(),
            body: body.into(),
            translation: None,
            exam_track: Some(ExamTrack::English1),
            essay_type: EssayType::Small,
            source: None,
            note: None,
            category: None,
            expressions: vec![],
            tags: vec![],
            source_photo_ids: vec![],
        }
    }

    fn query(search: Option<&str>) -> EssayListQuery {
        EssayListQuery {
            search: search.map(str::to_owned),
            category: None,
            tag: None,
            exam_track: None,
            essay_type: None,
            cursor: None,
            limit: Some(50),
        }
    }

    #[test]
    fn a_new_essay_keeps_its_original_photo_link() {
        let mut connection = setup();
        connection
            .execute(
                "INSERT INTO attachments (id, original_name, stored_name, media_type, byte_size,
             sha256, created_at, updated_at, version)
             VALUES ('photo-1','draft.jpg','photo-1.jpg','image/jpeg',12,'hash',?1,?1,1)",
                [NOW],
            )
            .unwrap();
        let mut source = input("My draft", "Dear friend");
        source.source_photo_ids = vec!["photo-1".into()];
        let saved = create_essay(&mut connection, source, NOW).unwrap();
        assert_eq!(saved.source_photo_ids, vec!["photo-1"]);
        assert_eq!(
            get_essay(&connection, &saved.id).unwrap().source_photo_ids,
            vec!["photo-1"]
        );
    }

    #[test]
    fn creates_full_essay_and_searches_every_reading_field() {
        let mut connection = setup();
        let mut value = input("A Letter", "Dear Sir or Madam");
        value.translation = Some("尊敬的先生或女士".into());
        value.note = Some("用于建议信".into());
        value.category = Some("书信".into());
        value.tags = vec!["模板".into()];
        value.expressions = vec![ExpressionInput {
            expression: "in light of".into(),
            explanation: Some("鉴于".into()),
        }];
        let created = create_essay(&mut connection, value, NOW).unwrap();
        assert_eq!(created.category.as_ref().unwrap().name, "书信");
        assert_eq!(created.expressions[0].expression, "in light of");
        assert_eq!(created.tags[0].name, "模板");

        for search in ["letter", "dear", "尊敬", "建议信", "light", "模板"] {
            let page = list_essays(&connection, query(Some(search))).unwrap();
            assert_eq!(page.items.len(), 1, "search {search}");
            assert_eq!(page.items[0].id, created.id);
        }

        let filtered = list_essays(
            &connection,
            EssayListQuery {
                category: Some("书信".into()),
                tag: Some("模板".into()),
                exam_track: Some(ExamTrack::English1),
                essay_type: Some(EssayType::Small),
                ..query(None)
            },
        )
        .unwrap();
        assert_eq!(filtered.items.len(), 1);
    }

    #[test]
    fn list_caps_pages_at_fifty_and_uses_a_stable_cursor() {
        let mut connection = setup();
        for index in 0..52 {
            create_essay(
                &mut connection,
                input(&format!("Essay {index:02}"), "Body"),
                &format!("2026-09-25T01:{index:02}:00Z"),
            )
            .unwrap();
        }
        let first = list_essays(
            &connection,
            EssayListQuery {
                limit: Some(500),
                ..query(None)
            },
        )
        .unwrap();
        assert_eq!(first.items.len(), 50);
        assert!(first.next_cursor.is_some());
        let second = list_essays(
            &connection,
            EssayListQuery {
                cursor: first.next_cursor,
                ..query(None)
            },
        )
        .unwrap();
        assert_eq!(second.items.len(), 2);
        assert_ne!(first.items[0].id, second.items[0].id);
    }

    #[test]
    fn update_conflict_does_not_overwrite_and_delete_is_soft() {
        let mut connection = setup();
        let created = create_essay(&mut connection, input("Original", "Body"), NOW).unwrap();
        let update = UpdateEssayInput {
            id: created.id.clone(),
            version: created.version,
            title: "Updated".into(),
            body: created.body.clone(),
            translation: None,
            exam_track: created.exam_track,
            essay_type: created.essay_type,
            source: None,
            note: None,
            category: None,
            expressions: vec![],
            tags: vec![],
        };
        let updated = update_essay(&mut connection, update.clone(), LATER).unwrap();
        assert_eq!(updated.title, "Updated");
        assert_eq!(
            update_essay(&mut connection, update, LATER)
                .unwrap_err()
                .code(),
            "ESSAY_VERSION_CONFLICT"
        );
        assert_eq!(
            get_essay(&connection, &created.id).unwrap().title,
            "Updated"
        );
        assert_eq!(
            delete_essays(&mut connection, vec![created.id.clone()], LATER).unwrap(),
            1
        );
        assert_eq!(
            get_essay(&connection, &created.id).unwrap_err().code(),
            "ESSAY_NOT_FOUND"
        );
        assert!(list_essays(&connection, query(None))
            .unwrap()
            .items
            .is_empty());
    }

    #[test]
    fn failed_child_insert_rolls_back_the_whole_essay() {
        let mut connection = setup();
        connection
            .execute_batch(
                "CREATE TRIGGER fail_essay_expression BEFORE INSERT ON essay_expressions
                 BEGIN SELECT RAISE(ABORT, 'injected expression failure'); END;",
            )
            .unwrap();
        let mut value = input("Atomic", "Body");
        value.expressions.push(ExpressionInput {
            expression: "rollback".into(),
            explanation: None,
        });
        assert!(create_essay(&mut connection, value, NOW).is_err());
        let count: i64 = connection
            .query_row("SELECT count(*) FROM essays", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
}
