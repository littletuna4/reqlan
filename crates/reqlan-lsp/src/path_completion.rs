//! Import-path and file-path completion.
//! rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion]
//! rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion_match_quality]
//! rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_replaces_the_tail]
//! rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_reentry_is_lossless]
//! rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_objects]
//! rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_performance]
use crate::code_actions::relative_import_path;
use crate::duty::{Checkpoint, Stopped};
use crate::utf16::{utf16_len, LineMap};
use lsp_types::{
    CompletionItem, CompletionItemKind, CompletionTextEdit, Position, Range, TextEdit, Url,
};
use reqlan_parse::{
    is_id_continuation, resolve_rq_path, ImportRootMapping, Model, TopLevelElement,
};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const MAX_RESULTS: usize = 500;
const MAX_TREE_NODES: usize = 8_000;
const MAX_DEPTH: usize = 32;
const LISTING_TTL: Duration = Duration::from_secs(3);
const LISTING_CACHE_LIMIT: usize = 4_096;

const SKIP_DIRECTORIES: &[&str] = &[
    "node_modules",
    "bower_components",
    "vendor",
    "dist",
    "build",
    "target",
    "coverage",
    "out",
    "__pycache__",
    "venv",
    "site-packages",
    "Pods",
    "tmp",
    "temp",
];

#[derive(Clone)]
struct DirEntry {
    name: String,
    is_directory: bool,
}

struct CachedListing {
    entries: Vec<DirEntry>,
    expires: Instant,
}

#[derive(Clone)]
struct FlatNode {
    path: PathBuf,
    relative: String,
    is_directory: bool,
}

struct CachedTree {
    nodes: Vec<FlatNode>,
    expires: Instant,
}

struct RankedPath {
    label: String,
    label_lower: String,
    stripped: String,
    is_directory: bool,
    sort_key: String,
}

struct CachedAssembly {
    ranked: Vec<RankedPath>,
    expires: Instant,
}

/// Directory listings and ranked path lists reused across keystrokes.
pub struct PathCompletionCache {
    listings: HashMap<PathBuf, CachedListing>,
    trees: HashMap<String, CachedTree>,
    assemblies: HashMap<String, CachedAssembly>,
    directory_reads: u64,
}

impl PathCompletionCache {
    pub fn new() -> Self {
        Self {
            listings: HashMap::new(),
            trees: HashMap::new(),
            assemblies: HashMap::new(),
            directory_reads: 0,
        }
    }

    pub fn directory_reads(&self) -> u64 {
        self.directory_reads
    }
}

impl Default for PathCompletionCache {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone)]
struct Candidate {
    label: String,
    target: PathBuf,
    is_directory: bool,
}

/// Where the cursor is asking for a completion.
/// `QualifiedFile` and `Reference` carry the typed name in `edit.prefix` and
/// never close the insert, so `edit.closing` is `None` for them.
pub enum CompletionSite {
    ImportPath(PathEdit),
    AnonymousPath(PathEdit),
    QualifiedFile { path: String, edit: PathEdit },
    Reference(PathEdit),
}

pub struct PathEdit {
    pub prefix: String,
    pub replace: Range,
    /// Closing quote appended to an import-path insert. Other sites omit it.
    pub closing: Option<char>,
    /// Text from the cursor to the closing token of the site, without the
    /// token. Empty when the line has no closing token yet.
    pub tail: String,
}

pub struct FileSymbols {
    pub names: Vec<(String, bool)>,
    pub sets: Vec<(String, Vec<String>)>,
}

pub fn file_symbols(model: &Model) -> FileSymbols {
    let mut names = Vec::new();
    let mut sets = Vec::new();
    for element in &model.elements {
        match element {
            TopLevelElement::Idea(idea) => names.push((idea.name.clone(), true)),
            TopLevelElement::OneLiner(idea) => names.push((idea.name.clone(), true)),
            TopLevelElement::IdeaSet(set) => {
                names.push((set.name.clone(), false));
                sets.push((set.name.clone(), set.members.clone()));
            }
            TopLevelElement::Anonymous(_) => {}
        }
    }
    FileSymbols { names, sets }
}

pub fn detect_site(text: &str, lines: &LineMap, pos: Position) -> Option<CompletionSite> {
    let byte = lines.byte_at(text, pos);
    let line_start = text[..byte].rfind('\n').map(|index| index + 1).unwrap_or(0);
    let line_end = text[byte..].find('\n').map(|index| byte + index).unwrap_or(text.len());
    let prefix = &text[line_start..byte];
    let suffix = &text[byte..line_end];
    if markdown_label(prefix, suffix) {
        return None;
    }
    if let Some(site) = qualified_site(prefix, suffix, pos) {
        return Some(site);
    }
    if let Some(site) = anonymous_site(prefix, suffix, pos) {
        return Some(site);
    }
    if let Some(site) = import_site(prefix, suffix, pos) {
        return Some(site);
    }
    reference_site(prefix, suffix, pos)
}

