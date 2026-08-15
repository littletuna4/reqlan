//! Index timing diagnostics store (`index-diagnostics.sqlite`).
//! rq:["../../../reqlan rq/indexer/indexer.rq".index_diagnostics_timing]
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]

use crate::sql_bridge::{execute, execute_batch, query, SqlBridge, SqlBridgeError};
use serde_json::Value as JsonValue;
use std::path::Path;
use thiserror::Error;

pub const DIAGNOSTICS_SCHEMA_VERSION: i64 = 1;
pub const MAX_RETAINED_RUNS: i64 = 50;

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
];

#[derive(Debug, Error)]
pub enum DiagnosticsError {
    #[error(transparent)]
    Sql(#[from] SqlBridgeError),
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
}
