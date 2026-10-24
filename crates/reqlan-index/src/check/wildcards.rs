//! Sparse wildcard recount (`0` or `1` match against the full catalog).
//! rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_sparse]
//! rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
//! rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]

use super::index::{CheckEdge, CheckIndex};
use super::{check_source_in_scope, to_zero_based_line, BrokenReference, CheckReferencesOptions};
use crate::extract::{count_wildcard_matches, split_wildcard_label, WildcardIdeaCandidate};
use crate::rq_ignore::is_line_rq_ignored;
use crate::store::StoreError;
use crate::types::{EdgeKind, IdeaKind};
use std::collections::{HashMap, HashSet};
use std::path::Path;

pub(super) fn append_wildcard_sparse_rows(
    index: &CheckIndex,
    workspace_root: &Path,
    options: &CheckReferencesOptions<'_>,
    rows: &mut Vec<BrokenReference>,
    ignore_cache: &mut HashMap<String, HashSet<u32>>,
) -> Result<(), StoreError> {
    // Stored wildcard edges can be empty when the source file was indexed before
    // its targets. Recount against the full compact catalog. Drop those unresolved rows.
    rows.retain(|row| row.kind != EdgeKind::WildcardReference.as_str());

    let candidates: Vec<WildcardIdeaCandidate> = index
        .ideas
        .iter()
        .filter(|idea| idea.kind != IdeaKind::Ideaset)
        .map(|idea| WildcardIdeaCandidate {
            file_path: idea.file_uri.clone(),
            file_uri: idea.file_uri.clone(),
            idea_name: idea.name.clone(),
        })
        .collect();

    let mut groups: HashMap<(String, Option<u32>, String), Vec<&CheckEdge>> = HashMap::new();
    for edge in &index.edges {
        if edge.kind != EdgeKind::WildcardReference {
            continue;
        }
        let label = edge.label.clone().unwrap_or_default();
        groups.entry((edge.source_id.clone(), edge.source_line, label)).or_default().push(edge);
    }
    for ((source_id, source_line, label), edges) in groups {
        let match_count = split_wildcard_label(&label)
            .map(|(path, idea)| count_wildcard_matches(path, idea, &candidates) as u32)
            .unwrap_or(0);
        let handling = match match_count {
            0 => options.wildcard_zero,
            1 => options.wildcard_one,
            _ => continue,
        };
        let Some(severity) = handling.severity() else {
            continue;
        };
        let Some(source) = index.get_idea(&source_id) else {
            continue;
        };
        if !check_source_in_scope(options, &source.file_uri) {
            continue;
        }
        let line = to_zero_based_line(EdgeKind::WildcardReference, source_line);
        if is_line_rq_ignored(workspace_root, &source.file_uri, line, ignore_cache) {
            continue;
        }
        rows.push(BrokenReference {
            file_uri: source.file_uri.clone(),
            source_id: Some(source.id.clone()),
            source_name: Some(source.name.clone()),
            kind: EdgeKind::WildcardReference.as_str().to_string(),
            label,
            source_line: line,
            snippet: edges.first().and_then(|edge| edge.snippet.clone()),
            severity: severity.to_string(),
            match_count: Some(match_count),
        });
    }
    Ok(())
}
