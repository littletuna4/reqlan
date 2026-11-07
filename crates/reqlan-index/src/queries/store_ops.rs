//! Domain read/write ops backing the TS SqliteIndexStore facade.
//! Reads return raw JSON rows / scalars; TS keeps presentation mapping (toSummary,
//! mapEdgeRow, mapIdeaRow, filter-specials labels) until labels move to Rust.
//! rq:["../../../../reqlan rq/indexer/indexer.rq".indexer_rust]

use rusqlite::{params, Connection};
use serde_json::{json, Value as JsonValue};

use crate::sql_bridge::{execute, execute_batch, query, SqlBridgeError};
use crate::types::{EdgeRecord, IdeaRecord};

use super::common::{count_from, like};

/// Summary columns used by activity-bar / lookup reads (no git columns).
const SUMMARY_COLS: &str = "id, name, kind, file_uri, line_start, summary, attributes_json";
/// Summary columns including indexed git dates + change count.
const SUMMARY_COLS_GIT: &str = "id, name, kind, file_uri, line_start, summary, attributes_json, git_created_at, git_modified_at, git_change_count";
/// Summary columns including line_end (for cursor-range lookups) and git columns.
const SUMMARY_COLS_RANGE_GIT: &str = "id, name, kind, file_uri, line_start, line_end, summary, attributes_json, git_created_at, git_modified_at, git_change_count";

pub fn get_document_hash(
    conn: &Connection,
    file_uri: &str,
) -> Result<Option<String>, SqlBridgeError> {
    let rows =
        query(conn, "SELECT content_hash FROM documents WHERE file_uri = ?", &[json!(file_uri)])?;
    Ok(rows
        .first()
        .and_then(|row| row.get("content_hash"))
        .and_then(JsonValue::as_str)
        .map(str::to_string))
}

pub fn get_document_mtime_ms(
    conn: &Connection,
    file_uri: &str,
) -> Result<Option<f64>, SqlBridgeError> {
    let rows =
        query(conn, "SELECT mtime_ms FROM documents WHERE file_uri = ?", &[json!(file_uri)])?;
    Ok(rows.first().and_then(|row| row.get("mtime_ms")).and_then(JsonValue::as_f64))
}

pub fn list_document_mtime_rows(conn: &Connection) -> Result<Vec<JsonValue>, SqlBridgeError> {
    query(conn, "SELECT file_uri, mtime_ms FROM documents", &[])
}

pub fn list_document_uris(conn: &Connection) -> Result<Vec<String>, SqlBridgeError> {
    let rows = query(conn, "SELECT file_uri FROM documents ORDER BY file_uri", &[])?;
    Ok(rows
        .into_iter()
        .filter_map(|row| row.get("file_uri").and_then(JsonValue::as_str).map(str::to_string))
        .collect())
}

pub fn list_all_idea_rows(conn: &Connection) -> Result<Vec<JsonValue>, SqlBridgeError> {
    query(conn, &format!("SELECT {SUMMARY_COLS} FROM ideas ORDER BY file_uri, line_start"), &[])
}

pub fn get_idea_row(conn: &Connection, id: &str) -> Result<Option<JsonValue>, SqlBridgeError> {
    let rows =
        query(conn, &format!("SELECT {SUMMARY_COLS_GIT} FROM ideas WHERE id = ?"), &[json!(id)])?;
    Ok(rows.into_iter().next())
}

pub fn get_ideas_in_file_rows(
    conn: &Connection,
    file_uri: &str,
) -> Result<Vec<JsonValue>, SqlBridgeError> {
    query(
        conn,
        &format!("SELECT {SUMMARY_COLS} FROM ideas WHERE file_uri = ? ORDER BY line_start"),
        &[json!(file_uri)],
    )
}

/// Inbound edges for ideas hosted in `file_uri`, plus comment/file refs that target the file.
/// rq:["../../../../reqlan rq/indexer/cache-reuse.rq".unify_inbound_indexes]
pub fn get_inbound_for_file_rows(
    conn: &Connection,
    file_uri: &str,
) -> Result<Vec<JsonValue>, SqlBridgeError> {
    query(
        conn,
        "SELECT e.id AS id,
                e.source_id AS source_id,
                e.target_id AS target_id,
                e.target_file AS target_file,
                e.kind AS kind,
                e.label AS label,
                e.source_line AS source_line,
                e.snippet AS snippet,
                e.is_resolved AS is_resolved,
                s.name AS source_name,
                s.file_uri AS source_file_uri,
                s.line_start AS source_idea_line,
                t.name AS target_name
         FROM edges e
         LEFT JOIN ideas s ON s.id = e.source_id
         LEFT JOIN ideas t ON t.id = e.target_id
         WHERE e.target_id IN (SELECT id FROM ideas WHERE file_uri = ?1)
            OR (
                e.kind IN ('comment_link', 'file_reference')
                AND e.target_file = ?1
            )
         ORDER BY e.source_id, e.id",
        &[json!(file_uri)],
    )
}

