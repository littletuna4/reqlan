//! SQLite store for CLI/MCP click session cursors.
//! rq:["../../../reqlan rq/cli/click.rq".click_session]
//! rq:["../../../reqlan rq/cli/click.rq".click_session_limit]

use reqlan_index::StoreError;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const MIGRATE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS sessions (
    session_key TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    last_touched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS session_ideas (
    session_key TEXT NOT NULL,
    idea_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    surfaced_at TEXT NOT NULL,
    PRIMARY KEY (session_key, idea_id),
    FOREIGN KEY (session_key) REFERENCES sessions(session_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_last_touched ON sessions(last_touched_at);
"#;

pub struct ClickSessionStore {
    conn: Connection,
    max_sessions: u32,
}

impl ClickSessionStore {
    pub fn open(path: &Path, max_sessions: u32) -> Result<Self, StoreError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")?;
        conn.execute_batch(MIGRATE_SQL)?;
        Ok(Self { conn, max_sessions: normalize_max_sessions(max_sessions) })
    }

    pub fn ensure_session(&mut self, session_key: Option<&str>) -> Result<String, StoreError> {
        let now = now_iso();
        let key = match session_key.map(str::trim).filter(|value| !value.is_empty()) {
            Some(existing) => {
                let updated = self.conn.execute(
                    "UPDATE sessions SET last_touched_at = ?1 WHERE session_key = ?2",
                    params![now, existing],
                )?;
                if updated == 0 {
                    self.conn.execute(
                        "INSERT INTO sessions(session_key, created_at, last_touched_at) VALUES (?1, ?2, ?3)",
                        params![existing, now, now],
                    )?;
                }
                existing.to_string()
            }
            None => {
                let key = new_session_key();
                self.conn.execute(
                    "INSERT INTO sessions(session_key, created_at, last_touched_at) VALUES (?1, ?2, ?3)",
                    params![key, now, now],
                )?;
                key
            }
        };
        self.evict_excess(&key)?;
        Ok(key)
    }

    pub fn surfaced_hashes(
        &self,
        session_key: &str,
    ) -> Result<HashMap<String, String>, StoreError> {
        let mut stmt = self
            .conn
            .prepare("SELECT idea_id, content_hash FROM session_ideas WHERE session_key = ?1")?;
        let rows = stmt.query_map([session_key], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut map = HashMap::new();
        for row in rows {
            let (idea_id, content_hash) = row?;
            map.insert(idea_id, content_hash);
        }
        Ok(map)
    }

    pub fn record_surfaced(
        &mut self,
        session_key: &str,
        ideas: &[(String, String)],
    ) -> Result<(), StoreError> {
        let now = now_iso();
        let tx = self.conn.transaction()?;
        tx.execute(
            "UPDATE sessions SET last_touched_at = ?1 WHERE session_key = ?2",
            params![now, session_key],
        )?;
        for (idea_id, content_hash) in ideas {
            tx.execute(
                "INSERT INTO session_ideas(session_key, idea_id, content_hash, surfaced_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(session_key, idea_id) DO UPDATE SET
                    content_hash = excluded.content_hash,
                    surfaced_at = excluded.surfaced_at",
                params![session_key, idea_id, content_hash, now],
            )?;
        }
        tx.commit()?;
        self.evict_excess(session_key)?;
        Ok(())
    }

    fn evict_excess(&mut self, protect_key: &str) -> Result<(), StoreError> {
        let count: i64 =
            self.conn.query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))?;
        let max = i64::from(self.max_sessions);
        if count <= max {
            return Ok(());
        }
        let excess = count - max;
        let mut stmt = self.conn.prepare(
            "SELECT session_key FROM sessions
             WHERE session_key != ?1
             ORDER BY last_touched_at ASC, created_at ASC
             LIMIT ?2",
        )?;
        let keys: Vec<String> = stmt
            .query_map(params![protect_key, excess], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        for key in keys {
            self.conn.execute("DELETE FROM sessions WHERE session_key = ?1", params![key])?;
        }
        Ok(())
    }

    #[cfg(test)]
    pub fn session_count(&self) -> Result<i64, StoreError> {
        self.conn
            .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
            .map_err(Into::into)
    }

    #[cfg(test)]
    pub fn has_session(&self, session_key: &str) -> Result<bool, StoreError> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM sessions WHERE session_key = ?1",
            [session_key],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }
}

pub fn normalize_max_sessions(value: u32) -> u32 {
    if value == 0 {
        1
    } else {
        value
    }
}

fn now_iso() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format!("{millis}")
}

fn new_session_key() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("clk-{nanos:x}")
}
