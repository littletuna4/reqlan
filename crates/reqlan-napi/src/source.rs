//! Parse-for-tooling source helpers: CLI parse summary, ignore lines,
//! idea-name extraction, local symbolic analysis.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use reqlan_parse::{parse_document, Severity};

/// Single-file parse for CLI `reqlan parse` — no workspace index, no Langium.
/// rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]
/// rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_align]
/// rq:["../../../reqlan rq/cli/cli_package.rq".commands]
// Exported via napi to `@reqlan/analytical` (load-native.ts); `#[no_mangle]`
// exports are not counted as live roots by the dead_code lint.
#[allow(dead_code)]
#[napi]
pub fn parse_reqlan_source(source: String) -> Result<serde_json::Value> {
    Ok(parse_source_summary(&source))
}

/// 0-based line indexes whose diagnostics `//rq-ignore-error` suppresses.
/// rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
#[allow(dead_code)]
#[napi(js_name = "findRqIgnoreErrorTargetLines")]
pub fn find_rq_ignore_error_target_lines(source: String) -> Vec<i64> {
    let mut lines: Vec<i64> = reqlan_index::find_rq_ignore_error_target_lines(&source)
        .into_iter()
        .map(i64::from)
        .collect();
    lines.sort_unstable();
    lines
}

/// Top-level idea names in a document — used by git-context historical extract.
/// rq:["../../../reqlan rq/indexer/indexer.rq".git_dates]
#[allow(dead_code)]
#[napi]
pub fn extract_idea_names(source: String) -> Vec<String> {
    let parsed = parse_document(&source);
    parsed
        .model
        .elements
        .iter()
        .filter_map(|element| element.name())
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .collect()
}

/// Path + source only: outbound edges with spans and same-file inbound backlinks.
/// No workspace catalog, no SQLite.
/// rq:["../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
/// rq:["../../../reqlan rq/language/syntax.rq".open_file_reference_sequencing]
#[allow(dead_code)]
#[napi]
pub fn analyze_local_symbolic(
    file_uri: String,
    source: String,
    import_roots: Option<Vec<serde_json::Value>>,
) -> Result<serde_json::Value> {
    let roots = parse_import_root_dtos(import_roots.as_deref().unwrap_or(&[]));
    let doc = reqlan_index::analyze_local_symbolic(&file_uri, &source, &roots);
    serde_json::to_value(doc).map_err(|error| Error::from_reason(error.to_string()))
}

// Helper of the napi-exported analyze_local_symbolic above.
#[allow(dead_code)]
fn parse_import_root_dtos(entries: &[serde_json::Value]) -> Vec<reqlan_parse::ImportRootMapping> {
    entries
        .iter()
        .filter_map(|entry| {
            let alias = entry.get("alias")?.as_str()?.to_string();
            if alias.is_empty() {
                return None;
            }
            let root = entry
                .get("root")
                .and_then(|value| value.as_str())
                .map(str::to_string)
                .filter(|value| !value.is_empty());
            Some(reqlan_parse::ImportRootMapping { alias, root })
        })
        .collect()
}
fn parse_source_summary(source: &str) -> serde_json::Value {
    let parsed = parse_document(source);
    let align = reqlan_parse::align_snapshot_from_parsed(&parsed);
    let elements: Vec<serde_json::Value> = align
        .elements
        .iter()
        .map(|element| {
            serde_json::json!({
                "type": element.type_name,
                "name": element.name,
            })
        })
        .collect();
    let diagnostics: Vec<serde_json::Value> = parsed
        .diagnostics
        .iter()
        .map(|diagnostic| {
            let severity = match diagnostic.severity {
                Severity::Error => 1,
                Severity::Warning => 2,
            };
            serde_json::json!({
                "severity": severity,
                "line": diagnostic.line + 1,
                "character": column_at(source, diagnostic.offset),
                "message": diagnostic.message,
                "text": line_text(source, diagnostic.offset),
            })
        })
        .collect();
    let error_count = diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.get("severity") == Some(&serde_json::json!(1)))
        .count();
    serde_json::json!({
        "ok": error_count == 0 && parsed.incomplete.is_none(),
        "errorCount": error_count,
        "diagnostics": diagnostics,
        "elements": elements,
        "refs": align
            .refs
            .iter()
            .map(|reference| serde_json::json!({
                "form": reference.form,
                "kind": reference.kind,
                "label": reference.label,
            }))
            .collect::<Vec<_>>(),
        "inlineCodeCount": align.inline_code_count,
        "codeSnippetCount": align.code_snippet_count,
    })
}

fn column_at(source: &str, offset: usize) -> u32 {
    let clamped = offset.min(source.len());
    let start = source[..clamped].rfind('\n').map(|index| index + 1).unwrap_or(0);
    (clamped.saturating_sub(start) + 1) as u32
}

fn line_text(source: &str, offset: usize) -> String {
    let clamped = offset.min(source.len());
    let start = source[..clamped].rfind('\n').map(|index| index + 1).unwrap_or(0);
    let end = source[start..].find('\n').map(|index| start + index).unwrap_or(source.len());
    source.get(start..end).unwrap_or("").to_string()
}
#[cfg(test)]
mod tests {
    use super::parse_source_summary;

    #[test]
    fn parse_source_summary_lists_oneliner_ideas() {
        let summary = parse_source_summary("hello this is a demo idea\n");
        assert_eq!(summary["ok"], serde_json::json!(true));
        assert_eq!(summary["errorCount"], serde_json::json!(0));
        assert_eq!(summary["elements"][0]["type"], "OneLinerIdea");
        assert_eq!(summary["elements"][0]["name"], "hello");
    }
}