/// `.rq` files and directories, or every file and directory when `extension` is `None`.
/// `open_files` are the session's other open documents; their relative paths join the pool.
#[allow(clippy::too_many_arguments)]
pub fn collect_path_items(
    cache: &mut PathCompletionCache,
    from_file: &Path,
    workspace: Option<&Path>,
    roots: &[ImportRootMapping],
    edit: &PathEdit,
    extension: Option<&str>,
    open_files: &[PathBuf],
    tick: &mut dyn Checkpoint,
) -> Result<Vec<CompletionItem>, Stopped> {
    let open_files: Vec<PathBuf> = open_files
        .iter()
        .filter(|file| extension.is_none_or(|ext| file.to_string_lossy().ends_with(ext)))
        .cloned()
        .collect();
    let key = assembly_key(from_file, workspace, roots, extension, &open_files);
    cache.ensure_assembly(&key, from_file, workspace, roots, extension, &open_files, tick)?;
    let query_lower = edit.prefix.to_lowercase();
    let stripped_query = strip_path_separators(&query_lower);
    let want_segments = edit.prefix.ends_with('/');
    // Query chunks split at `/` split the subsequence tier into segment and
    // loose matches. `<alias>/` queries boost the alias root they name.
    let chunks: Vec<String> = query_lower
        .split('/')
        .map(strip_path_separators)
        .filter(|chunk| !chunk.is_empty())
        .collect();
    let alias_prefix = roots.iter().find_map(|mapping| {
        let prefix = format!("{}/", mapping.alias);
        (!mapping.alias.is_empty() && edit.prefix.starts_with(&prefix)).then_some(prefix)
    });
    let filter = if edit.prefix.is_empty() { None } else { Some(edit.prefix.as_str()) };
    let context = MatchContext {
        query_lower: &query_lower,
        stripped_query: &stripped_query,
        prefix: &edit.prefix,
        tail: &edit.tail,
        identity: format!("{}{}", edit.prefix, edit.tail),
        chunks,
        alias_prefix,
    };
    let mut picked: Vec<(u8, u8, usize)> = Vec::new();
    let mut seen = HashSet::new();
    if let Some(assembly) = cache.assemblies.get(&key) {
        for (index, item) in assembly.ranked.iter().enumerate() {
            let Some((tier, segment_rank)) = match_rank(item, &context) else {
                continue;
            };
            if want_segments {
                seen.insert(item.label.clone());
            }
            picked.push((tier, segment_rank, index));
        }
    }
    let mut extras: Vec<(u8, u8, RankedPath)> = Vec::new();
    if want_segments {
        if let Some(dir) = resolve_prefix_dir(&edit.prefix, from_file, roots, workspace) {
            if tick.tick(&dir.to_string_lossy(), 0, 1) {
                return Err(Stopped);
            }
            let from_dir = from_file.parent().unwrap_or(from_file);
            for entry in cache.read_dir(&dir) {
                if !entry.is_directory && extension.is_some_and(|ext| !entry.name.ends_with(ext)) {
                    continue;
                }
                let label = if entry.is_directory {
                    format!("{}{}/", edit.prefix, entry.name)
                } else {
                    format!("{}{}", edit.prefix, entry.name)
                };
                if !seen.insert(label.clone()) {
                    continue;
                }
                let ranked = rank_candidate(
                    from_dir,
                    Candidate {
                        label,
                        target: dir.join(&entry.name),
                        is_directory: entry.is_directory,
                    },
                );
                let Some((tier, segment_rank)) = match_rank(&ranked, &context) else {
                    continue;
                };
                extras.push((tier, segment_rank, ranked));
            }
        }
    }
    let Some(assembly) = cache.assemblies.get(&key) else {
        return Ok(Vec::new());
    };
    let mut items: Vec<(PickRank, CompletionItem)> = picked
        .into_iter()
        .map(|(tier, segment_rank, index)| {
            let candidate = &assembly.ranked[index];
            let rank = pick_rank(candidate, tier, segment_rank, &context);
            let view = path_item(candidate, edit, filter);
            (rank, view)
        })
        .collect();
    items.extend(extras.into_iter().map(|(tier, segment_rank, extra)| {
        let rank = pick_rank(&extra, tier, segment_rank, &context);
        let view = path_item(&extra, edit, filter);
        (rank, view)
    }));
    // Re-entry identity first, then match quality, the alias assertion, the
    // tail resume, and the cached proximity order.
    items.sort_by(|(left, left_item), (right, right_item)| {
        right
            .identity
            .cmp(&left.identity)
            .then_with(|| left.tier.cmp(&right.tier))
            .then_with(|| left.segment_rank.cmp(&right.segment_rank))
            .then_with(|| right.alias_boost.cmp(&left.alias_boost))
            .then_with(|| right.resume.cmp(&left.resume))
            .then_with(|| left_item.sort_text.cmp(&right_item.sort_text))
    });
    if items.len() > MAX_RESULTS {
        items.truncate(MAX_RESULTS);
    }
    Ok(items.into_iter().map(|(_, item)| item).collect())
}

