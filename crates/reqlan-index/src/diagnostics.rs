//! Index timing diagnostics store (`index-diagnostics.sqlite`).
//! rq:["../../../reqlan rq/indexer/indexer.rq".index_diagnostics_timing]
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]

use crate::sql_bridge::{execute, execute_batch, query, SqlBridge, SqlBridgeError};
use serde::Deserialize;
use serde_json::{json, Value as JsonValue};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

pub const DIAGNOSTICS_SCHEMA_VERSION: i64 = 2;
pub const MAX_RETAINED_RUNS: i64 = 50;
/// Cap on persisted per-file index issues (mirrors the old Zustand ring).
pub const MAX_FILE_ISSUES: i64 = 500;
/// Cap on persisted document-update / workspace-change activity rings.
pub const MAX_ACTIVITY: i64 = 50;

const BASE_SQL: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )",
    "CREATE TABLE IF NOT EXISTS sync_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        duration_ms REAL NOT NULL,
        trigger TEXT NOT NULL,
        total_files INTEGER NOT NULL,
        skipped_mtime INTEGER NOT NULL,
        indexed_files INTEGER NOT NULL,
        error_files INTEGER NOT NULL,
        cancelled INTEGER NOT NULL DEFAULT 0,
        sum_file_duration_ms REAL NOT NULL DEFAULT 0,
        avg_path_depth REAL
    )",
    "CREATE TABLE IF NOT EXISTS file_timings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL,
        file_uri TEXT NOT NULL,
        duration_ms REAL NOT NULL,
        outcome TEXT NOT NULL,
        path_depth INTEGER NOT NULL,
        FOREIGN KEY (run_id) REFERENCES sync_runs(id) ON DELETE CASCADE
    )",
    "CREATE INDEX IF NOT EXISTS idx_file_timings_run ON file_timings(run_id)",
    "CREATE INDEX IF NOT EXISTS idx_file_timings_duration ON file_timings(duration_ms DESC)",
    // Per-file index issues (parse/extract/persist failures) — persisted so the
    // Ideas Summary problem list survives restart. Replaces the Zustand ring.
    "CREATE TABLE IF NOT EXISTS file_index_issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_uri TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER NOT NULL,
        message TEXT NOT NULL,
        phase TEXT NOT NULL,
        idea_names TEXT,
        cause TEXT,
        at INTEGER NOT NULL
    )",
    "CREATE INDEX IF NOT EXISTS idx_file_index_issues_file ON file_index_issues(file_uri)",
    // Document-update ring — used by the Ideas Summary Timeline \"index\" events.
    "CREATE TABLE IF NOT EXISTS document_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_uri TEXT NOT NULL,
        idea_count INTEGER NOT NULL,
        ideas TEXT,
        at INTEGER NOT NULL
    )",
    // Workspace change ring — created/changed/deleted watcher activity.
    "CREATE TABLE IF NOT EXISTS workspace_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_uri TEXT NOT NULL,
        change TEXT NOT NULL,
        at INTEGER NOT NULL
    )",
];

#[derive(Debug, Error)]
pub enum DiagnosticsError {
    #[error(transparent)]
    Sql(#[from] SqlBridgeError),
    #[error("serde: {0}")]
    Serde(#[from] serde_json::Error),
}

/// One per-file index issue as recorded by the sync/index path.
/// Mirrors the TS `FileIndexIssue` draft minus the owning `fileUri` / `at`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileIssueDraft {
    #[serde(default)]
    pub line: i64,
    #[serde(default)]
    pub column: i64,
    pub message: String,
    pub phase: String,
    #[serde(default)]
    pub idea_names: Option<Vec<String>>,
    #[serde(default)]
    pub cause: Option<String>,
}

pub struct IndexDiagnosticsStore {
    bridge: SqlBridge,
}

impl IndexDiagnosticsStore {
    pub fn open(path: &Path) -> Result<Self, DiagnosticsError> {
        let bridge = SqlBridge::open(path)?;
        let store = Self { bridge };
        store.migrate()?;
        Ok(store)
    }

    pub fn open_in_memory() -> Result<Self, DiagnosticsError> {
        let bridge = SqlBridge::open_in_memory()?;
        let store = Self { bridge };
        store.migrate()?;
        Ok(store)
    }

    fn migrate(&self) -> Result<(), DiagnosticsError> {
        for sql in BASE_SQL {
            execute_batch(self.bridge.connection(), sql)?;
        }
        execute(
            self.bridge.connection(),
            "INSERT INTO meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            &[
                JsonValue::String("schema_version".into()),
                JsonValue::String(DIAGNOSTICS_SCHEMA_VERSION.to_string()),
            ],
        )?;
        Ok(())
    }

