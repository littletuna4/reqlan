//! Open documents and a read-only view of each base's ideas index.
//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
use crate::analysis::{rename_edits, resolve_neighbor_file, DocModel, InboundReferencer};
use crate::code_actions::SymbolHit;
use crate::utf16::LineMap;
use lsp_types::{
    CodeActionOrCommand, CodeLens, Command, CompletionItem, Diagnostic, DiagnosticSeverity,
    DocumentHighlight, DocumentLink, GotoDefinitionResponse, Hover, InlayHint, NumberOrString,
    Position, Range, SemanticTokens, Url, WorkspaceEdit,
};
use reqlan_index::{
    find_comment_references_in_text, find_rq_ignore_error_target_lines, IdeaKind, IndexStore,
};
use reqlan_parse::{import_path_candidates, resolve_rq_path, ImportRootMapping};
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};

const NEIGHBOR_CAP: usize = 32;

struct OpenDoc {
    text: String,
    model: DocModel,
    path: Option<PathBuf>,
}

struct Neighbor {
    path: PathBuf,
    hash: u64,
    names: Vec<(String, u32)>,
    aliases: Vec<String>,
}

struct BaseIndex {
    root: PathBuf,
    store: IndexStore,
}

struct CommentDoc {
    text: String,
    path: PathBuf,
}

/// Language state for one server process.
/// Only open buffers keep a parse.
pub struct Session {
    documents: HashMap<String, OpenDoc>,
    comments: HashMap<String, CommentDoc>,
    folders: Vec<PathBuf>,
    indexes: Vec<BaseIndex>,
    neighbors: VecDeque<Neighbor>,
    /// Host push of referencer names, used when the index has no row yet.
    inbound_names: HashMap<String, Vec<(String, Vec<InboundReferencer>)>>,
    /// Host push of idea names for unresolved-reference quick fixes.
    name_catalog: Vec<SymbolHit>,
    /// When true, a hover shows the styled idea body. Default is on.
    idea_content_tooltip: bool,
}

impl Session {
    pub fn new() -> Self {
        Self {
            documents: HashMap::new(),
            comments: HashMap::new(),
            folders: Vec::new(),
            indexes: Vec::new(),
            neighbors: VecDeque::new(),
            inbound_names: HashMap::new(),
            name_catalog: Vec::new(),
            idea_content_tooltip: true,
        }
    }

    pub fn set_idea_content_tooltip(&mut self, enabled: bool) {
        self.idea_content_tooltip = enabled;
    }

    pub fn note_name_catalog(&mut self, entries: Vec<SymbolHit>) {
        self.name_catalog = entries;
    }

    pub fn document_count(&self) -> usize {
        self.documents.len() + self.comments.len()
    }

    pub fn comment_uris(&self) -> Vec<String> {
        let mut uris: Vec<String> = self.comments.keys().cloned().collect();
        uris.sort();
        uris
    }

    pub fn set_workspace_folders(&mut self, folders: &[PathBuf]) {
        self.folders = folders.to_vec();
        self.indexes.clear();
        for folder in folders {
            for base in discover_bases(folder) {
                let db = base.join(".reqlan").join("ideas-index.sqlite");
                if let Ok(store) = IndexStore::open_read_only(&db) {
                    self.indexes.push(BaseIndex { root: base, store });
                }
            }
        }
    }

    pub fn open(&mut self, uri: &str, text: String) {
        if is_rq_uri(uri) {
            self.comments.remove(uri);
            let path = uri_to_path(uri);
            let model = DocModel::parse(uri, text.clone(), path.as_deref());
            self.documents.insert(uri.to_string(), OpenDoc { text, model, path });
            return;
        }
        self.documents.remove(uri);
        let Some(path) = uri_to_path(uri) else {
            self.comments.remove(uri);
            return;
        };
        if !text.contains("rq:") {
            self.comments.remove(uri);
            return;
        }
        self.comments.insert(uri.to_string(), CommentDoc { text, path });
    }

    pub fn change(&mut self, uri: &str, text: String) {
        self.open(uri, text);
    }

    pub fn close(&mut self, uri: &str) {
        self.documents.remove(uri);
        self.comments.remove(uri);
        self.inbound_names.remove(uri);
    }

    pub fn note_inbound(&mut self, uri: &str, names: Vec<(String, Vec<InboundReferencer>)>) {
        self.inbound_names.insert(uri.to_string(), names);
    }

