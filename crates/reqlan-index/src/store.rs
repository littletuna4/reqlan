//! rusqlite store matching schema v4.
//! rq:["../../../reqlan rq/indexer/indexer.rq".index]
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]

use crate::schema::{version_migrations, BASE_MIGRATIONS, SCHEMA_VERSION};
use crate::sql_bridge::{execute, execute_batch, query, SqlBridgeError};
use crate::types::{
    to_summary, EdgeKind, EdgeRecord, IdeaKind, IdeaRecord, IdeaSummary, IndexedDocument,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("sql bridge: {0}")]
    SqlBridge(#[from] SqlBridgeError),
}

pub struct IndexStore {
    conn: Connection,
}

impl IndexStore {
    pub fn open(path: &Path) -> Result<Self, StoreError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;
        let store = Self { conn };
        store.migrate()?;
        Ok(store)
    }

    pub fn open_in_memory() -> Result<Self, StoreError> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        let store = Self { conn };
        store.migrate()?;
        Ok(store)
    }

    fn migrate(&self) -> Result<(), StoreError> {
        for statement in BASE_MIGRATIONS {
            self.conn.execute_batch(statement)?;
        }
        let current: i64 = self
            .conn
            .query_row("SELECT value FROM meta WHERE key = 'schema_version'", [], |row| {
                let value: String = row.get(0)?;
                Ok(value.parse().unwrap_or(1))
            })
            .optional()?
            .unwrap_or(1);
        for version in (current + 1)..=SCHEMA_VERSION {
            for statement in version_migrations(version) {
                if let Err(error) = self.conn.execute_batch(statement) {
                    let message = error.to_string();
                    if !message.contains("duplicate column") {
                        return Err(error.into());
                    }
                }
            }
        }
        self.conn.execute(
            "INSERT INTO meta(key, value) VALUES ('schema_version', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![SCHEMA_VERSION.to_string()],
        )?;
        Ok(())
    }

    pub fn schema_version(&self) -> Result<i64, StoreError> {
        self.conn
            .query_row("SELECT value FROM meta WHERE key = 'schema_version'", [], |row| {
                let value: String = row.get(0)?;
                Ok(value.parse().unwrap_or(0))
            })
            .map_err(Into::into)
    }

    pub fn get_document_hash(&self, file_uri: &str) -> Result<Option<String>, StoreError> {
        self.conn
            .query_row(
                "SELECT content_hash FROM documents WHERE file_uri = ?1",
                [file_uri],
                |row| row.get(0),
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn get_document_mtime_ms(&self, file_uri: &str) -> Result<Option<f64>, StoreError> {
        self.conn
            .query_row("SELECT mtime_ms FROM documents WHERE file_uri = ?1", [file_uri], |row| {
                row.get(0)
            })
            .optional()
            .map_err(Into::into)
    }

    pub fn list_document_mtimes(&self) -> Result<HashMap<String, Option<f64>>, StoreError> {
        let mut stmt = self.conn.prepare("SELECT file_uri, mtime_ms FROM documents")?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<f64>>(1)?)))?;
        let mut map = HashMap::new();
        for row in rows {
            let (uri, mtime) = row?;
            map.insert(uri, mtime);
        }
        Ok(map)
    }

    /// Indexed `.rq` document URIs for file-name search.
    /// rq:["../../../reqlan rq/core_analysis/search.rq".file_search]
    pub fn list_document_uris(&self) -> Result<Vec<String>, StoreError> {
        let mut stmt = self.conn.prepare("SELECT file_uri FROM documents ORDER BY file_uri")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn update_document_mtime(&self, file_uri: &str, mtime_ms: f64) -> Result<(), StoreError> {
        self.conn.execute(
            "UPDATE documents SET mtime_ms = ?1, indexed_at = datetime('now') WHERE file_uri = ?2",
            params![mtime_ms, file_uri],
        )?;
        Ok(())
    }

    pub fn upsert_document(
        &mut self,
        file_uri: &str,
        content_hash: &str,
        ideas: &[IdeaRecord],
        edges: &[EdgeRecord],
        mtime_ms: Option<f64>,
    ) -> Result<(), StoreError> {
        let tx = self.conn.transaction()?;
        let existing: HashMap<String, (Option<String>, Option<String>, Option<i64>)> = {
            let mut stmt = tx.prepare(
                "SELECT id, git_created_at, git_modified_at, git_change_count FROM ideas WHERE file_uri = ?1",
            )?;
            let rows = stmt.query_map([file_uri], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<i64>>(3)?,
                ))
            })?;
            let mut map = HashMap::new();
            for row in rows {
                let (id, created, modified, count) = row?;
                map.insert(id, (created, modified, count));
            }
            map
        };
        tx.execute(
            "DELETE FROM edges WHERE source_id IN (SELECT id FROM ideas WHERE file_uri = ?1)",
            [file_uri],
        )?;
        tx.execute("DELETE FROM ideas WHERE file_uri = ?1", [file_uri])?;
        {
            let mut insert_idea = tx.prepare(
                "INSERT INTO ideas (
                    id, name, kind, file_uri, line_start, line_end, summary,
                    attributes_json, content_hash, git_created_at, git_modified_at, git_change_count
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            )?;
            for idea in ideas {
                let previous = existing.get(&idea.id);
                insert_idea.execute(params![
                    idea.id,
                    idea.name,
                    idea.kind.as_str(),
                    idea.file_uri,
                    idea.line_start,
                    idea.line_end,
                    idea.summary,
                    idea.attributes_json,
                    idea.content_hash,
                    idea.git_created_at.as_deref().or(previous.and_then(|p| p.0.as_deref())),
                    idea.git_modified_at.as_deref().or(previous.and_then(|p| p.1.as_deref())),
                    idea.git_change_count.or(previous.and_then(|p| p.2)),
                ])?;
            }
        }
        {
            let mut insert_edge = tx.prepare(
                "INSERT OR IGNORE INTO edges (
                    id, source_id, target_id, target_file, kind, label, source_line, snippet, is_resolved
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            )?;
            for edge in edges {
                insert_edge.execute(params![
                    edge.id,
                    edge.source_id,
                    edge.target_id,
                    edge.target_file,
                    edge.kind.as_str(),
                    edge.label,
                    edge.source_line,
                    edge.snippet,
                    if edge.is_resolved == Some(false) { 0 } else { 1 },
                ])?;
            }
        }
        tx.execute(
            "INSERT INTO documents(file_uri, content_hash, indexed_at, mtime_ms)
             VALUES (?1, ?2, datetime('now'), ?3)
             ON CONFLICT(file_uri) DO UPDATE SET content_hash = excluded.content_hash, indexed_at = excluded.indexed_at, mtime_ms = excluded.mtime_ms",
            params![file_uri, content_hash, mtime_ms],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Persist a non-`.rq` comment file: document row plus `comment_link` edges onto ideas.
    pub fn persist_code_comment_file(
        &mut self,
        file_uri: &str,
        content_hash: &str,
        edges: &[EdgeRecord],
        mtime_ms: Option<f64>,
    ) -> Result<(), StoreError> {
        let tx = self.conn.transaction()?;
        tx.execute(
            "DELETE FROM edges WHERE kind = 'comment_link' AND target_file = ?1",
            [file_uri],
        )?;
        {
            let mut insert_edge = tx.prepare(
                "INSERT OR IGNORE INTO edges (
                    id, source_id, target_id, target_file, kind, label, source_line, snippet, is_resolved
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            )?;
            for edge in edges {
                insert_edge.execute(params![
                    edge.id,
                    edge.source_id,
                    edge.target_id,
                    edge.target_file,
                    edge.kind.as_str(),
                    edge.label,
                    edge.source_line,
                    edge.snippet,
                    if edge.is_resolved == Some(false) { 0 } else { 1 },
                ])?;
            }
        }
        tx.execute(
            "INSERT INTO documents(file_uri, content_hash, indexed_at, mtime_ms)
             VALUES (?1, ?2, datetime('now'), ?3)
             ON CONFLICT(file_uri) DO UPDATE SET content_hash = excluded.content_hash, indexed_at = excluded.indexed_at, mtime_ms = excluded.mtime_ms",
            params![file_uri, content_hash, mtime_ms],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn list_code_document_uris(&self) -> Result<Vec<String>, StoreError> {
        let mut stmt = self.conn.prepare(
            "SELECT file_uri FROM documents
             WHERE file_uri NOT LIKE '%.rq' AND file_uri NOT LIKE '%.RQ'
             ORDER BY file_uri",
        )?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn delete_document(&self, file_uri: &str) -> Result<(), StoreError> {
        self.conn.execute(
            "DELETE FROM edges WHERE kind = 'comment_link' AND target_file = ?1",
            [file_uri],
        )?;
        self.conn.execute(
            "DELETE FROM edges WHERE source_id IN (SELECT id FROM ideas WHERE file_uri = ?1)",
            [file_uri],
        )?;
        self.conn.execute("DELETE FROM ideas WHERE file_uri = ?1", [file_uri])?;
        self.conn.execute("DELETE FROM documents WHERE file_uri = ?1", [file_uri])?;
        Ok(())
    }

    pub fn clear(&self) -> Result<(), StoreError> {
        self.conn.execute_batch("DELETE FROM edges; DELETE FROM ideas; DELETE FROM documents;")?;
        Ok(())
    }

    pub fn count_edges_from_file(&self, file_uri: &str) -> Result<i64, StoreError> {
        self.conn
            .query_row(
                "SELECT COUNT(*) FROM edges WHERE source_id IN (SELECT id FROM ideas WHERE file_uri = ?1)",
                [file_uri],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }

    pub fn list_all_ideas(&self) -> Result<Vec<IdeaSummary>, StoreError> {
        Ok(self.all_idea_records()?.iter().map(to_summary).collect())
    }

    pub fn all_idea_records(&self) -> Result<Vec<IdeaRecord>, StoreError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, kind, file_uri, line_start, line_end, summary, attributes_json, content_hash,
                    git_created_at, git_modified_at, git_change_count
             FROM ideas ORDER BY file_uri, line_start",
        )?;
        let rows = stmt.query_map([], map_idea)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn get_idea(&self, id: &str) -> Result<Option<IdeaSummary>, StoreError> {
        self.conn
            .query_row(
                "SELECT id, name, kind, file_uri, line_start, line_end, summary, attributes_json, content_hash,
                        git_created_at, git_modified_at, git_change_count
                 FROM ideas WHERE id = ?1",
                [id],
                map_idea,
            )
            .optional()
            .map(|row| row.map(|record| to_summary(&record)))
            .map_err(Into::into)
    }

    pub fn get_ideas_in_file(&self, file_uri: &str) -> Result<Vec<IdeaSummary>, StoreError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, kind, file_uri, line_start, line_end, summary, attributes_json, content_hash,
                    git_created_at, git_modified_at, git_change_count
             FROM ideas WHERE file_uri = ?1 ORDER BY line_start",
        )?;
        let rows = stmt.query_map([file_uri], map_idea)?;
        Ok(rows.filter_map(|row| row.ok().map(|record| to_summary(&record))).collect())
    }

    pub fn search_by_name_or_summary(&self, query: &str) -> Result<Vec<IdeaSummary>, StoreError> {
        let pattern = format!("%{query}%");
        let mut stmt = self.conn.prepare(
            "SELECT id, name, kind, file_uri, line_start, line_end, summary, attributes_json, content_hash,
                    git_created_at, git_modified_at, git_change_count
             FROM ideas WHERE name LIKE ?1 OR summary LIKE ?1 ORDER BY name",
        )?;
        let rows = stmt.query_map([&pattern], map_idea)?;
        Ok(rows.filter_map(|row| row.ok().map(|record| to_summary(&record))).collect())
    }

    pub fn get_edges_from(&self, source_id: &str) -> Result<Vec<EdgeRecord>, StoreError> {
        self.query_edges("SELECT * FROM edges WHERE source_id = ?1", [source_id])
    }

    pub fn get_edges_to(&self, target_id: &str) -> Result<Vec<EdgeRecord>, StoreError> {
        self.query_edges("SELECT * FROM edges WHERE target_id = ?1", [target_id])
    }

    pub fn get_edges_referencing_file(
        &self,
        file_path: &str,
    ) -> Result<Vec<EdgeRecord>, StoreError> {
        let pattern = format!("%{file_path}%");
        self.query_edges(
            "SELECT * FROM edges WHERE target_file LIKE ?1 OR target_file = ?2",
            [pattern.as_str(), file_path],
        )
    }

    pub fn get_all_edges(&self) -> Result<Vec<EdgeRecord>, StoreError> {
        let mut stmt = self.conn.prepare("SELECT * FROM edges")?;
        let rows = stmt.query_map([], map_edge)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    fn query_edges<P: rusqlite::Params>(
        &self,
        sql: &str,
        params: P,
    ) -> Result<Vec<EdgeRecord>, StoreError> {
        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map(params, map_edge)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn persist_extracted(
        &mut self,
        document: IndexedDocument,
        mtime_ms: Option<f64>,
    ) -> Result<(), StoreError> {
        let mut ideas = document.ideas;
        for idea in &mut ideas {
            idea.content_hash = document.content_hash.clone();
        }
        self.upsert_document(
            &document.file_uri,
            &document.content_hash,
            &ideas,
            &document.edges,
            mtime_ms,
        )
    }

    pub fn sql_query(&self, sql: &str, params: &[JsonValue]) -> Result<Vec<JsonValue>, StoreError> {
        Ok(query(&self.conn, sql, params)?)
    }

    pub fn sql_execute(&self, sql: &str, params: &[JsonValue]) -> Result<usize, StoreError> {
        Ok(execute(&self.conn, sql, params)?)
    }

    pub fn sql_execute_batch(&self, sql: &str) -> Result<(), StoreError> {
        Ok(execute_batch(&self.conn, sql)?)
    }

    pub fn last_insert_rowid(&self) -> i64 {
        self.conn.last_insert_rowid()
    }
}

fn map_idea(row: &rusqlite::Row<'_>) -> rusqlite::Result<IdeaRecord> {
    Ok(IdeaRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        kind: IdeaKind::parse(&row.get::<_, String>(2)?),
        file_uri: row.get(3)?,
        line_start: row.get(4)?,
        line_end: row.get(5)?,
        summary: row.get(6)?,
        attributes_json: row.get(7)?,
        content_hash: row.get(8)?,
        git_created_at: row.get(9)?,
        git_modified_at: row.get(10)?,
        git_change_count: row.get(11)?,
    })
}

fn map_edge(row: &rusqlite::Row<'_>) -> rusqlite::Result<EdgeRecord> {
    let is_resolved: Option<i64> = row.get("is_resolved").ok();
    Ok(EdgeRecord {
        id: row.get("id")?,
        source_id: row.get("source_id")?,
        target_id: row.get("target_id")?,
        target_file: row.get("target_file")?,
        kind: EdgeKind::parse(&row.get::<_, String>("kind")?),
        label: row.get("label")?,
        source_line: row.get("source_line").ok(),
        snippet: row.get("snippet").ok(),
        is_resolved: is_resolved.map(|value| value != 0),
    })
}
