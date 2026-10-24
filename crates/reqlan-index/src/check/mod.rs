//! Reference & import check engine (`reqlan check` and `list_broken_references`).
//! rq:["../../../../reqlan rq/core_analysis/core.rq".test_references]
//! rq:["../../../../reqlan rq/core_analysis/check.rq".check]
//! rq:["../../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
//! rq:["../../../../reqlan rq/core_analysis/check.rq".check_order_by_target]
//! rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_sparse]
//! rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
//! rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
//! rq:["../../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
//! rq:["../../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
//! rq:["../../../../reqlan rq/core_analysis/check.rq".check_unresolved_imports]
//! rq:["../../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_idea]
//! rq:["../../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_file]
//! rq:["../../../../reqlan rq/core_analysis/check.rq".code_comment_syntax_errors]
//! rq:["../../../../reqlan rq/core_analysis/check_oom.rq".check_oom]
//! rq:["../../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
//! rq:["../../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
//! rq:["../../../../reqlan rq/language/syntax.rq".reference_file]

mod imports;
mod index;
mod qualified;
mod wildcards;

pub use index::{CheckEdge, CheckIdea, CheckIndex};

use crate::comment::{
    find_comment_syntax_errors, unresolved_comment_references, CommentReference,
    CommentSyntaxError, COMMENT_SYNTAX_KIND,
};
use crate::extract::{extra_file_matches, glob_list_matches, path_glob_matches};
use crate::ignore::WorkspaceGitignore;
use crate::path_resolve::file_reference_missing;
use crate::rq_ignore::is_line_rq_ignored;
use crate::store::{IndexStore, StoreError};
use crate::types::EdgeKind;
use imports::{append_unresolved_import_rows, append_unused_import_rows};
use qualified::{append_missing_qualified_file_targets, append_unresolved_qualified_idea_targets};
use reqlan_parse::{unquote_path, ImportRootMapping};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use wildcards::append_wildcard_sparse_rows;

#[derive(Debug, Clone, Default)]
pub struct ListBrokenReferencesOptions<'a> {
    pub path_glob: Option<&'a str>,
    /// When non-empty, a source file matches when any glob matches.
    /// An empty glob in this list does not match.
    pub path_globs: &'a [&'a str],
    /// Source files checked even when they match no glob.
    pub extra_files: &'a [&'a str],
    pub include_comment_references: bool,
    pub include_file_references: bool,
}

/// How [check] treats a sparse wildcard (0 matches or 1 match).
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
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

    pub(crate) fn severity(self) -> Option<&'static str> {
        match self {
            Self::Warn => Some("warning"),
            Self::Error => Some("error"),
            Self::Off => None,
        }
    }
}

/// Options for `check_references`.
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check]
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_unresolved_imports]
#[derive(Debug, Clone, Default)]
pub struct CheckReferencesOptions<'a> {
    /// Source files in the recursive scan. Empty means the whole base.
    /// One glob selects the same files as a single path glob.
    /// An empty glob string is an error.
    /// rq:["../../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
    pub path_globs: &'a [&'a str],
    /// Source files checked even when they match no glob.
    /// rq:["../../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
    pub extra_files: &'a [&'a str],
    pub wildcard_zero: SparseWildcardHandling,
    pub wildcard_one: SparseWildcardHandling,
    /// Globs matched against the missing target `label`. Empty globs are ignored.
    pub skip_targets: &'a [&'a str],
    /// Omit missing file targets that Git ignore rules ignore.
    pub skip_gitignored_targets: bool,
    /// How to treat unused import bindings (default `warn` from config; CLI overrides).
    pub unused_imports: Option<SparseWildcardHandling>,
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
/// rq:["../../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_order_by_target]
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_unresolved_imports]
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_idea]
pub fn check_references(
    store: &IndexStore,
    workspace_root: &Path,
    options: CheckReferencesOptions<'_>,
) -> Result<Vec<BrokenReference>, StoreError> {
    reject_empty_globs(options.path_globs)?;
    let index = CheckIndex::build(store)?;
    let mut rows = list_broken_references_from_index(
        &index,
        store,
        workspace_root,
        ListBrokenReferencesOptions {
            path_globs: options.path_globs,
            extra_files: options.extra_files,
            include_comment_references: true,
            include_file_references: true,
            ..Default::default()
        },
    )?;
    let mut ignore_cache: HashMap<String, HashSet<u32>> = HashMap::new();
    append_wildcard_sparse_rows(&index, workspace_root, &options, &mut rows, &mut ignore_cache)?;
    append_unresolved_import_rows(&index, workspace_root, &options, &mut rows, &mut ignore_cache)?;
    append_unused_import_rows(&index, workspace_root, &options, &mut rows, &mut ignore_cache)?;
    omit_skipped_targets(&mut rows, options.skip_targets);
    if options.skip_gitignored_targets {
        omit_gitignored_file_targets(&mut rows, workspace_root);
    }
    sort_check_rows_by_target(&mut rows);
    Ok(rows)
}

