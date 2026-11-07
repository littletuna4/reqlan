//! Page + count query bodies behind the summary table endpoints.
//! rq:["../../../../reqlan rq/extension/workspace-summary/ideas_summary/webview.rq".pages]
//! rq:["../../../../reqlan rq/extension/workspace-summary/ideas_summary/webview.rq".attributes_tab]
//! rq:["../../../../reqlan rq/extension/workspace-summary/ideas_summary/webview.rq".timeline_page]
//! rq:["../../../../reqlan rq/extension/local-context/activitybar-panels/todo.rq".todo_pane]
//! rq:["../../../../reqlan rq/extension/index-host/git-codelens.rq".git_dates_background_indexing]

use rusqlite::Connection;
use serde_json::{json, Value as JsonValue};

use crate::sql_bridge::{query, SqlBridgeError};

use super::common::count_from;
use super::filters::{GraphViewQuery, IdeasTableQuery, IdeasetsTableQuery, ReferencesTableQuery};
use super::graph_queries::{build_graph_filter_where, build_graph_truncation_order};
use super::table_queries::{
    build_ideas_order, build_ideas_where, build_ideasets_order, build_ideasets_where,
    build_references_order, build_references_where,
};

pub const ACTIVITY_BAR_TODO_LIMIT: i64 = 40;

const IDEA_PAGE_COLUMNS: &str = "i.id,\n                i.name,\n                i.kind,\n                i.file_uri,\n                i.line_start,\n                i.summary,\n                i.attributes_json,\n                i.git_created_at,\n                i.git_modified_at,\n                i.git_change_count,\n                (\n                    SELECT COUNT(*)\n                    FROM edges e\n                    WHERE e.source_id = i.id\n                ) AS outbound_count,\n                (\n                    SELECT COUNT(*)\n                    FROM edges e\n                    WHERE e.target_id = i.id\n                ) AS inbound_count,\n                (\n                    SELECT COUNT(*)\n                    FROM edges e\n                    WHERE e.source_id = i.id OR e.target_id = i.id\n                ) AS reference_count";

const IDEASETS_SUBQUERY: &str = "SELECT\n                    d.file_uri AS id,\n                    'file' AS kind,\n                    d.file_uri AS file_uri,\n                    0 AS line_start,\n                    NULL AS name,\n                    (\n                        SELECT COUNT(*)\n                        FROM ideas i\n                        WHERE i.file_uri = d.file_uri\n                    ) AS member_count\n                FROM documents d\n                UNION ALL\n                SELECT\n                    i.id,\n                    'explicit' AS kind,\n                    i.file_uri,\n                    i.line_start,\n                    i.name,\n                    (\n                        SELECT COUNT(*)\n                        FROM edges e\n                        WHERE e.source_id = i.id AND e.kind = 'ideaset_member'\n                    ) AS member_count\n                FROM ideas i\n                WHERE i.kind = 'ideaset'";

pub fn count_ideas(conn: &Connection, q: &IdeasTableQuery) -> Result<i64, SqlBridgeError> {
    let (where_sql, params) = build_ideas_where(q);
    let sql = format!("SELECT COUNT(*) as count FROM ideas i WHERE {where_sql}");
    Ok(count_from(query(conn, &sql, &params)?))
}

pub fn list_ideas_page_rows(
    conn: &Connection,
    q: &IdeasTableQuery,
) -> Result<Vec<JsonValue>, SqlBridgeError> {
    let (where_sql, mut params) = build_ideas_where(q);
    let order_sql = build_ideas_order(q);
    let sql = format!(
        "SELECT\n                {IDEA_PAGE_COLUMNS}\n            FROM ideas i\n            WHERE {where_sql}\n            ORDER BY {order_sql}\n            LIMIT ? OFFSET ?"
    );
    params.push(json!(q.page_size));
    params.push(json!(q.page * q.page_size));
    query(conn, &sql, &params)
}

