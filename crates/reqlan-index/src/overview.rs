//! Lazy coverage metrics for the Ideas Summary Overview.
//! Ported from `overview-coverage.ts`; walks the base with the shared `.rqignore`
//! filter, counts eligible non-`.rq` files, resolves file-reference coverage, and
//! tallies LOC with the same size caps.
//! rq:["../../../reqlan rq/extension/module/ideas_summary/webview.rq".overview_coverage_scores]

use crate::ignore::RqIgnoreFilter;
use crate::queries;
use crate::sql_bridge::SqlBridgeError;
use rusqlite::Connection;
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;
use walkdir::WalkDir;

const LOC_FILE_BYTE_CAP: u64 = 2 * 1024 * 1024;
const LOC_TOTAL_BYTE_CAP: u64 = 64 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverviewCoverageScores {
    pub idea_count: i64,
    pub rq_file_count: usize,
    pub eligible_non_rq_file_count: usize,
    pub referenced_eligible_file_count: usize,
    /// 0–100; None when there are no eligible non-`.rq` files.
    pub file_coverage_pct: Option<f64>,
    pub distinct_file_reference_count: usize,
    pub total_loc: u64,
    /// Ideas per 1000 LOC; None when LOC is 0.
    pub ideas_per_k_loc: Option<f64>,
    /// True when LOC counting hit size caps (totals are lower bounds).
    pub loc_truncated: bool,
    pub calculated_at: f64,
}

struct WalkResult {
    rq_files: Vec<String>,
    eligible_non_rq_files: Vec<String>,
}

/// Compute coverage scores for `base_root` using the ideas DB `conn`.
pub fn compute_overview_coverage(
    conn: &Connection,
    base_root: &Path,
) -> Result<OverviewCoverageScores, SqlBridgeError> {
    let idea_count = count_from(queries::counts(conn)?);
    let filter = RqIgnoreFilter::load(base_root);
    let walk = walk_eligible_files(base_root, &filter);
    let referenced = list_resolved_file_references(conn)?;

    let referenced_eligible_file_count =
        count_covered_eligible_files(&walk.eligible_non_rq_files, &referenced);
    let eligible_non_rq_file_count = walk.eligible_non_rq_files.len();
    let file_coverage_pct = if eligible_non_rq_file_count == 0 {
        None
    } else {
        let pct =
            (referenced_eligible_file_count as f64 / eligible_non_rq_file_count as f64) * 1000.0;
        Some((pct.round()) / 10.0)
    };

    let (total_loc, loc_truncated) = count_eligible_loc(base_root, &walk.eligible_non_rq_files);
    let ideas_per_k_loc = if total_loc == 0 {
        None
    } else {
        let value = (idea_count as f64 / total_loc as f64) * 1000.0 * 100.0;
        Some(value.round() / 100.0)
    };

    Ok(OverviewCoverageScores {
        idea_count,
        rq_file_count: walk.rq_files.len(),
        eligible_non_rq_file_count,
        referenced_eligible_file_count,
        file_coverage_pct,
        distinct_file_reference_count: referenced.len(),
        total_loc,
        ideas_per_k_loc,
        loc_truncated,
        calculated_at: now_ms(),
    })
}

fn count_from(counts: serde_json::Value) -> i64 {
    counts.get("ideas").and_then(serde_json::Value::as_i64).unwrap_or(0)
}

fn now_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

fn walk_eligible_files(base_root: &Path, filter: &RqIgnoreFilter) -> WalkResult {
    let mut rq_files = Vec::new();
    let mut eligible_non_rq_files = Vec::new();
    for entry in WalkDir::new(base_root).into_iter().filter_entry(|entry| {
        let rel = relative_posix(base_root, entry.path());
        rel.is_empty() || !filter.ignores(&rel, entry.file_type().is_dir())
    }) {
        let Ok(entry) = entry else { continue };
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let rel = relative_posix(base_root, path);
        if rel.is_empty() {
            continue;
        }
        if rel.to_ascii_lowercase().ends_with(".rq") {
            if !is_secret_rq_path(&rel) {
                rq_files.push(rel);
            }
            continue;
        }
        eligible_non_rq_files.push(rel);
    }
    WalkResult { rq_files, eligible_non_rq_files }
}

fn is_secret_rq_path(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.to_ascii_lowercase().ends_with(".secret.rq")
}

fn list_resolved_file_references(conn: &Connection) -> Result<HashSet<String>, SqlBridgeError> {
    let rows = queries::list_file_reference_target_rows(conn)?;
    let mut resolved = HashSet::new();
    for row in rows {
        let target =
            row.get("target_file").and_then(serde_json::Value::as_str).unwrap_or("").trim();
        if target.is_empty() {
            continue;
        }
        let source_id = row.get("source_id").and_then(serde_json::Value::as_str).unwrap_or("");
        let joined = resolve_referenced_file_path(target, source_id);
        let normalized = normalize_rel_path(&joined);
        if normalized.is_empty() || normalized.contains("://") || normalized.starts_with("../") {
            continue;
        }
        resolved.insert(normalized);
    }
    Ok(resolved)
}