    pub fn sql_query(
        &self,
        sql: &str,
        params: &[JsonValue],
    ) -> Result<Vec<JsonValue>, DiagnosticsError> {
        Ok(query(self.bridge.connection(), sql, params)?)
    }

    pub fn sql_execute(&self, sql: &str, params: &[JsonValue]) -> Result<usize, DiagnosticsError> {
        Ok(execute(self.bridge.connection(), sql, params)?)
    }

    pub fn sql_execute_batch(&self, sql: &str) -> Result<(), DiagnosticsError> {
        Ok(execute_batch(self.bridge.connection(), sql)?)
    }

    pub fn last_insert_rowid(&self) -> i64 {
        self.bridge.last_insert_rowid()
    }

    // ---- per-file index issues (persisted problem list) -----------------------

    /// Replace the recorded issues for `file_uri` with `issues`, then trim the
    /// whole table back to [`MAX_FILE_ISSUES`] newest rows.
    pub fn record_file_issues(
        &self,
        file_uri: &str,
        issues: &[FileIssueDraft],
        at_ms: i64,
    ) -> Result<(), DiagnosticsError> {
        let conn = self.bridge.connection();
        execute(
            conn,
            "DELETE FROM file_index_issues WHERE file_uri = ?1",
            &[JsonValue::String(file_uri.into())],
        )?;
        for issue in issues {
            let idea_names = match &issue.idea_names {
                Some(names) if !names.is_empty() => JsonValue::String(serde_json::to_string(names)?),
                _ => JsonValue::Null,
            };
            let cause = match &issue.cause {
                Some(cause) => JsonValue::String(cause.clone()),
                None => JsonValue::Null,
            };
            execute(
                conn,
                "INSERT INTO file_index_issues (file_uri, line, column, message, phase, idea_names, cause, at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                &[
                    JsonValue::String(file_uri.into()),
                    json!(issue.line),
                    json!(issue.column),
                    JsonValue::String(issue.message.clone()),
                    JsonValue::String(issue.phase.clone()),
                    idea_names,
                    cause,
                    json!(at_ms),
                ],
            )?;
        }
        self.trim_ring("file_index_issues", MAX_FILE_ISSUES)?;
        Ok(())
    }

    pub fn clear_file_issues(&self) -> Result<(), DiagnosticsError> {
        execute(self.bridge.connection(), "DELETE FROM file_index_issues", &[])?;
        Ok(())
    }

    pub fn clear_file_issues_for_file(&self, file_uri: &str) -> Result<(), DiagnosticsError> {
        execute(
            self.bridge.connection(),
            "DELETE FROM file_index_issues WHERE file_uri = ?1",
            &[JsonValue::String(file_uri.into())],
        )?;
        Ok(())
    }

    /// All persisted issues, oldest first, shaped like the TS `FileIndexIssue`.
    pub fn list_file_issues(&self) -> Result<Vec<JsonValue>, DiagnosticsError> {
        let rows = query(
            self.bridge.connection(),
            "SELECT file_uri, line, column, message, phase, idea_names, cause, at
             FROM file_index_issues ORDER BY id ASC",
            &[],
        )?;
        Ok(rows.into_iter().map(file_issue_row_to_json).collect())
    }

    pub fn file_issue_count(&self) -> Result<i64, DiagnosticsError> {
        let rows =
            query(self.bridge.connection(), "SELECT COUNT(*) AS n FROM file_index_issues", &[])?;
        Ok(rows.first().and_then(|row| row.get("n")).and_then(JsonValue::as_i64).unwrap_or(0))
    }

    // ---- document-update ring (Timeline index events) -------------------------

    pub fn record_document_update(
        &self,
        file_uri: &str,
        idea_count: i64,
        ideas: &JsonValue,
        at_ms: i64,
    ) -> Result<(), DiagnosticsError> {
        let ideas_col = match ideas {
            JsonValue::Array(items) if !items.is_empty() => {
                JsonValue::String(serde_json::to_string(ideas)?)
            }
            _ => JsonValue::Null,
        };
        execute(
            self.bridge.connection(),
            "INSERT INTO document_updates (file_uri, idea_count, ideas, at) VALUES (?1, ?2, ?3, ?4)",
            &[JsonValue::String(file_uri.into()), json!(idea_count), ideas_col, json!(at_ms)],
        )?;
        self.trim_ring("document_updates", MAX_ACTIVITY)?;
        Ok(())
    }

    /// Newest-first document updates, shaped like the TS `DocumentUpdate`.
    pub fn recent_document_updates(&self, limit: i64) -> Result<Vec<JsonValue>, DiagnosticsError> {
        let rows = query(
            self.bridge.connection(),
            "SELECT file_uri, idea_count, ideas, at FROM document_updates ORDER BY id DESC LIMIT ?1",
            &[json!(limit.max(0))],
        )?;
        Ok(rows.into_iter().map(document_update_row_to_json).collect())
    }

    // ---- workspace change ring ------------------------------------------------

    pub fn record_workspace_change(
        &self,
        file_uri: &str,
        change: &str,
        at_ms: i64,
    ) -> Result<(), DiagnosticsError> {
        execute(
            self.bridge.connection(),
            "INSERT INTO workspace_changes (file_uri, change, at) VALUES (?1, ?2, ?3)",
            &[JsonValue::String(file_uri.into()), JsonValue::String(change.into()), json!(at_ms)],
        )?;
        self.trim_ring("workspace_changes", MAX_ACTIVITY)?;
        Ok(())
    }

    /// Newest-first workspace changes, shaped like the TS `WorkspaceFileChange`.
    pub fn recent_workspace_changes(&self, limit: i64) -> Result<Vec<JsonValue>, DiagnosticsError> {
        let rows = query(
            self.bridge.connection(),
            "SELECT file_uri, change, at FROM workspace_changes ORDER BY id DESC LIMIT ?1",
            &[json!(limit.max(0))],
        )?;
        Ok(rows
            .into_iter()
            .map(|row| {
                json!({
                    "fileUri": row.get("file_uri").cloned().unwrap_or(JsonValue::Null),
                    "change": row.get("change").cloned().unwrap_or(JsonValue::Null),
                    "at": row.get("at").and_then(JsonValue::as_i64).unwrap_or(0),
                })
            })
            .collect())
    }

    /// Drop the document-update + workspace-change rings (Clear & rebuild).
    pub fn clear_activity(&self) -> Result<(), DiagnosticsError> {
        let conn = self.bridge.connection();
        execute(conn, "DELETE FROM document_updates", &[])?;
        execute(conn, "DELETE FROM workspace_changes", &[])?;
        Ok(())
    }

    fn trim_ring(&self, table: &str, cap: i64) -> Result<(), DiagnosticsError> {
        // Keep only the newest `cap` rows by id.
        let sql = format!(
            "DELETE FROM {table} WHERE id <= (
                SELECT id FROM {table} ORDER BY id DESC LIMIT 1 OFFSET ?1
            )"
        );
        execute(self.bridge.connection(), &sql, &[json!(cap.max(0))])?;
        Ok(())
    }
}

