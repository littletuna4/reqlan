//! List unresolved (broken) references from the ideas index.
//! rq:["../../../reqlan rq/core_analysis/core.rq".test_references]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_sparse]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_unresolved_imports]
//! rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
//! rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
//! rq:["../../../reqlan rq/language/syntax.rq".reference_file]
//! rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_does_not_exist_error]
//! rq:["../../../reqlan rq/extension/language/support/features-imports.rq".implicit_file_extension]
//! rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_folder_targets]

use crate::comment::{unresolved_comment_references, CommentReference};
use crate::extract::{
    count_wildcard_matches, path_glob_matches, split_wildcard_label, WildcardIdeaCandidate,
};
use crate::ignore::WorkspaceGitignore;
use crate::path_resolve::load_applying_rq_config;
use crate::rq_ignore::find_rq_ignore_error_target_lines;
use crate::store::{IndexStore, StoreError};
use crate::types::{EdgeKind, EdgeRecord, IdeaKind};
use reqlan_parse::{
    file_from_idea_id, import_path_candidates, is_absolute_uri_or_path, match_import_root_mapping,
    parse_document, parse_file_reference_string, resolve_rq_path, unquote_path, Import,
    ImportRootMapping,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;

#[derive(Debug, Clone, Default)]
pub struct ListBrokenReferencesOptions<'a> {
    pub path_glob: Option<&'a str>,
    pub include_comment_references: bool,
    pub include_file_references: bool,
}

/// How [check] treats a sparse wildcard (0 matches or 1 match).
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SparseWildcardHandling {
    #[default]
    Warn,
    Error,
    Off,
}

impl SparseWildcardHandling {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "warn" | "warning" => Some(Self::Warn),
            "error" => Some(Self::Error),
            "off" => Some(Self::Off),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Warn => "warn",
            Self::Error => "error",
            Self::Off => "off",
        }
    }

    fn severity(self) -> Option<&'static str> {
        match self {
            Self::Warn => Some("warning"),
            Self::Error => Some("error"),
            Self::Off => None,
        }
    }
}

/// Options for `check_references`.
/// rq:["../../../reqlan rq/core_analysis/check.rq".check]
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_unresolved_imports]
#[derive(Debug, Clone)]
pub struct CheckReferencesOptions<'a> {
    pub path_glob: Option<&'a str>,
    pub wildcard_zero: SparseWildcardHandling,
    pub wildcard_one: SparseWildcardHandling,
    /// Globs matched against the missing target `label`. Empty globs are ignored.
    pub skip_targets: &'a [&'a str],
    /// Omit missing file targets that Git ignore rules ignore.
    pub skip_gitignored_targets: bool,
}

