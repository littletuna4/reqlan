//! Incremental workspace sync: mtime skip, per-file upsert, cancel, hard rebuild.
//! rq:["../../../reqlan rq/indexer/indexer.rq".nonblocking_index]
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
//! rq:["../../../reqlan rq/indexer/indexer.rq".index_code_files]
//! rq:["../../../reqlan rq/indexer/indexer.rq".wildcard_reference_edges]
//! rq:["../../../reqlan rq/indexer/cache-reuse.rq".sync_pass_idea_catalog]
//! rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
//! rq:["../../../reqlan rq/core_analysis/check.rq".code_comment_syntax_errors]

use crate::comment::{
    code_file_content_hash, comment_link_edges, is_comment_index_path,
    looks_like_comment_reference_source, scan_comment_references, too_large_for_comment_index,
    IdeaRef,
};
use crate::extract::{
    extract_from_parse, extract_indexed_document, ExtractOptions, WildcardIdeaCandidate,
    EXTRACT_VERSION,
};
use crate::ids::idea_id;
use crate::ignore::{is_binary_rqignore_path, RqIgnoreFilter};
use crate::scan::{scan_workspace, ScanLimits};
use crate::store::{IndexStore, StoreError};
use crate::text::{read_index_text, IndexText};
use crate::types::{IdeaRecord, IndexedDocument};
use reqlan_parse::{parse_document, ImportRootMapping, Severity};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug, Clone)]
pub struct SyncOptions {
    pub workspace_root: PathBuf,
    pub hard_rebuild: bool,
    /// When non-empty, the recursive walk keeps a file that matches any glob.
    /// A directory that can hold no match is not entered.
    /// An empty glob in this list matches nothing.
    /// rq:["../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
    pub path_globs: Vec<String>,
    /// Files indexed even when they match no glob. Directories are not walked.
    /// rq:["../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
    pub include_files: Vec<PathBuf>,
    /// Record per-file sync actions for CLI `-vv` / `-vvv`.
    /// rq:["../../../reqlan rq/core_analysis/check.rq".check_verbose]
    pub record_file_events: bool,
}

#[derive(Debug, Clone, Default)]
pub struct SyncProgress {
    pub processed: usize,
    pub total: usize,
    pub current_file: Option<String>,
    pub skipped_mtime: usize,
    pub indexed: usize,
    pub errors: usize,
    pub cancelled: bool,
}

/// Per-file sync action for verbose check output.
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_verbose]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncFileAction {
    Indexed,
    SkippedMtime,
    Error,
    Skipped,
}