fn assembly_key(
    from_file: &Path,
    workspace: Option<&Path>,
    roots: &[ImportRootMapping],
    extension: Option<&str>,
    open_files: &[PathBuf],
) -> String {
    let mut key = String::new();
    key.push_str(&from_file.to_string_lossy());
    key.push('\0');
    key.push_str(extension.unwrap_or("*"));
    key.push('\0');
    if let Some(workspace) = workspace {
        key.push_str(&workspace.to_string_lossy());
    }
    for mapping in roots {
        key.push('\0');
        key.push_str(&mapping.alias);
        key.push('=');
        key.push_str(mapping.root.as_deref().unwrap_or(""));
    }
    key.push('\0');
    let mut sorted: Vec<&PathBuf> = open_files.iter().collect();
    sorted.sort();
    for file in sorted {
        key.push_str(&file.to_string_lossy());
        key.push(';');
    }
    key
}

impl PathCompletionCache {
    #[allow(clippy::too_many_arguments)]
    fn ensure_assembly(
        &mut self,
        key: &str,
        from_file: &Path,
        workspace: Option<&Path>,
        roots: &[ImportRootMapping],
        extension: Option<&str>,
        open_files: &[PathBuf],
        tick: &mut dyn Checkpoint,
    ) -> Result<(), Stopped> {
        let now = Instant::now();
        if self.assemblies.get(key).is_some_and(|cached| cached.expires > now) {
            return Ok(());
        }
        let mut by_label: HashMap<String, Candidate> = HashMap::new();
        let source_dir = from_file.parent().unwrap_or(from_file);
        add_tree(&mut by_label, self, source_dir, "./", extension, from_file, tick)?;
        if let Some(workspace) = workspace {
            for mapping in roots {
                if mapping.alias.is_empty() {
                    continue;
                }
                let root = import_root_dir(mapping, workspace);
                let display = format!("{}/", mapping.alias);
                add_tree(&mut by_label, self, &root, &display, extension, from_file, tick)?;
            }
        }
        add_relative_labels(&mut by_label, from_file);
        add_open_file_labels(&mut by_label, from_file, open_files);
        let mut ranked: Vec<RankedPath> =
            by_label.into_values().map(|candidate| rank_candidate(source_dir, candidate)).collect();
        ranked.sort_by(|left, right| left.sort_key.cmp(&right.sort_key));
        self.assemblies
            .insert(key.to_string(), CachedAssembly { ranked, expires: now + LISTING_TTL });
        Ok(())
    }
}

fn add_relative_labels(into: &mut HashMap<String, Candidate>, from_file: &Path) {
    let snapshot: Vec<Candidate> = into.values().cloned().collect();
    for candidate in snapshot {
        if candidate.is_directory || candidate.target == from_file {
            continue;
        }
        let Some(label) = relative_label(from_file, &candidate.target, false) else {
            continue;
        };
        if into.contains_key(&label) {
            continue;
        }
        let extra = Candidate { label, target: candidate.target.clone(), is_directory: false };
        let intermediates = intermediate_directories(&extra);
        insert_candidate(into, extra);
        for directory in intermediates {
            insert_candidate(into, directory);
        }
    }
}

fn relative_label(from_file: &Path, target: &Path, is_directory: bool) -> Option<String> {
    let mut label = relative_path_between(from_file, target)?;
    if is_directory && !label.ends_with('/') {
        label.push('/');
    }
    Some(label)
}

/// Open documents join the candidate pool as relative paths, like the Node engine.
fn add_open_file_labels(
    into: &mut HashMap<String, Candidate>,
    from_file: &Path,
    open_files: &[PathBuf],
) {
    for file in open_files {
        if file == from_file {
            continue;
        }
        let Some(label) = relative_label(from_file, file, false) else {
            continue;
        };
        insert_candidate(into, Candidate { label, target: file.clone(), is_directory: false });
    }
}

fn add_tree(
    into: &mut HashMap<String, Candidate>,
    cache: &mut PathCompletionCache,
    root: &Path,
    display_prefix: &str,
    extension: Option<&str>,
    skip_file: &Path,
    tick: &mut dyn Checkpoint,
) -> Result<(), Stopped> {
    if !root.is_dir() {
        return Ok(());
    }
    for node in cache.flattened(root, extension, tick)? {
        if !node.is_directory && node.path == skip_file {
            continue;
        }
        let label = if node.is_directory {
            format!("{display_prefix}{}/", node.relative)
        } else {
            format!("{display_prefix}{}", node.relative)
        };
        let candidate =
            Candidate { label, target: node.path.clone(), is_directory: node.is_directory };
        if node.is_directory {
            insert_candidate(into, candidate);
            continue;
        }
        let intermediates = intermediate_directories(&candidate);
        insert_candidate(into, candidate);
        for directory in intermediates {
            insert_candidate(into, directory);
        }
    }
    Ok(())
}

fn insert_candidate(into: &mut HashMap<String, Candidate>, candidate: Candidate) {
    into.entry(candidate.label.clone()).or_insert(candidate);
}