    pub fn diagnostics(&mut self, uri: &str) -> Vec<Diagnostic> {
        if self.comments.contains_key(uri) {
            return self.comment_diagnostics_for(uri);
        }
        let Some(doc) = self.documents.get(uri) else {
            return Vec::new();
        };
        let path = doc.path.clone();
        let roots = doc.model.roots.clone();
        let outbound = doc.model.neighbor_queries();
        let mut confirmed = std::collections::HashSet::new();
        let mut alias_confirmed = std::collections::HashSet::new();
        if let Some(from) = path.as_deref() {
            for (authored, idea) in outbound {
                if self.neighbor_has(from, &authored, &idea, &roots) {
                    confirmed.insert((authored, idea));
                } else if self.neighbor_binds_import(from, &authored, &idea, &roots) {
                    alias_confirmed.insert((authored, idea));
                }
            }
        }
        let parsed = {
            let Some(doc) = self.documents.get(uri) else {
                return Vec::new();
            };
            doc.model.diagnostics(
                |authored, idea| confirmed.contains(&(authored.to_string(), idea.to_string())),
                |authored, idea| {
                    alias_confirmed.contains(&(authored.to_string(), idea.to_string()))
                },
            )
        };
        let extra = self
            .documents
            .get(uri)
            .and_then(|doc| doc.path.clone().map(|path| (doc.text.clone(), path)));
        let mut out = parsed;
        if let Some((text, path)) = extra {
            out.extend(self.comment_diagnostics(&text, &path));
        }
        out
    }

    pub fn comment_diagnostics_for(&mut self, uri: &str) -> Vec<Diagnostic> {
        let Some(doc) = self.comments.get(uri) else {
            return Vec::new();
        };
        let text = doc.text.clone();
        let path = doc.path.clone();
        self.comment_diagnostics(&text, &path)
    }

    pub fn semantic_tokens(&self, uri: &str) -> Option<SemanticTokens> {
        self.documents.get(uri).map(|doc| doc.model.semantic_tokens())
    }

    pub fn first_body_indent(&self, uri: &str) -> Option<u32> {
        self.documents.get(uri).and_then(|doc| doc.model.first_body_indent())
    }

    pub fn links(&mut self, uri: &str) -> Vec<DocumentLink> {
        if self.comments.contains_key(uri) {
            return self.comment_links_for(uri);
        }
        let Some(doc) = self.documents.get(uri) else {
            return Vec::new();
        };
        let text = doc.text.clone();
        let path = doc.path.clone();
        let mut links = doc.model.links(uri);
        if let Some(path) = path {
            links.extend(self.comment_links(&text, &path));
        }
        links
    }

    pub fn definition(&mut self, uri: &str, pos: Position) -> Option<GotoDefinitionResponse> {
        let locations = self.documents.get(uri)?.model.definition(pos, uri);
        if locations.is_empty() {
            None
        } else {
            Some(GotoDefinitionResponse::Array(locations))
        }
    }

    pub fn hover(&self, uri: &str, pos: Position) -> Option<Hover> {
        let hit = self.documents.get(uri)?.model.hover_hit(pos)?;
        let value = if self.idea_content_tooltip {
            if let Some(markdown) = hit.markdown {
                markdown
            } else if let Some((path, idea)) = &hit.external {
                self.markdown_for_authored(uri, path, idea)
                    .unwrap_or_else(|| crate::hover_content::short_hover(&hit.name, &hit.summary))
            } else {
                crate::hover_content::short_hover(&hit.name, &hit.summary)
            }
        } else {
            crate::hover_content::short_hover(&hit.name, &hit.summary)
        };
        Some(Hover {
            contents: lsp_types::HoverContents::Markup(lsp_types::MarkupContent {
                kind: lsp_types::MarkupKind::Markdown,
                value,
            }),
            range: Some(hit.range),
        })
    }

    fn markdown_for_authored(&self, from_uri: &str, authored: &str, idea: &str) -> Option<String> {
        let path = self.documents.get(from_uri)?.model.resolve_path(authored)?;
        if let Some(markdown) = self.markdown_in_open(&path, idea) {
            return Some(markdown);
        }
        let text = std::fs::read_to_string(&path).ok()?;
        let parsed = reqlan_parse::parse_document(&text);
        crate::hover_content::markdown_for_name(&text, &parsed.model, idea)
    }

    fn markdown_in_open(&self, path: &Path, idea: &str) -> Option<String> {
        self.documents.values().find_map(|doc| {
            doc.path
                .as_ref()
                .filter(|doc_path| doc_path.as_path() == path)
                .and_then(|_| doc.model.idea_markdown(idea))
        })
    }