/// Raw reference-chip rows for a set of idea ids (both directions). Presentation
/// (path resolution + chip shaping) stays in TS.
pub fn list_reference_chip_rows(
    conn: &Connection,
    idea_ids: &[String],
) -> Result<Vec<JsonValue>, SqlBridgeError> {
    if idea_ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = vec!["?"; idea_ids.len()].join(", ");
    let sql = format!(
        "SELECT\n                e.id,\n                e.kind,\n                e.source_id,\n                e.target_id,\n                e.target_file,\n                e.label,\n                si.name AS source_name,\n                si.file_uri AS source_uri,\n                si.line_start AS source_line,\n                ti.name AS target_name,\n                ti.file_uri AS target_uri,\n                ti.line_start AS target_line\n            FROM edges e\n            JOIN ideas si ON si.id = e.source_id\n            LEFT JOIN ideas ti ON ti.id = e.target_id\n            WHERE e.source_id IN ({placeholders}) OR e.target_id IN ({placeholders})\n            ORDER BY e.id"
    );
    let mut params: Vec<JsonValue> = Vec::new();
    for id in idea_ids {
        params.push(json!(id));
    }
    for id in idea_ids {
        params.push(json!(id));
    }
    query(conn, &sql, &params)
}

pub fn count_ideasets(conn: &Connection, q: &IdeasetsTableQuery) -> Result<i64, SqlBridgeError> {
    let (where_sql, params) = build_ideasets_where(q);
    let sql = format!("SELECT COUNT(*) AS count\n            FROM (\n                {IDEASETS_SUBQUERY}\n            ) ideasets\n            WHERE {where_sql}");
    Ok(count_from(query(conn, &sql, &params)?))
}

pub fn list_ideasets_page_rows(
    conn: &Connection,
    q: &IdeasetsTableQuery,
) -> Result<Vec<JsonValue>, SqlBridgeError> {
    let (where_sql, mut params) = build_ideasets_where(q);
    let order_sql = build_ideasets_order(q);
    let sql = format!(
        "SELECT *\n            FROM (\n                {IDEASETS_SUBQUERY}\n            ) ideasets\n            WHERE {where_sql}\n            ORDER BY {order_sql}\n            LIMIT ? OFFSET ?"
    );
    params.push(json!(q.page_size));
    params.push(json!(q.page * q.page_size));
    query(conn, &sql, &params)
}

pub fn list_ideaset_member_rows(
    conn: &Connection,
    ideaset_id: &str,
    kind: &str,
    file_uri: &str,
) -> Result<Vec<JsonValue>, SqlBridgeError> {
    if kind == "file" {
        query(
            conn,
            "SELECT name, file_uri, line_start\n                FROM ideas\n                WHERE file_uri = ? AND kind != 'ideaset'\n                ORDER BY line_start",
            &[json!(file_uri)],
        )
    } else {
        query(
            conn,
            "SELECT i.name, i.file_uri, i.line_start\n                FROM edges e\n                JOIN ideas i ON i.id = e.target_id\n                WHERE e.source_id = ? AND e.kind = 'ideaset_member'\n                ORDER BY i.line_start",
            &[json!(ideaset_id)],
        )
    }
}

pub fn count_references(
    conn: &Connection,
    q: &ReferencesTableQuery,
) -> Result<i64, SqlBridgeError> {
    let (where_sql, params) = build_references_where(q);
    let sql = format!(
        "SELECT COUNT(*) as count\n            FROM edges e\n            JOIN ideas si ON si.id = e.source_id\n            LEFT JOIN ideas ti ON ti.id = e.target_id\n            WHERE {where_sql}"
    );
    Ok(count_from(query(conn, &sql, &params)?))
}

pub fn list_references_page_rows(
    conn: &Connection,
    q: &ReferencesTableQuery,
) -> Result<Vec<JsonValue>, SqlBridgeError> {
    let (where_sql, mut params) = build_references_where(q);
    let order_sql = build_references_order(q);
    let sql = format!(
        "SELECT\n                e.kind,\n                e.source_id,\n                e.target_id,\n                e.target_file,\n                e.label,\n                si.name AS source_name,\n                si.file_uri AS source_uri,\n                si.line_start AS source_line,\n                ti.name AS target_name,\n                ti.file_uri AS target_uri\n            FROM edges e\n            JOIN ideas si ON si.id = e.source_id\n            LEFT JOIN ideas ti ON ti.id = e.target_id\n            WHERE {where_sql}\n            ORDER BY {order_sql}\n            LIMIT ? OFFSET ?"
    );
    params.push(json!(q.page_size));
    params.push(json!(q.page * q.page_size));
    query(conn, &sql, &params)
}

