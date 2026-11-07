//! Wildcard reference edge expansion against the idea catalog.
//! rq:["../../../../reqlan rq/indexer/indexer.rq".wildcard_reference_edges]
//! rq:["../../../../reqlan rq/language/imports.rq".wildcard_references]

use super::glob::unquote_if_needed;
use super::glob::{glob_to_regex, join_posix, looks_absolute, normalize_posix, parent_posix};
use crate::ids::{edge_id, idea_id};
use crate::types::{EdgeKind, EdgeRecord};
use reqlan_parse::{resolve_rq_path, ImportRootMapping};

#[derive(Debug, Clone)]
pub struct WildcardIdeaCandidate {
    pub file_uri: String,
    pub file_path: String,
    pub idea_name: String,
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn wildcard_edges(
    source_id: &str,
    path_pattern_quoted: &str,
    idea_pattern: &str,
    from_file: &str,
    candidates: &[WildcardIdeaCandidate],
    import_roots: &[ImportRootMapping],
    source_line: u32,
    snippet: Option<String>,
) -> Vec<EdgeRecord> {
    let path = resolve_rq_path(&unquote_if_needed(path_pattern_quoted), from_file, import_roots);
    let label = format!("{path}.{idea_pattern}");
    let matches = match_wildcard(&path, idea_pattern, from_file, candidates);
    if matches.is_empty() {
        return vec![EdgeRecord {
            id: edge_id(
                source_id,
                EdgeKind::WildcardReference.as_str(),
                &format!("unresolved:{label}"),
            ),
            source_id: source_id.to_string(),
            target_id: None,
            target_file: None,
            kind: EdgeKind::WildcardReference,
            label: Some(label),
            source_line: Some(source_line),
            snippet,
            is_resolved: Some(false),
            source_offset_start: None,
            source_offset_end: None,
        }];
    }
    matches
        .into_iter()
        .map(|matched| {
            let target_id = idea_id(&matched.file_uri, &matched.idea_name);
            EdgeRecord {
                id: edge_id(source_id, EdgeKind::WildcardReference.as_str(), &target_id),
                source_id: source_id.to_string(),
                target_id: Some(target_id),
                target_file: None,
                kind: EdgeKind::WildcardReference,
                label: Some(label.clone()),
                source_line: Some(source_line),
                snippet: snippet.clone(),
                is_resolved: Some(true),
                source_offset_start: None,
                source_offset_end: None,
            }
        })
        .collect()
}

/// Split a stored wildcard edge label `{resolved_path}.{idea_pattern}`.
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_sparse]
pub fn split_wildcard_label(label: &str) -> Option<(&str, &str)> {
    let (path, idea) = label.rsplit_once('.')?;
    if path.is_empty() || idea.is_empty() {
        return None;
    }
    Some((path, idea))
}

/// Count catalog ideas that match a workspace-relative path glob and idea glob.
pub fn count_wildcard_matches(
    path_pattern: &str,
    idea_pattern: &str,
    candidates: &[WildcardIdeaCandidate],
) -> usize {
    match_wildcard(path_pattern, idea_pattern, "", candidates).len()
}

fn match_wildcard(
    path_pattern: &str,
    idea_pattern: &str,
    from_file: &str,
    candidates: &[WildcardIdeaCandidate],
) -> Vec<WildcardIdeaCandidate> {
    let idea_re = glob_to_regex(idea_pattern, false);
    let dir = parent_posix(from_file);
    let absolute = if path_pattern.starts_with('/') || looks_absolute(path_pattern) {
        normalize_posix(path_pattern)
    } else {
        join_posix(&dir, path_pattern)
    };
    let path_re = glob_to_regex(&absolute, true);
    let mut matches: Vec<_> = candidates
        .iter()
        .filter(|candidate| {
            path_re.is_match(&normalize_posix(&candidate.file_path))
                && idea_re.is_match(&candidate.idea_name)
        })
        .cloned()
        .collect();
    matches.sort_by(|left, right| {
        left.file_uri.cmp(&right.file_uri).then(left.idea_name.cmp(&right.idea_name))
    });
    matches
}