pub fn get_idea_at_line_row(
    conn: &Connection,
    file_uri: &str,
    line: i64,
) -> Result<Option<JsonValue>, SqlBridgeError> {
    let rows = query(
        conn,
        &format!(
            "SELECT {SUMMARY_COLS_GIT} FROM ideas\n            WHERE file_uri = ? AND line_start <= ? AND ? <= line_end AND kind != 'ideaset'\n            ORDER BY line_start DESC LIMIT 1"
        ),
        &[json!(file_uri), json!(line), json!(line)],
    )?;
    Ok(rows.into_iter().next())
}

pub fn get_ideaset_at_line_row(
    conn: &Connection,
    file_uri: &str,
    line: i64,
) -> Result<Option<JsonValue>, SqlBridgeError> {
    let rows = query(
        conn,
        &format!(
            "SELECT {SUMMARY_COLS_GIT} FROM ideas\n            WHERE file_uri = ? AND line_start <= ? AND ? <= line_end AND kind = 'ideaset'\n            ORDER BY line_start DESC LIMIT 1"
        ),
        &[json!(file_uri), json!(line), json!(line)],
    )?;
    Ok(rows.into_iter().next())
}

pub fn list_ideas_in_file_with_range_rows(
    conn: &Connection,
    file_uri: &str,
) -> Result<Vec<JsonValue>, SqlBridgeError> {
    query(
        conn,
        &format!(
            "SELECT {SUMMARY_COLS_RANGE_GIT} FROM ideas\n            WHERE file_uri = ? AND kind != 'ideaset'\n            ORDER BY line_start ASC"
        ),
        &[json!(file_uri)],
    )
}

pub fn list_ideasets_in_file_with_range_rows(
    conn: &Connection,
    file_uri: &str,
) -> Result<Vec<JsonValue>, SqlBridgeError> {
    query(
        conn,
        &format!(
            "SELECT {SUMMARY_COLS_RANGE_GIT} FROM ideas\n            WHERE file_uri = ? AND kind = 'ideaset'\n            ORDER BY line_start ASC"
        ),
        &[json!(file_uri)],
    )
}

pub fn get_ideas_by_ids_rows(
    conn: &Connection,
    ids: &[String],
) -> Result<Vec<JsonValue>, SqlBridgeError> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = vec!["?"; ids.len()].join(", ");
    let sql = format!("SELECT {SUMMARY_COLS} FROM ideas WHERE id IN ({placeholders})");
    let params: Vec<JsonValue> = ids.iter().map(|id| json!(id)).collect();
    query(conn, &sql, &params)
}

pub fn search_idea_rows(conn: &Connection, search: &str) -> Result<Vec<JsonValue>, SqlBridgeError> {
    query(
        conn,
        &format!(
            "SELECT {SUMMARY_COLS} FROM ideas WHERE name LIKE ? OR summary LIKE ? ORDER BY name"
        ),
        &[like(search), like(search)],
    )
}

/// Outbound + inbound reference rows for an idea (both directions joined to ideas).
/// Returns `{ outbound, inbound }`; TS maps each side into `ReferenceListRow`.
pub fn list_references_for_idea(
    conn: &Connection,
    idea_id: &str,
) -> Result<JsonValue, SqlBridgeError> {
    let outbound = query(
        conn,
        "SELECT\n                e.id AS edge_id,\n                e.kind,\n                e.source_id,\n                e.target_id,\n                e.target_file,\n                e.label,\n                e.source_line,\n                e.snippet,\n                e.is_resolved,\n                ti.name AS target_name,\n                ti.file_uri AS target_uri,\n                ti.line_start AS target_line\n            FROM edges e\n            LEFT JOIN ideas ti ON ti.id = e.target_id\n            WHERE e.source_id = ?\n            ORDER BY e.kind, e.id",
        &[json!(idea_id)],
    )?;
    let inbound = query(
        conn,
        "SELECT\n                e.id AS edge_id,\n                e.kind,\n                e.source_id,\n                e.target_id,\n                e.target_file,\n                e.label,\n                e.source_line,\n                e.snippet,\n                e.is_resolved,\n                si.name AS source_name,\n                si.file_uri AS source_uri,\n                si.line_start AS source_line_idea\n            FROM edges e\n            JOIN ideas si ON si.id = e.source_id\n            WHERE e.target_id = ?\n            ORDER BY e.kind, e.id",
        &[json!(idea_id)],
    )?;
    Ok(json!({ "outbound": outbound, "inbound": inbound }))
}