    pub fn highlights(&self, uri: &str, pos: Position) -> Vec<DocumentHighlight> {
        self.documents.get(uri).map(|doc| doc.model.highlights(pos)).unwrap_or_default()
    }

    pub fn completion(&self, uri: &str, pos: Position) -> Vec<CompletionItem> {
        let Some(doc) = self.documents.get(uri) else {
            return Vec::new();
        };
        let extra = self.index_names();
        doc.model.completion(pos, &extra)
    }

    pub fn prepare_rename(&self, uri: &str, pos: Position) -> Option<Range> {
        self.documents.get(uri)?.model.prepare_rename(pos)
    }

    pub fn rename(&self, uri: &str, pos: Position, new_name: &str) -> Option<WorkspaceEdit> {
        let old = self.documents.get(uri)?.model.name_at(pos)?;
        let mut changes = HashMap::new();
        for (doc_uri, doc) in &self.documents {
            let edits = rename_edits(&doc.text, &doc.model.lines, &old, new_name);
            if !edits.is_empty() {
                if let Ok(url) = Url::parse(doc_uri) {
                    changes.insert(url, edits);
                }
            }
        }
        if changes.is_empty() {
            None
        } else {
            Some(WorkspaceEdit {
                changes: Some(changes),
                document_changes: None,
                change_annotations: None,
            })
        }
    }

    pub fn code_actions(&mut self, uri: &str, range: Range) -> Vec<CodeActionOrCommand> {
        self.code_actions_for(uri, range, &[], &[])
    }

    pub fn code_actions_for(
        &mut self,
        uri: &str,
        range: Range,
        context_diagnostics: &[Diagnostic],
        only: &[String],
    ) -> Vec<CodeActionOrCommand> {
        let server_diagnostics = self.diagnostics(uri);
        let symbols = self.foreign_symbols(uri);
        self.documents
            .get(uri)
            .map(|doc| {
                doc.model.code_actions(
                    range,
                    uri,
                    context_diagnostics,
                    only,
                    &server_diagnostics,
                    &symbols,
                )
            })
            .unwrap_or_default()
    }

    fn foreign_symbols(&self, from_uri: &str) -> Vec<SymbolHit> {
        let mut symbols = Vec::new();
        for (uri, doc) in &self.documents {
            if uri == from_uri {
                continue;
            }
            for (name, kind) in doc.model.exported_names() {
                symbols.push(SymbolHit { name, kind: kind.to_string(), file_uri: uri.clone() });
            }
        }
        for hit in &self.name_catalog {
            if hit.file_uri != from_uri {
                symbols.push(hit.clone());
            }
        }
        for index in &self.indexes {
            let Ok(ideas) = index.store.list_all_ideas() else {
                continue;
            };
            for idea in ideas {
                if matches!(idea.kind, IdeaKind::Ideaset) {
                    continue;
                }
                let path = if Path::new(&idea.file_uri).is_absolute() {
                    PathBuf::from(&idea.file_uri)
                } else {
                    index.root.join(&idea.file_uri)
                };
                let Ok(file_uri) = Url::from_file_path(&path) else {
                    continue;
                };
                let kind = match idea.kind {
                    IdeaKind::Oneliner => "oneliner",
                    IdeaKind::Block => "idea",
                    IdeaKind::Ideaset => "ideaset",
                };
                symbols.push(SymbolHit {
                    name: idea.name,
                    kind: kind.to_string(),
                    file_uri: file_uri.to_string(),
                });
            }
        }
        symbols
    }

    pub fn code_lenses(&self, uri: &str) -> Vec<CodeLens> {
        let count = self.file_inbound_count(uri);
        if count == 0 {
            return Vec::new();
        }
        vec![CodeLens {
            range: Range::default(),
            command: Some(Command {
                title: format!("{count} inbound file references"),
                command: "reqlan.openInboundFileReferencesSummary".into(),
                arguments: Some(vec![serde_json::json!(uri)]),
            }),
            data: None,
        }]
    }

    pub fn inlays(&self, uri: &str) -> Vec<InlayHint> {
        let Some(doc) = self.documents.get(uri) else {
            return Vec::new();
        };
        let names = self.idea_inbound_names(uri);
        doc.model.inlays(uri, &names)
    }

