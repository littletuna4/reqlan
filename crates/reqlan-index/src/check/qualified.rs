//! Qualified reference target validation (`["path".idea]` and `[alias.idea]`).
//! rq:["../../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_idea]
//! rq:["../../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_file]
//! rq:["../../../../reqlan rq/language/imports.rq".import_namespace]

use super::index::CheckIndex;
use super::{
    list_source_in_scope, to_zero_based_line, BrokenReference, ListBrokenReferencesOptions,
};
use crate::path_resolve::{is_rq_uri, qualified_target_file_missing, rq_path_exists};
use crate::store::StoreError;
use crate::types::EdgeKind;
use reqlan_parse::{file_from_idea_id, import_path_candidates, parse_document};
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// A qualified reference `["path".idea]` or `[alias.idea]` is stored as a resolved idea edge.
/// When the target `.rq` file exists and does not declare that idea, the reference is unresolved.
/// An import alias bound in that file is a valid target. It is not a missing idea.
/// A code-file symbol reference is not this error. A missing file stays a file-reference error.
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_idea]
/// rq:["../../../../reqlan rq/language/imports.rq".import_namespace]
pub(super) fn append_unresolved_qualified_idea_targets(
    index: &CheckIndex,
    workspace_root: &Path,
    options: &ListBrokenReferencesOptions<'_>,
    broken: &mut Vec<BrokenReference>,
) -> Result<(), StoreError> {
    let mut import_bindings: HashMap<String, HashSet<String>> = HashMap::new();
    for edge in &index.edges {
        if edge.kind != EdgeKind::References || edge.is_resolved == Some(false) {
            continue;
        }
        let Some(target_id) = edge.target_id.as_deref() else {
            continue;
        };
        let Some(idea) = edge.label.as_deref().filter(|label| !label.is_empty()) else {
            continue;
        };
        let target_file = file_from_idea_id(target_id);
        if target_file.is_empty() || target_file == target_id {
            continue;
        }
        // Attribute edges point at the owner idea. The label is the attribute name.
        let Some((_, target_idea)) = target_id.rsplit_once('#') else {
            continue;
        };
        if target_idea != idea {
            continue;
        }
        let Some(source) = index.get_idea(&edge.source_id) else {
            continue;
        };
        if !list_source_in_scope(options, &source.file_uri) {
            continue;
        }
        if !index.qualified_target_is_rq(workspace_root, target_file) {
            continue;
        }
        if qualified_target_exposes_name(
            index,
            workspace_root,
            target_file,
            idea,
            &mut import_bindings,
        ) {
            continue;
        }
        broken.push(BrokenReference {
            file_uri: source.file_uri.clone(),
            source_id: Some(source.id.clone()),
            source_name: Some(source.name.clone()),
            kind: EdgeKind::References.as_str().to_string(),
            label: idea.to_string(),
            source_line: to_zero_based_line(edge.kind, edge.source_line),
            snippet: edge.snippet.clone(),
            severity: "error".to_string(),
            match_count: None,
        });
    }
    Ok(())
}

/// A qualified reference `["path".idea]` is stored as a resolved idea edge.
/// Check still reports the path when that file is not on disk.
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_file]
pub(super) fn append_missing_qualified_file_targets(
    index: &CheckIndex,
    workspace_root: &Path,
    options: &ListBrokenReferencesOptions<'_>,
    broken: &mut Vec<BrokenReference>,
) -> Result<(), StoreError> {
    for edge in &index.edges {
        if edge.kind != EdgeKind::References || edge.is_resolved == Some(false) {
            continue;
        }
        let Some(target_id) = edge.target_id.as_deref() else {
            continue;
        };
        let target_file = file_from_idea_id(target_id);
        if target_file.is_empty() || target_file == target_id {
            continue;
        }
        let Some(source) = index.get_idea(&edge.source_id) else {
            continue;
        };
        if !list_source_in_scope(options, &source.file_uri) {
            continue;
        }
        if target_file == source.file_uri {
            continue;
        }
        if !qualified_target_file_missing(workspace_root, target_file) {
            continue;
        }
        broken.push(BrokenReference {
            file_uri: source.file_uri.clone(),
            source_id: Some(source.id.clone()),
            source_name: Some(source.name.clone()),
            kind: EdgeKind::FileReference.as_str().to_string(),
            label: target_file.to_string(),
            source_line: to_zero_based_line(edge.kind, edge.source_line),
            snippet: edge.snippet.clone(),
            severity: "error".to_string(),
            match_count: None,
        });
    }
    Ok(())
}

fn qualified_target_exposes_name(
    index: &CheckIndex,
    workspace_root: &Path,
    target_file: &str,
    idea: &str,
    import_bindings: &mut HashMap<String, HashSet<String>>,
) -> bool {
    import_path_candidates(target_file).iter().any(|candidate| {
        is_rq_uri(candidate)
            && rq_path_exists(workspace_root, candidate)
            && (index.file_declares_idea(workspace_root, candidate, idea)
                || file_binds_import_name(workspace_root, candidate, idea, import_bindings))
    })
}

/// An import alias in the target file is a valid qualified name.
/// It is not an idea, so a from-import of that name stays unresolved.
fn file_binds_import_name(
    workspace_root: &Path,
    file_uri: &str,
    name: &str,
    cache: &mut HashMap<String, HashSet<String>>,
) -> bool {
    if !is_rq_uri(file_uri) {
        return false;
    }
    let names = cache.entry(file_uri.to_string()).or_insert_with(|| {
        let path = if Path::new(file_uri).is_absolute() {
            Path::new(file_uri).to_path_buf()
        } else {
            workspace_root.join(file_uri)
        };
        let Ok(source) = std::fs::read_to_string(&path) else {
            return HashSet::new();
        };
        parse_document(&source)
            .model
            .import_bindings()
            .into_iter()
            .map(|(binding, _line)| binding)
            .collect()
    });
    names.contains(name)
}