pub fn count_unresolved_for_idea(conn: &Connection, idea_id: &str) -> Result<i64, SqlBridgeError> {
    Ok(count_from(query(
        conn,
        "SELECT COUNT(*) AS count FROM edges WHERE source_id = ? AND is_resolved = 0",
        &[json!(idea_id)],
    )?))
}

pub fn count_edges_from_file(conn: &Connection, file_uri: &str) -> Result<i64, SqlBridgeError> {
    Ok(count_from(query(
        conn,
        "SELECT COUNT(*) AS count FROM edges WHERE source_id IN (SELECT id FROM ideas WHERE file_uri = ?)",
        &[json!(file_uri)],
    )?))
}

pub fn get_edges_from_rows(
    conn: &Connection,
    source_id: &str,
) -> Result<Vec<JsonValue>, SqlBridgeError> {
    query(conn, "SELECT * FROM edges WHERE source_id = ?", &[json!(source_id)])
}

pub fn get_edges_to_rows(
    conn: &Connection,
    target_id: &str,
) -> Result<Vec<JsonValue>, SqlBridgeError> {
    query(conn, "SELECT * FROM edges WHERE target_id = ?", &[json!(target_id)])
}

pub fn get_edges_for_nodes_rows(
    conn: &Connection,
    node_ids: &[String],
) -> Result<Vec<JsonValue>, SqlBridgeError> {
    if node_ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = vec!["?"; node_ids.len()].join(", ");
    let sql = format!(
        "SELECT * FROM edges WHERE source_id IN ({placeholders}) OR target_id IN ({placeholders})"
    );
    let mut params: Vec<JsonValue> = Vec::with_capacity(node_ids.len() * 2);
    for id in node_ids {
        params.push(json!(id));
    }
    for id in node_ids {
        params.push(json!(id));
    }
    query(conn, &sql, &params)
}

pub fn get_edges_referencing_file_rows(
    conn: &Connection,
    file_path: &str,
) -> Result<Vec<JsonValue>, SqlBridgeError> {
    query(
        conn,
        "SELECT * FROM edges WHERE target_file LIKE ? OR target_file LIKE ?",
        &[like(file_path), json!(file_path)],
    )
}

pub fn get_all_edge_rows(conn: &Connection) -> Result<Vec<JsonValue>, SqlBridgeError> {
    query(conn, "SELECT * FROM edges", &[])
}

pub fn list_file_reference_target_rows(
    conn: &Connection,
) -> Result<Vec<JsonValue>, SqlBridgeError> {
    query(
        conn,
        "SELECT source_id, target_file\n            FROM edges\n            WHERE target_file IS NOT NULL AND target_file != ''\n              AND (kind = 'file_reference' OR target_id IS NULL)",
        &[],
    )
}

pub fn all_idea_raw_rows(conn: &Connection) -> Result<Vec<JsonValue>, SqlBridgeError> {
    query(conn, "SELECT * FROM ideas", &[])
}

pub fn counts(conn: &Connection) -> Result<JsonValue, SqlBridgeError> {
    let ideas = count_from(query(conn, "SELECT COUNT(*) AS count FROM ideas", &[])?);
    let edges = count_from(query(conn, "SELECT COUNT(*) AS count FROM edges", &[])?);
    Ok(json!({ "ideas": ideas, "edges": edges }))
}

pub fn update_document_mtime(
    conn: &Connection,
    file_uri: &str,
    mtime_ms: f64,
) -> Result<(), SqlBridgeError> {
    execute(
        conn,
        "UPDATE documents SET mtime_ms = ?, indexed_at = datetime('now') WHERE file_uri = ?",
        &[json!(mtime_ms), json!(file_uri)],
    )?;
    Ok(())
}

pub fn update_git_dates(
    conn: &Connection,
    id: &str,
    created_at: Option<&str>,
    modified_at: Option<&str>,
    change_count: Option<i64>,
) -> Result<(), SqlBridgeError> {
    if let Some(count) = change_count {
        execute(
            conn,
            "UPDATE ideas SET git_created_at = ?, git_modified_at = ?, git_change_count = ? WHERE id = ?",
            &[json!(created_at), json!(modified_at), json!(count), json!(id)],
        )?;
    } else {
        execute(
            conn,
            "UPDATE ideas SET git_created_at = ?, git_modified_at = ? WHERE id = ?",
            &[json!(created_at), json!(modified_at), json!(id)],
        )?;
    }
    Ok(())
}

pub fn clear_all(conn: &Connection) -> Result<(), SqlBridgeError> {
    execute_batch(conn, "DELETE FROM edges; DELETE FROM ideas; DELETE FROM documents;")
}