    pub fn file_reference_at(&self, uri: &str, pos: Position) -> Option<serde_json::Value> {
        self.documents.get(uri)?.model.file_reference_at(pos)
    }

    pub fn wildcard_at(&self, uri: &str, pos: Position) -> Option<serde_json::Value> {
        self.documents.get(uri)?.model.wildcard_at(pos, uri)
    }

    pub fn search_site(&self, uri: &str, range: Range) -> Option<serde_json::Value> {
        self.documents.get(uri)?.model.search_site(range, uri)
    }

    fn comment_links_for(&mut self, uri: &str) -> Vec<DocumentLink> {
        let Some(doc) = self.comments.get(uri) else {
            return Vec::new();
        };
        let text = doc.text.clone();
        let path = doc.path.clone();
        self.comment_links(&text, &path)
    }

    fn comment_links(&mut self, text: &str, source: &Path) -> Vec<DocumentLink> {
        let lines = LineMap::new(text);
        let mut links = Vec::new();
        for site in self.comment_sites(text, source) {
            let CommentSite::Link { start, end, idea, target } = site else {
                continue;
            };
            let Ok(url) = Url::from_file_path(&target) else {
                continue;
            };
            links.push(DocumentLink {
                range: lines.range(text, start, end),
                target: Some(url),
                tooltip: Some(idea),
                data: None,
            });
        }
        links
    }

    fn comment_diagnostics(&mut self, text: &str, source: &Path) -> Vec<Diagnostic> {
        let lines = LineMap::new(text);
        let mut out = Vec::new();
        for site in self.comment_sites(text, source) {
            let (start, end, message, code) = match site {
                CommentSite::Link { .. } => continue,
                CommentSite::MissingFile { start, end, path } => (
                    start,
                    end,
                    format!("Could not resolve comment reference file '{path}'."),
                    "comment-reference-missing-file",
                ),
                CommentSite::MissingIdea { start, end, idea } => (
                    start,
                    end,
                    format!("Could not resolve comment reference to idea '{idea}'."),
                    "comment-reference-missing-idea",
                ),
            };
            out.push(Diagnostic {
                range: lines.range(text, start, end),
                message,
                severity: Some(DiagnosticSeverity::ERROR),
                source: Some("reqlan".into()),
                code: Some(NumberOrString::String(code.into())),
                ..Diagnostic::default()
            });
        }
        out
    }

    fn comment_sites(&mut self, text: &str, source: &Path) -> Vec<CommentSite> {
        let ignored = find_rq_ignore_error_target_lines(text);
        let roots = self.import_roots(source);
        let workspace = self.workspace_for(source);
        let mut sites = Vec::new();
        for reference in find_comment_references_in_text(text) {
            let site = self.resolve_comment(source, &reference, workspace.as_deref(), &roots);
            if matches!(site, CommentSite::Link { .. }) || !ignored.contains(&reference.line) {
                sites.push(site);
            }
        }
        sites
    }

    fn resolve_comment(
        &mut self,
        source: &Path,
        reference: &reqlan_index::CommentReference,
        workspace: Option<&Path>,
        roots: &[ImportRootMapping],
    ) -> CommentSite {
        let from = source.to_string_lossy();
        if let Some(authored) = reference.path.clone() {
            let mut found = None;
            for candidate in import_path_candidates(&authored) {
                let resolved = resolve_rq_path(&candidate, &from, roots);
                let absolute = absolute_candidate(&resolved, workspace, source);
                if self.path_is_file(&absolute) {
                    found = Some(absolute);
                    break;
                }
            }
            let Some(file) = found else {
                return CommentSite::MissingFile {
                    start: reference.start,
                    end: reference.end,
                    path: authored,
                };
            };
            if self.path_declares(&file, &reference.idea) {
                return CommentSite::Link {
                    start: reference.start,
                    end: reference.end,
                    idea: reference.idea.clone(),
                    target: file,
                };
            }
            return CommentSite::MissingIdea {
                start: reference.start,
                end: reference.end,
                idea: reference.idea.clone(),
            };
        }
        if let Some(target) = self.unqualified_file(&reference.idea) {
            return CommentSite::Link {
                start: reference.start,
                end: reference.end,
                idea: reference.idea.clone(),
                target,
            };
        }
        CommentSite::MissingIdea {
            start: reference.start,
            end: reference.end,
            idea: reference.idea.clone(),
        }
    }

    fn import_roots(&self, source: &Path) -> Vec<ImportRootMapping> {
        let workspace = self.workspace_for(source).unwrap_or_else(|| source.to_path_buf());
        reqlan_index::load_applying_rq_config(&workspace, Some(source)).import_roots
    }