fn intermediate_directories(file: &Candidate) -> Vec<Candidate> {
    let mut labels = Vec::new();
    let mut index = 0;
    while index < file.label.len() {
        let Some(slash) = file.label[index..].find('/') else {
            break;
        };
        let end = index + slash + 1;
        if end == file.label.len() {
            break;
        }
        let prefix = &file.label[..end];
        let skip = prefix == "@/"
            || prefix == "./"
            || prefix.chars().all(|ch| ch == '.' || ch == '/')
                && prefix.ends_with('/')
                && prefix.split('/').all(|part| part.is_empty() || part == "..");
        if !skip {
            labels.push(prefix.to_string());
        }
        index = end;
    }
    if labels.is_empty() {
        return Vec::new();
    }
    let mut dir = file.target.parent().unwrap_or(&file.target).to_path_buf();
    let mut out = Vec::new();
    for label in labels.into_iter().rev() {
        out.push(Candidate { label, target: dir.clone(), is_directory: true });
        if let Some(parent) = dir.parent() {
            dir = parent.to_path_buf();
        }
    }
    out
}

fn rank_candidate(from_dir: &Path, candidate: Candidate) -> RankedPath {
    let label_lower = candidate.label.to_lowercase();
    let stripped = strip_path_separators(&label_lower);
    let sort_key = sort_key(from_dir, &candidate);
    RankedPath {
        label: candidate.label,
        label_lower,
        stripped,
        is_directory: candidate.is_directory,
        sort_key,
    }
}

/// Match quality tier: 0 exact substring, 1 separator-stripped substring,
/// 2 ordered character subsequence. Ties keep the cached proximity order.
fn match_tier(item: &RankedPath, query_lower: &str, stripped_query: &str) -> Option<u8> {
    if item.label_lower.contains(query_lower) {
        return Some(0);
    }
    if item.stripped.contains(stripped_query) {
        return Some(1);
    }
    is_character_subsequence(&item.stripped, stripped_query).then_some(2)
}

/// The typed query pieces every picked candidate is ranked against.
struct MatchContext<'a> {
    query_lower: &'a str,
    stripped_query: &'a str,
    prefix: &'a str,
    tail: &'a str,
    /// The typed prefix plus the in-progress tail: the value being re-entered.
    identity: String,
    /// Query chunks split at `/`, separators stripped, for the segment sub-rank.
    chunks: Vec<String>,
    /// `<alias>/` when the query names a known alias root.
    alias_prefix: Option<String>,
}

/// Final order for one picked candidate: the edited value first, then match
/// quality, the alias assertion, the tail resume, and the proximity key.
struct PickRank {
    identity: bool,
    tier: u8,
    segment_rank: u8,
    alias_boost: bool,
    resume: bool,
}

/// Tier with its subsequence-tier sub-rank: every query chunk found inside one
/// path segment outranks a loose character subsequence. Only tier 2 consults
/// the sub-rank, so tiers 0 and 1 keep a uniform value and never re-order.
fn match_rank(item: &RankedPath, context: &MatchContext) -> Option<(u8, u8)> {
    let tier = match_tier(item, context.query_lower, context.stripped_query)?;
    let segment_rank =
        if tier == 2 && matches_by_segment(&item.label_lower, &context.chunks) { 0 } else { 1 };
    Some((tier, segment_rank))
}

/// `true` when every query chunk appears inside a `/`-segment of the label.
fn matches_by_segment(label_lower: &str, chunks: &[String]) -> bool {
    let segments: Vec<&str> = label_lower.split('/').collect();
    chunks.iter().all(|chunk| segments.iter().any(|segment| segment.contains(chunk.as_str())))
}

fn pick_rank(item: &RankedPath, tier: u8, segment_rank: u8, context: &MatchContext) -> PickRank {
    PickRank {
        identity: item.label == context.identity,
        tier,
        segment_rank,
        alias_boost: context
            .alias_prefix
            .as_deref()
            .is_some_and(|alias| item.label.starts_with(alias)),
        resume: resumes_tail(&item.label, context.prefix, context.tail),
    }
}

/// A label resumes the edit when the part after the typed prefix starts with
/// the path segment the tail is typing: `@/a` with tail `/b/c.ts` resumes
/// `@/a/b/` but not `@/a/z/…`.
fn resumes_tail(label: &str, prefix: &str, tail: &str) -> bool {
    let tail_head = head_segment(tail);
    !tail_head.is_empty()
        && label.strip_prefix(prefix).is_some_and(|remainder| head_segment(remainder) == tail_head)
}

/// The first path segment of a value, ignoring leading separators: `/b/c` is `b`.
fn head_segment(value: &str) -> &str {
    let value = value.trim_start_matches('/');
    match value.split_once('/') {
        Some((head, _)) => head,
        None => value,
    }
}

