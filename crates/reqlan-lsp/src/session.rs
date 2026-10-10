//! Open documents and a read-only view of each base's ideas index.
//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
//! rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".open_file_algorithm]
//! rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".open_file_hot_path]
//! rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".lazy_features_after_outbound]
use crate::analysis::{
    line_range, rename_edits, resolve_neighbor_file, AttributeCatalog, DocModel, InboundReferencer,
};
use crate::code_actions::SymbolHit;
use crate::utf16::LineMap;
use lsp_types::{
    CodeActionOrCommand, CodeLens, Command, CompletionItem, Diagnostic, DiagnosticSeverity,
    DocumentHighlight, DocumentLink, GotoDefinitionResponse, Hover, InlayHint, Location,
    NumberOrString, Position, Range, SemanticTokens, TextEdit, Url, WorkspaceEdit,
};
use reqlan_index::{
    find_comment_references_in_text, find_rq_ignore_error_target_lines, idea_id, IdeaKind,
    IndexStore,
};
use reqlan_parse::{
    import_path_candidates, parse_document, resolve_rq_path, ImportRootMapping, Model,
};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

const NEIGHBOR_CAP: usize = 32;

struct OpenDoc {
    model: DocModel,
    path: Option<PathBuf>,
}

/// A closed `.rq` file parsed once. A lookup checks the file stamp, not the text.
struct Neighbor {
    path: PathBuf,
    stamp: FileStamp,
    text: String,
    model: Model,
    names: Vec<(String, Range)>,
    bindings: Vec<(String, u32)>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
struct FileStamp {
    modified: SystemTime,
    len: u64,
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
    /// Host push of referencer names. Presence of a URI means snapshot-first (no SQLite).
    inbound_names: HashMap<String, Vec<(String, Vec<InboundReferencer>)>>,
    /// Host push of file-level inbound referencers for the file CodeLens.
    file_referencers: HashMap<String, Vec<InboundReferencer>>,
    /// Host push of idea names for unresolved-reference quick fixes and completion.
    name_catalog: Vec<SymbolHit>,
    /// Host push of attribute keys and values for completion.
    attribute_catalog: AttributeCatalog,
    /// When true, a hover shows the styled idea body. Default is on.
    idea_content_tooltip: bool,
    /// When true, emit inbound reference inlay hints. Default is off (matches VS Code setting).
    reference_inlay_hints: bool,
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
            file_referencers: HashMap::new(),
            name_catalog: Vec::new(),
            attribute_catalog: AttributeCatalog::endorsed(),
            idea_content_tooltip: true,
            reference_inlay_hints: false,
        }
    }

    pub fn set_idea_content_tooltip(&mut self, enabled: bool) {
        self.idea_content_tooltip = enabled;
    }

    pub fn set_reference_inlay_hints(&mut self, enabled: bool) {
        self.reference_inlay_hints = enabled;
    }

    pub fn note_name_catalog(&mut self, entries: Vec<SymbolHit>) {
        self.name_catalog = entries;
    }

    pub fn note_attribute_catalog(&mut self, catalog: AttributeCatalog) {
        self.attribute_catalog = catalog;
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
            let model = DocModel::parse(uri, text, path.as_deref());
            self.documents.insert(uri.to_string(), OpenDoc { model, path });
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

    /// Reparse with the import roots loaded at open. A change does not read the config again.
    pub fn change(&mut self, uri: &str, text: String) {
        let Some(doc) = self.documents.remove(uri) else {
            return self.open(uri, text);
        };
        let model = DocModel::parse_with_roots(uri, text, doc.path.as_deref(), doc.model.roots);
        self.documents.insert(uri.to_string(), OpenDoc { model, path: doc.path });
    }

    pub fn close(&mut self, uri: &str) {
        self.documents.remove(uri);
        self.comments.remove(uri);
        self.inbound_names.remove(uri);
        self.file_referencers.remove(uri);
    }

    pub fn note_inbound(
        &mut self,
        uri: &str,
        names: Vec<(String, Vec<InboundReferencer>)>,
        file_referencers: Vec<InboundReferencer>,
    ) {
        self.inbound_names.insert(uri.to_string(), names);
        self.file_referencers.insert(uri.to_string(), file_referencers);
    }

    /// Hot-path diagnostics: this buffer plus import neighbors. No path-qualified confirm.
    pub fn diagnostics_hot(&mut self, uri: &str) -> Vec<Diagnostic> {
        self.diagnostics_with(uri, false)
    }

    /// Full diagnostics after qualified neighbor confirm.
    pub fn diagnostics(&mut self, uri: &str) -> Vec<Diagnostic> {
        self.diagnostics_with(uri, true)
    }

    fn diagnostics_with(&mut self, uri: &str, confirm_path_qualified: bool) -> Vec<Diagnostic> {
        if self.comments.contains_key(uri) {
            return self.comment_diagnostics_for(uri);
        }
        let Some(doc) = self.documents.get(uri) else {
            return Vec::new();
        };
        let path = doc.path.clone();
        let roots = doc.model.roots.clone();
        let mut outbound = doc.model.import_neighbor_queries();
        if confirm_path_qualified {
            outbound.extend(doc.model.qualified_neighbor_queries());
        }
        let mut confirmed = HashSet::new();
        let mut alias_confirmed = HashSet::new();
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
                confirm_path_qualified,
            )
        };
        let mut out = parsed;
        if let Some(doc) = self.documents.remove(uri) {
            if let Some(path) = doc.path.as_deref().filter(|_| doc.model.text.contains("rq:")) {
                out.extend(self.comment_diagnostics(&doc.model.text, path));
            }
            self.documents.insert(uri.to_string(), doc);
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
        let Some(doc) = self.documents.remove(uri) else {
            return Vec::new();
        };
        let mut links = doc.model.links(uri, |path, idea| self.neighbor_range(path, idea));
        if let Some(path) = doc.path.as_deref().filter(|_| doc.model.text.contains("rq:")) {
            links.extend(self.comment_links(&doc.model.text, path));
        }
        self.documents.insert(uri.to_string(), doc);
        links
    }

    pub fn definition(&mut self, uri: &str, pos: Position) -> Option<GotoDefinitionResponse> {
        let Some(doc) = self.documents.remove(uri) else {
            return None;
        };
        let links = doc.model.definition(pos, uri, |path, idea| self.neighbor_range(path, idea));
        self.documents.insert(uri.to_string(), doc);
        if links.is_empty() {
            None
        } else {
            Some(GotoDefinitionResponse::Link(links))
        }
    }

    pub fn hover(&mut self, uri: &str, pos: Position) -> Option<Hover> {
        let hit = self.documents.get(uri)?.model.hover_hit(pos, self.idea_content_tooltip)?;
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

    /// Idea body from the open buffer or the neighbor cache. A hover does not reparse the file.
    fn markdown_for_authored(
        &mut self,
        from_uri: &str,
        authored: &str,
        idea: &str,
    ) -> Option<String> {
        let path = self.documents.get(from_uri)?.model.resolve_path(authored)?;
        if let Some(doc) = self.open_doc_at(&path) {
            return doc.model.idea_markdown(idea);
        }
        let entry = self.ensure_neighbor(&path)?;
        crate::hover_content::markdown_for_name(&entry.text, &entry.model, idea)
    }

    fn open_doc_at(&self, path: &Path) -> Option<&OpenDoc> {
        self.documents.values().find(|doc| doc.path.as_deref() == Some(path))
    }

    pub fn highlights(&self, uri: &str, pos: Position) -> Vec<DocumentHighlight> {
        self.documents.get(uri).map(|doc| doc.model.highlights(pos)).unwrap_or_default()
    }

    pub fn completion(&self, uri: &str, pos: Position) -> Vec<CompletionItem> {
        let Some(doc) = self.documents.get(uri) else {
            return Vec::new();
        };
        let extra = self.completion_names(uri);
        doc.model.completion(pos, &extra, &self.attribute_catalog)
    }

    pub fn prepare_rename(&self, uri: &str, pos: Position) -> Option<Range> {
        self.documents.get(uri)?.model.prepare_rename(pos)
    }

    pub fn rename(&self, uri: &str, pos: Position, new_name: &str) -> Option<WorkspaceEdit> {
        let old = self.documents.get(uri)?.model.name_at(pos)?;
        let mut changes: HashMap<Url, Vec<TextEdit>> = HashMap::new();
        let mut touched: HashSet<String> = HashSet::new();
        for (doc_uri, doc) in &self.documents {
            let edits = rename_edits(&doc.model.text, &doc.model.lines, &old, new_name);
            if !edits.is_empty() {
                if let Ok(url) = Url::parse(doc_uri) {
                    changes.insert(url, edits);
                    touched.insert(doc_uri.clone());
                }
            }
        }
        for (doc_uri, doc) in &self.comments {
            let edits = rename_edits(&doc.text, &LineMap::new(&doc.text), &old, new_name);
            if !edits.is_empty() {
                if let Ok(url) = Url::parse(doc_uri) {
                    changes.insert(url, edits);
                    touched.insert(doc_uri.clone());
                }
            }
        }
        for (file_uri, text) in self.index_rename_texts(&old) {
            if touched.contains(&file_uri) {
                continue;
            }
            let edits = rename_edits(&text, &LineMap::new(&text), &old, new_name);
            if edits.is_empty() {
                continue;
            }
            if let Ok(url) = Url::parse(&file_uri) {
                changes.insert(url, edits);
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

    pub fn references(&self, uri: &str, pos: Position) -> Vec<Location> {
        let Some(name) = self.documents.get(uri).and_then(|doc| doc.model.name_at(pos)) else {
            return Vec::new();
        };
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        for (doc_uri, doc) in &self.documents {
            for location in doc.model.reference_locations(doc_uri, &name) {
                let key = location_key(&location);
                if seen.insert(key) {
                    out.push(location);
                }
            }
        }
        for (doc_uri, doc) in &self.comments {
            let lines = LineMap::new(&doc.text);
            for reference in find_comment_references_in_text(&doc.text) {
                if reference.idea != name {
                    continue;
                }
                let location = Location {
                    uri: Url::parse(doc_uri)
                        .unwrap_or_else(|_| Url::parse("file:///reqlan.rq").expect("uri")),
                    range: lines.range(&doc.text, reference.start, reference.end),
                };
                let key = location_key(&location);
                if seen.insert(key) {
                    out.push(location);
                }
            }
        }
        for location in self.index_reference_locations(&name) {
            let key = location_key(&location);
            if seen.insert(key) {
                out.push(location);
            }
        }
        out
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
        if !self.reference_inlay_hints {
            return Vec::new();
        }
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
        if let Some(doc) = self.open_doc_at(path) {
            return doc.model.has_idea(idea);
        }
        self.neighbor_declares(path, idea)
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
        for hit in &self.name_catalog {
            if hit.name == idea {
                if let Some(path) =
                    Url::parse(&hit.file_uri).ok().and_then(|url| url.to_file_path().ok())
                {
                    return Some(path);
                }
            }
        }
        None
    }

    fn completion_names(&self, from_uri: &str) -> Vec<String> {
        let mut names = Vec::new();
        let mut seen = HashSet::new();
        for hit in &self.name_catalog {
            if hit.file_uri != from_uri && seen.insert(hit.name.clone()) {
                names.push(hit.name.clone());
            }
        }
        if !names.is_empty() {
            return names;
        }
        for index in &self.indexes {
            if let Ok(ideas) = index.store.list_all_ideas() {
                for idea in ideas {
                    if seen.insert(idea.name.clone()) {
                        names.push(idea.name);
                    }
                }
            }
        }
        names
    }

    fn idea_inbound_names(&self, uri: &str) -> Vec<(String, Vec<InboundReferencer>)> {
        // Snapshot-first: once the host pushes for this URI, never open SQLite here.
        if let Some(pushed) = self.inbound_names.get(uri) {
            return pushed
                .iter()
                .map(|(idea, names)| (idea.clone(), sort_referencers(names.clone())))
                .collect();
        }
        Vec::new()
    }

    fn file_inbound_count(&self, uri: &str) -> u32 {
        if let Some(rows) = self.file_referencers.get(uri) {
            return rows.len() as u32;
        }
        0
    }

    fn index_rename_texts(&self, idea: &str) -> Vec<(String, String)> {
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        for index in &self.indexes {
            let Ok(ideas) = index.store.list_all_ideas() else {
                continue;
            };
            for row in ideas {
                if row.name != idea {
                    continue;
                }
                let id = idea_id(&row.file_uri, &row.name);
                let Ok(edges) = index.store.get_edges_to(&id) else {
                    continue;
                };
                let mut files = HashSet::new();
                files.insert(row.file_uri.clone());
                for edge in edges {
                    if let Some(source) = edge.source_id.split_once('#').map(|(file, _)| file) {
                        files.insert(source.to_string());
                    }
                }
                for relative in files {
                    let path = if Path::new(&relative).is_absolute() {
                        PathBuf::from(&relative)
                    } else {
                        index.root.join(&relative)
                    };
                    let Ok(file_uri) = Url::from_file_path(&path) else {
                        continue;
                    };
                    let file_uri = file_uri.to_string();
                    if !seen.insert(file_uri.clone()) {
                        continue;
                    }
                    if let Ok(text) = std::fs::read_to_string(&path) {
                        out.push((file_uri, text));
                    }
                }
            }
        }
        out
    }

    fn index_reference_locations(&self, idea: &str) -> Vec<Location> {
        let mut out = Vec::new();
        for index in &self.indexes {
            let Ok(ideas) = index.store.list_all_ideas() else {
                continue;
            };
            for row in ideas {
                if row.name != idea {
                    continue;
                }
                let path = if Path::new(&row.file_uri).is_absolute() {
                    PathBuf::from(&row.file_uri)
                } else {
                    index.root.join(&row.file_uri)
                };
                if let Ok(uri) = Url::from_file_path(&path) {
                    out.push(Location {
                        uri,
                        range: Range {
                            start: Position { line: row.line_start, character: 0 },
                            end: Position {
                                line: row.line_start,
                                character: utf16_len_name(&row.name),
                            },
                        },
                    });
                }
                let id = idea_id(&row.file_uri, &row.name);
                let Ok(edges) = index.store.get_edges_to(&id) else {
                    continue;
                };
                for edge in edges {
                    let Some((source_file, _)) = edge.source_id.split_once('#') else {
                        continue;
                    };
                    let path = if Path::new(source_file).is_absolute() {
                        PathBuf::from(source_file)
                    } else {
                        index.root.join(source_file)
                    };
                    let Ok(uri) = Url::from_file_path(&path) else {
                        continue;
                    };
                    let line = edge.source_line.unwrap_or(0);
                    out.push(Location {
                        uri,
                        range: Range {
                            start: Position { line, character: 0 },
                            end: Position { line, character: utf16_len_name(idea) },
                        },
                    });
                }
            }
        }
        out
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
        self.path_declares(&path, idea)
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
        if let Some(doc) = self.open_doc_at(&path) {
            return doc.model.binds_import(idea);
        }
        self.ensure_neighbor(&path)
            .is_some_and(|entry| entry.bindings.iter().any(|(name, _)| name == idea))
    }

    fn neighbor_declares(&mut self, path: &Path, idea: &str) -> bool {
        self.ensure_neighbor(path)
            .is_some_and(|entry| entry.names.iter().any(|(name, _)| name == idea))
    }

    /// Name token of `idea` in `path`. An open buffer wins over the file on disk.
    fn neighbor_range(&mut self, path: &Path, idea: &str) -> Option<Range> {
        if let Some(doc) = self.open_doc_at(path) {
            return doc.model.idea_range(idea);
        }
        let entry = self.ensure_neighbor(path)?;
        if let Some((_, range)) = entry.names.iter().find(|(name, _)| name == idea) {
            return Some(*range);
        }
        entry
            .bindings
            .iter()
            .find(|(name, _)| name == idea)
            .map(|(name, line)| line_range(*line, name))
    }

    /// One `stat` when the cached parse is current. Read and parse only when the file changed.
    fn ensure_neighbor(&mut self, path: &Path) -> Option<&Neighbor> {
        let meta = std::fs::metadata(path).ok().filter(|meta| meta.is_file())?;
        let stamp = FileStamp { modified: meta.modified().ok()?, len: meta.len() };
        if let Some(index) = self.neighbors.iter().position(|entry| entry.path == path) {
            if self.neighbors[index].stamp == stamp {
                return self.neighbors.get(index);
            }
            self.neighbors.remove(index);
        }
        let text = std::fs::read_to_string(path).ok()?;
        let parsed = parse_document(&text);
        let lines = LineMap::new(&text);
        let mut names = Vec::new();
        for element in &parsed.model.elements {
            let (name, span) = match element {
                reqlan_parse::TopLevelElement::Idea(item) => (&item.name, item.span),
                reqlan_parse::TopLevelElement::OneLiner(item) => (&item.name, item.span),
                reqlan_parse::TopLevelElement::IdeaSet(item) => (&item.name, item.span),
                reqlan_parse::TopLevelElement::Anonymous(_) => continue,
            };
            let start = text
                .get(span.start..span.end)
                .and_then(|body| body.find(name.as_str()))
                .map_or(span.start, |offset| span.start + offset);
            names.push((name.clone(), lines.range(&text, start, start + name.len())));
        }
        let bindings = parsed.model.import_bindings();
        self.neighbors.push_back(Neighbor {
            path: path.to_path_buf(),
            stamp,
            text,
            model: parsed.model,
            names,
            bindings,
        });
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

fn location_key(location: &Location) -> String {
    format!(
        "{}:{}:{}:{}:{}",
        location.uri,
        location.range.start.line,
        location.range.start.character,
        location.range.end.line,
        location.range.end.character
    )
}

fn utf16_len_name(name: &str) -> u32 {
    name.encode_utf16().count() as u32
}
