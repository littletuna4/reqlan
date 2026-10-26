//! Open documents and a read-only view of each base's ideas index.
//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
//! rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".open_file_algorithm]
//! rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".open_file_hot_path]
//! rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".lazy_features_after_outbound]
use crate::analysis::{
    authored_path_span, file_landing_range, ident_span_from, line_range, location_url,
    rename_edits, resolve_neighbor_file, span_has, AttributeCatalog, DocModel, InboundReferencer,
};
use crate::code_actions::{import_fix_names, plan_from_import_edit, SymbolHit};
use crate::duty::{Checkpoint, Idle, Stopped};
use crate::path_completion::{
    collect_path_items, detect_site, file_symbols, relative_path_between, CompletionSite,
    FileSymbols, PathCompletionCache, PathEdit,
};
use crate::utf16::LineMap;
use lsp_types::{
    CodeActionOrCommand, CodeLens, Command, CompletionItem, CompletionItemKind, CompletionList,
    CompletionTextEdit, Diagnostic, DiagnosticSeverity, DocumentHighlight, DocumentLink,
    GotoDefinitionResponse, Hover, InlayHint, Location, LocationLink, NumberOrString, Position,
    Range, SelectionRange, SemanticTokens, TextDocumentContentChangeEvent, TextEdit, Url,
    WorkspaceEdit,
};
use reqlan_index::{
    find_applying_base_root, find_comment_references_in_text, find_rq_ignore_error_target_lines,
    idea_id, IdeaKind, IndexStore,
};
use reqlan_parse::{
    import_path_candidates, parse_document, resolve_rq_path, ImportRootMapping, Model, Span,
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
    /// Host push of attribute keys and values for completion.
    attribute_catalog: AttributeCatalog,
    /// When true, a hover shows the styled idea body. Default is on.
    idea_content_tooltip: bool,
    /// When true, emit inbound reference inlay hints. Default is off (matches VS Code setting).
    reference_inlay_hints: bool,
    path_cache: PathCompletionCache,
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
            attribute_catalog: AttributeCatalog::endorsed(),
            idea_content_tooltip: true,
            reference_inlay_hints: false,
            path_cache: PathCompletionCache::new(),
        }
    }

    pub fn path_completion_directory_reads(&self) -> u64 {
        self.path_cache.directory_reads()
    }

    pub fn set_idea_content_tooltip(&mut self, enabled: bool) {
        self.idea_content_tooltip = enabled;
    }

    pub fn set_reference_inlay_hints(&mut self, enabled: bool) {
        self.reference_inlay_hints = enabled;
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
            open_base_index(&mut self.indexes, folder);
        }
    }

    /// Replace open indexes with the bases from the extension's one workspace scan.
    /// Does not walk the tree.
    /// rq:["../../../reqlan rq/indexer/cache-reuse.rq".single_sync_walk]
    pub fn note_base_roots(&mut self, roots: &[PathBuf]) {
        self.indexes.clear();
        for root in roots {
            open_base_index(&mut self.indexes, root);
        }
    }

    pub fn open(&mut self, uri: &str, text: String) {
        if is_rq_uri(uri) {
            self.comments.remove(uri);
            let path = uri_to_path(uri);
            let workspace = self.alias_workspace(path.as_deref());
            let model = DocModel::parse(uri, text, path.as_deref(), workspace.as_deref());
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
        let workspace = self.alias_workspace(doc.path.as_deref());
        let model = DocModel::parse_with_roots(
            uri,
            text,
            doc.path.as_deref(),
            doc.model.roots,
            workspace.as_deref(),
        );
        self.documents.insert(uri.to_string(), OpenDoc { model, path: doc.path });
    }

    /// Splice incremental `didChange` edits, then reparse the whole buffer.
    /// An empty batch leaves the buffer. A ranged edit for a URI that is not open is dropped.
    /// A rangeless edit for an unknown URI opens that text.
    /// `.rq` buffers keep import roots via [Session::change]. Comment buffers go through [Session::open].
    /// rq:["../../../reqlan rq/extension/language/support/ts-lsp-vs-rust-gaps.rq".lsp_incremental_sync]
    pub fn apply_content_changes(
        &mut self,
        uri: &str,
        changes: &[TextDocumentContentChangeEvent],
    ) -> bool {
        if changes.is_empty() {
            return false;
        }
        let Some(current) = self.buffer_text(uri) else {
            if changes[0].range.is_some() {
                return false;
            }
            let text = crate::utf16::apply_content_changes("", changes);
            self.open(uri, text);
            return true;
        };
        let text = crate::utf16::apply_content_changes(&current, changes);
        if self.documents.contains_key(uri) {
            self.change(uri, text);
        } else {
            self.open(uri, text);
        }
        true
    }

    fn buffer_text(&self, uri: &str) -> Option<String> {
        if let Some(doc) = self.documents.get(uri) {
            return Some(doc.model.text.clone());
        }
        self.comments.get(uri).map(|doc| doc.text.clone())
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
        self.diagnostics_with(uri, false, &mut Idle).unwrap_or_default()
    }

    /// Full diagnostics after qualified neighbor confirm.
    pub fn diagnostics(&mut self, uri: &str) -> Vec<Diagnostic> {
        self.diagnostics_with(uri, true, &mut Idle).unwrap_or_default()
    }

    /// Confirm-pass diagnostics. `Err` means a newer client message is waiting.
    pub fn diagnostics_checked(
        &mut self,
        uri: &str,
        tick: &mut dyn Checkpoint,
    ) -> Result<Vec<Diagnostic>, Stopped> {
        self.diagnostics_with(uri, true, tick)
    }

    fn diagnostics_with(
        &mut self,
        uri: &str,
        confirm_path_qualified: bool,
        tick: &mut dyn Checkpoint,
    ) -> Result<Vec<Diagnostic>, Stopped> {
        if tick.tick("Checking references", 0, 1) {
            return Err(Stopped);
        }
        if self.comments.contains_key(uri) {
            return Ok(self.comment_diagnostics_for(uri));
        }
        let Some(doc) = self.documents.get(uri) else {
            return Ok(Vec::new());
        };
        let path = doc.path.clone();
        let roots = doc.model.roots.clone();
        let mut outbound = doc.model.import_neighbor_queries();
        if confirm_path_qualified {
            outbound.extend(doc.model.qualified_neighbor_queries());
        }
        let total = outbound.len().max(1) as u32;
        let mut confirmed = HashSet::new();
        let mut alias_confirmed = HashSet::new();
        if let Some(from) = path.as_deref() {
            for (index, (authored, idea)) in outbound.into_iter().enumerate() {
                if tick.tick("Checking references", index as u32, total) {
                    return Err(Stopped);
                }
                if self.neighbor_has(from, &authored, &idea, &roots) {
                    confirmed.insert((authored, idea));
                } else if self.neighbor_binds_import(from, &authored, &idea, &roots) {
                    alias_confirmed.insert((authored, idea));
                }
            }
        }
        let parsed = {
            let Some(doc) = self.documents.get(uri) else {
                return Ok(Vec::new());
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
        Ok(out)
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
        // File document links are stripped in the host. Ctrl+click uses definition.
        // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
        // rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".references_in_functional_code_comments]
        if self.comments.contains_key(uri) {
            let link = self.comment_definition_for(uri, pos)?;
            return Some(GotoDefinitionResponse::Link(vec![link]));
        }
        let Some(doc) = self.documents.remove(uri) else {
            return None;
        };
        let links = doc.model.definition(pos, uri, |path, idea| self.neighbor_range(path, idea));
        if !links.is_empty() {
            self.documents.insert(uri.to_string(), doc);
            return Some(GotoDefinitionResponse::Link(links));
        }
        let path = doc.path.clone();
        let text = doc.model.text.clone();
        self.documents.insert(uri.to_string(), doc);
        let link =
            path.as_ref().and_then(|path| self.comment_definition_at(&text, path, uri, pos))?;
        Some(GotoDefinitionResponse::Link(vec![link]))
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

    pub fn completion(&mut self, uri: &str, pos: Position) -> CompletionList {
        self.completion_with(uri, pos, &mut Idle).unwrap_or_else(|_| completion_list(Vec::new()))
    }

    pub fn completion_with(
        &mut self,
        uri: &str,
        pos: Position,
        tick: &mut dyn Checkpoint,
    ) -> Result<CompletionList, Stopped> {
        if tick.tick("Completing", 0, 1) {
            return Err(Stopped);
        }
        let attribute_items = self.documents.get(uri).and_then(|doc| {
            doc.model
                .attribute_completion_site(pos)
                .then(|| doc.model.completion(pos, &self.attribute_catalog))
        });
        if let Some(items) = attribute_items {
            return Ok(completion_list(items));
        }
        if !self.documents.contains_key(uri) {
            return Ok(completion_list(Vec::new()));
        }
        let site = self
            .documents
            .get(uri)
            .and_then(|doc| detect_site(&doc.model.text, &doc.model.lines, pos));
        match site {
            Some(CompletionSite::ImportPath(edit)) => {
                self.path_items(uri, &edit, Some(".rq"), tick)
            }
            Some(CompletionSite::AnonymousPath(edit)) => self.path_items(uri, &edit, None, tick),
            Some(CompletionSite::QualifiedFile { path, idea_prefix, replace }) => {
                Ok(self.qualified_items(uri, &path, &idea_prefix, replace))
            }
            Some(CompletionSite::Reference { prefix, replace }) => {
                Ok(self.reference_items(uri, &prefix, replace))
            }
            None => Ok(completion_list(Vec::new())),
        }
    }

    fn path_items(
        &mut self,
        uri: &str,
        edit: &PathEdit,
        extension: Option<&str>,
        tick: &mut dyn Checkpoint,
    ) -> Result<CompletionList, Stopped> {
        let (from, roots, workspace) = {
            let Some(doc) = self.documents.get(uri) else {
                return Ok(completion_list(Vec::new()));
            };
            (
                doc.path.clone(),
                doc.model.roots.clone(),
                doc.model.workspace_root().map(Path::to_path_buf),
            )
        };
        let Some(from) = from else {
            return Ok(completion_list(Vec::new()));
        };
        let items = collect_path_items(
            &mut self.path_cache,
            &from,
            workspace.as_deref(),
            &roots,
            edit,
            extension,
            tick,
        )?;
        Ok(completion_list(items))
    }

    fn qualified_items(
        &mut self,
        uri: &str,
        authored: &str,
        idea_prefix: &str,
        replace: Range,
    ) -> CompletionList {
        let resolved = self.documents.get(uri).and_then(|doc| doc.model.resolve_path(authored));
        let symbols = resolved
            .as_ref()
            .map(|path| self.symbols_at(path))
            .unwrap_or_else(|| FileSymbols { names: Vec::new(), sets: Vec::new() });
        completion_list(qualified_completion_items(&symbols, idea_prefix, authored, replace))
    }

    fn symbols_at(&mut self, path: &Path) -> FileSymbols {
        if let Some(symbols) = self
            .documents
            .values()
            .find(|doc| doc.path.as_deref() == Some(path))
            .map(|doc| file_symbols(doc.model.syntax()))
        {
            return symbols;
        }
        self.ensure_neighbor(path)
            .map(|neighbor| file_symbols(&neighbor.model))
            .unwrap_or(FileSymbols { names: Vec::new(), sets: Vec::new() })
    }

    fn reference_items(&self, uri: &str, prefix: &str, replace: Range) -> CompletionList {
        let (from, locals) = {
            let Some(doc) = self.documents.get(uri) else {
                return completion_list(Vec::new());
            };
            (doc.path.clone(), file_symbols(doc.model.syntax()).names)
        };
        let mut items = Vec::new();
        let mut seen = HashSet::new();
        for (name, _) in locals {
            if !prefix.is_empty() && !name.starts_with(prefix) {
                continue;
            }
            if !seen.insert(format!("local::{name}")) {
                continue;
            }
            items.push(reference_item(&name, true, None, None, replace));
        }
        let mut remote = 0usize;
        for (doc_uri, other) in &self.documents {
            if doc_uri == uri {
                continue;
            }
            let Some(path) = &other.path else {
                continue;
            };
            let file_uri = Url::from_file_path(path)
                .map(|url| url.to_string())
                .unwrap_or_else(|_| doc_uri.clone());
            for (name, importable) in file_symbols(other.model.syntax()).names {
                if self.push_remote_item(
                    uri,
                    prefix,
                    replace,
                    &from,
                    &name,
                    &file_uri,
                    importable,
                    &mut items,
                    &mut seen,
                    &mut remote,
                ) {
                    return completion_list(items);
                }
            }
        }
        for index in &self.indexes {
            let Ok(rows) = index.store.idea_names_with_prefix(prefix, 80) else {
                continue;
            };
            for row in rows {
                let Some(file_uri) = indexed_file_uri(index, &row.file_uri) else {
                    continue;
                };
                if self.push_remote_item(
                    uri,
                    prefix,
                    replace,
                    &from,
                    &row.name,
                    &file_uri,
                    row.kind != IdeaKind::Ideaset,
                    &mut items,
                    &mut seen,
                    &mut remote,
                ) {
                    return completion_list(items);
                }
            }
        }
        completion_list(items)
    }

    /// `true` when the remote list is full.
    fn push_remote_item(
        &self,
        uri: &str,
        prefix: &str,
        replace: Range,
        from: &Option<PathBuf>,
        name: &str,
        file_uri: &str,
        importable: bool,
        items: &mut Vec<CompletionItem>,
        seen: &mut HashSet<String>,
        remote: &mut usize,
    ) -> bool {
        if *remote >= 80 {
            return true;
        }
        if !prefix.is_empty() && !name.starts_with(prefix) {
            return false;
        }
        let target = path_of_file(file_uri);
        let same = match (from, &target) {
            (Some(from), Some(target)) => from == target,
            _ => file_uri == uri,
        };
        if same || !seen.insert(format!("{file_uri}::{name}")) {
            return false;
        }
        let import_path = from
            .as_ref()
            .zip(target.as_ref())
            .and_then(|(from, target)| relative_path_between(from, target));
        let edit = if importable {
            self.documents.get(uri).and_then(|doc| {
                import_path.as_ref().and_then(|path| {
                    plan_from_import_edit(
                        &doc.model.text,
                        &doc.model.lines,
                        doc.model.syntax(),
                        path,
                        name,
                    )
                })
            })
        } else {
            None
        };
        items.push(reference_item(name, false, import_path, edit, replace));
        *remote += 1;
        false
    }

    pub fn prepare_rename(&self, uri: &str, pos: Position) -> Option<Range> {
        self.documents.get(uri)?.model.prepare_rename(pos)
    }

    pub fn rename(&self, uri: &str, pos: Position, new_name: &str) -> Option<WorkspaceEdit> {
        self.rename_with(uri, pos, new_name, &mut Idle).ok().flatten()
    }

    pub fn rename_with(
        &self,
        uri: &str,
        pos: Position,
        new_name: &str,
        tick: &mut dyn Checkpoint,
    ) -> Result<Option<WorkspaceEdit>, Stopped> {
        let Some(old) = self.documents.get(uri).and_then(|doc| doc.model.name_at(pos)) else {
            return Ok(None);
        };
        let mut changes: HashMap<Url, Vec<TextEdit>> = HashMap::new();
        let mut touched: HashSet<String> = HashSet::new();
        let total = (self.documents.len() + self.comments.len() + self.indexes.len()).max(1) as u32;
        let mut done = 0u32;
        for (doc_uri, doc) in &self.documents {
            if tick.tick("Renaming", done, total) {
                return Err(Stopped);
            }
            done += 1;
            let edits = rename_edits(&doc.model.text, &doc.model.lines, &old, new_name);
            if !edits.is_empty() {
                if let Ok(url) = Url::parse(doc_uri) {
                    changes.insert(url, edits);
                    touched.insert(doc_uri.clone());
                }
            }
        }
        for (doc_uri, doc) in &self.comments {
            if tick.tick("Renaming", done, total) {
                return Err(Stopped);
            }
            done += 1;
            let edits = rename_edits(&doc.text, &LineMap::new(&doc.text), &old, new_name);
            if !edits.is_empty() {
                if let Ok(url) = Url::parse(doc_uri) {
                    changes.insert(url, edits);
                    touched.insert(doc_uri.clone());
                }
            }
        }
        for (file_uri, text) in self.index_rename_texts(&old, tick)? {
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
            Ok(None)
        } else {
            Ok(Some(WorkspaceEdit {
                changes: Some(changes),
                document_changes: None,
                change_annotations: None,
            }))
        }
    }

    /// Expand-selection chains for the open buffer. One chain per caret.
    /// rq:["../../../reqlan rq/extension/language/vsc-primitives.rq".selection_range]
    pub fn selection_ranges(
        &self,
        uri: &str,
        positions: &[Position],
    ) -> Option<Vec<SelectionRange>> {
        let doc = self.documents.get(uri)?;
        Some(positions.iter().copied().map(|pos| doc.model.selection_range(pos)).collect())
    }

    /// Outline symbols for the open buffer. One symbol per declared idea.
    pub fn document_symbols(&self, uri: &str) -> Option<Vec<lsp_types::DocumentSymbol>> {
        let doc = self.documents.get(uri)?;
        let symbols: Vec<lsp_types::DocumentSymbol> = doc
            .model
            .names
            .iter()
            .map(|loc| {
                #[allow(deprecated)]
                lsp_types::DocumentSymbol {
                    name: loc.name.clone(),
                    detail: None,
                    kind: lsp_types::SymbolKind::NAMESPACE,
                    deprecated: None,
                    tags: None,
                    range: loc.range.clone(),
                    selection_range: loc.range.clone(),
                    children: None,
                }
            })
            .collect();
        Some(symbols)
    }

    /// Fold regions for ideas that span more than two lines and for block comments.
    pub fn folding_ranges(&self, uri: &str) -> Vec<lsp_types::FoldingRange> {
        let Some(doc) = self.documents.get(uri) else { return Vec::new() };
        let mut out = Vec::new();
        for loc in &doc.model.names {
            let start = loc.range.start.line;
            let end = loc.range.end.line;
            if end.saturating_sub(start) < 2 {
                continue;
            }
            out.push(lsp_types::FoldingRange {
                start_line: start,
                start_character: Some(0),
                end_line: end - 1,
                end_character: Some(0),
                kind: Some(lsp_types::FoldingRangeKind::Region),
                collapsed_text: None,
            });
        }
        out.sort_by_key(|range| (range.start_line, range.end_line));
        out
    }

    /// Workspace symbols from the open buffers and a prefix query on the ideas index.
    pub fn workspace_symbols(&self, query: &str) -> Vec<lsp_types::WorkspaceSymbol> {
        self.workspace_symbols_with(query, &mut Idle).unwrap_or_default()
    }

    pub fn workspace_symbols_with(
        &self,
        query: &str,
        tick: &mut dyn Checkpoint,
    ) -> Result<Vec<lsp_types::WorkspaceSymbol>, Stopped> {
        let needle = query.to_lowercase();
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        let documents = self.documents.len().max(1) as u32;
        for (index, (uri, doc)) in self.documents.iter().enumerate() {
            if tick.tick("Searching workspace", index as u32, documents) {
                return Err(Stopped);
            }
            for loc in &doc.model.names {
                if !name_matches(&loc.name, &needle) {
                    continue;
                }
                seen.insert(loc.name.clone());
                let url = lsp_types::Url::parse(uri)
                    .unwrap_or_else(|_| lsp_types::Url::parse("file:///reqlan.rq").unwrap());
                out.push(lsp_types::WorkspaceSymbol {
                    name: loc.name.clone(),
                    kind: lsp_types::SymbolKind::NAMESPACE,
                    tags: None,
                    container_name: None,
                    location: lsp_types::OneOf::Left(lsp_types::Location {
                        uri: url,
                        range: loc.range.clone(),
                    }),
                    data: None,
                });
            }
        }
        let indexes = self.indexes.len().max(1) as u32;
        for (index_no, index) in self.indexes.iter().enumerate() {
            if tick.tick("Searching workspace", index_no as u32, indexes) {
                return Err(Stopped);
            }
            let Ok(rows) = index.store.idea_names_with_prefix(query, 80) else {
                continue;
            };
            for row in rows {
                if !name_matches(&row.name, &needle) {
                    continue;
                }
                if !seen.insert(row.name.clone()) {
                    continue;
                }
                let Some(file_uri) = indexed_file_uri(index, &row.file_uri) else {
                    continue;
                };
                let url = lsp_types::Url::parse(&file_uri)
                    .unwrap_or_else(|_| lsp_types::Url::parse("file:///reqlan.rq").unwrap());
                out.push(lsp_types::WorkspaceSymbol {
                    name: row.name.clone(),
                    kind: lsp_types::SymbolKind::MODULE,
                    tags: None,
                    container_name: None,
                    location: lsp_types::OneOf::Left(lsp_types::Location {
                        uri: url,
                        range: Range {
                            start: Position { line: row.line_start, character: 0 },
                            end: Position {
                                line: row.line_start,
                                character: utf16_len_name(&row.name),
                            },
                        },
                    }),
                    data: None,
                });
            }
        }
        Ok(out)
    }

    pub fn references(&self, uri: &str, pos: Position) -> Vec<Location> {
        self.references_with(uri, pos, &mut Idle).unwrap_or_default()
    }

    pub fn references_with(
        &self,
        uri: &str,
        pos: Position,
        tick: &mut dyn Checkpoint,
    ) -> Result<Vec<Location>, Stopped> {
        if tick.tick("Finding references", 0, 1) {
            return Err(Stopped);
        }
        let Some(name) = self.documents.get(uri).and_then(|doc| doc.model.name_at(pos)) else {
            return Ok(Vec::new());
        };
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        let total = (self.documents.len() + self.comments.len()).max(1) as u32;
        let mut done = 0u32;
        for (doc_uri, doc) in &self.documents {
            if tick.tick("Finding references", done, total) {
                return Err(Stopped);
            }
            done += 1;
            for location in doc.model.reference_locations(doc_uri, &name) {
                let key = location_key(&location);
                if seen.insert(key) {
                    out.push(location);
                }
            }
        }
        for (doc_uri, doc) in &self.comments {
            if tick.tick("Finding references", done, total) {
                return Err(Stopped);
            }
            done += 1;
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
        for location in self.index_reference_locations(&name, tick)? {
            let key = location_key(&location);
            if seen.insert(key) {
                out.push(location);
            }
        }
        Ok(out)
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
        let names = self.documents.get(uri).map(|doc| {
            import_fix_names(
                doc.model.syntax(),
                &doc.model.lines,
                &doc.model.text,
                context_diagnostics,
            )
        });
        let Some(names) = names else {
            return Vec::new();
        };
        let symbols = self.symbols_named(uri, &names);
        let server_diagnostics = self.diagnostics(uri);
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

    fn symbols_named(&self, from_uri: &str, names: &HashSet<String>) -> Vec<SymbolHit> {
        if names.is_empty() {
            return Vec::new();
        }
        let mut symbols = Vec::new();
        for (uri, doc) in &self.documents {
            if uri == from_uri {
                continue;
            }
            for (name, kind) in doc.model.exported_names() {
                if !names.contains(&name) {
                    continue;
                }
                symbols.push(SymbolHit { name, kind: kind.to_string(), file_uri: uri.clone() });
            }
        }
        for index in &self.indexes {
            for name in names {
                let Ok(rows) = index.store.ideas_named(name) else {
                    continue;
                };
                for row in rows {
                    if matches!(row.kind, IdeaKind::Ideaset) {
                        continue;
                    }
                    let Some(file_uri) = indexed_file_uri(index, &row.file_uri) else {
                        continue;
                    };
                    let kind = match row.kind {
                        IdeaKind::Oneliner => "oneliner",
                        IdeaKind::Block => "idea",
                        IdeaKind::Ideaset => "ideaset",
                    };
                    symbols.push(SymbolHit { name: row.name, kind: kind.to_string(), file_uri });
                }
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

    fn comment_definition_for(&mut self, uri: &str, pos: Position) -> Option<LocationLink> {
        let Some(doc) = self.comments.get(uri) else {
            return None;
        };
        let text = doc.text.clone();
        let path = doc.path.clone();
        self.comment_definition_at(&text, &path, uri, pos)
    }

    /// Go-to-definition for a comment reference site.
    /// Same resolution as document links and missing-idea diagnostics.
    // rq-ignore-error
    /// Origin is the path string or idea id under the cursor — not the whole `rq:[…]`.
    /// A found file stays a path target when the idea is absent.
    /// rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_qualified_token_links]
    /// rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_resolution_error_state]
    fn comment_definition_at(
        &mut self,
        text: &str,
        source: &Path,
        doc_uri: &str,
        pos: Position,
    ) -> Option<LocationLink> {
        let lines = LineMap::new(text);
        let byte = lines.byte_at(text, pos);
        for site in self.comment_sites(text, source) {
            let Some(target) = site.target.as_ref() else {
                continue;
            };
            let Ok(target_uri) = Url::from_file_path(target) else {
                continue;
            };
            if let Some(path_span) = site.path_span {
                if span_has(path_span, byte) {
                    return comment_location_link(
                        lines.range(text, path_span.start, path_span.end),
                        target_uri,
                        file_landing_range(),
                        doc_uri,
                    );
                }
            }
            let Some(idea_span) = site.idea_span else {
                continue;
            };
            if !span_has(idea_span, byte) || !site.idea_found {
                continue;
            }
            let range = match site.idea_at {
                Some(range) => range,
                None => self.neighbor_range(target, &site.idea)?,
            };
            let target_range = if range.start == range.end { file_landing_range() } else { range };
            return comment_location_link(
                lines.range(text, idea_span.start, idea_span.end),
                target_uri,
                target_range,
                doc_uri,
            );
        }
        None
    }

    fn comment_links(&mut self, text: &str, source: &Path) -> Vec<DocumentLink> {
        // rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_qualified_token_links]
        // rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_resolution_error_state]
        let lines = LineMap::new(text);
        let mut links = Vec::new();
        for site in self.comment_sites(text, source) {
            let Some(target) = site.target.as_ref() else {
                continue;
            };
            let Ok(url) = Url::from_file_path(target) else {
                continue;
            };
            if let Some(path_span) = site.path_span {
                links.push(DocumentLink {
                    range: lines.range(text, path_span.start, path_span.end),
                    target: Some(url.clone()),
                    tooltip: None,
                    data: None,
                });
            }
            if !site.idea_found {
                continue;
            }
            let Some(idea_span) = site.idea_span else {
                continue;
            };
            let target_url = if site.path.is_some() {
                let Some(range) = site.idea_at else {
                    continue;
                };
                location_url(&url, range.start.line)
            } else {
                url
            };
            links.push(DocumentLink {
                range: lines.range(text, idea_span.start, idea_span.end),
                target: Some(target_url),
                tooltip: Some(site.idea),
                data: None,
            });
        }
        links
    }

    fn comment_diagnostics(&mut self, text: &str, source: &Path) -> Vec<Diagnostic> {
        // rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_resolution_error_state]
        let lines = LineMap::new(text);
        let mut out = Vec::new();
        for site in self.comment_sites(text, source) {
            let Some((start, end, message, code)) = comment_issue(&site) else {
                continue;
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
            let site = self.resolve_comment(text, source, &reference, workspace.as_deref(), &roots);
            if !site.has_issue() || !ignored.contains(&reference.line) {
                sites.push(site);
            }
        }
        sites
    }

    /// One path read. The site keeps the file when that read does not find the idea.
    fn resolve_comment(
        &mut self,
        text: &str,
        source: &Path,
        reference: &reqlan_index::CommentReference,
        workspace: Option<&Path>,
        roots: &[ImportRootMapping],
    ) -> CommentSite {
        let statement = comment_token_span(reference.start, reference.end);
        let path_span =
            reference.path.as_deref().and_then(|path| authored_path_span(text, statement, path));
        let idea_span = ident_span_from(text, statement, reference.start, &reference.idea);
        let (target, idea_found, idea_at) = if let Some(authored) = reference.path.as_deref() {
            let from = source.to_string_lossy();
            let mut hit = None;
            for candidate in import_path_candidates(authored) {
                let resolved = resolve_rq_path(&candidate, &from, roots);
                let absolute = absolute_candidate(&resolved, workspace, source);
                if let FileIdea::Present { idea_at } = self.file_idea(&absolute, &reference.idea) {
                    hit = Some((absolute, idea_at));
                    break;
                }
            }
            match hit {
                Some((file, idea_at)) => (Some(file), idea_at.is_some(), idea_at),
                None => (None, false, None),
            }
        } else if let Some(target) = self.unqualified_file(&reference.idea) {
            (Some(target), true, None)
        } else {
            (None, false, None)
        };
        CommentSite {
            start: reference.start,
            end: reference.end,
            idea: reference.idea.clone(),
            path: reference.path.clone(),
            path_span,
            idea_span,
            target,
            idea_found,
            idea_at,
        }
    }

    /// One read of `path`. `Present` is that file; `idea_at` is set only when the same read declares `idea`.
    fn file_idea(&mut self, path: &Path, idea: &str) -> FileIdea {
        if let Some(doc) = self.open_doc_at(path) {
            let idea_at = if doc.model.has_idea(idea) { doc.model.idea_range(idea) } else { None };
            return FileIdea::Present { idea_at };
        }
        let Some(entry) = self.ensure_neighbor(path) else {
            return FileIdea::Absent;
        };
        let idea_at = entry.names.iter().find(|(name, _)| name == idea).map(|(_, range)| *range);
        FileIdea::Present { idea_at }
    }

    fn import_roots(&self, source: &Path) -> Vec<ImportRootMapping> {
        let workspace = self.alias_workspace(Some(source)).unwrap_or_else(|| source.to_path_buf());
        reqlan_index::import_roots_for_source(&workspace, &source.to_string_lossy())
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

    /// Workspace folder when set; otherwise the applying `.reqlan` base (same root check uses).
    fn alias_workspace(&self, source: Option<&Path>) -> Option<PathBuf> {
        let source = source?;
        self.workspace_for(source).or_else(|| find_applying_base_root(source, Some(source)))
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
        for index in &self.indexes {
            let Ok(rows) = index.store.ideas_named(idea) else {
                continue;
            };
            for row in rows {
                let Some(file_uri) = indexed_file_uri(index, &row.file_uri) else {
                    continue;
                };
                if let Some(path) = path_of_file(&file_uri) {
                    return Some(path);
                }
            }
        }
        None
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

    fn index_rename_texts(
        &self,
        idea: &str,
        tick: &mut dyn Checkpoint,
    ) -> Result<Vec<(String, String)>, Stopped> {
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        let total = self.indexes.len().max(1) as u32;
        for (index_no, index) in self.indexes.iter().enumerate() {
            if tick.tick("Renaming", index_no as u32, total) {
                return Err(Stopped);
            }
            let Ok(ideas) = index.store.ideas_named(idea) else {
                continue;
            };
            for row in ideas {
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
        Ok(out)
    }

    fn index_reference_locations(
        &self,
        idea: &str,
        tick: &mut dyn Checkpoint,
    ) -> Result<Vec<Location>, Stopped> {
        let mut out = Vec::new();
        let total = self.indexes.len().max(1) as u32;
        for (index_no, index) in self.indexes.iter().enumerate() {
            if tick.tick("Finding references", index_no as u32, total) {
                return Err(Stopped);
            }
            let Ok(ideas) = index.store.ideas_named(idea) else {
                continue;
            };
            for row in ideas {
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
        Ok(out)
    }

    fn neighbor_has(
        &mut self,
        from: &Path,
        authored: &str,
        idea: &str,
        roots: &[reqlan_parse::ImportRootMapping],
    ) -> bool {
        let workspace = self.alias_workspace(Some(from));
        let Some(path) = resolve_neighbor_file(from, authored, roots, workspace.as_deref()) else {
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
        let workspace = self.alias_workspace(Some(from));
        let Some(path) = resolve_neighbor_file(from, authored, roots, workspace.as_deref()) else {
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

fn open_base_index(indexes: &mut Vec<BaseIndex>, folder: &Path) {
    let db = folder.join(".reqlan").join("ideas-index.sqlite");
    if let Ok(store) = IndexStore::open_read_only(&db) {
        indexes.push(BaseIndex { root: folder.to_path_buf(), store });
    }
}

/// One comment-reference resolution. A qualified file can be present while `idea_found` is false.
struct CommentSite {
    start: usize,
    end: usize,
    idea: String,
    path: Option<String>,
    path_span: Option<Span>,
    idea_span: Option<Span>,
    target: Option<PathBuf>,
    idea_found: bool,
    idea_at: Option<Range>,
}

impl CommentSite {
    fn has_issue(&self) -> bool {
        (self.path.is_some() && self.target.is_none()) || !self.idea_found
    }
}

enum FileIdea {
    Absent,
    Present { idea_at: Option<Range> },
}

fn comment_issue(site: &CommentSite) -> Option<(usize, usize, String, &'static str)> {
    if let Some(path) = site.path.as_deref() {
        if site.target.is_none() {
            let (start, end) = token_or_whole(site.path_span, site.start, site.end);
            return Some((
                start,
                end,
                format!("Could not resolve comment reference file '{path}'."),
                "comment-reference-missing-file",
            ));
        }
    }
    if !site.idea_found {
        let (start, end) = token_or_whole(site.idea_span, site.start, site.end);
        return Some((
            start,
            end,
            format!("Could not resolve comment reference to idea '{}'.", site.idea),
            "comment-reference-missing-idea",
        ));
    }
    None
}

fn token_or_whole(span: Option<Span>, start: usize, end: usize) -> (usize, usize) {
    span.map(|span| (span.start, span.end)).unwrap_or((start, end))
}

fn comment_token_span(start: usize, end: usize) -> Span {
    Span { start, end, line_start: 0, line_end: 0 }
}

fn comment_location_link(
    origin: Range,
    target_uri: Url,
    target_range: Range,
    doc_uri: &str,
) -> Option<LocationLink> {
    if target_uri.as_str() == doc_uri && origin == target_range {
        return None;
    }
    Some(LocationLink {
        origin_selection_range: Some(origin),
        target_uri,
        target_range,
        target_selection_range: target_range,
    })
}

pub(crate) fn is_rq_uri(uri: &str) -> bool {
    let path = uri.split('?').next().unwrap_or(uri);
    let path = path.split('#').next().unwrap_or(path);
    path.to_ascii_lowercase().ends_with(".rq")
}

fn absolute_candidate(resolved: &str, workspace: Option<&Path>, source: &Path) -> PathBuf {
    if let Some(root) = workspace {
        return reqlan_index::absolute_rq_path(root, resolved);
    }
    let path = PathBuf::from(resolved);
    if path.is_absolute() {
        return path;
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

fn indexed_file_uri(index: &BaseIndex, file_uri: &str) -> Option<String> {
    let path = if Path::new(file_uri).is_absolute() {
        PathBuf::from(file_uri)
    } else {
        index.root.join(file_uri)
    };
    Url::from_file_path(path).ok().map(|url| url.to_string())
}

fn name_matches(name: &str, needle: &str) -> bool {
    needle.is_empty() || name.to_lowercase().contains(needle)
}

fn completion_list(items: Vec<CompletionItem>) -> CompletionList {
    CompletionList { is_incomplete: true, items, ..CompletionList::default() }
}

fn path_of_file(value: &str) -> Option<PathBuf> {
    if let Ok(url) = Url::parse(value) {
        if let Ok(path) = url.to_file_path() {
            return Some(path);
        }
    }
    let path = PathBuf::from(value);
    path.is_absolute().then_some(path)
}

fn qualified_completion_items(
    symbols: &FileSymbols,
    idea_prefix: &str,
    authored: &str,
    replace: Range,
) -> Vec<CompletionItem> {
    let labels = if let Some((qualifier, member_prefix)) = idea_prefix.split_once('.') {
        symbols
            .sets
            .iter()
            .filter(|(name, _)| name == qualifier)
            .flat_map(|(_, members)| {
                members
                    .iter()
                    .filter(|member| member.starts_with(member_prefix))
                    .map(|member| format!("{qualifier}.{member}"))
                    .collect::<Vec<_>>()
            })
            .collect::<Vec<_>>()
    } else {
        symbols
            .names
            .iter()
            .filter(|(name, _)| idea_prefix.is_empty() || name.starts_with(idea_prefix))
            .map(|(name, _)| name.clone())
            .collect()
    };
    labels
        .into_iter()
        .map(|label| CompletionItem {
            label: label.clone(),
            kind: Some(CompletionItemKind::REFERENCE),
            detail: Some(authored.to_string()),
            text_edit: Some(CompletionTextEdit::Edit(TextEdit { range: replace, new_text: label })),
            ..CompletionItem::default()
        })
        .collect()
}

fn reference_item(
    name: &str,
    local: bool,
    detail: Option<String>,
    edit: Option<TextEdit>,
    replace: Range,
) -> CompletionItem {
    CompletionItem {
        label: name.to_string(),
        kind: Some(if local { CompletionItemKind::CLASS } else { CompletionItemKind::REFERENCE }),
        detail,
        additional_text_edits: edit.map(|edit| vec![edit]),
        text_edit: Some(CompletionTextEdit::Edit(TextEdit {
            range: replace,
            new_text: name.to_string(),
        })),
        ..CompletionItem::default()
    }
}
