//! One directory walk: base markers, `.rq` paths, and allowlisted code paths.
//! The walk does not read file bodies.
//! rq:["../../../reqlan rq/indexer/cache-reuse.rq".single_sync_walk]
//! rq:["../../../reqlan rq/indexer/sequencing.rq".scan_limits]

use crate::comment::is_comment_index_path;
use crate::extract::{path_glob_matches, path_glob_may_match_under};
use crate::ignore::{is_binary_rqignore_path, RqIgnoreFilter};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

pub const DEFAULT_SCAN_MAX_DEPTH: u32 = 8;
pub const DEFAULT_SCAN_MAX_ENTRIES: u32 = 20_000;
pub const SCAN_MAX_DEPTH_LIMIT: u32 = 32;
pub const SCAN_MAX_ENTRIES_LIMIT: u32 = 500_000;

#[derive(Debug, Clone)]
pub struct ScanLimits {
    pub max_depth: u32,
    pub max_entries: u32,
    /// When set, a nested directory that owns `.reqlan` is recorded and not entered.
    pub stop_at_child_bases: bool,
    /// When non-empty, keep a file only when it matches a glob. An empty glob matches nothing.
    pub path_globs: Vec<String>,
}

impl Default for ScanLimits {
    fn default() -> Self {
        Self {
            max_depth: DEFAULT_SCAN_MAX_DEPTH,
            max_entries: DEFAULT_SCAN_MAX_ENTRIES,
            stop_at_child_bases: false,
            path_globs: Vec::new(),
        }
    }
}

impl ScanLimits {
    pub fn clamped(self) -> Self {
        Self {
            max_depth: clamp_scan_depth(self.max_depth),
            max_entries: clamp_scan_entries(self.max_entries),
            stop_at_child_bases: self.stop_at_child_bases,
            path_globs: self.path_globs,
        }
    }
}

pub fn clamp_scan_depth(value: u32) -> u32 {
    value.clamp(1, SCAN_MAX_DEPTH_LIMIT)
}

pub fn clamp_scan_entries(value: u32) -> u32 {
    value.clamp(1, SCAN_MAX_ENTRIES_LIMIT)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceScan {
    pub bases: Vec<PathBuf>,
    pub rq_files: Vec<PathBuf>,
    pub code_files: Vec<PathBuf>,
    pub truncated: bool,
    pub truncation_reason: Option<String>,
}

struct ScanState {
    bases: Vec<PathBuf>,
    rq_files: Vec<PathBuf>,
    code_files: Vec<PathBuf>,
    entries: u32,
    truncated: bool,
    hit_entries: bool,
    hit_depth: bool,
}

/// Visit each directory once under `roots`.
/// `max_depth` is the deepest directory level to list. The root is depth 0.
/// Children of a directory at `max_depth` are not entered.
pub fn scan_workspace(roots: &[PathBuf], limits: ScanLimits) -> WorkspaceScan {
    let limits = limits.clamped();
    let mut state = ScanState {
        bases: Vec::new(),
        rq_files: Vec::new(),
        code_files: Vec::new(),
        entries: 0,
        truncated: false,
        hit_entries: false,
        hit_depth: false,
    };
    for root in roots {
        if state.hit_entries {
            break;
        }
        if !root.is_dir() {
            continue;
        }
        let filter = RqIgnoreFilter::load(root);
        visit(root, root, 0, &limits, &filter, &mut state);
    }
    state.bases.sort();
    state.bases.dedup();
    state.rq_files.sort();
    state.code_files.sort();
    let truncation_reason = if state.hit_entries {
        Some("maxEntries".to_string())
    } else if state.hit_depth {
        Some("maxDepth".to_string())
    } else {
        None
    };
    WorkspaceScan {
        bases: state.bases,
        rq_files: state.rq_files,
        code_files: state.code_files,
        truncated: state.truncated,
        truncation_reason,
    }
}

fn visit(
    scan_root: &Path,
    dir: &Path,
    depth: u32,
    limits: &ScanLimits,
    filter: &RqIgnoreFilter,
    state: &mut ScanState,
) {
    if state.hit_entries {
        return;
    }
    if depth > limits.max_depth {
        state.truncated = true;
        state.hit_depth = true;
        return;
    }
    let read = match fs::read_dir(dir) {
        Ok(read) => read,
        Err(_) => return,
    };
    let mut children: Vec<PathBuf> = Vec::new();
    for entry in read.flatten() {
        if state.entries >= limits.max_entries {
            state.truncated = true;
            state.hit_entries = true;
            return;
        }
        state.entries += 1;
        let path = entry.path();
        let is_dir = entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false);
        let name = entry.file_name();
        if is_dir && name == ".reqlan" {
            state.bases.push(dir.to_path_buf());
            continue;
        }
        let rel = relative_posix(scan_root, &path);
        if filter.ignores(&rel, is_dir) {
            continue;
        }
        if is_dir {
            if limits.stop_at_child_bases && path != scan_root && path.join(".reqlan").is_dir() {
                state.bases.push(path);
                continue;
            }
            children.push(path);
            continue;
        }
        if !file_in_glob(&limits.path_globs, &rel) {
            continue;
        }
        if path.extension().and_then(|ext| ext.to_str()) == Some("rq") {
            state.rq_files.push(path);
        } else if is_comment_index_path(&path) || is_binary_rqignore_path(&path) {
            state.code_files.push(path);
        }
    }
    for child in children {
        if state.hit_entries {
            return;
        }
        let child_depth = depth.saturating_add(1);
        if child_depth > limits.max_depth {
            state.truncated = true;
            state.hit_depth = true;
            continue;
        }
        let rel = relative_posix(scan_root, &child);
        if !directory_may_hold(&limits.path_globs, &rel) {
            continue;
        }
        visit(scan_root, &child, child_depth, limits, filter, state);
    }
}

fn file_in_glob(path_globs: &[String], rel: &str) -> bool {
    if path_globs.is_empty() {
        return true;
    }
    path_globs.iter().any(|glob| {
        let glob = glob.trim();
        !glob.is_empty() && path_glob_matches(glob, rel)
    })
}

fn directory_may_hold(path_globs: &[String], dir_rel: &str) -> bool {
    if path_globs.is_empty() {
        return true;
    }
    path_globs.iter().any(|glob| path_glob_may_match_under(glob, dir_rel))
}

fn relative_posix(root: &Path, path: &Path) -> String {
    path.strip_prefix(root).unwrap_or(path).to_string_lossy().replace('\\', "/")
}
