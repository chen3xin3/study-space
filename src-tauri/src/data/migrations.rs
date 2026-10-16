use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};

use crate::data::error::DataError;

const FOUNDATION_SCHEMA: &str = r#"
CREATE TABLE app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size >= 0),
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);

CREATE INDEX attachments_active_created_idx
ON attachments(deleted_at, created_at DESC);

CREATE TABLE backup_history (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size >= 0),
  status TEXT NOT NULL CHECK(status IN ('completed', 'failed', 'restored')),
  app_version TEXT NOT NULL,
  error_message TEXT
);

CREATE INDEX backup_history_created_idx
ON backup_history(created_at DESC);
"#;

const VOCABULARY_SCHEMA: &str = r#"
CREATE TABLE words (
  id TEXT PRIMARY KEY,
  display_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  phonetic TEXT,
  part_of_speech TEXT,
  example_sentence TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE UNIQUE INDEX words_active_normalized_idx
ON words(normalized_text) WHERE deleted_at IS NULL;
CREATE INDEX words_active_updated_idx ON words(deleted_at, updated_at DESC, id);

CREATE TABLE word_meanings (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id),
  meaning TEXT NOT NULL,
  normalized_meaning TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE UNIQUE INDEX word_meanings_active_unique_idx
ON word_meanings(word_id, normalized_meaning) WHERE deleted_at IS NULL;
CREATE INDEX word_meanings_word_idx ON word_meanings(word_id, deleted_at);

CREATE TABLE word_tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE UNIQUE INDEX word_tags_active_normalized_idx
ON word_tags(normalized_name) WHERE deleted_at IS NULL;

CREATE TABLE word_tag_relations (
  word_id TEXT NOT NULL REFERENCES words(id),
  tag_id TEXT NOT NULL REFERENCES word_tags(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(word_id, tag_id)
);
CREATE INDEX word_tag_relations_tag_idx ON word_tag_relations(tag_id, word_id);

CREATE TABLE word_learning_logs (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id),
  action TEXT NOT NULL CHECK(action IN ('created','encountered','meaning_added','restored')),
  note TEXT,
  occurred_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE INDEX word_learning_logs_word_time_idx
ON word_learning_logs(word_id, occurred_at DESC);
CREATE INDEX word_learning_logs_time_idx ON word_learning_logs(occurred_at);

CREATE TABLE word_review_state (
  word_id TEXT PRIMARY KEY REFERENCES words(id),
  next_review_at TEXT NOT NULL,
  interval_days INTEGER NOT NULL DEFAULT 0 CHECK(interval_days >= 0),
  last_result TEXT CHECK(last_result IN ('known','fuzzy','unknown')),
  review_count INTEGER NOT NULL DEFAULT 0 CHECK(review_count >= 0),
  lapse_count INTEGER NOT NULL DEFAULT 0 CHECK(lapse_count >= 0),
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE INDEX word_review_state_due_idx ON word_review_state(next_review_at, word_id);

CREATE TABLE word_review_logs (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id),
  direction TEXT NOT NULL CHECK(direction IN ('en_to_zh','zh_to_en')),
  result TEXT NOT NULL CHECK(result IN ('known','fuzzy','unknown')),
  prompted_at TEXT NOT NULL,
  answer_revealed_at TEXT,
  submitted_at TEXT NOT NULL,
  previous_review_at TEXT,
  next_review_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE INDEX word_review_logs_word_time_idx
ON word_review_logs(word_id, submitted_at DESC);
CREATE INDEX word_review_logs_time_idx ON word_review_logs(submitted_at);
"#;

const ESSAY_AI_SCHEMA: &str = r#"
CREATE TABLE essay_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE UNIQUE INDEX essay_categories_active_name_idx
ON essay_categories(normalized_name) WHERE deleted_at IS NULL;

CREATE TABLE essays (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  translation TEXT,
  exam_track TEXT CHECK(exam_track IN ('english_1','english_2')),
  essay_type TEXT NOT NULL CHECK(essay_type IN ('small','large','custom')),
  source TEXT,
  note TEXT,
  category_id TEXT REFERENCES essay_categories(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE INDEX essays_active_updated_idx ON essays(deleted_at, updated_at DESC, id);
CREATE INDEX essays_category_idx ON essays(category_id, deleted_at, updated_at DESC);

CREATE TABLE essay_expressions (
  id TEXT PRIMARY KEY,
  essay_id TEXT NOT NULL REFERENCES essays(id),
  expression TEXT NOT NULL,
  explanation TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE INDEX essay_expressions_essay_idx
ON essay_expressions(essay_id, deleted_at, sort_order, id);

CREATE TABLE essay_tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE UNIQUE INDEX essay_tags_active_name_idx
ON essay_tags(normalized_name) WHERE deleted_at IS NULL;

CREATE TABLE essay_tag_relations (
  essay_id TEXT NOT NULL REFERENCES essays(id),
  tag_id TEXT NOT NULL REFERENCES essay_tags(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(essay_id, tag_id)
);
CREATE INDEX essay_tag_relations_tag_idx ON essay_tag_relations(tag_id, essay_id);

CREATE TABLE essay_attempts (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK(mode IN ('independent','dictation')),
  source_essay_id TEXT REFERENCES essays(id),
  title TEXT NOT NULL,
  prompt TEXT,
  scoring_criteria TEXT,
  body TEXT NOT NULL DEFAULT '',
  note TEXT,
  exam_track TEXT CHECK(exam_track IN ('english_1','english_2')),
  essay_type TEXT NOT NULL CHECK(essay_type IN ('small','large','custom')),
  status TEXT NOT NULL CHECK(status IN ('draft','completed')),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE INDEX essay_attempts_active_updated_idx
ON essay_attempts(deleted_at, updated_at DESC, id);
CREATE INDEX essay_attempts_source_idx
ON essay_attempts(source_essay_id, deleted_at, updated_at DESC);

CREATE TABLE essay_attempt_attachments (
  attempt_id TEXT NOT NULL REFERENCES essay_attempts(id),
  attachment_id TEXT NOT NULL REFERENCES attachments(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(attempt_id, attachment_id)
);
CREATE INDEX essay_attempt_attachments_attachment_idx
ON essay_attempt_attachments(attachment_id, attempt_id);

CREATE TABLE ai_settings (
  singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  provider_name TEXT NOT NULL DEFAULT '',
  api_url TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
INSERT INTO ai_settings
  (singleton_id, enabled, provider_name, api_url, model, updated_at, version)
VALUES (1, 0, '', '', '', '1970-01-01T00:00:00Z', 1);

CREATE TABLE ai_requests (
  id TEXT PRIMARY KEY,
  feature TEXT NOT NULL CHECK(feature = 'essay_review'),
  attempt_id TEXT NOT NULL REFERENCES essay_attempts(id),
  provider_name TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','succeeded','failed')),
  error_code TEXT,
  retry_of TEXT REFERENCES ai_requests(id),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE INDEX ai_requests_attempt_idx
ON ai_requests(attempt_id, created_at DESC, id);

CREATE TABLE essay_ai_reviews (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES ai_requests(id),
  attempt_id TEXT NOT NULL REFERENCES essay_attempts(id),
  reference_score REAL,
  max_score REAL,
  rationale TEXT NOT NULL,
  grammar_json TEXT NOT NULL,
  wording_json TEXT NOT NULL,
  content_analysis TEXT NOT NULL,
  sentence_suggestions_json TEXT NOT NULL,
  optimized_essay TEXT NOT NULL,
  expressions_json TEXT NOT NULL,
  recognized_text TEXT,
  safe_raw_response TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  model TEXT NOT NULL,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE INDEX essay_ai_reviews_attempt_idx
ON essay_ai_reviews(attempt_id, created_at DESC, id);
"#;

const VOCABULARY_IMPORT_SCHEMA: &str = r#"
CREATE TABLE vocabulary_import_sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('draft','recognizing','reviewing','completed','failed')),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE INDEX vocabulary_import_sessions_open_idx
ON vocabulary_import_sessions(deleted_at, status, updated_at DESC, id);

CREATE TABLE vocabulary_import_images (
  session_id TEXT NOT NULL REFERENCES vocabulary_import_sessions(id),
  attachment_id TEXT NOT NULL REFERENCES attachments(id),
  sort_order INTEGER NOT NULL CHECK(sort_order >= 0),
  rotation_degrees INTEGER NOT NULL DEFAULT 0
    CHECK(rotation_degrees IN (0,90,180,270)),
  PRIMARY KEY(session_id, attachment_id)
);
CREATE INDEX vocabulary_import_images_attachment_idx
ON vocabulary_import_images(attachment_id, session_id);

CREATE TABLE vocabulary_import_candidates (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES vocabulary_import_sessions(id),
  word TEXT NOT NULL,
  meaning_or_note TEXT,
  confidence TEXT NOT NULL CHECK(confidence IN ('confident','uncertain')),
  source_attachment_id TEXT REFERENCES attachments(id),
  source_line INTEGER CHECK(source_line IS NULL OR source_line >= 0),
  selected INTEGER NOT NULL DEFAULT 1 CHECK(selected IN (0,1)),
  resolution TEXT CHECK(resolution IN (
    'create','encounter_only','append_meaning','restore_and_append','skip'
  )),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE INDEX vocabulary_import_candidates_session_idx
ON vocabulary_import_candidates(session_id, deleted_at, source_line, id);
"#;

const DASHBOARD_SCHEMA: &str = r#"
CREATE TABLE daily_tasks (
  id TEXT PRIMARY KEY,
  local_date TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
  position INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE INDEX daily_tasks_day_idx
ON daily_tasks(local_date, deleted_at, completed_at, position, created_at, id);

CREATE TABLE study_timers (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('running','paused','completed')),
  current_started_at TEXT,
  accumulated_seconds INTEGER NOT NULL DEFAULT 0 CHECK(accumulated_seconds >= 0),
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE UNIQUE INDEX study_timers_one_open_idx
ON study_timers((1)) WHERE status IN ('running','paused');

CREATE TABLE study_timer_segments (
  id TEXT PRIMARY KEY,
  timer_id TEXT NOT NULL REFERENCES study_timers(id),
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL CHECK(duration_seconds >= 0),
  created_at TEXT NOT NULL
);
CREATE INDEX study_timer_segments_time_idx
ON study_timer_segments(started_at, ended_at, timer_id);
"#;

const PHOTO_ARCHIVE_SCHEMA: &str = r#"
CREATE TABLE study_photos (
  attachment_id TEXT PRIMARY KEY REFERENCES attachments(id),
  study_date TEXT NOT NULL,
  study_date_confirmed INTEGER NOT NULL CHECK(study_date_confirmed IN (0,1)),
  title TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK(kind IN ('english','essay','other')),
  memorized INTEGER NOT NULL DEFAULT 0 CHECK(memorized IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE INDEX study_photos_date_idx ON study_photos(study_date DESC, attachment_id);
"#;

const ESSAY_PHOTO_SOURCES_SCHEMA: &str = r#"
CREATE TABLE essay_photo_sources (
  essay_id TEXT NOT NULL REFERENCES essays(id),
  attachment_id TEXT NOT NULL REFERENCES attachments(id),
  sort_order INTEGER NOT NULL CHECK(sort_order >= 0),
  PRIMARY KEY(essay_id, attachment_id)
);
CREATE INDEX essay_photo_sources_attachment_idx
ON essay_photo_sources(attachment_id, essay_id);
"#;

const FOCUS_SCHEMA: &str = r#"
CREATE TABLE focus_sessions (
  timer_id TEXT PRIMARY KEY REFERENCES study_timers(id),
  mode TEXT NOT NULL CHECK(mode IN ('open','pomodoro')),
  subject TEXT NOT NULL CHECK(subject IN ('english','math','specialty','politics','other')),
  goal TEXT NOT NULL DEFAULT '',
  work_seconds INTEGER NOT NULL CHECK(work_seconds BETWEEN 60 AND 14400),
  break_seconds INTEGER NOT NULL CHECK(break_seconds BETWEEN 0 AND 3600),
  phase TEXT NOT NULL CHECK(phase IN ('work','break','finished')),
  phase_started_at TEXT NOT NULL,
  cycle_number INTEGER NOT NULL DEFAULT 1 CHECK(cycle_number >= 1),
  cycle_start_seconds INTEGER NOT NULL DEFAULT 0 CHECK(cycle_start_seconds >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX focus_sessions_subject_idx ON focus_sessions(subject, created_at DESC);
"#;

const INBOX_SCHEMA: &str = r#"
CREATE TABLE inbox_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE UNIQUE INDEX inbox_folder_name_idx ON inbox_folders(name) WHERE deleted_at IS NULL;
CREATE TABLE inbox_items (
  id TEXT PRIMARY KEY,
  folder_id TEXT REFERENCES inbox_folders(id),
  attachment_id TEXT REFERENCES attachments(id),
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK(kind IN ('image','document','note')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE INDEX inbox_items_folder_idx ON inbox_items(folder_id, deleted_at, created_at DESC);
INSERT INTO inbox_items
  (id, folder_id, attachment_id, title, note, kind, created_at, updated_at, version)
SELECT lower(hex(randomblob(16))), NULL, p.attachment_id,
       CASE WHEN p.title <> '' THEN p.title ELSE a.original_name END,
       '', 'image', a.created_at, a.updated_at, 1
FROM study_photos p JOIN attachments a ON a.id=p.attachment_id
WHERE a.deleted_at IS NULL;
"#;

const FOCUS_SYSTEM_SCHEMA: &str = r#"
CREATE TABLE focus_plans (
  id TEXT PRIMARY KEY,
  local_date TEXT NOT NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL CHECK(subject IN ('english','math','specialty','politics','other')),
  estimated_cycles INTEGER NOT NULL CHECK(estimated_cycles BETWEEN 1 AND 24),
  completed_cycles INTEGER NOT NULL DEFAULT 0 CHECK(completed_cycles >= 0),
  repeat_rule TEXT NOT NULL DEFAULT 'none' CHECK(repeat_rule IN ('none','daily','weekdays','weekly')),
  linked_daily_task_id TEXT,
  completed_at TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE INDEX focus_plans_day_position_idx
ON focus_plans(local_date, position, created_at);

CREATE TABLE focus_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('open','pomodoro')),
  work_seconds INTEGER NOT NULL CHECK(work_seconds BETWEEN 60 AND 14400),
  short_break_seconds INTEGER NOT NULL CHECK(short_break_seconds BETWEEN 0 AND 3600),
  long_break_seconds INTEGER NOT NULL CHECK(long_break_seconds BETWEEN 0 AND 7200),
  cycles_per_set INTEGER NOT NULL CHECK(cycles_per_set BETWEEN 1 AND 12),
  long_break_after_cycles INTEGER NOT NULL CHECK(long_break_after_cycles BETWEEN 1 AND 12),
  auto_start_break INTEGER NOT NULL DEFAULT 0 CHECK(auto_start_break IN (0,1)),
  auto_start_work INTEGER NOT NULL DEFAULT 0 CHECK(auto_start_work IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);

ALTER TABLE focus_sessions ADD COLUMN plan_id TEXT REFERENCES focus_plans(id);
ALTER TABLE focus_sessions ADD COLUMN preset_id TEXT REFERENCES focus_presets(id);
ALTER TABLE focus_sessions ADD COLUMN long_break_seconds INTEGER NOT NULL DEFAULT 900
  CHECK(long_break_seconds BETWEEN 0 AND 7200);
ALTER TABLE focus_sessions ADD COLUMN cycles_per_set INTEGER NOT NULL DEFAULT 4
  CHECK(cycles_per_set BETWEEN 1 AND 12);
ALTER TABLE focus_sessions ADD COLUMN long_break_after_cycles INTEGER NOT NULL DEFAULT 4
  CHECK(long_break_after_cycles BETWEEN 1 AND 12);
ALTER TABLE focus_sessions ADD COLUMN auto_start_break INTEGER NOT NULL DEFAULT 0
  CHECK(auto_start_break IN (0,1));
ALTER TABLE focus_sessions ADD COLUMN auto_start_work INTEGER NOT NULL DEFAULT 0
  CHECK(auto_start_work IN (0,1));

CREATE TABLE focus_interruptions (
  id TEXT PRIMARY KEY,
  timer_id TEXT NOT NULL REFERENCES focus_sessions(timer_id),
  reason TEXT NOT NULL CHECK(reason IN ('phone','urgent','environment','physical','other')),
  note TEXT NOT NULL DEFAULT '',
  elapsed_seconds INTEGER NOT NULL CHECK(elapsed_seconds >= 0),
  created_at TEXT NOT NULL
);
CREATE INDEX focus_interruptions_timer_time_idx
ON focus_interruptions(timer_id, created_at);

CREATE TABLE focus_reviews (
  timer_id TEXT PRIMARY KEY REFERENCES focus_sessions(timer_id),
  plan_completed INTEGER NOT NULL CHECK(plan_completed IN (0,1)),
  completed_cycles INTEGER NOT NULL CHECK(completed_cycles >= 0),
  focus_rating INTEGER NOT NULL CHECK(focus_rating BETWEEN 1 AND 5),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO focus_presets
  (id, name, mode, work_seconds, short_break_seconds, long_break_seconds,
   cycles_per_set, long_break_after_cycles, auto_start_break, auto_start_work,
   created_at, updated_at, version)
VALUES
  ('builtin-25-5', '经典番茄', 'pomodoro', 1500, 300, 900, 4, 4, 0, 0,
   '2026-10-02T00:00:00Z', '2026-10-02T00:00:00Z', 1),
  ('builtin-50-10', '深度学习', 'pomodoro', 3000, 600, 1200, 4, 4, 0, 0,
   '2026-10-02T00:00:00Z', '2026-10-02T00:00:00Z', 1),
  ('builtin-90-20', '沉浸长时段', 'pomodoro', 5400, 1200, 1800, 2, 2, 0, 0,
   '2026-10-02T00:00:00Z', '2026-10-02T00:00:00Z', 1);
"#;

const LEARNING_ITEMS_SCHEMA: &str = r#"
CREATE TABLE learning_items (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL CHECK(subject IN ('english','math','specialty','politics','other')),
  collection TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('note','question','material','practice','exam')),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  mastery TEXT NOT NULL DEFAULT 'new'
    CHECK(mastery IN ('new','learning','familiar','mastered')),
  source TEXT NOT NULL DEFAULT '',
  score REAL,
  max_score REAL,
  review_at TEXT,
  favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)),
  last_opened_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE INDEX learning_items_scope_idx
ON learning_items(subject, collection, deleted_at, updated_at DESC);
CREATE INDEX learning_items_favorite_idx
ON learning_items(favorite, deleted_at, updated_at DESC);
"#;

const LEARNING_CONTEXT_LINKS_SCHEMA: &str = r#"
ALTER TABLE daily_tasks ADD COLUMN learning_item_id TEXT REFERENCES learning_items(id);
ALTER TABLE focus_plans ADD COLUMN learning_item_id TEXT REFERENCES learning_items(id);
ALTER TABLE focus_sessions ADD COLUMN learning_item_id TEXT REFERENCES learning_items(id);
CREATE INDEX daily_tasks_learning_item_idx ON daily_tasks(learning_item_id, local_date);
CREATE INDEX focus_plans_learning_item_idx ON focus_plans(learning_item_id, local_date);
CREATE INDEX focus_sessions_learning_item_idx ON focus_sessions(learning_item_id, created_at);
"#;

const FOCUS_DAILY_TASK_LINK_SCHEMA: &str = r#"
ALTER TABLE focus_sessions ADD COLUMN daily_task_id TEXT REFERENCES daily_tasks(id);
CREATE INDEX focus_sessions_daily_task_idx ON focus_sessions(daily_task_id, created_at);
"#;

const PHOTO_TRASH_SCHEMA: &str = r#"
ALTER TABLE study_photos ADD COLUMN deleted_at TEXT;
CREATE INDEX study_photos_deleted_date_idx
ON study_photos(deleted_at, study_date DESC, attachment_id);
"#;

const ESSAY_IMPORT_DRAFT_SCHEMA: &str = r#"
CREATE TABLE essay_import_drafts (
  id TEXT PRIMARY KEY,
  stage TEXT NOT NULL CHECK(stage IN ('draft','review','failed')),
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  translation TEXT NOT NULL DEFAULT '',
  exam_track TEXT CHECK(exam_track IS NULL OR exam_track IN ('english_1','english_2')),
  essay_type TEXT NOT NULL CHECK(essay_type IN ('small','large','custom')),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1)
);
CREATE TABLE essay_import_draft_attachments (
  draft_id TEXT NOT NULL REFERENCES essay_import_drafts(id) ON DELETE CASCADE,
  attachment_id TEXT NOT NULL REFERENCES attachments(id),
  position INTEGER NOT NULL CHECK(position >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY(draft_id, attachment_id),
  UNIQUE(draft_id, position)
);
CREATE INDEX essay_import_drafts_updated_idx
ON essay_import_drafts(updated_at DESC, id);
CREATE INDEX essay_import_draft_attachments_attachment_idx
ON essay_import_draft_attachments(attachment_id, draft_id);
"#;

fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(FOUNDATION_SCHEMA),
        M::up(VOCABULARY_SCHEMA),
        M::up(ESSAY_AI_SCHEMA),
        M::up(VOCABULARY_IMPORT_SCHEMA),
        M::up(DASHBOARD_SCHEMA),
        M::up(PHOTO_ARCHIVE_SCHEMA),
        M::up(ESSAY_PHOTO_SOURCES_SCHEMA),
        M::up(FOCUS_SCHEMA),
        M::up(INBOX_SCHEMA),
        M::up(FOCUS_SYSTEM_SCHEMA),
        M::up(LEARNING_ITEMS_SCHEMA),
        M::up(LEARNING_CONTEXT_LINKS_SCHEMA),
        M::up(FOCUS_DAILY_TASK_LINK_SCHEMA),
        M::up(PHOTO_TRASH_SCHEMA),
        M::up(ESSAY_IMPORT_DRAFT_SCHEMA),
    ])
}

pub fn migrate(connection: &mut Connection) -> Result<(), DataError> {
    migrations()
        .to_latest(connection)
        .map_err(|error| DataError::database_migration_failed(error.to_string()))
}

pub fn schema_version(connection: &Connection) -> Result<usize, DataError> {
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| DataError::database_open_failed(error.to_string()))?;
    usize::try_from(version).map_err(|error| DataError::database_open_failed(error.to_string()))
}

#[cfg(test)]
pub fn validate_migrations() -> Result<(), DataError> {
    migrations()
        .validate()
        .map_err(|error| DataError::database_migration_failed(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn essay_import_drafts_are_available_after_upgrade() {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        for table in ["essay_import_drafts", "essay_import_draft_attachments"] {
            let count: i64 = connection
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "missing table {table}");
        }
        let stage_count: i64 = connection
            .query_row(
                "SELECT count(*) FROM pragma_table_info('essay_import_drafts') WHERE name='stage'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stage_count, 1);
        assert_eq!(schema_version(&connection).unwrap(), 15);
    }

    #[test]
    fn learning_context_links_are_available_after_upgrade() {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        for (table, column) in [
            ("daily_tasks", "learning_item_id"),
            ("focus_plans", "learning_item_id"),
            ("focus_sessions", "learning_item_id"),
            ("focus_sessions", "daily_task_id"),
        ] {
            let count: i64 = connection.query_row(
                "SELECT count(*) FROM pragma_table_info(?1) WHERE name=?2",
                rusqlite::params![table, column],
                |row| row.get(0),
            ).unwrap();
            assert_eq!(count, 1, "missing {table}.{column}");
        }
        assert_eq!(schema_version(&connection).unwrap(), 15);
    }

    #[test]
    fn learning_item_schema_is_available_after_upgrade() {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        let table_count: i64 = connection
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='learning_items'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(table_count, 1);
        assert_eq!(schema_version(&connection).unwrap(), 15);
    }

    #[test]
    fn study_photo_schema_is_available_after_upgrade() {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        let table_count: i64 = connection
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='study_photos'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(table_count, 1);
        let deleted_at_count: i64 = connection
            .query_row(
                "SELECT count(*) FROM pragma_table_info('study_photos') WHERE name='deleted_at'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(deleted_at_count, 1);
        assert_eq!(schema_version(&connection).unwrap(), 15);
    }

    #[test]
    fn focus_metadata_schema_is_available_after_upgrade() {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        let table_count: i64 = connection
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='focus_sessions'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(table_count, 1);
        assert_eq!(schema_version(&connection).unwrap(), 15);
    }

    #[test]
    fn migrations_create_all_tables_idempotently() {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        migrate(&mut connection).unwrap();
        for table in [
            "app_metadata",
            "attachments",
            "backup_history",
            "words",
            "word_meanings",
            "word_tags",
            "word_tag_relations",
            "word_learning_logs",
            "word_review_state",
            "word_review_logs",
            "essay_categories",
            "essays",
            "essay_expressions",
            "essay_tags",
            "essay_tag_relations",
            "essay_attempts",
            "essay_attempt_attachments",
            "ai_settings",
            "ai_requests",
            "essay_ai_reviews",
            "vocabulary_import_sessions",
            "vocabulary_import_images",
            "vocabulary_import_candidates",
            "daily_tasks",
            "study_timers",
            "study_timer_segments",
            "study_photos",
            "essay_photo_sources",
            "focus_sessions",
            "focus_plans",
            "focus_presets",
            "focus_interruptions",
            "focus_reviews",
            "inbox_folders",
            "inbox_items",
            "learning_items",
        ] {
            let count: i64 = connection
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1);
        }
        assert_eq!(schema_version(&connection).unwrap(), 15);
    }

    #[test]
    fn foundation_database_upgrades_to_latest_schema() {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        Migrations::new(vec![M::up(FOUNDATION_SCHEMA)])
            .to_latest(&mut connection)
            .unwrap();
        assert_eq!(schema_version(&connection).unwrap(), 1);

        migrate(&mut connection).unwrap();

        assert_eq!(schema_version(&connection).unwrap(), 15);
        let words_table: i64 = connection
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='words'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(words_table, 1);
    }

    #[test]
    fn vocabulary_database_upgrades_to_essay_schema() {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        Migrations::new(vec![M::up(FOUNDATION_SCHEMA), M::up(VOCABULARY_SCHEMA)])
            .to_latest(&mut connection)
            .unwrap();
        assert_eq!(schema_version(&connection).unwrap(), 2);

        migrate(&mut connection).unwrap();

        for table in [
            "essay_categories",
            "essays",
            "essay_expressions",
            "essay_tags",
            "essay_tag_relations",
            "essay_attempts",
            "essay_attempt_attachments",
            "ai_settings",
            "ai_requests",
            "essay_ai_reviews",
        ] {
            let count: i64 = connection
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "missing table {table}");
        }
        assert_eq!(schema_version(&connection).unwrap(), 15);
    }

    #[test]
    fn essay_database_upgrades_to_photo_import_schema() {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        Migrations::new(vec![
            M::up(FOUNDATION_SCHEMA),
            M::up(VOCABULARY_SCHEMA),
            M::up(ESSAY_AI_SCHEMA),
        ])
        .to_latest(&mut connection)
        .unwrap();
        assert_eq!(schema_version(&connection).unwrap(), 3);

        migrate(&mut connection).unwrap();

        for table in [
            "vocabulary_import_sessions",
            "vocabulary_import_images",
            "vocabulary_import_candidates",
        ] {
            let count: i64 = connection
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "missing table {table}");
        }
        assert_eq!(schema_version(&connection).unwrap(), 15);
    }

    #[test]
    fn version_nine_focus_data_upgrades_without_losing_sessions() {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        Migrations::new(vec![
            M::up(FOUNDATION_SCHEMA),
            M::up(VOCABULARY_SCHEMA),
            M::up(ESSAY_AI_SCHEMA),
            M::up(VOCABULARY_IMPORT_SCHEMA),
            M::up(DASHBOARD_SCHEMA),
            M::up(PHOTO_ARCHIVE_SCHEMA),
            M::up(ESSAY_PHOTO_SOURCES_SCHEMA),
            M::up(FOCUS_SCHEMA),
            M::up(INBOX_SCHEMA),
        ])
        .to_latest(&mut connection)
        .unwrap();
        connection
            .execute_batch(
                "INSERT INTO study_timers
               (id, status, current_started_at, accumulated_seconds, ended_at,
                created_at, updated_at, version)
             VALUES
               ('legacy-timer', 'completed', NULL, 1500, '2026-10-01T08:25:00Z',
                '2026-10-01T08:00:00Z', '2026-10-01T08:25:00Z', 2);
             INSERT INTO focus_sessions
               (timer_id, mode, subject, goal, work_seconds, break_seconds, phase,
                phase_started_at, cycle_number, cycle_start_seconds, created_at, updated_at)
             VALUES
               ('legacy-timer', 'pomodoro', 'english', 'legacy focus', 1500, 300,
                'finished', '2026-10-01T08:25:00Z', 1, 0,
                '2026-10-01T08:00:00Z', '2026-10-01T08:25:00Z');",
            )
            .unwrap();

        migrate(&mut connection).unwrap();

        assert_eq!(schema_version(&connection).unwrap(), 15);
        for table in [
            "focus_plans",
            "focus_presets",
            "focus_interruptions",
            "focus_reviews",
        ] {
            let count: i64 = connection
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "missing table {table}");
        }
        let legacy: (String, i64, i64, i64) = connection
            .query_row(
                "SELECT goal, long_break_seconds, cycles_per_set, long_break_after_cycles
             FROM focus_sessions WHERE timer_id='legacy-timer'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(legacy, ("legacy focus".into(), 900, 4, 4));
    }

    #[test]
    fn migration_definition_validates() {
        validate_migrations().unwrap();
    }
}
