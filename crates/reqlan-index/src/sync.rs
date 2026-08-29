//! Incremental workspace sync: mtime skip, per-file upsert, cancel, hard rebuild.
//! rq:["../../../reqlan rq/indexer/indexer.rq".nonblocking_index]
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
//! rq:["../../../reqlan rq/indexer/indexer.rq".index_code_files]
//! rq:["../../../reqlan rq/indexer/indexer.rq".wildcard_reference_edges]
//! rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]

use crate::comment::{
    code_file_content_hash, comment_link_edges, is_comment_index_path,
    looks_like_comment_reference_source, too_large_for_comment_index,
};
use crate::extract::{
    extract_from_parse, extract_indexed_document, ExtractOptions, WildcardIdeaCandidate,
    EXTRACT_VERSION,
};
use crate::ignore::{is_binary_rqignore_path, RqIgnoreFilter};
use crate::path_resolve::load_applying_rq_config;
use crate::store::{IndexStore, StoreError};
use crate::types::IdeaSummary;
use reqlan_parse::{parse_document, ImportRootMapping, Severity};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use walkdir::WalkDir;

#[derive(Debug, Clone)]
pub struct SyncOptions {
    pub workspace_root: PathBuf,
    pub hard_rebuild: bool,
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

#[derive(Debug)]
pub struct SyncResult {
    pub progress: SyncProgress,
    pub file_issues: Vec<FileIssue>,
}

#[derive(Debug, Clone)]
pub struct FileIssue {
    pub file_uri: String,
    pub message: String,
}

pub fn collect_rq_files(workspace_root: &Path, filter: &RqIgnoreFilter) -> Vec<PathBuf> {
    collect_files(workspace_root, filter, |path| {
        path.extension().and_then(|ext| ext.to_str()) == Some("rq")
    })
}

pub fn collect_code_files(workspace_root: &Path, filter: &RqIgnoreFilter) -> Vec<PathBuf> {
    collect_files(workspace_root, filter, |path| {
        is_comment_index_path(path) || is_binary_rqignore_path(path)
    })
}

fn collect_files(
    workspace_root: &Path,
    filter: &RqIgnoreFilter,
    keep: impl Fn(&Path) -> bool,
) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for entry in WalkDir::new(workspace_root).into_iter().filter_entry(|entry| {
        should_descend(workspace_root, filter, entry.path(), entry.file_type().is_dir())
    }) {
        let Ok(entry) = entry else { continue };
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if !keep(path) {
            continue;
        }
        let rel = relative_posix(workspace_root, path);
        if filter.ignores(&rel, false) {
            continue;
        }
        files.push(path.to_path_buf());
    }
    files.sort();
    files
}

fn should_descend(
    workspace_root: &Path,
    filter: &RqIgnoreFilter,
    path: &Path,
    is_dir: bool,
) -> bool {
    let rel = relative_posix(workspace_root, path);
    if filter.ignores(&rel, is_dir) {
        return false;
    }
    if is_dir && path != workspace_root && path.join(".reqlan").is_dir() {
        return false;
    }
    true
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
    let filter = RqIgnoreFilter::load(&options.workspace_root);
    let import_roots = load_applying_rq_config(&options.workspace_root, None).import_roots;
    let rq_files = collect_rq_files(&options.workspace_root, &filter);
    let code_files = collect_code_files(&options.workspace_root, &filter);
    let stored_mtimes = store.list_document_mtimes()?;
    let mut progress =
        SyncProgress { total: rq_files.len() + code_files.len(), ..SyncProgress::default() };
    let mut file_issues = Vec::new();
    let mut rq_indexed = 0usize;

    let mut catalog: Vec<WildcardIdeaCandidate> = store
        .list_all_ideas()?
        .into_iter()
        .map(|idea| WildcardIdeaCandidate {
            file_path: idea.file_uri.clone(),
            file_uri: idea.file_uri,
            idea_name: idea.name,
        })
        .collect();

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
            continue;
        }

        let source = match std::fs::read_to_string(&path) {
            Ok(text) => text,
            Err(error) => {
                progress.errors += 1;
                file_issues.push(FileIssue { file_uri, message: error.to_string() });
                continue;
            }
        };
        let extracted = extract_indexed_document(
            &file_uri,
            &source,
            &ExtractOptions {
                idea_candidates: catalog.clone(),
                import_roots: import_roots.clone(),
                local_symbolic: false,
            },
        );
        if let Err(error) = store.persist_extracted(extracted.clone(), mtime_ms) {
            progress.errors += 1;
            file_issues.push(FileIssue { file_uri, message: error.to_string() });
            continue;
        }
        for idea in extracted.ideas {
            catalog.push(WildcardIdeaCandidate {
                file_path: idea.file_uri.clone(),
                file_uri: idea.file_uri,
                idea_name: idea.name,
            });
        }
        progress.indexed += 1;
        rq_indexed += 1;
    }

    if !progress.cancelled {
        index_code_files(
            store,
            &options.workspace_root,
            &code_files,
            &stored_mtimes,
            options.hard_rebuild || stale_extract || rq_indexed > 0,
            cancel,
            &mut progress,
            &mut file_issues,
            &import_roots,
        )?;
        store.set_extract_version(EXTRACT_VERSION)?;
    }

    Ok(SyncResult { progress, file_issues })
}