#[derive(Debug, Clone)]
pub struct SyncFileEvent {
    pub file_uri: String,
    pub action: SyncFileAction,
    pub detail: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SyncResult {
    pub progress: SyncProgress,
    pub file_issues: Vec<FileIssue>,
    pub file_events: Vec<SyncFileEvent>,
}

fn push_file_event(
    events: &mut Vec<SyncFileEvent>,
    record: bool,
    file_uri: String,
    action: SyncFileAction,
    detail: Option<String>,
) {
    if record {
        events.push(SyncFileEvent { file_uri, action, detail });
    }
}

#[derive(Debug, Clone)]
pub struct FileIssue {
    pub file_uri: String,
    pub message: String,
}

/// Compact catalog row for comment-link resolution during a sync pass.
struct CatalogLinkIdea {
    id: String,
    name: String,
    file_uri: String,
}

impl IdeaRef for CatalogLinkIdea {
    fn id(&self) -> &str {
        &self.id
    }
    fn name(&self) -> &str {
        &self.name
    }
    fn file_uri(&self) -> &str {
        &self.file_uri
    }
}

pub fn collect_rq_files(workspace_root: &Path, _filter: &RqIgnoreFilter) -> Vec<PathBuf> {
    let root = workspace_root.to_path_buf();
    scan_workspace(
        std::slice::from_ref(&root),
        ScanLimits { stop_at_child_bases: true, ..ScanLimits::default() },
    )
    .rq_files
}

pub fn collect_code_files(workspace_root: &Path, _filter: &RqIgnoreFilter) -> Vec<PathBuf> {
    let root = workspace_root.to_path_buf();
    scan_workspace(
        std::slice::from_ref(&root),
        ScanLimits { stop_at_child_bases: true, ..ScanLimits::default() },
    )
    .code_files
}

fn append_explicit_files(
    workspace_root: &Path,
    include_files: &[PathBuf],
    rq_files: &mut Vec<PathBuf>,
    code_files: &mut Vec<PathBuf>,
) {
    for include in include_files {
        let path =
            if include.is_absolute() { include.clone() } else { workspace_root.join(include) };
        if !path.is_file() {
            continue;
        }
        if rq_files.iter().any(|existing| existing == &path)
            || code_files.iter().any(|existing| existing == &path)
        {
            continue;
        }
        if path.extension().and_then(|ext| ext.to_str()) == Some("rq") {
            rq_files.push(path);
        } else if is_comment_index_path(&path) || is_binary_rqignore_path(&path) {
            code_files.push(path);
        }
    }
    rq_files.sort();
    code_files.sort();
}

/// Load the in-process idea catalog once for a sync / batch index pass.
/// rq:["../../../reqlan rq/indexer/cache-reuse.rq".sync_pass_idea_catalog]
pub fn load_idea_catalog(store: &IndexStore) -> Result<Vec<WildcardIdeaCandidate>, StoreError> {
    Ok(store
        .list_all_ideas()?
        .into_iter()
        .map(|idea| WildcardIdeaCandidate {
            file_path: idea.file_uri.clone(),
            file_uri: idea.file_uri,
            idea_name: idea.name,
        })
        .collect())
}

fn replace_file_catalog_ideas(
    catalog: &mut Vec<WildcardIdeaCandidate>,
    file_uri: &str,
    ideas: &[IdeaRecord],
) {
    catalog.retain(|candidate| candidate.file_uri != file_uri);
    for idea in ideas {
        catalog.push(WildcardIdeaCandidate {
            file_path: idea.file_uri.clone(),
            file_uri: idea.file_uri.clone(),
            idea_name: idea.name.clone(),
        });
    }
}

fn remove_file_catalog_ideas(catalog: &mut Vec<WildcardIdeaCandidate>, file_uri: &str) {
    catalog.retain(|candidate| candidate.file_uri != file_uri);
}

fn take_file_catalog_ideas(
    catalog: &mut Vec<WildcardIdeaCandidate>,
    file_uri: &str,
) -> Vec<WildcardIdeaCandidate> {
    let mut taken = Vec::new();
    catalog.retain(|candidate| {
        if candidate.file_uri == file_uri {
            taken.push(candidate.clone());
            false
        } else {
            true
        }
    });
    taken
}

fn link_catalog(catalog: &[WildcardIdeaCandidate]) -> Vec<CatalogLinkIdea> {
    catalog
        .iter()
        .map(|candidate| CatalogLinkIdea {
            id: idea_id(&candidate.file_uri, &candidate.idea_name),
            name: candidate.idea_name.clone(),
            file_uri: candidate.file_uri.clone(),
        })
        .collect()
}

pub fn sync_workspace(
    store: &mut IndexStore,
    options: &SyncOptions,
    cancel: &AtomicBool,
) -> Result<SyncResult, StoreError> {
    let stale_extract = store.extract_version()? != EXTRACT_VERSION;
    if options.hard_rebuild || stale_extract {
        store.clear()?;
    }
    let scan = scan_workspace(
        std::slice::from_ref(&options.workspace_root),
        ScanLimits {
            path_globs: options.path_globs.clone(),
            stop_at_child_bases: true,
            ..ScanLimits::default()
        },
    );
    let mut rq_files = scan.rq_files;
    let mut code_files = scan.code_files;
    append_explicit_files(
        &options.workspace_root,
        &options.include_files,
        &mut rq_files,
        &mut code_files,
    );
    let stored_mtimes = store.list_document_mtimes()?;
    let mut progress =
        SyncProgress { total: rq_files.len() + code_files.len(), ..SyncProgress::default() };
    let mut file_issues = Vec::new();
    let mut file_events = Vec::new();
    let record_events = options.record_file_events;
    let mut names_changed = false;

    let mut catalog = load_idea_catalog(store)?;

    for path in rq_files {
        if cancel.load(Ordering::Relaxed) {
            progress.cancelled = true;
            break;
        }
        let file_uri = relative_posix(&options.workspace_root, &path);
        progress.current_file = Some(file_uri.clone());
        progress.processed += 1;

        let mtime_ms = file_mtime_ms(&path);
        if !options.hard_rebuild
            && mtime_unchanged(mtime_ms, stored_mtimes.get(&file_uri).copied().flatten())
        {
            progress.skipped_mtime += 1;
            push_file_event(
                &mut file_events,
                record_events,
                file_uri,
                SyncFileAction::SkippedMtime,
                Some("mtime unchanged".to_string()),
            );
            continue;
        }

        let source = match read_source(&path) {
            Ok(Some(text)) => text,
            Ok(None) => {
                push_file_event(
                    &mut file_events,
                    record_events,
                    file_uri,
                    SyncFileAction::Skipped,
                    Some("unreadable or empty".to_string()),
                );
                continue;
            }
            Err(error) => {
                progress.errors += 1;
                let message = error.to_string();
                push_file_event(
                    &mut file_events,
                    record_events,
                    file_uri.clone(),
                    SyncFileAction::Error,
                    Some(message.clone()),
                );
                file_issues.push(FileIssue { file_uri, message });
                continue;
            }
        };
        // Drop this file's prior ideas before extract so wildcards do not match
        // renamed-away names; later files in this pass still see the new set.
        let prior = take_file_catalog_ideas(&mut catalog, &file_uri);
        let import_roots = crate::import_roots_for_source(&options.workspace_root, &file_uri);
        let extracted = extract_indexed_document(
            &file_uri,
            &source,
            &ExtractOptions { idea_candidates: &catalog, import_roots, local_symbolic: false },
        );
        let file_names_changed = idea_names_change(store, &extracted)?;
        if let Err(error) = store.persist_extracted(extracted.clone(), mtime_ms) {
            catalog.extend(prior);
            progress.errors += 1;
            let message = error.to_string();
            push_file_event(
                &mut file_events,
                record_events,
                file_uri.clone(),
                SyncFileAction::Error,
                Some(message.clone()),
            );
            file_issues.push(FileIssue { file_uri, message });
            continue;
        }
        names_changed |= file_names_changed;
        replace_file_catalog_ideas(&mut catalog, &file_uri, &extracted.ideas);
        progress.indexed += 1;
        push_file_event(&mut file_events, record_events, file_uri, SyncFileAction::Indexed, None);
    }

    if !progress.cancelled {
        index_code_files(
            store,
            &options.workspace_root,
            &code_files,
            &catalog,
            &stored_mtimes,
            options.hard_rebuild || stale_extract || names_changed,
            cancel,
            record_events,
            &mut progress,
            &mut file_issues,
            &mut file_events,
        )?;
        store.set_extract_version(EXTRACT_VERSION)?;
    }

    Ok(SyncResult { progress, file_issues, file_events })
}

/// Index an explicit path list with one shared idea catalog (no directory walk).
/// `.rq` files run first so later wildcards and code links see ideas from this pass.
/// rq:["../../../reqlan rq/indexer/cache-reuse.rq".sync_pass_idea_catalog]
pub fn index_paths(
    store: &mut IndexStore,
    workspace_root: &Path,
    paths: &[PathBuf],
    cancel: &AtomicBool,
) -> Result<SyncResult, StoreError> {
    let mut rq_files = Vec::new();
    let mut code_files = Vec::new();
    for path in paths {
        let absolute = if path.is_absolute() { path.clone() } else { workspace_root.join(path) };
        if !absolute.is_file() {
            continue;
        }
        if absolute.extension().and_then(|ext| ext.to_str()) == Some("rq") {
            rq_files.push(absolute);
        } else if is_comment_index_path(&absolute) || is_binary_rqignore_path(&absolute) {
            code_files.push(absolute);
        }
    }
    rq_files.sort();
    code_files.sort();

    let stored_mtimes = store.list_document_mtimes()?;
    let mut progress =
        SyncProgress { total: rq_files.len() + code_files.len(), ..SyncProgress::default() };
    let mut file_issues = Vec::new();
    let mut file_events = Vec::new();
    let mut catalog = load_idea_catalog(store)?;
    let mut names_changed = false;

    for path in &rq_files {
        if cancel.load(Ordering::Relaxed) {
            progress.cancelled = true;
            break;
        }
        let file_uri = relative_posix(workspace_root, path);
        progress.current_file = Some(file_uri.clone());
        progress.processed += 1;
        let mtime_ms = file_mtime_ms(path);
        if mtime_unchanged(mtime_ms, stored_mtimes.get(&file_uri).copied().flatten()) {
            progress.skipped_mtime += 1;
            continue;
        }
        match index_rq_path(store, workspace_root, path, &file_uri, &mut catalog, mtime_ms) {
            Ok(Some(outcome)) => {
                names_changed |= outcome.names_changed;
                progress.indexed += 1;
            }
            Ok(None) => {}
            Err(error) => {
                progress.errors += 1;
                file_issues.push(FileIssue { file_uri, message: error.to_string() });
            }
        }
    }

    if !progress.cancelled {
        index_code_files(
            store,
            workspace_root,
            &code_files,
            &catalog,
            &stored_mtimes,
            names_changed,
            cancel,
            false,
            &mut progress,
            &mut file_issues,
            &mut file_events,
        )?;
    }

    Ok(SyncResult { progress, file_issues, file_events })
}

struct RqIndexOutcome {
    names_changed: bool,
}

fn index_rq_path(
    store: &mut IndexStore,
    workspace_root: &Path,
    path: &Path,
    file_uri: &str,
    catalog: &mut Vec<WildcardIdeaCandidate>,
    mtime_ms: Option<f64>,
) -> Result<Option<RqIndexOutcome>, StoreError> {
    let Some(source) = read_source(path)? else {
        return Ok(None);
    };
    let prior = take_file_catalog_ideas(catalog, file_uri);
    let import_roots = crate::import_roots_for_source(workspace_root, file_uri);
    let extracted = extract_indexed_document(
        file_uri,
        &source,
        &ExtractOptions { idea_candidates: catalog, import_roots, local_symbolic: false },
    );
    let names_changed = idea_names_change(store, &extracted)?;
    if let Err(error) = store.persist_extracted(extracted.clone(), mtime_ms) {
        catalog.extend(prior);
        return Err(error);
    }
    replace_file_catalog_ideas(catalog, file_uri, &extracted.ideas);
    Ok(Some(RqIndexOutcome { names_changed }))
}

fn index_code_files(
    store: &mut IndexStore,
    workspace_root: &Path,
    code_files: &[PathBuf],
    catalog: &[WildcardIdeaCandidate],
    stored_mtimes: &std::collections::HashMap<String, Option<f64>>,
    force_reextract: bool,
    cancel: &AtomicBool,
    record_events: bool,
    progress: &mut SyncProgress,
    file_issues: &mut Vec<FileIssue>,
    file_events: &mut Vec<SyncFileEvent>,
) -> Result<(), StoreError> {
    let links = link_catalog(catalog);
    let mut keep = HashSet::new();
    for path in code_files {
        if cancel.load(Ordering::Relaxed) {
            progress.cancelled = true;
            break;
        }
        let file_uri = relative_posix(workspace_root, path);
        progress.current_file = Some(file_uri.clone());
        progress.processed += 1;
        let import_roots = crate::import_roots_for_source(workspace_root, &file_uri);
        match index_code_file_path(
            store,
            path,
            &file_uri,
            &links,
            stored_mtimes,
            force_reextract,
            &import_roots,
        )? {
            CodeIndexOutcome::SkippedMtime => {
                progress.skipped_mtime += 1;
                push_file_event(
                    file_events,
                    record_events,
                    file_uri.clone(),
                    SyncFileAction::SkippedMtime,
                    Some("mtime unchanged".to_string()),
                );
                keep.insert(file_uri);
            }
            CodeIndexOutcome::Indexed => {
                progress.indexed += 1;
                push_file_event(
                    file_events,
                    record_events,
                    file_uri.clone(),
                    SyncFileAction::Indexed,
                    None,
                );
                keep.insert(file_uri);
            }
            CodeIndexOutcome::Empty => {
                push_file_event(
                    file_events,
                    record_events,
                    file_uri,
                    SyncFileAction::Skipped,
                    Some("empty or not indexed".to_string()),
                );
            }
            CodeIndexOutcome::Error(message) => {
                progress.errors += 1;
                push_file_event(
                    file_events,
                    record_events,
                    file_uri.clone(),
                    SyncFileAction::Error,
                    Some(message.clone()),
                );
                file_issues.push(FileIssue { file_uri, message });
            }
        }
    }
    if !progress.cancelled {
        for uri in store.list_code_document_uris()? {
            if !keep.contains(&uri) {
                store.delete_document(&uri)?;
            }
        }
    }
    Ok(())
}

#[derive(Debug)]
enum CodeIndexOutcome {
    SkippedMtime,
    Indexed,
    Empty,
    Error(String),
}

fn index_code_file_path(
    store: &mut IndexStore,
    path: &Path,
    file_uri: &str,
    catalog: &[CatalogLinkIdea],
    stored_mtimes: &std::collections::HashMap<String, Option<f64>>,
    force_reextract: bool,
    import_roots: &[ImportRootMapping],
) -> Result<CodeIndexOutcome, StoreError> {
    if too_large_for_comment_index(path) {
        return Ok(CodeIndexOutcome::Empty);
    }
    let mtime_ms = file_mtime_ms(path);
    if !force_reextract && mtime_unchanged(mtime_ms, stored_mtimes.get(file_uri).copied().flatten())
    {
        return Ok(CodeIndexOutcome::SkippedMtime);
    }
    let source = match read_source(path) {
        Ok(Some(text)) => text,
        Ok(None) => return Ok(CodeIndexOutcome::Empty),
        Err(_) if is_binary_rqignore_path(path) => return Ok(CodeIndexOutcome::Empty),
        Err(error) => return Ok(CodeIndexOutcome::Error(error.to_string())),
    };
    persist_code_source(store, file_uri, &source, catalog, mtime_ms, import_roots)
}

fn persist_code_source(
    store: &mut IndexStore,
    file_uri: &str,
    source: &str,
    catalog: &[CatalogLinkIdea],
    mtime_ms: Option<f64>,
    import_roots: &[ImportRootMapping],
) -> Result<CodeIndexOutcome, StoreError> {
    let content_hash = code_file_content_hash(source);
    // Negative cache: keep a documents row (hash + mtime, no ideas/edges) so soft sync
    // and idle stale checks can mtime-skip code files with no `rq:` comment refs.
    // rq:["../../../reqlan rq/indexer/cache-reuse.rq".code_file_negative_cache]
    if !looks_like_comment_reference_source(source) {
        store.persist_code_comment_file(file_uri, &content_hash, &[], mtime_ms)?;
        return Ok(CodeIndexOutcome::Indexed);
    }
    // rq:["../../../reqlan rq/core_analysis/check.rq".code_comment_syntax_errors]
    let scan = scan_comment_references(source);
    if scan.references.is_empty() && scan.syntax_errors.is_empty() {
        store.persist_code_comment_file(file_uri, &content_hash, &[], mtime_ms)?;
        return Ok(CodeIndexOutcome::Indexed);
    }
    let edges = comment_link_edges(file_uri, source, catalog, import_roots);
    store.persist_code_comment_file(file_uri, &content_hash, &edges, mtime_ms)?;
    Ok(CodeIndexOutcome::Indexed)
}

fn refresh_indexed_code_documents(
    store: &mut IndexStore,
    workspace_root: &Path,
    catalog: &[WildcardIdeaCandidate],
) -> Result<(), StoreError> {
    let links = link_catalog(catalog);
    for file_uri in store.list_code_document_uris()? {
        let path = workspace_root.join(&file_uri);
        if !path.is_file() {
            store.delete_document(&file_uri)?;
            continue;
        }
        let source = match read_source(&path) {
            Ok(Some(text)) => text,
            Ok(None) | Err(_) => {
                store.delete_document(&file_uri)?;
                continue;
            }
        };
        let mtime_ms = file_mtime_ms(&path);
        let import_roots = crate::import_roots_for_source(workspace_root, &file_uri);
        let _ = persist_code_source(store, &file_uri, &source, &links, mtime_ms, &import_roots)?;
    }
    Ok(())
}

#[derive(Debug, Clone, Default)]
pub struct IndexOneFileResult {
    pub file_uri: String,
    pub diagnostics: Vec<String>,
}

/// Index a single `.rq` or comment-bearing source file (or remove it when missing).
/// Prefer [`index_one_file_with_catalog`] or [`index_paths`] inside a multi-file pass.
pub fn index_one_file(
    store: &mut IndexStore,
    workspace_root: &Path,
    file_path_or_uri: &str,
) -> Result<IndexOneFileResult, StoreError> {
    let mut catalog = load_idea_catalog(store)?;
    index_one_file_with_catalog(store, workspace_root, file_path_or_uri, &mut catalog)
}

/// Index one file using a shared mutable catalog for the surrounding sync pass.
/// After a `.rq` persist, replaces that file's catalog rows (rename-safe).
/// rq:["../../../reqlan rq/indexer/cache-reuse.rq".sync_pass_idea_catalog]
pub fn index_one_file_with_catalog(
    store: &mut IndexStore,
    workspace_root: &Path,
    file_path_or_uri: &str,
    catalog: &mut Vec<WildcardIdeaCandidate>,
) -> Result<IndexOneFileResult, StoreError> {
    let file_uri = to_indexed_uri(workspace_root, file_path_or_uri);
    let path = if Path::new(file_path_or_uri).is_absolute() {
        PathBuf::from(file_path_or_uri)
    } else if file_path_or_uri.starts_with("file://") {
        workspace_root.join(&file_uri)
    } else {
        workspace_root.join(&file_uri)
    };

    if !path.is_file() {
        store.delete_document(&file_uri)?;
        remove_file_catalog_ideas(catalog, &file_uri);
        return Ok(IndexOneFileResult { file_uri, diagnostics: Vec::new() });
    }

    if RqIgnoreFilter::load(workspace_root).ignores(&file_uri, false) {
        store.delete_document(&file_uri)?;
        remove_file_catalog_ideas(catalog, &file_uri);
        return Ok(IndexOneFileResult { file_uri, diagnostics: Vec::new() });
    }

    let import_roots = crate::import_roots_for_source(workspace_root, &file_uri);

    if is_comment_index_path(&path) || is_binary_rqignore_path(&path) {
        let source = match read_source(&path) {
            Ok(Some(text)) => text,
            Ok(None) => {
                return Ok(IndexOneFileResult { file_uri, diagnostics: Vec::new() });
            }
            Err(_) if is_binary_rqignore_path(&path) => {
                return Ok(IndexOneFileResult { file_uri, diagnostics: Vec::new() });
            }
            Err(error) => return Err(error.into()),
        };
        let mtime_ms = file_mtime_ms(&path);
        let links = link_catalog(catalog);
        persist_code_source(store, &file_uri, &source, &links, mtime_ms, &import_roots)?;
        return Ok(IndexOneFileResult { file_uri, diagnostics: Vec::new() });
    }

    let source = match read_source(&path) {
        Ok(Some(text)) => text,
        Ok(None) => return Ok(IndexOneFileResult { file_uri, diagnostics: Vec::new() }),
        Err(error) => return Err(error.into()),
    };
    let prior = take_file_catalog_ideas(catalog, &file_uri);
    let mtime_ms = file_mtime_ms(&path);
    let parsed = parse_document(&source);
    let diagnostics: Vec<String> = parsed
        .diagnostics
        .iter()
        .filter(|diag| matches!(diag.severity, Severity::Error))
        .map(|diag| diag.message.clone())
        .collect();
    let extracted = extract_from_parse(
        &file_uri,
        &source,
        &parsed,
        &ExtractOptions { idea_candidates: catalog, import_roots, local_symbolic: false },
    );
    let names_changed = idea_names_change(store, &extracted)?;
    if let Err(error) = store.persist_extracted(extracted.clone(), mtime_ms) {
        catalog.extend(prior);
        return Err(error);
    }
    replace_file_catalog_ideas(catalog, &file_uri, &extracted.ideas);
    if names_changed {
        refresh_indexed_code_documents(store, workspace_root, catalog)?;
    }
    Ok(IndexOneFileResult { file_uri, diagnostics })
}

/// Code comment links resolve on idea names alone, so only a name change re-links code files.
fn idea_names_change(store: &IndexStore, document: &IndexedDocument) -> Result<bool, StoreError> {
    let before: HashSet<String> =
        store.get_ideas_in_file(&document.file_uri)?.into_iter().map(|idea| idea.name).collect();
    let after: HashSet<&str> = document.ideas.iter().map(|idea| idea.name.as_str()).collect();
    Ok(before.len() != after.len() || !before.iter().all(|name| after.contains(name.as_str())))
}

fn read_source(path: &Path) -> Result<Option<String>, std::io::Error> {
    match read_index_text(path)? {
        IndexText::Text(text) => Ok(Some(text)),
        IndexText::Skip => Ok(None),
    }
}

fn file_mtime_ms(path: &Path) -> Option<f64> {
    std::fs::metadata(path).ok().and_then(|meta| {
        meta.modified().ok().and_then(|time| {
            time.duration_since(std::time::UNIX_EPOCH).ok().map(|d| d.as_millis() as f64)
        })
    })
}

fn mtime_unchanged(mtime_ms: Option<f64>, stored: Option<f64>) -> bool {
    match (mtime_ms, stored) {
        (Some(mtime), Some(stored)) => (mtime - stored).abs() < 1.0,
        _ => false,
    }
}

pub fn relative_posix(root: &Path, path: &Path) -> String {
    path.strip_prefix(root).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

pub fn to_indexed_uri(workspace_root: &Path, file_path_or_uri: &str) -> String {
    if file_path_or_uri.starts_with("file://") {
        return file_path_or_uri.to_string();
    }
    let path = Path::new(file_path_or_uri);
    if path.is_absolute() {
        return relative_posix(workspace_root, path);
    }
    file_path_or_uri.replace('\\', "/")
}
