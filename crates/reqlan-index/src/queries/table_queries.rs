//! WHERE / ORDER BY builders for the ideas, ideasets, and references tables.
//! rq:["../../../../reqlan rq/extension/workspace-summary/ideas_summary/webview.rq".table_column_filters]
//! rq:["../../../../reqlan rq/extension/workspace-summary/ideas_summary/webview.rq".group_by_type]
//! rq:["../../../../reqlan rq/extension/workspace-summary/ideas_summary/webview.rq".idea_sets_tab]
//! rq:["../../../../reqlan rq/extension/workspace-summary/ideas_summary/webview.rq".ideas_table_filters]
use serde_json::{json, Value as JsonValue};

use super::common::{attribute_json_path, like, trimmed};
use super::filters::{ColumnFilter, IdeasTableQuery, IdeasetsTableQuery, ReferencesTableQuery};

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
        let target_file = target_file.replace('\\', "/");
        let basename = target_file.rsplit('/').next().unwrap_or(target_file.as_str()).to_string();
        let suffix = format!("%/{basename}");
        return (
            "EXISTS (\n                SELECT 1 FROM edges e\n                WHERE e.source_id = i.id\n                AND e.target_id IS NULL\n                AND (\n                    e.target_file = ? OR e.label = ?\n                    OR e.target_file = ? OR e.label = ?\n                    OR e.target_file LIKE ? OR e.label LIKE ?\n                )\n            )".to_string(),
            vec![
                json!(target_file),
                json!(target_file),
                json!(basename),
                json!(basename),
                json!(suffix),
                json!(suffix),
            ],
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