fn path_item(candidate: &RankedPath, edit: &PathEdit, filter: Option<&str>) -> CompletionItem {
    // The tail continues the label, so merge_tail keeps or carries it; an
    // unclosed anonymous string appends its closing quote after the insert.
    let mut new_text = merge_tail(&candidate.label, &edit.prefix, &edit.tail);
    if let Some(delimiter) = edit.closing {
        new_text.push(delimiter);
    }
    CompletionItem {
        label: candidate.label.clone(),
        kind: Some(if candidate.is_directory {
            CompletionItemKind::FOLDER
        } else {
            CompletionItemKind::FILE
        }),
        sort_text: Some(candidate.sort_key.clone()),
        filter_text: Some(filter.unwrap_or(&candidate.label).to_string()),
        text_edit: Some(CompletionTextEdit::Edit(TextEdit { range: edit.replace, new_text })),
        ..CompletionItem::default()
    }
}

fn sort_key(from_dir: &Path, candidate: &Candidate) -> String {
    let to_dir = if candidate.is_directory {
        candidate.target.clone()
    } else {
        candidate.target.parent().unwrap_or(&candidate.target).to_path_buf()
    };
    let hops = directory_hop_distance(from_dir, &to_dir);
    let directory_rank = if candidate.is_directory { '0' } else { '1' };
    format!("{hops:04}_{directory_rank}_{}", candidate.label)
}

fn directory_hop_distance(from_dir: &Path, to_dir: &Path) -> u32 {
    let from: Vec<_> = from_dir.components().collect();
    let to: Vec<_> = to_dir.components().collect();
    let mut shared = 0;
    while shared < from.len() && shared < to.len() && from[shared] == to[shared] {
        shared += 1;
    }
    (from.len() - shared + to.len() - shared) as u32
}

#[cfg(test)]
fn path_match_tier(path: &str, query: &str) -> Option<u8> {
    let path_lower = path.to_lowercase();
    let query_lower = query.to_lowercase();
    if path_lower.contains(&query_lower) {
        return Some(0);
    }
    let stripped_path = strip_path_separators(&path_lower);
    let stripped_query = strip_path_separators(&query_lower);
    if stripped_path.contains(&stripped_query) {
        return Some(1);
    }
    is_character_subsequence(&stripped_path, &stripped_query).then_some(2)
}

fn strip_path_separators(value: &str) -> String {
    let mut out = String::new();
    let chars: Vec<char> = value.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        if chars[index] == '.' && index + 1 < chars.len() && chars[index + 1] == '/' {
            index += 2;
            continue;
        }
        if chars[index] == '.'
            && index + 2 < chars.len()
            && chars[index + 1] == '.'
            && chars[index + 2] == '/'
        {
            index += 3;
            continue;
        }
        if chars[index] == '/' {
            index += 1;
            continue;
        }
        out.push(chars[index]);
        index += 1;
    }
    out
}

fn is_character_subsequence(haystack: &str, needle: &str) -> bool {
    let mut needle_chars = needle.chars();
    let mut next = needle_chars.next();
    for ch in haystack.chars() {
        if next == Some(ch) {
            next = needle_chars.next();
            if next.is_none() {
                return true;
            }
        }
    }
    next.is_none()
}

impl PathCompletionCache {
    fn flattened(
        &mut self,
        root: &Path,
        extension: Option<&str>,
        tick: &mut dyn Checkpoint,
    ) -> Result<Vec<FlatNode>, Stopped> {
        let key = format!("{}::{}", root.display(), extension.unwrap_or("*"));
        let now = Instant::now();
        if tick.tick(&root.to_string_lossy(), 0, 1) {
            return Err(Stopped);
        }
        if let Some(cached) = self.trees.get(&key) {
            if cached.expires > now {
                return Ok(cached.nodes.clone());
            }
        }
        let mut nodes = Vec::new();
        if self.walk(root, "", 0, extension, tick, &mut nodes) {
            return Err(Stopped);
        }
        self.trees.insert(key, CachedTree { nodes: nodes.clone(), expires: now + LISTING_TTL });
        Ok(nodes)
    }

    /// `true` when the client cancelled the walk. A stopped walk is not cached.
    fn walk(
        &mut self,
        directory: &Path,
        relative: &str,
        depth: usize,
        extension: Option<&str>,
        tick: &mut dyn Checkpoint,
        nodes: &mut Vec<FlatNode>,
    ) -> bool {
        if tick.tick(&directory.to_string_lossy(), nodes.len() as u32, MAX_TREE_NODES as u32) {
            return true;
        }
        if depth > MAX_DEPTH || nodes.len() >= MAX_TREE_NODES {
            return false;
        }
        for entry in self.read_dir(directory) {
            if nodes.len() >= MAX_TREE_NODES {
                return false;
            }
            let rel = if relative.is_empty() {
                entry.name.clone()
            } else {
                format!("{relative}/{}", entry.name)
            };
            let path = directory.join(&entry.name);
            if entry.is_directory {
                nodes.push(FlatNode {
                    path: path.clone(),
                    relative: rel.clone(),
                    is_directory: true,
                });
                if self.walk(&path, &rel, depth + 1, extension, tick, nodes) {
                    return true;
                }
                continue;
            }
            if extension.is_some_and(|ext| !entry.name.ends_with(ext)) {
                continue;
            }
            nodes.push(FlatNode { path, relative: rel, is_directory: false });
        }
        false
    }

