pub mod ai;
pub mod attachments;
pub mod backup;
pub mod dashboard;
pub mod database;
pub mod error;
pub mod essays;
pub mod focus;
pub mod focus_plans;
pub mod focus_sessions;
pub mod inbox;
pub mod learning_items;
pub mod migrations;
pub mod models;
pub mod paths;
pub mod photo_archive;
pub mod vocabulary;

#[cfg(test)]
mod smoke_tests {
    use std::fs;

    use serde_json::json;

    use super::attachments::{get_attachment, import_attachment};
    use super::backup::{create_backup, restore_backup};
    use super::dashboard::models::{CreateDailyTaskInput, DailyWindow, DashboardDayQuery};
    use super::dashboard::repository as dashboard_repository;
    use super::database::DatabaseManager;
    use super::paths::DataPaths;
    use super::vocabulary::import_models::{ImportConfidence, RecognizedCandidate};
    use super::vocabulary::models::{
        CreateWordInput, CreateWordOutcome, DeleteWordsInput, DuplicateResolution,
        ResolveDuplicateInput, ReviewDirection, ReviewResult, SubmitReviewInput,
    };
    use super::vocabulary::{import_repository, repository, review};

    #[test]
    fn complete_local_data_round_trip_preserves_metadata_and_attachment_hash() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("fixture.pdf");
        fs::write(&source, b"disposable smoke-test pdf").unwrap();
        let paths = DataPaths::from_root(temp.path().join("app-data")).unwrap();
        let manager = DatabaseManager::open(paths).unwrap();

        manager.set_metadata("smoke", "before").unwrap();
        let imported = import_attachment(&manager, &source).unwrap();
        let backup =
            create_backup(&manager, json!({ "theme": "eye-care", "aiEnabled": false })).unwrap();
        manager.set_metadata("smoke", "after").unwrap();

        restore_backup(
            &manager,
            backup.path.as_ref(),
            super::backup::inspect_backup(&manager, backup.path.as_ref())
                .unwrap()
                .fingerprint,
            json!({ "theme": "macaron", "aiEnabled": false }),
        )
        .unwrap();