/// Resolve an authored file reference against the defining idea's file directory.
/// Mirrors `resolveReferencedFilePath` for workspace-relative index URIs.
fn resolve_referenced_file_path(target_file: &str, source_id: &str) -> String {
    let target = target_file.replace('\\', "/");
    if target.contains("://") || target.starts_with('/') || is_windows_absolute(&target) {
        return target_file.to_string();
    }
    let defining_file = defining_file_path(source_id).replace('\\', "/");
    if defining_file.is_empty()
        || defining_file.contains("://")
        || defining_file.starts_with('/')
        || is_windows_absolute(&defining_file)
    {
        return target_file.to_string();
    }
    posix_join(posix_dirname(&defining_file), &target)
}

fn defining_file_path(source_id: &str) -> String {
    match source_id.rfind('#') {
        Some(index) => source_id[..index].to_string(),
        None => source_id.to_string(),
    }
}

fn is_windows_absolute(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

fn posix_dirname(path: &str) -> &str {
    match path.rfind('/') {
        Some(0) => "/",
        Some(index) => &path[..index],
        None => ".",
    }
}

fn posix_join(base: &str, relative: &str) -> String {
    let combined = if base.is_empty() || base == "." {
        relative.to_string()
    } else {
        format!("{}/{}", base.trim_end_matches('/'), relative)
    };
    normalize_posix_segments(&combined)
}

/// Collapse `.` / `..` segments the way `posix.join` does.
fn normalize_posix_segments(path: &str) -> String {
    let absolute = path.starts_with('/');
    let mut out: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if matches!(out.last(), Some(&last) if last != "..") {
                    out.pop();
                } else if !absolute {
                    out.push(part);
                }
            }
            other => out.push(other),
        }
    }
    let joined = out.join("/");
    if absolute {
        format!("/{joined}")
    } else {
        joined
    }
}

fn normalize_rel_path(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    let normalized = normalized.strip_prefix("./").unwrap_or(&normalized);
    normalized.trim_end_matches('/').to_string()
}

fn count_covered_eligible_files(eligible: &[String], referenced: &HashSet<String>) -> usize {
    if eligible.is_empty() || referenced.is_empty() {
        return 0;
    }
    let eligible_set: HashSet<&str> = eligible.iter().map(String::as_str).collect();
    let mut covered: HashSet<&str> = HashSet::new();
    for path in eligible {
        if referenced.contains(path) {
            covered.insert(path);
        }
    }
    // Directory references cover every eligible file beneath them.
    for reference in referenced {
        if eligible_set.contains(reference.as_str()) {
            continue;
        }
        let prefix = format!("{reference}/");
        for path in eligible {
            if path.starts_with(&prefix) {
                covered.insert(path);
            }
        }
    }
    covered.len()
}

fn count_eligible_loc(base_root: &Path, eligible: &[String]) -> (u64, bool) {
    let mut total_loc = 0u64;
    let mut bytes_read = 0u64;
    let mut loc_truncated = false;

    for rel in eligible {
        if bytes_read >= LOC_TOTAL_BYTE_CAP {
            loc_truncated = true;
            break;
        }
        let abs_path = base_root.join(rel);
        let size = match std::fs::metadata(&abs_path) {
            Ok(meta) => meta.len(),
            Err(_) => continue,
        };
        if size == 0 {
            continue;
        }
        if size > LOC_FILE_BYTE_CAP {
            loc_truncated = true;
            continue;
        }
        if bytes_read + size > LOC_TOTAL_BYTE_CAP {
            loc_truncated = true;
            break;
        }
        let bytes = match std::fs::read(&abs_path) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };
        if bytes.iter().take(4096).any(|&byte| byte == 0) {
            continue;
        }
        match String::from_utf8(bytes) {
            Ok(text) => {
                bytes_read += size;
                total_loc += count_lines(&text);
            }
            Err(_) => continue,
        }
    }

    (total_loc, loc_truncated)
}

fn count_lines(text: &str) -> u64 {
    if text.is_empty() {
        return 0;
    }
    let mut lines = 1u64;
    for byte in text.bytes() {
        if byte == b'\n' {
            lines += 1;
        }
    }
    if text.ends_with('\n') {
        lines -= 1;
    }
    lines
}

fn relative_posix(root: &Path, path: &Path) -> String {
    path.strip_prefix(root).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_file_reference_against_defining_dir() {
        assert_eq!(
            resolve_referenced_file_path("../foo.ts", "reqlan rq/sub/page.rq#idea"),
            "reqlan rq/foo.ts"
        );
        assert_eq!(resolve_referenced_file_path("./bar.ts", "a/b.rq#i"), "a/bar.ts");
    }

    #[test]
    fn counts_directory_reference_coverage() {
        let eligible = vec!["src/a.ts".to_string(), "src/b.ts".to_string(), "other.ts".to_string()];
        let referenced: HashSet<String> = ["src".to_string()].into_iter().collect();
        assert_eq!(count_covered_eligible_files(&eligible, &referenced), 2);
    }

    #[test]
    fn counts_lines_like_ts() {
        assert_eq!(count_lines(""), 0);
        assert_eq!(count_lines("a\nb\n"), 2);
        assert_eq!(count_lines("a\nb"), 2);
    }
}
