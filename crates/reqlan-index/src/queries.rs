//! Webview table + graph query semantics (WHERE / ORDER / pagination / filter specials).
//! Ported from packages/analytical/src/index-store/{webview-table-queries,webview-graph-queries}.ts
//! and the page/count query bodies of sqlite-store.ts. Presentation mapping of the returned
//! raw rows (attribute formatting, reference-chip path resolution) stays in TS.
//! rq:["../../../reqlan rq/extension/module/ideas_summary/webview.rq".table_column_filters]
//! rq:["../../../reqlan rq/extension/module/ideas_summary/webview.rq".group_by_type]
//! rq:["../../../reqlan rq/extension/module/ideas_summary/webview.rq".attributes_tab]
//! rq:["../../../reqlan rq/extension/module/ideas_summary/graphical_graph.rq".graphical_graph]

use crate::sql_bridge::{execute, execute_batch, query, SqlBridgeError};
use crate::types::{EdgeRecord, IdeaRecord, FILTER_EMPTY, FILTER_NOT_PRESENT};
use rusqlite::{params, Connection};
use serde::Deserialize;
use serde_json::{json, Value as JsonValue};

pub const ACTIVITY_BAR_TODO_LIMIT: i64 = 40;
pub const GRAPH_MAX_NODES: i64 = 120;
pub const GRAPH_NODES_HARD_CAP: i64 = 1000;