    fn read_dir(&mut self, directory: &Path) -> Vec<DirEntry> {
        let now = Instant::now();
        if let Some(cached) = self.listings.get(directory) {
            if cached.expires > now {
                return cached.entries.clone();
            }
        }
        self.directory_reads += 1;
        let mut entries = Vec::new();
        let Ok(read) = std::fs::read_dir(directory) else {
            return entries;
        };
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.is_empty() || name.starts_with('.') {
                continue;
            }
            let is_directory = entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false);
            if is_directory && SKIP_DIRECTORIES.contains(&name.as_str()) {
                continue;
            }
            entries.push(DirEntry { name, is_directory });
        }
        entries.sort_by(|left, right| left.name.cmp(&right.name));
        if self.listings.len() >= LISTING_CACHE_LIMIT {
            self.listings.clear();
        }
        self.listings.insert(
            directory.to_path_buf(),
            CachedListing { entries: entries.clone(), expires: now + LISTING_TTL },
        );
        entries
    }
}

fn import_root_dir(mapping: &ImportRootMapping, workspace: &Path) -> PathBuf {
    match mapping.root.as_deref() {
        None | Some("") => workspace.to_path_buf(),
        Some(root) if Path::new(root).is_absolute() => PathBuf::from(root),
        Some(root) => workspace.join(root),
    }
}

fn resolve_prefix_dir(
    prefix: &str,
    from_file: &Path,
    roots: &[ImportRootMapping],
    workspace: Option<&Path>,
) -> Option<PathBuf> {
    let resolved = resolve_rq_path(prefix, &from_file.to_string_lossy(), roots);
    let path = PathBuf::from(&resolved);
    let path = if path.is_absolute() {
        path
    } else if let Some(workspace) = workspace {
        workspace.join(path)
    } else {
        path
    };
    path.is_dir().then_some(path)
}

fn markdown_label(prefix: &str, suffix: &str) -> bool {
    if !suffix.starts_with("](") {
        return false;
    }
    let Some(start) = prefix.rfind('[') else {
        return false;
    };
    !prefix[start + 1..].contains(']')
}

fn import_site(prefix: &str, suffix: &str, pos: Position) -> Option<CompletionSite> {
    let trimmed = prefix.trim_start();
    let keyword = if trimmed.starts_with("from") {
        "from"
    } else if trimmed.starts_with("import") {
        "import"
    } else {
        return None;
    };
    let lead = prefix.len() - trimmed.len();
    let after = &prefix[lead + keyword.len()..];
    if !after.is_empty() && !after.starts_with([' ', '\t', '"', '\'']) {
        return None;
    }
    let rest = after.trim_start();
    let quote = rest.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let content = &rest[quote.len_utf8()..];
    if content.contains(quote) {
        return None;
    }
    let content_start = prefix.len() - content.len();
    let close_len = match suffix.find(quote) {
        Some(index) => index + quote.len_utf8(),
        None => 0,
    };
    let start_col = utf16_len(&prefix[..content_start]);
    let end_col = utf16_len(prefix) + utf16_len(&suffix[..close_len]);
    Some(CompletionSite::ImportPath(PathEdit {
        prefix: content.to_string(),
        replace: Range {
            start: Position { line: pos.line, character: start_col },
            end: Position { line: pos.line, character: end_col },
        },
        closing: Some(quote),
        tail: String::new(),
    }))
}

/// The text after the cursor up to the first `closer`, without the closer.
/// Empty when the line has no closer: the string or bracket is still open.
fn tail_before(closer: char, suffix: &str) -> String {
    match suffix.find(closer) {
        Some(end) => suffix[..end].to_string(),
        None => String::new(),
    }
}

/// Keep the part of `tail` that continues `label` after the typed `prefix`,
/// so the insert does not duplicate text the replace range already covers.
/// A folder insert keeps a bare file name: a `tail` with no `/` after a
/// label that ends with `/` is the file being completed, so carry it.
pub(crate) fn merge_tail(label: &str, prefix: &str, tail: &str) -> String {
    if let Some(remainder) = label.strip_prefix(prefix) {
        if let Some(rest) = tail.strip_prefix(remainder) {
            return format!("{label}{rest}");
        }
    }
    if label.ends_with('/') && !tail.is_empty() && !tail.contains('/') {
        return format!("{label}{tail}");
    }
    label.to_string()
}

fn anonymous_site(prefix: &str, suffix: &str, pos: Position) -> Option<CompletionSite> {
    let (content, delimiter, content_start) = quoted_bracket(prefix)?;
    let tail = tail_before(delimiter, suffix);
    // No closer on the line and only whitespace after the cursor: the string
    // is still open, so the insert appends the closing quote. In-progress text
    // keeps the insert quote-free so it is never trapped behind a quote.
    let closing = (tail.is_empty() && suffix.trim().is_empty()).then_some(delimiter);
    Some(CompletionSite::AnonymousPath(PathEdit {
        prefix: content,
        replace: replace_to_tail(prefix, content_start, &tail, pos.line),
        closing,
        tail,
    }))
}