/// Ideas whose attributes carry a `@todo` key (coarse prefilter); TS refines + caps.
pub fn list_todo_idea_rows(conn: &Connection) -> Result<Vec<JsonValue>, SqlBridgeError> {
    query(
        conn,
        "SELECT id, name, kind, file_uri, line_start, summary, attributes_json\n            FROM ideas\n            WHERE kind != 'ideaset'\n              AND attributes_json LIKE '%\"todo\":%'\n            ORDER BY name ASC, file_uri ASC, line_start ASC",
        &[],
    )
}

/// Candidate ideas for a graph query plus total matching count (limit = maxNodes+1).
pub fn list_ideas_for_graph_query_rows(
    conn: &Connection,
    q: &GraphViewQuery,
    limit: i64,
) -> Result<(Vec<JsonValue>, i64), SqlBridgeError> {
    let (where_sql, params) = build_graph_filter_where(q);
    let order_sql = build_graph_truncation_order(q.truncation_basis.as_deref());
    let count_sql = format!("SELECT COUNT(*) as count FROM ideas i WHERE {where_sql}");
    let total = count_from(query(conn, &count_sql, &params)?);
    let sql = format!(
        "SELECT id, name, kind, file_uri, line_start, summary, attributes_json,\n                   git_created_at, git_modified_at, git_change_count\n            FROM ideas i\n            WHERE {where_sql}\n            ORDER BY {order_sql}\n            LIMIT ?"
    );
    let mut row_params = params;
    row_params.push(json!(limit));
    let rows = query(conn, &sql, &row_params)?;
    Ok((rows, total))
}

/// Recent git idea rows for the Timeline tab (TS expands into created/modified events).
pub fn list_recent_git_idea_rows(
    conn: &Connection,
    limit: i64,
) -> Result<Vec<JsonValue>, SqlBridgeError> {
    let fetch = (limit * 2).clamp(1, 400);
    query(
        conn,
        "SELECT id, name, kind, file_uri, line_start, summary, attributes_json,\n                   git_created_at, git_modified_at, git_change_count\n            FROM ideas\n            WHERE kind != 'ideaset'\n              AND (git_modified_at IS NOT NULL OR git_created_at IS NOT NULL)\n            ORDER BY COALESCE(git_modified_at, git_created_at) DESC\n            LIMIT ?",
        &[json!(fetch)],
    )
}

/// Idea ids still needing git date / change-count backfill.
pub fn list_idea_ids_missing_git_dates(
    conn: &Connection,
    limit: i64,
    file_uri: Option<&str>,
    prefer_file_uri: Option<&str>,
) -> Result<Vec<String>, SqlBridgeError> {
    let capped = limit.clamp(1, 200);
    const MISSING: &str = "(\n            (git_created_at IS NULL AND git_modified_at IS NULL)\n            OR git_change_count IS NULL\n        )";
    let (sql, params): (String, Vec<JsonValue>) = if let Some(file_uri) =
        file_uri.map(str::trim).filter(|s| !s.is_empty())
    {
        (
            format!(
                "SELECT id\n                FROM ideas\n                WHERE kind != 'ideaset'\n                  AND {MISSING}\n                  AND file_uri = ?\n                ORDER BY line_start ASC\n                LIMIT ?"
            ),
            vec![json!(file_uri), json!(capped)],
        )
    } else if let Some(prefer) = prefer_file_uri.map(str::trim).filter(|s| !s.is_empty()) {
        (
            format!(
                "SELECT id\n                FROM ideas\n                WHERE kind != 'ideaset'\n                  AND {MISSING}\n                ORDER BY CASE WHEN file_uri = ? THEN 0 ELSE 1 END,\n                         file_uri ASC, line_start ASC\n                LIMIT ?"
            ),
            vec![json!(prefer), json!(capped)],
        )
    } else {
        (
            format!(
                "SELECT id\n                FROM ideas\n                WHERE kind != 'ideaset'\n                  AND {MISSING}\n                ORDER BY file_uri ASC, line_start ASC\n                LIMIT ?"
            ),
            vec![json!(capped)],
        )
    };
    let rows = query(conn, &sql, &params)?;
    Ok(rows
        .into_iter()
        .filter_map(|row| row.get("id").and_then(JsonValue::as_str).map(str::to_string))
        .collect())
}

/// Rows for the attributes tab aggregation (TS aggregates + paginates in JS).
pub fn list_attribute_idea_rows(conn: &Connection) -> Result<Vec<JsonValue>, SqlBridgeError> {
    query(
        conn,
        "SELECT id, attributes_json\n            FROM ideas\n            WHERE kind != 'ideaset'",
        &[],
    )
}
