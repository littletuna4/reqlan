//! Graph slice candidate filtering (FILTER_EMPTY / FILTER_NOT_PRESENT semantics)
//! and truncation order.
//! rq:["../../../../reqlan rq/extension/workspace-summary/ideas_summary/graphical_graph.rq".graphical_graph]
//! rq:["../../../../reqlan rq/extension/workspace-summary/ideas_summary/graphical_graph.rq".node_truncation]
use serde_json::{json, Value as JsonValue};

use crate::types::{FILTER_EMPTY, FILTER_NOT_PRESENT};

use super::common::{attribute_json_path, like, trimmed};
use super::filters::GraphViewQuery;

pub const GRAPH_MAX_NODES: i64 = 120;
pub const GRAPH_NODES_HARD_CAP: i64 = 1000;

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