fn index_code_files(
    store: &mut IndexStore,
    workspace_root: &Path,
    code_files: &[PathBuf],
    stored_mtimes: &std::collections::HashMap<String, Option<f64>>,
    force_reextract: bool,
    cancel: &AtomicBool,
    progress: &mut SyncProgress,
    file_issues: &mut Vec<FileIssue>,
    import_roots: &[ImportRootMapping],
) -> Result<(), StoreError> {
    let catalog = store.list_all_ideas()?;
    let mut keep = HashSet::new();
    for path in code_files {
        if cancel.load(Ordering::Relaxed) {
            progress.cancelled = true;
            break;
        }
        let file_uri = relative_posix(workspace_root, path);
        progress.current_file = Some(file_uri.clone());
        progress.processed += 1;
        match index_code_file_path(
            store,
            path,
            &file_uri,
            &catalog,
            stored_mtimes,
            force_reextract,
            import_roots,
        )? {
            CodeIndexOutcome::SkippedMtime => {
                progress.skipped_mtime += 1;
                keep.insert(file_uri);
            }
            CodeIndexOutcome::Indexed => {
                progress.indexed += 1;
                keep.insert(file_uri);
            }
            CodeIndexOutcome::Empty => {}
            CodeIndexOutcome::Error(message) => {
                progress.errors += 1;
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
    catalog: &[IdeaSummary],
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
    let source = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(_) if is_binary_rqignore_path(path) => return Ok(CodeIndexOutcome::Empty),
        Err(error) => return Ok(CodeIndexOutcome::Error(error.to_string())),
    };
    persist_code_source(store, file_uri, &source, catalog, mtime_ms, import_roots)
}

fn persist_code_source(
    store: &mut IndexStore,
    file_uri: &str,
    source: &str,
    catalog: &[IdeaSummary],
    mtime_ms: Option<f64>,
    import_roots: &[ImportRootMapping],
) -> Result<CodeIndexOutcome, StoreError> {
    if !looks_like_comment_reference_source(source)
        || crate::comment::find_comment_references_in_text(source).is_empty()
    {
        if store.get_document_hash(file_uri)?.is_some() {
            store.delete_document(file_uri)?;
        }
        return Ok(CodeIndexOutcome::Empty);
    }
    let edges = comment_link_edges(file_uri, source, catalog, import_roots);
    store.persist_code_comment_file(file_uri, &code_file_content_hash(source), &edges, mtime_ms)?;
    Ok(CodeIndexOutcome::Indexed)
}

fn refresh_indexed_code_documents(
    store: &mut IndexStore,
    workspace_root: &Path,
) -> Result<(), StoreError> {
    let catalog = store.list_all_ideas()?;
    let import_roots = load_applying_rq_config(workspace_root, None).import_roots;
    for file_uri in store.list_code_document_uris()? {
        let path = workspace_root.join(&file_uri);
        if !path.is_file() {
            store.delete_document(&file_uri)?;
            continue;
        }
        let source = match std::fs::read_to_string(&path) {
            Ok(text) => text,
            Err(_) => {
                store.delete_document(&file_uri)?;
                continue;
            }
        };
        let mtime_ms = file_mtime_ms(&path);
        let _ = persist_code_source(store, &file_uri, &source, &catalog, mtime_ms, &import_roots)?;
    }
    Ok(())
}

#[derive(Debug, Clone, Default)]
pub struct IndexOneFileResult {
    pub file_uri: String,
    pub diagnostics: Vec<String>,
}

/// Index a single `.rq` or comment-bearing source file (or remove it when missing).
pub fn index_one_file(
    store: &mut IndexStore,
    workspace_root: &Path,
    file_path_or_uri: &str,
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
        return Ok(IndexOneFileResult { file_uri, diagnostics: Vec::new() });
    }

    let import_roots = load_applying_rq_config(workspace_root, Some(&path)).import_roots;

    if is_comment_index_path(&path) || is_binary_rqignore_path(&path) {
        if is_binary_rqignore_path(&path) {
            let filter = RqIgnoreFilter::load(workspace_root);
            if filter.ignores(&file_uri, false) {
                store.delete_document(&file_uri)?;
                return Ok(IndexOneFileResult { file_uri, diagnostics: Vec::new() });
            }
        }
        let catalog = store.list_all_ideas()?;
        let source = match std::fs::read_to_string(&path) {
            Ok(text) => text,
            Err(_) if is_binary_rqignore_path(&path) => {
                return Ok(IndexOneFileResult { file_uri, diagnostics: Vec::new() });
            }
            Err(error) => return Err(error.into()),
        };
        let mtime_ms = file_mtime_ms(&path);
        persist_code_source(store, &file_uri, &source, &catalog, mtime_ms, &import_roots)?;
        return Ok(IndexOneFileResult { file_uri, diagnostics: Vec::new() });
    }

    let source = std::fs::read_to_string(&path)?;
    let catalog: Vec<WildcardIdeaCandidate> = store
        .list_all_ideas()?
        .into_iter()
        .filter(|idea| idea.file_uri != file_uri)
        .map(|idea| WildcardIdeaCandidate {
            file_path: idea.file_uri.clone(),
            file_uri: idea.file_uri,
            idea_name: idea.name,
        })
        .collect();
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
    store.persist_extracted(extracted, mtime_ms)?;
    refresh_indexed_code_documents(store, workspace_root)?;
    Ok(IndexOneFileResult { file_uri, diagnostics })
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