/// Current unix time in milliseconds (matches JS `Date.now()`).
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn file_issue_row_to_json(row: JsonValue) -> JsonValue {
    let idea_names = row
        .get("idea_names")
        .and_then(JsonValue::as_str)
        .and_then(|text| serde_json::from_str::<Vec<String>>(text).ok());
    let mut object = json!({
        "fileUri": row.get("file_uri").cloned().unwrap_or(JsonValue::Null),
        "line": row.get("line").and_then(JsonValue::as_i64).unwrap_or(0),
        "column": row.get("column").and_then(JsonValue::as_i64).unwrap_or(0),
        "message": row.get("message").cloned().unwrap_or(JsonValue::Null),
        "phase": row.get("phase").cloned().unwrap_or(JsonValue::Null),
        "at": row.get("at").and_then(JsonValue::as_i64).unwrap_or(0),
    });
    if let Some(names) = idea_names {
        object["ideaNames"] = json!(names);
    }
    if let Some(cause) = row.get("cause").and_then(JsonValue::as_str) {
        object["cause"] = JsonValue::String(cause.to_string());
    }
    object
}

fn document_update_row_to_json(row: JsonValue) -> JsonValue {
    let ideas = row
        .get("ideas")
        .and_then(JsonValue::as_str)
        .and_then(|text| serde_json::from_str::<JsonValue>(text).ok())
        .unwrap_or(JsonValue::Array(Vec::new()));
    json!({
        "fileUri": row.get("file_uri").cloned().unwrap_or(JsonValue::Null),
        "ideaCount": row.get("idea_count").and_then(JsonValue::as_i64).unwrap_or(0),
        "ideas": ideas,
        "at": row.get("at").and_then(JsonValue::as_i64).unwrap_or(0),
    })
}