impl Default for CheckReferencesOptions<'_> {
    fn default() -> Self {
        Self {
            path_glob: None,
            wildcard_zero: SparseWildcardHandling::Warn,
            wildcard_one: SparseWildcardHandling::Warn,
            skip_targets: &[],
            skip_gitignored_targets: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokenReference {
    pub file_uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_name: Option<String>,
    pub kind: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
    /// `error` for unresolved idea/file/comment/import refs; `warning` for sparse wildcards.
    #[serde(default = "error_severity")]
    pub severity: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_count: Option<u32>,
}

fn error_severity() -> String {
    "error".to_string()
}

/// CI check: unresolved idea refs, comment refs, missing code files, and imports.
/// Skips lines after `//rq-ignore-error`.
/// Ordered by missing target so shared broken refs group together.
/// rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_order_by_target]
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_unresolved_imports]
pub fn check_references(
    store: &IndexStore,
    workspace_root: &Path,
    options: CheckReferencesOptions<'_>,
) -> Result<Vec<BrokenReference>, StoreError> {
    let mut rows = list_broken_references(
        store,
        workspace_root,
        ListBrokenReferencesOptions {
            path_glob: options.path_glob,
            include_comment_references: true,
            include_file_references: true,
        },
    )?;
    let mut ignore_cache: HashMap<String, HashSet<u32>> = HashMap::new();
    append_wildcard_sparse_rows(store, workspace_root, &options, &mut rows, &mut ignore_cache)?;
    append_unresolved_import_rows(store, workspace_root, &options, &mut rows, &mut ignore_cache)?;
    omit_skipped_targets(&mut rows, options.skip_targets);
    if options.skip_gitignored_targets {
        omit_gitignored_file_targets(&mut rows, workspace_root);
    }
    sort_check_rows_by_target(&mut rows);
    Ok(rows)
}

fn omit_skipped_targets(rows: &mut Vec<BrokenReference>, skip_targets: &[&str]) {
    if skip_targets.is_empty() {
        return;
    }
    rows.retain(|row| !target_is_skipped(&row.label, skip_targets));
}

fn target_is_skipped(label: &str, skip_targets: &[&str]) -> bool {
    skip_targets.iter().any(|pattern| {
        let pattern = pattern.trim();
        !pattern.is_empty() && (pattern == label || path_glob_matches(pattern, label))
    })
}

fn omit_gitignored_file_targets(rows: &mut Vec<BrokenReference>, workspace_root: &Path) {
    let gitignore = WorkspaceGitignore::load(workspace_root);
    let import_roots = load_applying_rq_config(workspace_root, None).import_roots;
    rows.retain(|row| {
        !is_gitignorable_missing_path(row)
            || !file_target_is_gitignored(row, &gitignore, &import_roots)
    });
}

fn is_gitignorable_missing_path(row: &BrokenReference) -> bool {
    if row.kind == EdgeKind::FileReference.as_str() {
        return true;
    }
    row.kind == EdgeKind::Import.as_str() && looks_like_import_path_label(&row.label)
}

fn looks_like_import_path_label(label: &str) -> bool {
    label.contains('/') || label.contains('\\') || label.contains('.') || label.starts_with('@')
}

fn file_target_is_gitignored(
    row: &BrokenReference,
    gitignore: &WorkspaceGitignore,
    import_roots: &[ImportRootMapping],
) -> bool {
    let Some(relative) = resolved_workspace_relative_path(&row.file_uri, &row.label, import_roots)
    else {
        return false;
    };
    gitignore.ignores(&relative)
}

fn resolved_workspace_relative_path(
    source_file: &str,
    label: &str,
    import_roots: &[ImportRootMapping],
) -> Option<String> {
    if label.contains("://") {
        return None;
    }
    let resolved = resolve_rq_path(label, source_file, import_roots);
    if is_absolute_uri_or_path(&resolved) {
        return None;
    }
    if resolved.is_empty() || resolved == "." || resolved.starts_with("../") {
        return None;
    }
    Some(resolved)
}

fn sort_check_rows_by_target(rows: &mut [BrokenReference]) {
    rows.sort_by(|left, right| {
        left.label
            .cmp(&right.label)
            .then(left.kind.cmp(&right.kind))
            .then(left.severity.cmp(&right.severity))
            .then(left.file_uri.cmp(&right.file_uri))
            .then(left.source_line.cmp(&right.source_line))
    });
}

fn append_wildcard_sparse_rows(
    store: &IndexStore,
    workspace_root: &Path,
    options: &CheckReferencesOptions<'_>,
    rows: &mut Vec<BrokenReference>,
    ignore_cache: &mut HashMap<String, HashSet<u32>>,
) -> Result<(), StoreError> {
    // Stored wildcard edges can be empty when the source file was indexed before
    // its targets. Recount against the full catalog. Drop those unresolved rows.
    rows.retain(|row| row.kind != EdgeKind::WildcardReference.as_str());

    let candidates: Vec<WildcardIdeaCandidate> = store
        .list_all_ideas()?
        .into_iter()
        .filter(|idea| idea.kind != IdeaKind::Ideaset)
        .map(|idea| WildcardIdeaCandidate {
            file_path: idea.file_uri.clone(),
            file_uri: idea.file_uri,
            idea_name: idea.name,
        })
        .collect();

    let mut groups: HashMap<(String, Option<u32>, String), Vec<EdgeRecord>> = HashMap::new();
    for edge in store.get_all_edges()? {
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
        let Some(source) = store.get_idea(&source_id)? else {
            continue;
        };
        if !file_matches(options.path_glob, &source.file_uri) {
            continue;
        }
        let line = to_zero_based_line(EdgeKind::WildcardReference, source_line);
        if line_is_ignored(workspace_root, &source.file_uri, line, ignore_cache) {
            continue;
        }
        rows.push(BrokenReference {
            file_uri: source.file_uri,
            source_id: Some(source.id),
            source_name: Some(source.name),
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

/// rq:["../../../reqlan rq/core_analysis/check.rq".check_unresolved_imports]
/// rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_does_not_exist_error]
fn append_unresolved_import_rows(
    store: &IndexStore,
    workspace_root: &Path,
    options: &CheckReferencesOptions<'_>,
    rows: &mut Vec<BrokenReference>,
    ignore_cache: &mut HashMap<String, HashSet<u32>>,
) -> Result<(), StoreError> {
    let mut ideas_by_file: HashMap<String, HashSet<String>> = HashMap::new();
    for idea in store.list_all_ideas()? {
        ideas_by_file.entry(idea.file_uri).or_default().insert(idea.name);
    }
    let indexed_rq: HashSet<String> =
        store.list_document_uris()?.into_iter().filter(|uri| is_rq_uri(uri)).collect();
    let import_roots = load_applying_rq_config(workspace_root, None).import_roots;

    for file_uri in store.list_document_uris()? {
        if !is_rq_uri(&file_uri) {
            continue;
        }
        if !file_matches(options.path_glob, &file_uri) {
            continue;
        }
        let path = workspace_root.join(&file_uri);
        let Ok(source) = std::fs::read_to_string(&path) else {
            continue;
        };
        let parsed = parse_document(&source);
        for import in &parsed.model.imports {
            push_unresolved_import_issues(
                import,
                &file_uri,
                workspace_root,
                &import_roots,
                &ideas_by_file,
                &indexed_rq,
                ignore_cache,
                rows,
            );
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn push_unresolved_import_issues(
    import: &Import,
    source_file: &str,
    workspace_root: &Path,
    import_roots: &[ImportRootMapping],
    ideas_by_file: &HashMap<String, HashSet<String>>,
    indexed_rq: &HashSet<String>,
    ignore_cache: &mut HashMap<String, HashSet<u32>>,
    rows: &mut Vec<BrokenReference>,
) {
    let Some((path, path_line, ideas)) = well_formed_import_parts(import) else {
        return;
    };
    if path.is_empty() || is_remote_import_path(path) {
        return;
    }
    match resolve_existing_import_path(workspace_root, source_file, path, import_roots) {
        None => {
            if line_is_ignored(workspace_root, source_file, Some(path_line), ignore_cache) {
                return;
            }
            rows.push(import_issue(source_file, path, path_line));
        }
        Some(resolved) => {
            for (idea, line) in ideas {
                if line_is_ignored(workspace_root, source_file, Some(line), ignore_cache) {
                    continue;
                }
                if file_declares_idea(workspace_root, &resolved, &idea, ideas_by_file, indexed_rq) {
                    continue;
                }
                rows.push(import_issue(source_file, &idea, line));
            }
        }
    }
}

type ImportSpecifierSites = Vec<(String, u32)>;

fn well_formed_import_parts(import: &Import) -> Option<(&str, u32, ImportSpecifierSites)> {
    match import {
        Import::InvalidFrom(_) => None,
        Import::From(from) if from.specifiers.is_empty() => None,
        Import::From(from) => {
            let ideas = from
                .specifiers
                .iter()
                .filter(|spec| !spec.idea.is_empty())
                .map(|spec| (spec.idea.clone(), spec.span.line_start))
                .collect();
            Some((from.path.as_str(), from.span.line_start, ideas))
        }
        Import::Namespace(ns) => Some((ns.path.as_str(), ns.span.line_start, Vec::new())),
        Import::Qualified(qualified) if qualified.idea.is_empty() => None,
        Import::Qualified(qualified) => Some((
            qualified.path.as_str(),
            qualified.span.line_start,
            vec![(qualified.idea.clone(), qualified.span.line_start)],
        )),
    }
}

fn import_issue(source_file: &str, label: &str, source_line: u32) -> BrokenReference {
    BrokenReference {
        file_uri: source_file.to_string(),
        source_id: None,
        source_name: None,
        kind: EdgeKind::Import.as_str().to_string(),
        label: label.to_string(),
        source_line: Some(source_line),
        snippet: None,
        severity: "error".to_string(),
        match_count: None,
    }
}

fn is_rq_uri(file_uri: &str) -> bool {
    file_uri.to_ascii_lowercase().ends_with(".rq")
}

fn is_remote_import_path(path: &str) -> bool {
    path.contains("://")
}

fn resolve_existing_import_path(
    workspace_root: &Path,
    source_file: &str,
    authored: &str,
    import_roots: &[ImportRootMapping],
) -> Option<String> {
    for candidate in import_path_candidates(authored) {
        let resolved = resolve_rq_path(&candidate, source_file, import_roots);
        if file_exists(workspace_root, &resolved) {
            return Some(resolved);
        }
    }
    None
}

fn file_declares_idea(
    workspace_root: &Path,
    file_uri: &str,
    name: &str,
    ideas_by_file: &HashMap<String, HashSet<String>>,
    indexed_rq: &HashSet<String>,
) -> bool {
    if let Some(names) = ideas_by_file.get(file_uri) {
        return names.contains(name);
    }
    if indexed_rq.contains(file_uri) {
        return false;
    }
    let path = workspace_root.join(file_uri);
    if !path.is_file() {
        return false;
    }
    let Ok(source) = std::fs::read_to_string(&path) else {
        return false;
    };
    parse_document(&source).model.elements.iter().any(|element| element.name() == Some(name))
}

pub fn list_broken_references(
    store: &IndexStore,
    workspace_root: &Path,
    options: ListBrokenReferencesOptions<'_>,
) -> Result<Vec<BrokenReference>, StoreError> {
    let catalog = store.list_all_ideas()?;
    let local_ideas: HashSet<(String, String)> =
        catalog.iter().map(|idea| (idea.file_uri.clone(), idea.name.clone())).collect();
    let catalog_ids: HashSet<&str> = catalog.iter().map(|idea| idea.id.as_str()).collect();
    let import_roots = load_applying_rq_config(workspace_root, None).import_roots;

    let mut broken = Vec::new();
    for (edge, source) in store.list_unresolved_idea_edges()? {
        if !file_matches(options.path_glob, &source.file_uri) {
            continue;
        }
        if edge.kind == EdgeKind::CommentLink {
            continue;
        }
        if idea_reference_resolves(&edge, &source.file_uri, &local_ideas, &catalog_ids) {
            continue;
        }
        broken.push(BrokenReference {
            file_uri: source.file_uri,
            source_id: Some(source.id),
            source_name: Some(source.name),
            kind: edge.kind.as_str().to_string(),
            label: edge.label.unwrap_or_default(),
            source_line: to_zero_based_line(edge.kind, edge.source_line),
            snippet: edge.snippet,
            severity: "error".to_string(),
            match_count: None,
        });
    }

    if options.include_comment_references {
        for file_uri in store.list_code_document_uris()? {
            if !file_matches(options.path_glob, &file_uri) {
                continue;
            }
            let path = workspace_root.join(&file_uri);
            let Ok(source) = std::fs::read_to_string(&path) else {
                continue;
            };
            for reference in unresolved_comment_references(
                &file_uri,
                &source,
                &catalog,
                &import_roots,
                Some(workspace_root),
            ) {
                broken.push(broken_comment(&file_uri, &reference));
            }
        }
    }

    if options.include_file_references {
        for edge in store.get_all_edges()? {
            if edge.kind != EdgeKind::FileReference {
                continue;
            }
            let Some(target) = edge.target_file.as_deref() else {
                continue;
            };
            let Some(source) = store.get_idea(&edge.source_id)? else {
                continue;
            };
            if !file_matches(options.path_glob, &source.file_uri) {
                continue;
            }
            if !file_reference_missing(workspace_root, &edge.source_id, target, &import_roots) {
                continue;
            }
            broken.push(BrokenReference {
                file_uri: source.file_uri,
                source_id: Some(source.id),
                source_name: Some(source.name),
                kind: EdgeKind::FileReference.as_str().to_string(),
                label: unquote_path(target),
                source_line: to_zero_based_line(edge.kind, edge.source_line),
                snippet: edge.snippet,
                severity: "error".to_string(),
                match_count: None,
            });
        }
        append_missing_qualified_file_targets(
            store,
            workspace_root,
            options.path_glob,
            &mut broken,
        )?;
    }

    let mut ignore_cache: HashMap<String, HashSet<u32>> = HashMap::new();
    broken.retain(|row| {
        !line_is_ignored(workspace_root, &row.file_uri, row.source_line, &mut ignore_cache)
    });

    broken.sort_by(|left, right| {
        left.file_uri
            .cmp(&right.file_uri)
            .then(left.source_line.cmp(&right.source_line))
            .then(left.label.cmp(&right.label))
            .then(left.kind.cmp(&right.kind))
    });
    broken.dedup();
    Ok(broken)
}

fn idea_reference_resolves(
    edge: &EdgeRecord,
    source_file: &str,
    local_ideas: &HashSet<(String, String)>,
    catalog_ids: &HashSet<&str>,
) -> bool {
    if edge.kind != EdgeKind::References && edge.kind != EdgeKind::WildcardReference {
        return false;
    }
    if let Some(target_id) = edge.target_id.as_deref() {
        if catalog_ids.contains(target_id) {
            return true;
        }
    }
    let Some(label) = edge.label.as_deref() else {
        return false;
    };
    if label.is_empty() {
        return false;
    }
    local_ideas.contains(&(source_file.to_string(), label.to_string()))
}

fn file_matches(glob: Option<&str>, file_uri: &str) -> bool {
    match glob {
        None => true,
        Some(glob) if glob.trim().is_empty() => true,
        Some(glob) => path_glob_matches(glob, file_uri),
    }
}

fn broken_comment(file_uri: &str, reference: &CommentReference) -> BrokenReference {
    BrokenReference {
        file_uri: file_uri.to_string(),
        source_id: None,
        source_name: None,
        kind: EdgeKind::CommentLink.as_str().to_string(),
        label: reference.display_label(),
        source_line: Some(reference.line),
        snippet: Some(reference.snippet.clone()),
        severity: "error".to_string(),
        match_count: None,
    }
}

fn line_is_ignored(
    workspace_root: &Path,
    file_uri: &str,
    source_line: Option<u32>,
    cache: &mut HashMap<String, HashSet<u32>>,
) -> bool {
    let Some(line) = source_line else {
        return false;
    };
    let ignored = cache.entry(file_uri.to_string()).or_insert_with(|| {
        let path = workspace_root.join(file_uri);
        std::fs::read_to_string(&path)
            .map(|text| find_rq_ignore_error_target_lines(&text))
            .unwrap_or_default()
    });
    ignored.contains(&line)
}

fn to_zero_based_line(kind: EdgeKind, source_line: Option<u32>) -> Option<u32> {
    let line = source_line?;
    match kind {
        EdgeKind::CommentLink => Some(line),
        _ => Some(line.saturating_sub(1)),
    }
}

/// A qualified reference `["path".idea]` is stored as a resolved idea edge.
/// Check still reports the path when that file is not on disk.
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_file]
fn append_missing_qualified_file_targets(
    store: &IndexStore,
    workspace_root: &Path,
    path_glob: Option<&str>,
    broken: &mut Vec<BrokenReference>,
) -> Result<(), StoreError> {
    for edge in store.get_all_edges()? {
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
        let Some(source) = store.get_idea(&edge.source_id)? else {
            continue;
        };
        if !file_matches(path_glob, &source.file_uri) {
            continue;
        }
        if target_file == source.file_uri {
            continue;
        }
        if !qualified_target_file_missing(workspace_root, target_file) {
            continue;
        }
        broken.push(BrokenReference {
            file_uri: source.file_uri,
            source_id: Some(source.id),
            source_name: Some(source.name),
            kind: EdgeKind::FileReference.as_str().to_string(),
            label: target_file.to_string(),
            source_line: to_zero_based_line(edge.kind, edge.source_line),
            snippet: edge.snippet,
            severity: "error".to_string(),
            match_count: None,
        });
    }
    Ok(())
}

fn qualified_target_file_missing(workspace_root: &Path, target_file: &str) -> bool {
    if target_file.contains("://") {
        return false;
    }
    !import_path_candidates(target_file)
        .iter()
        .any(|candidate| file_exists(workspace_root, candidate))
}

fn file_reference_missing(
    workspace_root: &Path,
    source_id: &str,
    target_file: &str,
    import_roots: &[ImportRootMapping],
) -> bool {
    if target_file.contains("://") {
        return false;
    }
    let parsed = parse_file_reference_string(&unquote_path(target_file));
    let path = parsed.file_path.replace('\\', "/");
    if path.trim().is_empty() {
        return true;
    }
    let aliased = match_import_root_mapping(&path, import_roots).is_some();
    if !aliased && !path.contains('/') && !path.contains('\\') {
        return false;
    }
    let resolved = resolve_rq_path(target_file, file_from_idea_id(source_id), import_roots);
    !file_exists(workspace_root, &resolved)
}

fn file_exists(workspace_root: &Path, candidate: &str) -> bool {
    let path = if Path::new(candidate).is_absolute() {
        Path::new(candidate).to_path_buf()
    } else {
        workspace_root.join(candidate)
    };
    path.exists()
}