/// Replace range on one line: from `start_byte` to the column after `tail`.
/// An empty `tail` (no closing token on the line) ends the range at the cursor.
fn replace_to_tail(prefix: &str, start_byte: usize, tail: &str, line: u32) -> Range {
    Range {
        start: Position { line, character: utf16_len(&prefix[..start_byte]) },
        end: Position { line, character: utf16_len(prefix) + utf16_len(tail) },
    }
}

fn qualified_site(prefix: &str, suffix: &str, pos: Position) -> Option<CompletionSite> {
    let mut index = prefix.len();
    while index > 0 {
        let ch = prefix[..index].chars().next_back()?;
        if is_id_continuation(ch) || ch == '.' {
            index -= ch.len_utf8();
            continue;
        }
        break;
    }
    let tail = &prefix[index..];
    if !tail.starts_with('.') {
        return None;
    }
    let idea_prefix = &tail[1..];
    if !idea_prefix.chars().all(|ch| is_id_continuation(ch) || ch == '.') {
        return None;
    }
    if index == 0 {
        return None;
    }
    let before = &prefix[..index];
    let delimiter = before.chars().next_back()?;
    if delimiter != '"' && delimiter != '\'' {
        return None;
    }
    let close_at = before.len() - delimiter.len_utf8();
    let open_and_path = &prefix[..close_at];
    let open_at = open_and_path.rfind(delimiter)?;
    let path = &open_and_path[open_at + delimiter.len_utf8()..];
    if path.contains(delimiter) {
        return None;
    }
    if !bracket_before(open_and_path, open_at) {
        return None;
    }
    let idea_start = prefix.len() - idea_prefix.len();
    let tail = tail_before(']', suffix);
    Some(CompletionSite::QualifiedFile {
        path: path.to_string(),
        edit: PathEdit {
            prefix: idea_prefix.to_string(),
            replace: replace_to_tail(prefix, idea_start, &tail, pos.line),
            closing: None,
            tail,
        },
    })
}

fn quoted_bracket(prefix: &str) -> Option<(String, char, usize)> {
    let quote_at = prefix.rfind(['"', '\''])?;
    let delimiter = prefix[quote_at..].chars().next()?;
    let content_start = quote_at + delimiter.len_utf8();
    let content = &prefix[content_start..];
    if content.contains(['"', '\'']) {
        return None;
    }
    if !bracket_before(prefix, quote_at) {
        return None;
    }
    Some((content.to_string(), delimiter, content_start))
}

fn bracket_before(text: &str, quote_at: usize) -> bool {
    let before = &text[..quote_at];
    let brackets = if before.ends_with("[[") {
        2
    } else if before.ends_with('[') {
        1
    } else {
        return false;
    };
    let bracket_start = before.len() - brackets;
    if bracket_start == 0 {
        return true;
    }
    !before[..bracket_start].ends_with('[')
}

fn reference_site(prefix: &str, suffix: &str, pos: Position) -> Option<CompletionSite> {
    let start = prefix.rfind('[')?;
    let rest = &prefix[start + 1..];
    if rest.contains(']') || rest.contains('"') || rest.contains('\'') {
        return None;
    }
    let name = rest.trim_start_matches(char::is_whitespace);
    // A bracket target is one grammar `ID` (dots join qualified parts). Words split
    // by spaces are markdown link label or prose text, not a reference.
    if !name.chars().all(|ch| is_id_continuation(ch) || ch == '.') {
        return None;
    }
    let skipped = rest.len() - name.len();
    let name_start = start + 1 + skipped;
    let tail = tail_before(']', suffix);
    Some(CompletionSite::Reference(PathEdit {
        prefix: name.to_string(),
        replace: replace_to_tail(prefix, name_start, &tail, pos.line),
        closing: None,
        tail,
    }))
}