fn default_page_size() -> i64 {
    50
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnFilter {
    pub column: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub selected: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceFilter {
    #[serde(default)]
    pub direction: String,
    #[serde(default)]
    pub filter_key: String,
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdeasTableQuery {
    #[serde(default)]
    pub page: i64,
    #[serde(default = "default_page_size")]
    pub page_size: i64,
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub sort_by: Option<String>,
    #[serde(default)]
    pub sort_dir: Option<String>,
    #[serde(default)]
    pub attribute_columns: Vec<String>,
    #[serde(default)]
    pub reference_filters: Vec<ReferenceFilter>,
    #[serde(default)]
    pub column_filters: Vec<ColumnFilter>,
    #[serde(default)]
    pub group_by: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdeasetsTableQuery {
    #[serde(default)]
    pub page: i64,
    #[serde(default = "default_page_size")]
    pub page_size: i64,
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub sort_by: Option<String>,
    #[serde(default)]
    pub sort_dir: Option<String>,
    #[serde(default)]
    pub column_filters: Vec<ColumnFilter>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferencesTableQuery {
    #[serde(default)]
    pub page: i64,
    #[serde(default = "default_page_size")]
    pub page_size: i64,
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub sort_by: Option<String>,
    #[serde(default)]
    pub sort_dir: Option<String>,
    #[serde(default)]
    pub column_filters: Vec<ColumnFilter>,
    #[serde(default)]
    pub group_by: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphViewQuery {
    #[serde(default)]
    pub center_id: Option<String>,
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub path_filter: Option<String>,
    #[serde(default)]
    pub status_filter: Option<Vec<String>>,
    #[serde(default)]
    pub tag_filter: Option<Vec<String>>,
    #[serde(default)]
    pub include_indirect: bool,
    #[serde(default)]
    pub include_wildcard_refs: Option<bool>,
    #[serde(default)]
    pub hop_depth: Option<f64>,
    #[serde(default)]
    pub max_nodes: Option<i64>,
    #[serde(default)]
    pub ignore_hard_cap: Option<bool>,
    #[serde(default)]
    pub include_ideasets: Option<bool>,
    #[serde(default)]
    pub truncation_basis: Option<String>,
}

fn like(text: &str) -> JsonValue {
    json!(format!("%{}%", text))
}

fn trimmed(value: &Option<String>) -> Option<&str> {
    value.as_deref().map(str::trim).filter(|text| !text.is_empty())
}

/// JSON path for an attribute key, matching TS `$.${JSON.stringify(key)}`.
fn attribute_json_path(key: &str) -> String {
    format!("$.{}", serde_json::to_string(key).unwrap_or_else(|_| format!("\"{key}\"")))
}

fn find_column_filter<'a>(filters: &'a [ColumnFilter], column: &str) -> Option<&'a ColumnFilter> {
    filters.iter().find(|filter| filter.column == column)
}

fn push_text_like(
    clauses: &mut Vec<String>,
    params: &mut Vec<JsonValue>,
    expression: &str,
    text: Option<&str>,
) {
    if let Some(text) = text {
        let text = text.trim();
        if !text.is_empty() {
            clauses.push(format!("{expression} LIKE ?"));
            params.push(like(text));
        }
    }
}

fn push_selected_in(
    clauses: &mut Vec<String>,
    params: &mut Vec<JsonValue>,
    expression: &str,
    selected: Option<&[String]>,
) {
    if let Some(selected) = selected {
        if !selected.is_empty() {
            let placeholders = vec!["?"; selected.len()].join(", ");
            clauses.push(format!("{expression} IN ({placeholders})"));
            for value in selected {
                params.push(json!(value));
            }
        }
    }
}

/// Map References table view types back to edge kinds for SQL filters.
pub fn edge_kinds_for_reference_view_types(types: &[String]) -> Vec<String> {
    let mut kinds: Vec<String> = Vec::new();
    let push = |kinds: &mut Vec<String>, value: &str| {
        if !kinds.iter().any(|existing| existing == value) {
            kinds.push(value.to_string());
        }
    };
    for view_type in types {
        match view_type.as_str() {
            "file" => {
                push(&mut kinds, "file_reference");
                push(&mut kinds, "url_reference");
            }
            "comment" => push(&mut kinds, "comment_link"),
            "sub-idea" => {
                push(&mut kinds, "references");
                push(&mut kinds, "wildcard_reference");
                push(&mut kinds, "import");
                push(&mut kinds, "ideaset_member");
            }
            other => push(&mut kinds, other),
        }
    }
    kinds
}

pub fn build_reference_filter_clause(filter_key: &str) -> (String, Vec<JsonValue>) {
    if let Some(target_id) = filter_key.strip_prefix("outbound:idea:") {
        return (
            "EXISTS (\n                SELECT 1 FROM edges e\n                WHERE e.source_id = i.id AND e.target_id = ?\n            )".to_string(),
            vec![json!(target_id)],
        );
    }
    if let Some(target_file) = filter_key.strip_prefix("outbound:file:") {
        return (
            "EXISTS (\n                SELECT 1 FROM edges e\n                WHERE e.source_id = i.id\n                AND e.target_id IS NULL\n                AND (e.target_file = ? OR e.label = ?)\n            )".to_string(),
            vec![json!(target_file), json!(target_file)],
        );
    }
    if let Some(source_id) = filter_key.strip_prefix("inbound:idea:") {
        return (
            "EXISTS (\n                SELECT 1 FROM edges e\n                WHERE e.target_id = i.id AND e.source_id = ?\n            )".to_string(),
            vec![json!(source_id)],
        );
    }
    ("1 = 1".to_string(), Vec::new())
}

pub fn build_ideas_where(q: &IdeasTableQuery) -> (String, Vec<JsonValue>) {
    let mut clauses = vec!["i.kind != 'ideaset'".to_string()];
    let mut params: Vec<JsonValue> = Vec::new();

    if let Some(search) = trimmed(&q.search) {
        clauses.push(
            "(\n            i.name LIKE ? OR i.summary LIKE ? OR i.file_uri LIKE ?\n            OR EXISTS (\n                SELECT 1\n                FROM edges e\n                LEFT JOIN ideas ti ON ti.id = e.target_id\n                LEFT JOIN ideas si ON si.id = e.source_id\n                WHERE (e.source_id = i.id OR e.target_id = i.id)\n                AND (\n                    COALESCE(ti.name, '') LIKE ?\n                    OR COALESCE(si.name, '') LIKE ?\n                    OR COALESCE(e.target_file, '') LIKE ?\n                    OR COALESCE(e.label, '') LIKE ?\n                )\n            )\n        )".to_string(),
        );
        for _ in 0..7 {
            params.push(like(search));
        }
    }

    for filter in &q.reference_filters {
        let (sql, filter_params) = build_reference_filter_clause(&filter.filter_key);
        clauses.push(sql);
        params.extend(filter_params);
    }

    for key in &q.attribute_columns {
        let path = attribute_json_path(key);
        clauses.push(
            "(\n            json_type(json_extract(i.attributes_json, ?)) IS NOT NULL\n            AND json_type(json_extract(i.attributes_json, ?)) != 'null'\n            AND (\n                json_type(json_extract(i.attributes_json, ?)) = 'true'\n                OR (\n                    json_type(json_extract(i.attributes_json, ?)) = 'text'\n                    AND json_extract(i.attributes_json, ?) != ''\n                )\n                OR (\n                    json_type(json_extract(i.attributes_json, ?)) = 'array'\n                    AND json_array_length(json_extract(i.attributes_json, ?)) > 0\n                )\n            )\n        )".to_string(),
        );
        for _ in 0..7 {
            params.push(json!(path));
        }
    }

    if let Some(filter) = find_column_filter(&q.column_filters, "title") {
        push_text_like(&mut clauses, &mut params, "i.name", filter.text.as_deref());
    }
    if let Some(filter) = find_column_filter(&q.column_filters, "path") {
        push_text_like(&mut clauses, &mut params, "i.file_uri", filter.text.as_deref());
    }
    if let Some(filter) = find_column_filter(&q.column_filters, "body") {
        push_text_like(&mut clauses, &mut params, "i.summary", filter.text.as_deref());
    }
    if let Some(filter) = find_column_filter(&q.column_filters, "kind") {
        push_selected_in(&mut clauses, &mut params, "i.kind", filter.selected.as_deref());
    }

    (clauses.join(" AND "), params)
}

pub fn build_ideas_order(q: &IdeasTableQuery) -> String {
    let direction = if q.sort_dir.as_deref() == Some("desc") { "DESC" } else { "ASC" };
    let sort_by = q.sort_by.as_deref();
    let primary = match sort_by {
        Some("title") => format!("i.name {direction}, i.file_uri ASC, i.line_start ASC"),
        Some("body") => format!("i.summary {direction}, i.name ASC"),
        Some("kind") => format!("i.kind {direction}, i.name ASC"),
        Some("outRefs") => format!("outbound_count {direction}, i.name ASC"),
        Some("inRefs") => format!("inbound_count {direction}, i.name ASC"),
        Some("gitCreatedAt") => {
            format!("i.git_created_at IS NULL ASC, i.git_created_at {direction}, i.name ASC")
        }
        Some("gitModifiedAt") => {
            format!("i.git_modified_at IS NULL ASC, i.git_modified_at {direction}, i.name ASC")
        }
        Some("gitChangeCount") => {
            format!("i.git_change_count IS NULL ASC, i.git_change_count {direction}, i.name ASC")
        }
        Some(other) if other.starts_with("attr:") => {
            let key = &other["attr:".len()..];
            let path = attribute_json_path(key).replace('\'', "''");
            format!("json_extract(i.attributes_json, '{path}') {direction}, i.name ASC")
        }
        _ => format!("i.file_uri {direction}, i.line_start ASC"),
    };
    if q.group_by.as_deref() == Some("kind") {
        format!("i.kind ASC, {primary}")
    } else {
        primary
    }
}

pub fn build_ideasets_where(q: &IdeasetsTableQuery) -> (String, Vec<JsonValue>) {
    let mut clauses = vec!["1 = 1".to_string()];
    let mut params: Vec<JsonValue> = Vec::new();

    if let Some(search) = trimmed(&q.search) {
        clauses.push(
            "(COALESCE(name, file_uri) LIKE ? OR file_uri LIKE ? OR kind LIKE ?)".to_string(),
        );
        params.push(like(search));
        params.push(like(search));
        params.push(like(search));
    }

    if let Some(filter) = find_column_filter(&q.column_filters, "name") {
        push_text_like(
            &mut clauses,
            &mut params,
            "COALESCE(name, file_uri)",
            filter.text.as_deref(),
        );
    }
    if let Some(filter) = find_column_filter(&q.column_filters, "path") {
        push_text_like(&mut clauses, &mut params, "file_uri", filter.text.as_deref());
    }
    if let Some(filter) = find_column_filter(&q.column_filters, "kind") {
        push_selected_in(&mut clauses, &mut params, "kind", filter.selected.as_deref());
    }

    (clauses.join(" AND "), params)
}

pub fn build_ideasets_order(q: &IdeasetsTableQuery) -> String {
    let direction = if q.sort_dir.as_deref() == Some("desc") { "DESC" } else { "ASC" };
    match q.sort_by.as_deref() {
        Some("name") => format!("COALESCE(name, file_uri) {direction}, file_uri ASC"),
        Some("kind") => format!("kind {direction}, file_uri ASC"),
        Some("members") => format!("member_count {direction}, file_uri ASC"),
        _ => format!("file_uri {direction}, line_start ASC"),
    }
}

pub fn build_references_where(q: &ReferencesTableQuery) -> (String, Vec<JsonValue>) {
    let mut clauses = vec!["1 = 1".to_string()];
    let mut params: Vec<JsonValue> = Vec::new();

    if let Some(search) = trimmed(&q.search) {
        clauses.push(
            "(\n            si.name LIKE ? OR si.file_uri LIKE ?\n            OR COALESCE(ti.name, '') LIKE ? OR COALESCE(ti.file_uri, '') LIKE ?\n            OR COALESCE(e.target_file, '') LIKE ? OR COALESCE(e.label, '') LIKE ?\n            OR e.kind LIKE ?\n        )".to_string(),
        );
        for _ in 0..7 {
            params.push(like(search));
        }
    }

    if let Some(filter) = find_column_filter(&q.column_filters, "source") {
        if let Some(text) = trimmed(&filter.text) {
            clauses.push("(si.name LIKE ? OR si.file_uri LIKE ?)".to_string());
            params.push(like(text));
            params.push(like(text));
        }
    }
    if let Some(filter) = find_column_filter(&q.column_filters, "target") {
        if let Some(text) = trimmed(&filter.text) {
            clauses.push("(COALESCE(ti.name, e.target_file, e.label, '') LIKE ? OR COALESCE(ti.file_uri, e.target_file, '') LIKE ?)".to_string());
            params.push(like(text));
            params.push(like(text));
        }
    }
    if let Some(filter) = find_column_filter(&q.column_filters, "inRq") {
        if let Some(selected) = &filter.selected {
            let wants_yes = selected.iter().any(|value| value == "yes");
            let wants_no = selected.iter().any(|value| value == "no");
            if wants_yes && !wants_no {
                clauses.push("e.target_id IS NOT NULL".to_string());
            } else if wants_no && !wants_yes {
                clauses.push("e.target_id IS NULL".to_string());
            }
        }
    }
    if let Some(filter) = find_column_filter(&q.column_filters, "type") {
        if let Some(selected) = &filter.selected {
            if !selected.is_empty() {
                let kinds = edge_kinds_for_reference_view_types(selected);
                push_selected_in(&mut clauses, &mut params, "e.kind", Some(&kinds));
            }
        }
    }

    (clauses.join(" AND "), params)
}

pub fn build_references_order(q: &ReferencesTableQuery) -> String {
    let direction = if q.sort_dir.as_deref() == Some("desc") { "DESC" } else { "ASC" };
    let primary = match q.sort_by.as_deref() {
        Some("target") => {
            format!("COALESCE(ti.name, e.target_file, e.label, '') {direction}, si.file_uri ASC")
        }
        Some("inRq") => format!(
            "(CASE WHEN e.target_id IS NULL THEN 0 ELSE 1 END) {direction}, si.file_uri ASC"
        ),
        Some("type") => format!("e.kind {direction}, si.file_uri ASC"),
        _ => format!("si.file_uri {direction}, si.line_start ASC, e.id ASC"),
    };
    if q.group_by.as_deref() == Some("type") {
        format!("e.kind ASC, {primary}")
    } else {
        primary
    }
}

fn normalize_filter_list(value: &Option<Vec<String>>) -> Vec<String> {
    match value {
        Some(list) => list
            .iter()
            .map(|entry| entry.trim().to_string())
            .filter(|entry| !entry.is_empty())
            .collect(),
        None => Vec::new(),
    }
}

/// Graph slice candidate WHERE clause including FILTER_EMPTY / FILTER_NOT_PRESENT semantics.
pub fn build_graph_filter_where(q: &GraphViewQuery) -> (String, Vec<JsonValue>) {
    let mut clauses: Vec<String> = Vec::new();
    let mut params: Vec<JsonValue> = Vec::new();

    if q.include_ideasets != Some(true) {
        clauses.push("i.kind != 'ideaset'".to_string());
    }

    if let Some(search) = trimmed(&q.search) {
        clauses.push("(i.name LIKE ? OR i.summary LIKE ? OR i.file_uri LIKE ?)".to_string());
        params.push(like(search));
        params.push(like(search));
        params.push(like(search));
    }

    if let Some(path_filter) = trimmed(&q.path_filter) {
        clauses.push("i.file_uri LIKE ?".to_string());
        params.push(like(path_filter));
    }

    let status_filters = normalize_filter_list(&q.status_filter);
    if !status_filters.is_empty() {
        let path = attribute_json_path("status");
        let mut parts: Vec<String> = Vec::new();
        let include_missing = status_filters.iter().any(|value| value == FILTER_NOT_PRESENT);
        let include_empty = status_filters.iter().any(|value| value == FILTER_EMPTY);
        let concrete: Vec<&String> = status_filters
            .iter()
            .filter(|value| *value != FILTER_NOT_PRESENT && *value != FILTER_EMPTY)
            .collect();
        if include_missing {
            parts.push("json_extract(i.attributes_json, ?) IS NULL".to_string());
            params.push(json!(path));
        }
        if include_empty {
            parts.push(empty_attribute_sql());
            for _ in 0..5 {
                params.push(json!(path));
            }
        }
        if !concrete.is_empty() {
            let placeholders = vec!["?"; concrete.len()].join(", ");
            parts.push(format!("json_extract(i.attributes_json, ?) IN ({placeholders})"));
            params.push(json!(path));
            for value in &concrete {
                params.push(json!(value));
            }
        }
        clauses.push(format!("({})", parts.join(" OR ")));
    }

    let tag_filters = normalize_filter_list(&q.tag_filter);
    if !tag_filters.is_empty() {
        let path = attribute_json_path("tags");
        let mut parts: Vec<String> = Vec::new();
        let include_missing = tag_filters.iter().any(|value| value == FILTER_NOT_PRESENT);
        let include_empty = tag_filters.iter().any(|value| value == FILTER_EMPTY);
        let concrete: Vec<&String> = tag_filters
            .iter()
            .filter(|value| *value != FILTER_NOT_PRESENT && *value != FILTER_EMPTY)
            .collect();
        if include_missing {
            parts.push("json_extract(i.attributes_json, ?) IS NULL".to_string());
            params.push(json!(path));
        }
        if include_empty {
            parts.push(empty_attribute_sql());
            for _ in 0..5 {
                params.push(json!(path));
            }
        }
        for tag in &concrete {
            parts.push(
                "(\n                json_extract(i.attributes_json, ?) LIKE ?\n                OR EXISTS (\n                    SELECT 1 FROM json_each(json_extract(i.attributes_json, ?))\n                    WHERE value = ?\n                )\n            )".to_string(),
            );
            params.push(json!(path));
            params.push(like(tag));
            params.push(json!(path));
            params.push(json!(tag));
        }
        clauses.push(format!("({})", parts.join(" OR ")));
    }

    if clauses.is_empty() {
        ("1=1".to_string(), params)
    } else {
        (clauses.join(" AND "), params)
    }
}

fn empty_attribute_sql() -> String {
    "(\n                json_type(json_extract(i.attributes_json, ?)) = 'true'\n                OR (\n                    json_type(json_extract(i.attributes_json, ?)) = 'text'\n                    AND TRIM(CAST(json_extract(i.attributes_json, ?) AS TEXT)) = ''\n                )\n                OR (\n                    json_type(json_extract(i.attributes_json, ?)) = 'array'\n                    AND json_array_length(json_extract(i.attributes_json, ?)) = 0\n                )\n            )".to_string()
}

/// ORDER BY for unfocused graph seed lists when capping node count.
pub fn build_graph_truncation_order(basis: Option<&str>) -> String {
    match basis {
        Some("git-modified") => {
            "i.git_modified_at IS NULL ASC, i.git_modified_at DESC, i.file_uri ASC, i.line_start ASC".to_string()
        }
        Some("git-created") => {
            "i.git_created_at IS NULL ASC, i.git_created_at DESC, i.file_uri ASC, i.line_start ASC".to_string()
        }
        _ => "i.file_uri ASC, i.line_start ASC".to_string(),
    }
}

// ---- page + count query bodies -------------------------------------------------

const IDEA_PAGE_COLUMNS: &str = "i.id,\n                i.name,\n                i.kind,\n                i.file_uri,\n                i.line_start,\n                i.summary,\n                i.attributes_json,\n                i.git_created_at,\n                i.git_modified_at,\n                i.git_change_count,\n                (\n                    SELECT COUNT(*)\n                    FROM edges e\n                    WHERE e.source_id = i.id\n                ) AS outbound_count,\n                (\n                    SELECT COUNT(*)\n                    FROM edges e\n                    WHERE e.target_id = i.id\n                ) AS inbound_count,\n                (\n                    SELECT COUNT(*)\n                    FROM edges e\n                    WHERE e.source_id = i.id OR e.target_id = i.id\n                ) AS reference_count";

const IDEASETS_SUBQUERY: &str = "SELECT\n                    d.file_uri AS id,\n                    'file' AS kind,\n                    d.file_uri AS file_uri,\n                    0 AS line_start,\n                    NULL AS name,\n                    (\n                        SELECT COUNT(*)\n                        FROM ideas i\n                        WHERE i.file_uri = d.file_uri\n                    ) AS member_count\n                FROM documents d\n                UNION ALL\n                SELECT\n                    i.id,\n                    'explicit' AS kind,\n                    i.file_uri,\n                    i.line_start,\n                    i.name,\n                    (\n                        SELECT COUNT(*)\n                        FROM edges e\n                        WHERE e.source_id = i.id AND e.kind = 'ideaset_member'\n                    ) AS member_count\n                FROM ideas i\n                WHERE i.kind = 'ideaset'";

fn count_from(rows: Vec<JsonValue>) -> i64 {
    rows.first().and_then(|row| row.get("count")).and_then(JsonValue::as_i64).unwrap_or(0)
}

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

// ---- domain read/write ops backing the TS SqliteIndexStore facade -------------
// Reads return raw JSON rows / scalars; TS keeps presentation mapping (toSummary,
// mapEdgeRow, mapIdeaRow, filter-specials labels) until labels move to Rust.

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
/// rq:["../../../reqlan rq/indexer/cache-reuse.rq".unify_inbound_indexes]
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
    use std::collections::HashMap;
    let tx = conn.unchecked_transaction()?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::IndexStore;
    use crate::types::{EdgeKind, EdgeRecord, IdeaKind, IdeaRecord};

    fn idea(id: &str, name: &str, file: &str, line: u32, attributes: &str) -> IdeaRecord {
        IdeaRecord {
            id: id.to_string(),
            name: name.to_string(),
            kind: IdeaKind::Block,
            file_uri: file.to_string(),
            line_start: line,
            line_end: line,
            summary: String::new(),
            attributes_json: attributes.to_string(),
            content_hash: "h".to_string(),
            git_created_at: None,
            git_modified_at: None,
            git_change_count: None,
        }
    }

    fn edge(id: &str, source: &str, target: Option<&str>, kind: EdgeKind) -> EdgeRecord {
        EdgeRecord {
            id: id.to_string(),
            source_id: source.to_string(),
            target_id: target.map(str::to_string),
            target_file: None,
            kind,
            label: None,
            source_line: None,
            snippet: None,
            is_resolved: Some(true),
            source_offset_start: None,
            source_offset_end: None,
        }
    }

    fn seeded() -> IndexStore {
        let mut store = IndexStore::open_in_memory().unwrap();
        let ideas = vec![
            idea("f.rq#alpha", "alpha", "f.rq", 1, r#"{"status":"done","tags":["core"]}"#),
            idea("f.rq#beta", "beta", "f.rq", 2, r#"{"status":"pending","todo":"finish me"}"#),
            idea("g.rq#gamma", "gamma", "g.rq", 1, r#"{"tags":[]}"#),
            idea("g.rq#delta", "delta", "g.rq", 2, r#"{}"#),
        ];
        let edges = vec![edge("e1", "f.rq#alpha", Some("g.rq#gamma"), EdgeKind::References)];
        store.upsert_document("f.rq", "h1", &ideas[..2], &edges, None).unwrap();
        store.upsert_document("g.rq", "h2", &ideas[2..], &[], None).unwrap();
        store
    }

    #[test]
    fn inbound_for_file_returns_edges_targeting_ideas_in_file() {
        let store = seeded();
        let rows = get_inbound_for_file_rows(store.connection(), "g.rq").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["source_id"], json!("f.rq#alpha"));
        assert_eq!(rows[0]["target_id"], json!("g.rq#gamma"));
        assert_eq!(rows[0]["source_name"], json!("alpha"));
        assert_eq!(rows[0]["target_name"], json!("gamma"));
        assert_eq!(rows[0]["kind"], json!("references"));
    }

    #[test]
    fn ideas_pagination_respects_page_size() {
        let store = seeded();
        let mut q = IdeasTableQuery { page_size: 2, ..Default::default() };
        let total = count_ideas(store.connection(), &q).unwrap();
        assert_eq!(total, 4);
        let page0 = list_ideas_page_rows(store.connection(), &q).unwrap();
        assert_eq!(page0.len(), 2);
        q.page = 1;
        let page1 = list_ideas_page_rows(store.connection(), &q).unwrap();
        assert_eq!(page1.len(), 2);
        // Default order is by file_uri, line_start: f.rq#alpha, f.rq#beta then g.rq...
        assert_eq!(page0[0]["id"], json!("f.rq#alpha"));
        assert_eq!(page1[0]["id"], json!("g.rq#gamma"));
    }

    #[test]
    fn graph_filter_status_not_present() {
        let store = seeded();
        // Not present: ideas without a status key => gamma, delta.
        let not_present = GraphViewQuery {
            status_filter: Some(vec![FILTER_NOT_PRESENT.to_string()]),
            ..Default::default()
        };
        let (rows, total) =
            list_ideas_for_graph_query_rows(store.connection(), &not_present, 100).unwrap();
        assert_eq!(total, 2);
        let names: Vec<&str> = rows.iter().map(|r| r["name"].as_str().unwrap()).collect();
        assert!(names.contains(&"gamma"));
        assert!(names.contains(&"delta"));
    }

    #[test]
    fn graph_filter_where_emits_special_clauses() {
        // FILTER_EMPTY / FILTER_NOT_PRESENT semantics are generated into the WHERE clause.
        let q = GraphViewQuery {
            status_filter: Some(vec![
                FILTER_NOT_PRESENT.to_string(),
                FILTER_EMPTY.to_string(),
                "done".to_string(),
            ]),
            ..Default::default()
        };
        let (sql, params) = build_graph_filter_where(&q);
        assert!(sql.contains("json_extract(i.attributes_json, ?) IS NULL"));
        assert!(sql.contains("TRIM(CAST(json_extract(i.attributes_json, ?) AS TEXT)) = ''"));
        assert!(sql.contains("json_extract(i.attributes_json, ?) IN (?)"));
        // path (missing) + 5 empty paths + path + concrete value.
        assert_eq!(params.len(), 8);
    }

    #[test]
    fn graph_filter_concrete_status() {
        let store = seeded();
        let q =
            GraphViewQuery { status_filter: Some(vec!["done".to_string()]), ..Default::default() };
        let (rows, total) = list_ideas_for_graph_query_rows(store.connection(), &q, 100).unwrap();
        assert_eq!(total, 1);
        assert_eq!(rows[0]["name"], json!("alpha"));
    }

    #[test]
    fn todo_prefilter_matches_todo_key() {
        let store = seeded();
        let rows = list_todo_idea_rows(store.connection()).unwrap();
        let names: Vec<&str> = rows.iter().map(|r| r["name"].as_str().unwrap()).collect();
        assert_eq!(names, vec!["beta"]);
    }

    #[test]
    fn reference_chips_cover_both_directions() {
        let store = seeded();
        let rows = list_reference_chip_rows(
            store.connection(),
            &["f.rq#alpha".to_string(), "g.rq#gamma".to_string()],
        )
        .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["source_id"], json!("f.rq#alpha"));
        assert_eq!(rows[0]["target_id"], json!("g.rq#gamma"));
    }

    #[test]
    fn ideasets_include_file_and_explicit() {
        let store = seeded();
        let q = IdeasetsTableQuery { page_size: 50, ..Default::default() };
        let total = count_ideasets(store.connection(), &q).unwrap();
        // Two documents (file ideasets); no explicit ideaset ideas seeded.
        assert_eq!(total, 2);
        let rows = list_ideasets_page_rows(store.connection(), &q).unwrap();
        assert_eq!(rows.len(), 2);
    }

    #[test]
    fn references_page_lists_edges() {
        let store = seeded();
        let q = ReferencesTableQuery { page_size: 50, ..Default::default() };
        assert_eq!(count_references(store.connection(), &q).unwrap(), 1);
        let rows = list_references_page_rows(store.connection(), &q).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["source_name"], json!("alpha"));
    }

    #[test]
    fn missing_git_dates_lists_all_ideas_initially() {
        let store = seeded();
        let ids = list_idea_ids_missing_git_dates(store.connection(), 40, None, None).unwrap();
        assert_eq!(ids.len(), 4);
    }

    #[test]
    fn document_hash_and_mtime_roundtrip() {
        let store = seeded();
        let conn = store.connection();
        assert_eq!(get_document_hash(conn, "f.rq").unwrap().as_deref(), Some("h1"));
        assert_eq!(get_document_hash(conn, "missing.rq").unwrap(), None);
        assert_eq!(get_document_mtime_ms(conn, "f.rq").unwrap(), None);
        update_document_mtime(conn, "f.rq", 1234.0).unwrap();
        assert_eq!(get_document_mtime_ms(conn, "f.rq").unwrap(), Some(1234.0));
        let uris = list_document_uris(conn).unwrap();
        assert_eq!(uris, vec!["f.rq".to_string(), "g.rq".to_string()]);
    }

    #[test]
    fn idea_lookups_by_id_and_line() {
        let store = seeded();
        let conn = store.connection();
        let alpha = get_idea_row(conn, "f.rq#alpha").unwrap().unwrap();
        assert_eq!(alpha["name"], json!("alpha"));
        assert!(get_idea_row(conn, "nope").unwrap().is_none());
        let at_line = get_idea_at_line_row(conn, "f.rq", 2).unwrap().unwrap();
        assert_eq!(at_line["name"], json!("beta"));
        assert!(get_ideaset_at_line_row(conn, "f.rq", 2).unwrap().is_none());
        let by_ids =
            get_ideas_by_ids_rows(conn, &["f.rq#alpha".to_string(), "g.rq#delta".to_string()])
                .unwrap();
        assert_eq!(by_ids.len(), 2);
        assert!(get_ideas_by_ids_rows(conn, &[]).unwrap().is_empty());
    }

    #[test]
    fn references_for_idea_covers_both_directions() {
        let store = seeded();
        let conn = store.connection();
        let alpha = list_references_for_idea(conn, "f.rq#alpha").unwrap();
        assert_eq!(alpha["outbound"].as_array().unwrap().len(), 1);
        assert_eq!(alpha["inbound"].as_array().unwrap().len(), 0);
        assert_eq!(alpha["outbound"][0]["target_name"], json!("gamma"));
        let gamma = list_references_for_idea(conn, "g.rq#gamma").unwrap();
        assert_eq!(gamma["inbound"].as_array().unwrap().len(), 1);
        assert_eq!(gamma["inbound"][0]["source_name"], json!("alpha"));
    }

    #[test]
    fn edges_counts_and_node_batch() {
        let store = seeded();
        let conn = store.connection();
        assert_eq!(get_all_edge_rows(conn).unwrap().len(), 1);
        assert_eq!(
            get_edges_for_nodes_rows(conn, &["f.rq#alpha".to_string(), "g.rq#gamma".to_string()])
                .unwrap()
                .len(),
            1
        );
        assert!(get_edges_for_nodes_rows(conn, &[]).unwrap().is_empty());
        assert_eq!(count_edges_from_file(conn, "f.rq").unwrap(), 1);
        let totals = counts(conn).unwrap();
        assert_eq!(totals["ideas"], json!(4));
        assert_eq!(totals["edges"], json!(1));
    }

    #[test]
    fn remove_documents_deletes_ideas_and_edges() {
        let store = seeded();
        let conn = store.connection();
        remove_documents(conn, &["f.rq".to_string()]).unwrap();
        let totals = counts(conn).unwrap();
        assert_eq!(totals["ideas"], json!(2));
        assert_eq!(totals["edges"], json!(0));
        clear_all(conn).unwrap();
        let totals = counts(conn).unwrap();
        assert_eq!(totals["ideas"], json!(0));
    }
}