        assert_eq!(
            manager.get_metadata("smoke").unwrap().as_deref(),
            Some("before")
        );
        let restored = get_attachment(&manager, &imported.id).unwrap().unwrap();
        assert_eq!(restored.sha256, imported.sha256);
        manager.health_check().unwrap();
    }

    #[test]
    fn vocabulary_survives_backup_restore_and_database_reopen() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app-data")).unwrap();
        let manager = DatabaseManager::open(paths.clone()).unwrap();
        let created = manager
            .with_connection_mut(|connection| {
                repository::create_word(
                    connection,
                    CreateWordInput {
                        word: "persist".to_owned(),
                        meaning: "坚持".to_owned(),
                        phonetic: None,
                        part_of_speech: Some("verb".to_owned()),
                        example_sentence: None,
                        note: None,
                        tags: vec!["核心".to_owned()],
                    },
                    "2026-09-24T02:00:00Z",
                    "2026-09-25T01:00:00Z",
                )
            })
            .unwrap();
        let CreateWordOutcome::Created { word } = created else {
            panic!("expected a newly created word");
        };
        manager
            .with_connection_mut(|connection| {
                repository::resolve_duplicate(
                    connection,
                    ResolveDuplicateInput {
                        word_id: word.id.clone(),
                        resolution: DuplicateResolution::AppendMeaning {
                            meaning: "持续".to_owned(),
                        },
                    },
                    "2026-09-25T02:00:00Z",
                    "2026-09-26T01:00:00Z",
                )
            })
            .unwrap();
        manager
            .with_connection_mut(|connection| {
                review::submit_review(
                    connection,
                    SubmitReviewInput {
                        word_id: word.id.clone(),
                        direction: ReviewDirection::EnToZh,
                        result: ReviewResult::Known,
                        review_state_version: 1,
                        prompted_at: "2026-09-25T02:10:00Z".to_owned(),
                        answer_revealed_at: Some("2026-09-25T02:10:03Z".to_owned()),
                        submitted_at: "2026-09-25T02:10:05Z".to_owned(),
                        local_day_start: "2026-09-24T16:00:00Z".to_owned(),
                        local_day_end: "2026-09-25T16:00:00Z".to_owned(),
                        next_local_day_nine_utc: "2026-09-26T01:00:00Z".to_owned(),
                    },
                )
            })
            .unwrap();

        let backup =
            create_backup(&manager, json!({ "theme": "eye-care", "aiEnabled": false })).unwrap();
        manager
            .with_connection_mut(|connection| {
                repository::delete_words(
                    connection,
                    DeleteWordsInput {
                        word_ids: vec![word.id.clone()],
                    },
                    "2026-09-25T03:00:00Z",
                )
            })
            .unwrap();
        let preview = super::backup::inspect_backup(&manager, backup.path.as_ref()).unwrap();
        restore_backup(
            &manager,
            backup.path.as_ref(),
            preview.fingerprint,
            json!({ "theme": "eye-care", "aiEnabled": false }),
        )
        .unwrap();

        let restored = manager
            .with_connection(|connection| repository::get_word(connection, &word.id))
            .unwrap();
        assert!(restored.deleted_at.is_none());
        assert_eq!(restored.meanings.len(), 2);
        let review_logs: i64 = manager
            .with_connection(|connection| {
                connection
                    .query_row(
                        "SELECT count(*) FROM word_review_logs WHERE word_id=?1",
                        [&word.id],
                        |row| row.get(0),
                    )
                    .map_err(super::error::DataError::from)
            })
            .unwrap();
        assert_eq!(review_logs, 1);

        drop(manager);
        let reopened = DatabaseManager::open(paths).unwrap();
        let reopened_word = reopened
            .with_connection(|connection| repository::get_word(connection, &word.id))
            .unwrap();
        assert_eq!(reopened_word.meanings.len(), 2);
        assert_eq!(reopened_word.review_state.unwrap().review_count, 1,);
    }

    #[test]
    fn vocabulary_photo_import_survives_backup_restore_and_database_reopen() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("handwritten-words.jpg");
        fs::write(&source, b"private handwritten vocabulary photo").unwrap();
        let paths = DataPaths::from_root(temp.path().join("app-data")).unwrap();
        let manager = DatabaseManager::open(paths.clone()).unwrap();
        let attachment = import_attachment(&manager, &source).unwrap();
        let session = manager
            .with_connection_mut(|connection| {
                let draft = import_repository::create_session(
                    connection,
                    vec![attachment.id.clone()],
                    "2026-09-27T01:00:00Z",
                )?;
                let recognizing = import_repository::set_recognizing(
                    connection,
                    &draft.id,
                    draft.version,
                    "2026-09-27T01:01:00Z",
                )?;
                import_repository::replace_candidates(
                    connection,
                    &draft.id,
                    recognizing.version,
                    vec![RecognizedCandidate {
                        word: "diligent".into(),
                        meaning_or_note: Some("勤奋的；我的课堂注释".into()),
                        confidence: ImportConfidence::Confident,
                        image_index: 0,
                        line: Some(1),
                    }],
                    "2026-09-27T01:02:00Z",
                )
            })
            .unwrap();
        let backup = create_backup(
            &manager,
            json!({ "theme": "eye-care", "showManualWordEntry": false }),
        )
        .unwrap();
        manager
            .with_connection_mut(|connection| {
                import_repository::delete_session(
                    connection,
                    &session.id,
                    session.version,
                    "2026-09-27T01:03:00Z",
                )
            })
            .unwrap();

        let preview = super::backup::inspect_backup(&manager, backup.path.as_ref()).unwrap();
        let restored = restore_backup(
            &manager,
            backup.path.as_ref(),
            preview.fingerprint,
            json!({ "theme": "night", "showManualWordEntry": true }),
        )
        .unwrap();
        assert_eq!(restored.settings["showManualWordEntry"], false);
        assert_eq!(
            get_attachment(&manager, &attachment.id)
                .unwrap()
                .unwrap()
                .sha256,
            attachment.sha256
        );
        let restored_session = manager
            .with_connection(|connection| import_repository::get_session(connection, &session.id))
            .unwrap();
        assert_eq!(restored_session.images[0].attachment_id, attachment.id);
        assert_eq!(restored_session.candidates[0].word, "diligent");
        assert_eq!(
            restored_session.candidates[0].meaning_or_note.as_deref(),
            Some("勤奋的；我的课堂注释")
        );

        drop(manager);
        let reopened = DatabaseManager::open(paths).unwrap();
        let reopened_session = reopened
            .with_connection(|connection| import_repository::get_session(connection, &session.id))
            .unwrap();
        assert_eq!(reopened_session.candidates.len(), 1);
        assert_eq!(reopened_session.images[0].attachment_id, attachment.id);
    }

    #[test]
    fn dashboard_tasks_and_study_time_survive_backup_restore_and_reopen() {
        let temp = tempfile::tempdir().unwrap();
        let paths = DataPaths::from_root(temp.path().join("app-data")).unwrap();
        let manager = DatabaseManager::open(paths.clone()).unwrap();
        let task = manager
            .with_connection_mut(|connection| {
                let created = dashboard_repository::create_task(
                    connection,
                    CreateDailyTaskInput {
                        local_date: "2026-09-27".into(),
                        title: "数学刷题".into(),
                        learning_item_id: None,
                    },
                    "2026-09-27T01:00:00Z",
                )?;
                dashboard_repository::set_task_completed(
                    connection,
                    &created.id,
                    created.version,
                    true,
                    "2026-09-27T01:01:00Z",
                )
            })
            .unwrap();
        manager
            .with_connection_mut(|connection| {
                let timer = dashboard_repository::start_timer(connection, "2026-09-27T02:00:00Z")?;
                dashboard_repository::end_timer(
                    connection,
                    &timer.id,
                    timer.version,
                    "2026-09-27T02:15:00Z",
                )
            })
            .unwrap();

        let backup = create_backup(&manager, json!({ "theme": "eye-care" })).unwrap();
        manager
            .with_connection_mut(|connection| {
                dashboard_repository::delete_task(
                    connection,
                    &task.id,
                    task.version,
                    "2026-09-27T03:00:00Z",
                )
            })
            .unwrap();
        let preview = super::backup::inspect_backup(&manager, backup.path.as_ref()).unwrap();
        restore_backup(
            &manager,
            backup.path.as_ref(),
            preview.fingerprint,
            json!({}),
        )
        .unwrap();
        drop(manager);

        let reopened = DatabaseManager::open(paths).unwrap();
        let window = |date: &str, start: &str, end: &str| DailyWindow {
            local_date: date.into(),
            start_utc: start.into(),
            end_utc: end.into(),
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
        let summary = reopened
            .with_connection(|connection| {
                dashboard_repository::get_dashboard_summary(
                    connection,
                    &query,
                    "2026-09-27T03:00:00Z",
                )
            })
            .unwrap();
        assert_eq!(summary.total_tasks, 1);
        assert_eq!(summary.completed_tasks, 1);
        assert_eq!(summary.today_seconds, 900);
        assert_eq!(summary.streak_days, 1);
        assert_eq!(summary.trend.last().unwrap().seconds, 900);
    }
}