pub fn relative_path_between(from_file: &Path, to_file: &Path) -> Option<String> {
    let from = Url::from_file_path(from_file).ok()?.to_string();
    let to = Url::from_file_path(to_file).ok()?.to_string();
    relative_import_path(&from, &to)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn substring_and_subsequence_match() {
        assert_eq!(path_match_tier("../../parent/path.rq", "path"), Some(0));
        assert_eq!(path_match_tier("../../parent/path.rq", "./path"), Some(1));
        assert_eq!(path_match_tier("../../hello/inbetween/path/file.rq", "hellopath"), Some(2));
        assert_eq!(path_match_tier("./other.rq", "path"), None);
    }

    #[test]
    fn reference_site_rejects_words_split_by_spaces() {
        let text = "demo {\n    see [Some label \n}";
        let lines = LineMap::new(text);
        let pos = Position { line: 1, character: 20 };
        assert!(detect_site(text, &lines, pos).is_none());
    }

    #[test]
    fn qualified_site_accepts_hyphenated_idea_prefixes() {
        let text = "demo {\n    see [\"./lib.rq\".my-idea\n}";
        let lines = LineMap::new(text);
        let pos = Position { line: 1, character: 27 };
        let Some(CompletionSite::QualifiedFile { edit, .. }) = detect_site(text, &lines, pos)
        else {
            panic!("qualified site");
        };
        assert_eq!(edit.prefix, "my-idea");
    }

    #[test]
    fn reference_site_accepts_hyphens_and_dots() {
        let text = "demo {\n    see [my-idea.\n}";
        let lines = LineMap::new(text);
        let pos = Position { line: 1, character: 17 };
        let Some(CompletionSite::Reference(edit)) = detect_site(text, &lines, pos) else {
            panic!("reference site");
        };
        assert_eq!(edit.prefix, "my-idea.");
    }

    #[test]
    fn import_site_keeps_the_typed_prefix() {
        let text = "import \"./lang/\"";
        let lines = LineMap::new(text);
        let pos = Position { line: 0, character: (text.len() - 1) as u32 };
        let Some(CompletionSite::ImportPath(edit)) = detect_site(text, &lines, pos) else {
            panic!("import site");
        };
        assert_eq!(edit.prefix, "./lang/");
        assert_eq!(edit.closing, Some('"'));
    }

    #[test]
    fn anonymous_site_reads_the_open_string() {
        let text = "demo {\n    [\"./\"]\n}";
        let lines = LineMap::new(text);
        let pos = Position { line: 1, character: 8 };
        let Some(CompletionSite::AnonymousPath(edit)) = detect_site(text, &lines, pos) else {
            panic!("anonymous site");
        };
        assert_eq!(edit.prefix, "./");
        assert!(edit.closing.is_none());
    }

    #[test]
    fn merge_tail_consumes_the_matching_tail() {
        assert_eq!(merge_tail("@/a/b/", "@/a/", "b/c.ts"), "@/a/b/c.ts");
        assert_eq!(merge_tail("@/a/b/c.ts", "@/a/", "b/c.ts"), "@/a/b/c.ts");
        assert_eq!(merge_tail("name", "na", "me"), "name");
    }

    #[test]
    fn merge_tail_keeps_the_label_when_the_tail_differs() {
        assert_eq!(
            merge_tail("@/root/x/hello/afile.ts", "@/root/x", "/afile.ts"),
            "@/root/x/hello/afile.ts"
        );
        assert_eq!(merge_tail("namespace_idea_two", "na", "mespace_idea"), "namespace_idea_two");
        assert_eq!(merge_tail("@/a/d", "@/a", "/b"), "@/a/d");
    }

    #[test]
    fn merge_tail_with_a_matching_tail_is_a_no_op() {
        assert_eq!(merge_tail("@/a/b", "@/a", "/b"), "@/a/b");
    }

    #[test]
    fn merge_tail_carries_a_bare_filename_tail() {
        assert_eq!(merge_tail("@/a/d/", "@/a/", "c.ts"), "@/a/d/c.ts");
        assert_eq!(merge_tail("@/a/d/", "@/a/", "b/c.ts"), "@/a/d/");
        assert_eq!(merge_tail("@/a/d/", "@/a/", ""), "@/a/d/");
        assert_eq!(merge_tail("namespace_idea", "na", "me"), "namespace_idea");
    }

    #[test]
    fn merge_tail_with_an_empty_tail_is_the_label() {
        assert_eq!(merge_tail("@/a/b/", "@/a/", ""), "@/a/b/");
    }

    #[test]
    fn anonymous_site_ends_the_range_before_the_closing_quote() {
        let text = "demo {\n    [\"./abc\"]\n}";
        let lines = LineMap::new(text);
        let pos = Position { line: 1, character: 9 };
        let Some(CompletionSite::AnonymousPath(edit)) = detect_site(text, &lines, pos) else {
            panic!("anonymous site");
        };
        assert_eq!(edit.prefix, "./a");
        assert_eq!(edit.tail, "bc");
        assert_eq!(edit.replace.start.character, 6);
        assert_eq!(edit.replace.end.character, 11);
    }

    #[test]
    fn anonymous_site_with_an_open_string_ends_the_range_at_the_cursor() {
        let text = "demo {\n    [\"./abc\n}";
        let lines = LineMap::new(text);
        let pos = Position { line: 1, character: 9 };
        let Some(CompletionSite::AnonymousPath(edit)) = detect_site(text, &lines, pos) else {
            panic!("anonymous site");
        };
        assert_eq!(edit.tail, "");
        assert_eq!(edit.replace.end.character, 9);
    }

    #[test]
    fn reference_site_keeps_both_wikilink_brackets() {
        let text = "demo {\n    see [[name]]\n}";
        let lines = LineMap::new(text);
        let pos = Position { line: 1, character: 12 };
        let Some(CompletionSite::Reference(edit)) = detect_site(text, &lines, pos) else {
            panic!("reference site");
        };
        assert_eq!(edit.prefix, "na");
        assert_eq!(edit.tail, "me");
        assert_eq!(edit.replace.end.character, 14);
        assert_eq!(merge_tail("name_two", &edit.prefix, &edit.tail), "name_two");
    }
}