    fn workspace_for(&self, source: &Path) -> Option<PathBuf> {
        let mut best: Option<&Path> = None;
        for folder in &self.folders {
            if source.starts_with(folder)
                && best.is_none_or(|current| folder.as_os_str().len() > current.as_os_str().len())
            {
                best = Some(folder);
            }
        }
        best.map(Path::to_path_buf)
    }

    fn path_is_file(&self, path: &Path) -> bool {
        self.documents.values().any(|doc| doc.path.as_deref() == Some(path)) || path.is_file()
    }

    fn path_declares(&mut self, path: &Path, idea: &str) -> bool {
        let open = self
            .documents
            .values()
            .find(|doc| doc.path.as_deref() == Some(path))
            .map(|doc| doc.model.has_idea(idea));
        if let Some(has) = open {
            return has;
        }
        self.cached_neighbor_line(path, idea).is_some()
    }

    fn unqualified_file(&self, idea: &str) -> Option<PathBuf> {
        let mut paths: Vec<PathBuf> =
            self.documents.values().filter_map(|doc| doc.path.clone()).collect();
        paths.sort();
        for path in &paths {
            let has = self
                .documents
                .values()
                .find(|doc| doc.path.as_deref() == Some(path.as_path()))
                .is_some_and(|doc| doc.model.has_idea(idea));
            if has {
                return Some(path.clone());
            }
        }
        for index in &self.indexes {
            let Ok(ideas) = index.store.list_all_ideas() else {
                continue;
            };
            if let Some(row) = ideas.into_iter().find(|row| row.name == idea) {
                let path = PathBuf::from(&row.file_uri);
                return Some(if path.is_absolute() { path } else { index.root.join(path) });
            }
        }
        None
    }

    fn index_names(&self) -> Vec<String> {
        let mut names = Vec::new();
        for index in &self.indexes {
            if let Ok(ideas) = index.store.list_all_ideas() {
                for idea in ideas {
                    names.push(idea.name);
                }
            }
        }
        names
    }

    fn idea_inbound_names(&self, uri: &str) -> Vec<(String, Vec<InboundReferencer>)> {
        if let Some(pushed) = self.inbound_names.get(uri) {
            if !pushed.is_empty() {
                return pushed
                    .iter()
                    .map(|(idea, names)| (idea.clone(), sort_referencers(names.clone())))
                    .collect();
            }
        }
        let mut names: HashMap<String, Vec<InboundReferencer>> = HashMap::new();
        for index in &self.indexes {
            let relative = index_uri(&index.root, uri);
            let Ok(rows) = index.store.inbound_for_file(&relative) else {
                continue;
            };
            for row in rows {
                let kind = row.get("kind").and_then(|value| value.as_str()).unwrap_or("");
                if kind != "references" && kind != "wildcard_reference" {
                    continue;
                }
                let Some(target) = row.get("target_name").and_then(|value| value.as_str()) else {
                    continue;
                };
                let Some(source) = row.get("source_name").and_then(|value| value.as_str()) else {
                    continue;
                };
                let source_file =
                    row.get("source_file_uri").and_then(|value| value.as_str()).unwrap_or("");
                if source_file == relative.as_str() {
                    continue;
                }
                let line = row.get("source_idea_line").and_then(|value| value.as_u64()).unwrap_or(0)
                    as u32;
                let list = names.entry(target.to_string()).or_default();
                if list.iter().any(|referencer| referencer.name == source) {
                    continue;
                }
                list.push(InboundReferencer {
                    name: source.to_string(),
                    uri: file_uri_in_base(&index.root, source_file),
                    line,
                });
            }
        }
        names.into_iter().map(|(idea, referencers)| (idea, sort_referencers(referencers))).collect()
    }

    fn file_inbound_count(&self, uri: &str) -> u32 {
        let mut count = 0u32;
        for index in &self.indexes {
            let relative = index_uri(&index.root, uri);
            let Ok(rows) = index.store.inbound_for_file(&relative) else {
                continue;
            };
            for row in rows {
                if row.get("kind").and_then(|value| value.as_str()) == Some("file_reference") {
                    count += 1;
                }
            }
        }
        count
    }

