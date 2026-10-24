//! Import-path and file-path completion.
//! rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion]
//! rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_objects]
//! rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_performance]
use crate::code_actions::relative_import_path;
use crate::duty::{Checkpoint, Stopped};
use crate::utf16::{utf16_len, LineMap};
use lsp_types::{
    CompletionItem, CompletionItemKind, CompletionTextEdit, Position, Range, TextEdit, Url,
};
use reqlan_parse::{resolve_rq_path, ImportRootMapping, Model, TopLevelElement};
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
pub enum CompletionSite {
    ImportPath(PathEdit),
    AnonymousPath(PathEdit),
    QualifiedFile { path: String, idea_prefix: String, replace: Range },
    Reference { prefix: String, replace: Range },
}

pub struct PathEdit {
    pub prefix: String,
    pub replace: Range,
    /// Closing quote appended to an import-path insert. Anonymous paths omit it.
    pub closing: Option<char>,
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
    if let Some(site) = qualified_site(prefix, pos) {
        return Some(site);
    }
    if let Some(site) = anonymous_site(prefix, pos) {
        return Some(site);
    }
    if let Some(site) = import_site(prefix, suffix, pos) {
        return Some(site);
    }
    reference_site(prefix, pos)
        .map(|site| CompletionSite::Reference { prefix: site.0, replace: site.1 })
}

/// `.rq` files and directories, or every file and directory when `extension` is `None`.
pub fn collect_path_items(
    cache: &mut PathCompletionCache,
    from_file: &Path,
    workspace: Option<&Path>,
    roots: &[ImportRootMapping],
    edit: &PathEdit,
    extension: Option<&str>,
    tick: &mut dyn Checkpoint,
) -> Result<Vec<CompletionItem>, Stopped> {
    let key = assembly_key(from_file, workspace, roots, extension);
    cache.ensure_assembly(&key, from_file, workspace, roots, extension, tick)?;
    let query_lower = edit.prefix.to_lowercase();
    let stripped_query = strip_path_separators(&query_lower);
    let want_segments = edit.prefix.ends_with('/');
    let mut picked = Vec::new();
    let mut seen = HashSet::new();
    if let Some(assembly) = cache.assemblies.get(&key) {
        for (index, item) in assembly.ranked.iter().enumerate() {
            if !ranked_matches(item, &query_lower, &stripped_query) {
                continue;
            }
            if want_segments {
                seen.insert(item.label.clone());
            }
            picked.push(index);
            if picked.len() == MAX_RESULTS {
                break;
            }
        }
    }
    let mut extras = Vec::new();
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
                extras.push(rank_candidate(
                    from_dir,
                    Candidate {
                        label,
                        target: dir.join(&entry.name),
                        is_directory: entry.is_directory,
                    },
                ));
            }
        }
    }
    let filter = if edit.prefix.is_empty() { None } else { Some(edit.prefix.as_str()) };
    let Some(assembly) = cache.assemblies.get(&key) else {
        return Ok(Vec::new());
    };
    let mut items: Vec<CompletionItem> =
        picked.iter().map(|index| path_item(&assembly.ranked[*index], edit, filter)).collect();
    if !extras.is_empty() {
        items.extend(extras.iter().map(|extra| path_item(extra, edit, filter)));
        items.sort_by(|left, right| left.sort_text.cmp(&right.sort_text));
        if items.len() > MAX_RESULTS {
            items.truncate(MAX_RESULTS);
        }
    }
    Ok(items)
}

fn assembly_key(
    from_file: &Path,
    workspace: Option<&Path>,
    roots: &[ImportRootMapping],
    extension: Option<&str>,
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
    key
}

impl PathCompletionCache {
    fn ensure_assembly(
        &mut self,
        key: &str,
        from_file: &Path,
        workspace: Option<&Path>,
        roots: &[ImportRootMapping],
        extension: Option<&str>,
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

fn ranked_matches(item: &RankedPath, query_lower: &str, stripped_query: &str) -> bool {
    if query_lower.is_empty() {
        return true;
    }
    if item.label_lower.contains(query_lower) {
        return true;
    }
    if stripped_query.is_empty() {
        return true;
    }
    if item.stripped.contains(stripped_query) {
        return true;
    }
    is_character_subsequence(&item.stripped, stripped_query)
}

fn path_item(candidate: &RankedPath, edit: &PathEdit, filter: Option<&str>) -> CompletionItem {
    let new_text = match edit.closing {
        Some(delimiter) => format!("{}{delimiter}", candidate.label),
        None => candidate.label.clone(),
    };
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
fn path_matches_query(path: &str, query: &str) -> bool {
    if query.is_empty() {
        return true;
    }
    let path_lower = path.to_lowercase();
    let query_lower = query.to_lowercase();
    if path_lower.contains(&query_lower) {
        return true;
    }
    let stripped_path = strip_path_separators(&path_lower);
    let stripped_query = strip_path_separators(&query_lower);
    if stripped_query.is_empty() {
        return true;
    }
    if stripped_path.contains(&stripped_query) {
        return true;
    }
    is_character_subsequence(&stripped_path, &stripped_query)
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
    }))
}

fn anonymous_site(prefix: &str, pos: Position) -> Option<CompletionSite> {
    let (content, _delimiter, content_start) = quoted_bracket(prefix)?;
    let start_col = utf16_len(&prefix[..content_start]);
    Some(CompletionSite::AnonymousPath(PathEdit {
        prefix: content,
        replace: Range { start: Position { line: pos.line, character: start_col }, end: pos },
        closing: None,
    }))
}

fn qualified_site(prefix: &str, pos: Position) -> Option<CompletionSite> {
    let mut index = prefix.len();
    while index > 0 {
        let ch = prefix[..index].chars().next_back()?;
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '.' {
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
    if !idea_prefix.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '.') {
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
    Some(CompletionSite::QualifiedFile {
        path: path.to_string(),
        idea_prefix: idea_prefix.to_string(),
        replace: Range {
            start: Position { line: pos.line, character: utf16_len(&prefix[..idea_start]) },
            end: pos,
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
    before[..bracket_start].chars().next_back() != Some('[')
}

fn reference_site(prefix: &str, pos: Position) -> Option<(String, Range)> {
    let start = prefix.rfind('[')?;
    let rest = &prefix[start + 1..];
    if rest.contains(']') || rest.contains('"') || rest.contains('\'') {
        return None;
    }
    let name = rest.trim_start_matches(|ch: char| ch.is_whitespace());
    let skipped = rest.len() - name.len();
    let name_start = start + 1 + skipped;
    Some((
        name.to_string(),
        Range {
            start: Position { line: pos.line, character: utf16_len(&prefix[..name_start]) },
            end: pos,
        },
    ))
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
        assert!(path_matches_query("../../parent/path.rq", "path"));
        assert!(path_matches_query("../../hello/inbetween/path/file.rq", "hellopath"));
        assert!(!path_matches_query("./other.rq", "path"));
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
}