/// Delete many documents (and their ideas + edges, incl. inbound comment links) atomically.
pub fn remove_documents(conn: &Connection, file_uris: &[String]) -> Result<(), SqlBridgeError> {
    if file_uris.is_empty() {
        return Ok(());
    }
    let tx = conn.unchecked_transaction()?;
    for file_uri in file_uris {
        tx.execute(
            "DELETE FROM edges WHERE kind = 'comment_link' AND target_file = ?1",
            [file_uri],
        )?;
        tx.execute(
            "DELETE FROM edges WHERE source_id IN (SELECT id FROM ideas WHERE file_uri = ?1)",
            [file_uri],
        )?;
        tx.execute("DELETE FROM ideas WHERE file_uri = ?1", [file_uri])?;
        tx.execute("DELETE FROM documents WHERE file_uri = ?1", [file_uri])?;
    }
    tx.commit()?;
    Ok(())
}

/// One document's ideas + edges for [`upsert_documents`].
/// rq:["../../../../reqlan rq/indexer/cache-reuse.rq".batched_document_upsert]
#[derive(Debug, Clone, Copy)]
pub struct DocumentUpsert<'a> {
    pub file_uri: &'a str,
    pub content_hash: &'a str,
    pub ideas: &'a [IdeaRecord],
    pub edges: &'a [EdgeRecord],
    pub mtime_ms: Option<f64>,
}

/// Replace a document's ideas + edges, preserving analyser-populated git columns.
/// Mirrors the historic TS `upsertDocument` transaction.
pub fn upsert_document(
    conn: &Connection,
    file_uri: &str,
    content_hash: &str,
    ideas: &[IdeaRecord],
    edges: &[EdgeRecord],
    mtime_ms: Option<f64>,
) -> Result<(), SqlBridgeError> {
    upsert_documents(conn, &[DocumentUpsert { file_uri, content_hash, ideas, edges, mtime_ms }])
}

/// Replace many documents' ideas + edges in one BEGIN/COMMIT.
/// On error, roll back the whole batch (no prefix commit). Same atomicity as [`remove_documents`].
/// rq:["../../../../reqlan rq/indexer/cache-reuse.rq".batched_document_upsert]
pub fn upsert_documents(
    conn: &Connection,
    documents: &[DocumentUpsert<'_>],
) -> Result<(), SqlBridgeError> {
    if documents.is_empty() {
        return Ok(());
    }
    let tx = conn.unchecked_transaction()?;
    for document in documents {
        upsert_document_in_tx(
            &tx,
            document.file_uri,
            document.content_hash,
            document.ideas,
            document.edges,
            document.mtime_ms,
        )?;
    }
    tx.commit()?;
    Ok(())
}

/// Body of a document upsert. Caller must already hold an open transaction.
fn upsert_document_in_tx(
    conn: &Connection,
    file_uri: &str,
    content_hash: &str,
    ideas: &[IdeaRecord],
    edges: &[EdgeRecord],
    mtime_ms: Option<f64>,
) -> Result<(), SqlBridgeError> {
    use std::collections::HashMap;
    let existing: HashMap<String, (Option<String>, Option<String>, Option<i64>)> = {
        let mut stmt = conn.prepare(
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
    // `comment_link` edges belong to the code file that holds the comment, so kept ideas
    // update in place; deleting a removed idea cascades to its comment links.
    conn.execute(
        "DELETE FROM edges WHERE kind != 'comment_link'
           AND source_id IN (SELECT id FROM ideas WHERE file_uri = ?1)",
        [file_uri],
    )?;
    {
        let mut delete_idea = conn.prepare("DELETE FROM ideas WHERE id = ?1")?;
        for id in existing.keys().filter(|id| !ideas.iter().any(|idea| &idea.id == *id)) {
            delete_idea.execute([id])?;
        }
    }
    {
        let mut insert_idea = conn.prepare(
            "INSERT INTO ideas (
                id, name, kind, file_uri, line_start, line_end, summary,
                attributes_json, content_hash, git_created_at, git_modified_at, git_change_count
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name, kind = excluded.kind, file_uri = excluded.file_uri,
                line_start = excluded.line_start, line_end = excluded.line_end,
                summary = excluded.summary, attributes_json = excluded.attributes_json,
                content_hash = excluded.content_hash, git_created_at = excluded.git_created_at,
                git_modified_at = excluded.git_modified_at,
                git_change_count = excluded.git_change_count",
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
        let mut insert_edge = conn.prepare(
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
    conn.execute(
        "INSERT INTO documents(file_uri, content_hash, indexed_at, mtime_ms)
         VALUES (?1, ?2, datetime('now'), ?3)
         ON CONFLICT(file_uri) DO UPDATE SET content_hash = excluded.content_hash, indexed_at = excluded.indexed_at, mtime_ms = excluded.mtime_ms",
        params![file_uri, content_hash, mtime_ms],
    )?;
    Ok(())
}