pub fn list_broken_references(
    store: &IndexStore,
    workspace_root: &Path,
    options: ListBrokenReferencesOptions<'_>,
) -> Result<Vec<BrokenReference>, StoreError> {
    let index = CheckIndex::build(store)?;
    list_broken_references_from_index(&index, store, workspace_root, options)
}

fn list_broken_references_from_index(
    index: &CheckIndex,
    store: &IndexStore,
    workspace_root: &Path,
    options: ListBrokenReferencesOptions<'_>,
) -> Result<Vec<BrokenReference>, StoreError> {
    let mut roots_cache: HashMap<String, Vec<ImportRootMapping>> = HashMap::new();
    let mut broken = Vec::new();

    for edge in &index.edges {
        if edge.is_resolved != Some(false) || edge.kind == EdgeKind::CommentLink {
            continue;
        }
        let Some(source) = index.get_idea(&edge.source_id) else {
            continue;
        };
        if !list_source_in_scope(&options, &source.file_uri) {
            continue;
        }
        if idea_reference_resolves(index, edge, &source.file_uri) {
            continue;
        }
        broken.push(BrokenReference {
            file_uri: source.file_uri.clone(),
            source_id: Some(edge.source_id.clone()),
            source_name: Some(source.name.clone()),
            kind: edge.kind.as_str().to_string(),
            label: edge.label.clone().unwrap_or_default(),
            source_line: to_zero_based_line(edge.kind, edge.source_line),
            snippet: edge.snippet.clone(),
            severity: "error".to_string(),
            match_count: None,
        });
    }

    if options.include_comment_references {
        let catalog = index.ideas.as_slice();
        for file_uri in store.list_code_document_uris()? {
            if !list_source_in_scope(&options, &file_uri) {
                continue;
            }
            let path = workspace_root.join(&file_uri);
            let Ok(source) = std::fs::read_to_string(&path) else {
                continue;
            };
            let import_roots = roots_cache
                .entry(file_uri.clone())
                .or_insert_with(|| crate::import_roots_for_source(workspace_root, &file_uri));
            for reference in unresolved_comment_references(
                &file_uri,
                &source,
                catalog,
                import_roots,
                Some(workspace_root),
            ) {
                broken.push(broken_comment(&file_uri, &reference));
            }
            for error in find_comment_syntax_errors(&source) {
                broken.push(broken_comment_syntax(&file_uri, &error));
            }
        }
    }

    if options.include_file_references {
        for edge in &index.edges {
            if edge.kind != EdgeKind::FileReference {
                continue;
            }
            let Some(target) = edge.target_file.as_deref() else {
                continue;
            };
            let Some(source) = index.get_idea(&edge.source_id) else {
                continue;
            };
            if !list_source_in_scope(&options, &source.file_uri) {
                continue;
            }
            let import_roots = roots_cache.entry(source.file_uri.clone()).or_insert_with(|| {
                crate::import_roots_for_source(workspace_root, &source.file_uri)
            });
            if !file_reference_missing(workspace_root, &edge.source_id, target, import_roots) {
                continue;
            }
            broken.push(BrokenReference {
                file_uri: source.file_uri.clone(),
                source_id: Some(edge.source_id.clone()),
                source_name: Some(source.name.clone()),
                kind: EdgeKind::FileReference.as_str().to_string(),
                label: unquote_path(target),
                source_line: to_zero_based_line(edge.kind, edge.source_line),
                snippet: edge.snippet.clone(),
                severity: "error".to_string(),
                match_count: None,
            });
        }
        append_missing_qualified_file_targets(index, workspace_root, &options, &mut broken)?;
    }

    append_unresolved_qualified_idea_targets(index, workspace_root, &options, &mut broken)?;

    let mut ignore_cache: HashMap<String, HashSet<u32>> = HashMap::new();
    broken.retain(|row| {
        !is_line_rq_ignored(workspace_root, &row.file_uri, row.source_line, &mut ignore_cache)
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

fn idea_reference_resolves(index: &CheckIndex, edge: &CheckEdge, source_file: &str) -> bool {
    if edge.kind != EdgeKind::References && edge.kind != EdgeKind::WildcardReference {
        return false;
    }
    if let Some(target_id) = edge.target_id.as_deref() {
        if index.has_idea_id(target_id) {
            return true;
        }
    }
    let Some(label) = edge.label.as_deref().filter(|l| !l.is_empty()) else {
        return false;
    };
    index.has_local_idea(source_file, label)
}

fn reject_empty_globs(globs: &[&str]) -> Result<(), StoreError> {
    if globs.iter().any(|glob| glob.trim().is_empty()) {
        return Err(StoreError::Invalid("path glob must not be empty".to_string()));
    }
    Ok(())
}

pub(crate) fn check_source_in_scope(options: &CheckReferencesOptions<'_>, file_uri: &str) -> bool {
    if extra_file_matches(options.extra_files, file_uri) {
        return true;
    }
    if options.path_globs.is_empty() {
        return true;
    }
    glob_list_matches(options.path_globs, file_uri)
}

pub(crate) fn list_source_in_scope(
    options: &ListBrokenReferencesOptions<'_>,
    file_uri: &str,
) -> bool {
    if extra_file_matches(options.extra_files, file_uri) {
        return true;
    }
    if !options.path_globs.is_empty() {
        return glob_list_matches(options.path_globs, file_uri);
    }
    match options.path_glob {
        None => true,
        Some(glob) if glob.trim().is_empty() => true,
        Some(glob) => path_glob_matches(glob, file_uri),
    }
}

pub(crate) fn to_zero_based_line(kind: EdgeKind, source_line: Option<u32>) -> Option<u32> {
    let line = source_line?;
    match kind {
        EdgeKind::CommentLink => Some(line),
        _ => Some(line.saturating_sub(1)),
    }
}

fn omit_skipped_targets(rows: &mut Vec<BrokenReference>, skip_targets: &[&str]) {
    if skip_targets.is_empty() {
        return;
    }
    rows.retain(|row| {
        !skip_targets.iter().any(|pattern| {
            let pattern = pattern.trim();
            !pattern.is_empty() && (pattern == row.label || path_glob_matches(pattern, &row.label))
        })
    });
}

fn omit_gitignored_file_targets(rows: &mut Vec<BrokenReference>, workspace_root: &Path) {
    let gitignore = WorkspaceGitignore::load(workspace_root);
    let mut roots_cache: HashMap<String, Vec<ImportRootMapping>> = HashMap::new();
    rows.retain(|row| {
        if !is_gitignorable_missing_path(row) {
            return true;
        }
        let import_roots = roots_cache
            .entry(row.file_uri.clone())
            .or_insert_with(|| crate::import_roots_for_source(workspace_root, &row.file_uri));
        !gitignore.ignores_resolved_target(&row.file_uri, &row.label, import_roots)
    });
}

fn is_gitignorable_missing_path(row: &BrokenReference) -> bool {
    if row.kind == EdgeKind::FileReference.as_str() {
        return true;
    }
    row.kind == EdgeKind::Import.as_str()
        && (row.label.contains('/')
            || row.label.contains('\\')
            || row.label.contains('.')
            || row.label.starts_with('@'))
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

fn broken_comment_syntax(file_uri: &str, error: &CommentSyntaxError) -> BrokenReference {
    BrokenReference {
        file_uri: file_uri.to_string(),
        source_id: None,
        source_name: None,
        kind: COMMENT_SYNTAX_KIND.to_string(),
        label: error.label.clone(),
        source_line: Some(error.line),
        snippet: Some(error.snippet.clone()),
        severity: "error".to_string(),
        match_count: None,
    }
}