    fn neighbor_has(
        &mut self,
        from: &Path,
        authored: &str,
        idea: &str,
        roots: &[reqlan_parse::ImportRootMapping],
    ) -> bool {
        let Some(path) = resolve_neighbor_file(from, authored, roots) else {
            return false;
        };
        if let Some(open) =
            self.documents.values().find(|doc| doc.path.as_deref() == Some(path.as_path()))
        {
            return open.model.has_idea(idea);
        }
        self.cached_neighbor_line(&path, idea).is_some()
    }

    fn neighbor_binds_import(
        &mut self,
        from: &Path,
        authored: &str,
        idea: &str,
        roots: &[reqlan_parse::ImportRootMapping],
    ) -> bool {
        let Some(path) = resolve_neighbor_file(from, authored, roots) else {
            return false;
        };
        if let Some(open) =
            self.documents.values().find(|doc| doc.path.as_deref() == Some(path.as_path()))
        {
            return open.model.binds_import(idea);
        }
        self.ensure_neighbor(&path)
            .is_some_and(|entry| entry.aliases.iter().any(|name| name == idea))
    }

    fn cached_neighbor_line(&mut self, path: &Path, idea: &str) -> Option<u32> {
        self.ensure_neighbor(path)?
            .names
            .iter()
            .find(|(name, _)| name == idea)
            .map(|(_, line)| *line)
    }

    fn ensure_neighbor(&mut self, path: &Path) -> Option<&Neighbor> {
        let text = std::fs::read_to_string(path).ok()?;
        let hash = hash_text(&text);
        if let Some(index) =
            self.neighbors.iter().position(|entry| entry.path == path && entry.hash == hash)
        {
            return self.neighbors.get(index);
        }
        let symbolic =
            reqlan_index::analyze_local_symbolic(&path.display().to_string(), &text, &[]);
        let names: Vec<(String, u32)> =
            symbolic.ideas.into_iter().map(|idea| (idea.name, idea.line_start)).collect();
        let aliases = symbolic.import_bindings.into_iter().map(|binding| binding.name).collect();
        self.neighbors.push_back(Neighbor { path: path.to_path_buf(), hash, names, aliases });
        while self.neighbors.len() > NEIGHBOR_CAP {
            self.neighbors.pop_front();
        }
        self.neighbors.back()
    }
}

impl Default for Session {
    fn default() -> Self {
        Self::new()
    }
}

fn discover_bases(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    walk_bases(root, 0, &mut out);
    out
}

fn walk_bases(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    if dir.join(".reqlan").is_dir() {
        out.push(dir.to_path_buf());
    }
    if depth >= 6 {
        return;
    }
    let Ok(read) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in read.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" {
            continue;
        }
        walk_bases(&path, depth + 1, out);
    }
}

enum CommentSite {
    Link { start: usize, end: usize, idea: String, target: PathBuf },
    MissingFile { start: usize, end: usize, path: String },
    MissingIdea { start: usize, end: usize, idea: String },
}

pub(crate) fn is_rq_uri(uri: &str) -> bool {
    let path = uri.split('?').next().unwrap_or(uri);
    let path = path.split('#').next().unwrap_or(path);
    path.to_ascii_lowercase().ends_with(".rq")
}

fn absolute_candidate(resolved: &str, workspace: Option<&Path>, source: &Path) -> PathBuf {
    let path = PathBuf::from(resolved);
    if path.is_absolute() {
        return path;
    }
    if let Some(root) = workspace {
        return root.join(&path);
    }
    source.parent().unwrap_or(Path::new("/")).join(path)
}

fn uri_to_path(uri: &str) -> Option<PathBuf> {
    Url::parse(uri).ok()?.to_file_path().ok()
}

fn sort_referencers(mut referencers: Vec<InboundReferencer>) -> Vec<InboundReferencer> {
    referencers.sort_by(|left, right| left.name.cmp(&right.name));
    referencers.dedup_by(|left, right| left.name == right.name);
    referencers
}

fn file_uri_in_base(root: &Path, file: &str) -> String {
    if file.contains("://") {
        return file.to_string();
    }
    let path = PathBuf::from(file);
    let path = if path.is_absolute() { path } else { root.join(path) };
    Url::from_file_path(path).map(|uri| uri.to_string()).unwrap_or_else(|_| file.to_string())
}

fn index_uri(root: &Path, uri: &str) -> String {
    let Some(path) = uri_to_path(uri) else {
        return uri.to_string();
    };
    path.strip_prefix(root)
        .map(|relative| relative.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| path.to_string_lossy().replace('\\', "/"))
}

fn hash_text(text: &str) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in text.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}
