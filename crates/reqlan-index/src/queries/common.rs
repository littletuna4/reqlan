//! Shared SQL clause helpers for the query modules.
//! rq:["../../../../reqlan rq/extension/workspace-summary/ideas_summary/webview.rq".table_column_filters]
//! rq:["../../../../reqlan rq/extension/workspace-summary/ideas_summary/webview.rq".pages]
use serde_json::{json, Value as JsonValue};

pub(crate) fn like(text: &str) -> JsonValue {
    json!(format!("%{}%", text))
}

pub(crate) fn trimmed(value: &Option<String>) -> Option<&str> {
    value.as_deref().map(str::trim).filter(|text| !text.is_empty())
}

/// JSON path for an attribute key, matching TS `$.${JSON.stringify(key)}`.
pub(crate) fn attribute_json_path(key: &str) -> String {
    format!("$.{}", serde_json::to_string(key).unwrap_or_else(|_| format!("\"{key}\"")))
}

pub(crate) fn count_from(rows: Vec<JsonValue>) -> i64 {
    rows.first().and_then(|row| row.get("count")).and_then(JsonValue::as_i64).unwrap_or(0)
}
