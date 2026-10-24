//! Open-buffer language features from the Rust AST.
//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
//! rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".open_file_algorithm]
//! rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".outbound_one_hop]
//! rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".missing_reference_colour_sequence]
use crate::utf16::{range_contains, utf16_len, LineMap};
use lsp_types::{
    CodeActionOrCommand, Command, CompletionItem, CompletionItemKind, Diagnostic,
    DiagnosticSeverity, DocumentHighlight, DocumentHighlightKind, DocumentLink, InlayHint,
    InlayHintLabel, InlayHintLabelPart, InlayHintLabelPartTooltip, InlayHintTooltip, Location,
    LocationLink, MarkupContent, MarkupKind, Position, Range, SelectionRange, SemanticToken,
    SemanticTokens, TextEdit, Url,
};
use reqlan_index::{
    analyze_local_symbolic_from_parse, find_rq_ignore_error_target_lines, local_name_binding,
    locate_authored_rq_path, LocalNameBinding, LocalSymbolicDocument,
};
use reqlan_parse::{
    import_path_candidates, parse_document, unquote_path, Attribute, AttributeValue, BodyElement,
    Import, ImportRootMapping, ListItem, Model, ReferenceTarget, RichPart, Span, TopLevelElement,
};
use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const TYPE_IDEA: u32 = 0;
const TYPE_NAMESPACE: u32 = 1;
const TYPE_VARIABLE: u32 = 2;
const TYPE_STRING: u32 = 3;
const TYPE_DECORATOR: u32 = 4;
const TYPE_OPERATOR: u32 = 5;
const TYPE_KEYWORD: u32 = 6;
const TYPE_METHOD: u32 = 7;
const MOD_DEFINITION: u32 = 1;

/// Endorsed attribute keys used until the host pushes a catalog.
pub const ENDORSED_ATTRIBUTE_KEYS: &[&str] = &[
    "plan",
    "status",
    "priority",
    "criticality",
    "confirmation",
    "owner",
    "log",
    "tags",
    "references",
    "refs",
    "required",
    "deprecated",
    "tests",
];

/// Host-pushed attribute completion catalog.
#[derive(Debug, Clone, Default)]
pub struct AttributeCatalog {
    pub keys: Vec<String>,
    pub values_by_key: HashMap<String, Vec<String>>,
}

impl AttributeCatalog {
    pub fn endorsed() -> Self {
        Self {
            keys: ENDORSED_ATTRIBUTE_KEYS.iter().map(|key| (*key).to_string()).collect(),
            values_by_key: HashMap::new(),
        }
    }
}

/// One idea that references the declaration under the inlay.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InboundReferencer {
    pub name: String,
    pub uri: String,
    /// Zero-based line of the referencer. The tooltip link uses the next line number.
    pub line: u32,
}

#[derive(Debug, Clone)]
pub(crate) struct HoverHit {
    pub range: Range,
    pub name: String,
    pub summary: String,
    pub markdown: Option<String>,
    pub external: Option<(String, String)>,
}

enum HoverToken<'a> {
    Idea(&'a str),
    ExternalIdea(&'a str, &'a str),
    Path(&'a str),
    Wildcard(&'a str, &'a str),
}

#[derive(Debug, Clone)]
pub struct NameLoc {
    pub name: String,
    pub range: Range,
    pub summary: String,
    pub line: u32,
}

#[derive(Debug, Clone)]
pub struct DocModel {
    pub text: String,
    pub lines: LineMap,
    pub roots: Vec<ImportRootMapping>,
    /// Workspace / applying-base folder for `@/` and other relative `resolve_rq_path` results.
    /// Same join as `reqlan check` ([locate_authored_rq_path]).
    workspace: Option<PathBuf>,
    file_path: Option<PathBuf>,
    pub(crate) names: Vec<NameLoc>,
    tokens: Vec<RawToken>,
    model: Model,
    parse_diagnostics: Vec<reqlan_parse::ParseDiagnostic>,
    /// Body references sorted by start byte. A cursor lookup is a binary search.
    refs: Vec<ReferenceTarget>,
    /// Authored path to resolved file, filled on first use for this parse.
    located: RefCell<HashMap<String, Option<PathBuf>>>,
}

#[derive(Debug, Clone, Copy)]
struct RawToken {
    start: usize,
    end: usize,
    kind: u32,
    modifiers: u32,
}

impl DocModel {
    pub fn parse(
        uri: &str,
        text: String,
        file_path: Option<&Path>,
        workspace: Option<&Path>,
    ) -> Self {
        let roots = file_path
            .map(|path| {
                let from = path.to_string_lossy();
                let ws = workspace.unwrap_or(path);
                reqlan_index::import_roots_for_source(ws, &from)
            })
            .unwrap_or_else(reqlan_parse::default_import_roots);
        Self::parse_with_roots(uri, text, file_path, roots, workspace)
    }

    /// Parse with import roots already loaded for this file.
    pub fn parse_with_roots(
        uri: &str,
        text: String,
        file_path: Option<&Path>,
        roots: Vec<ImportRootMapping>,
        workspace: Option<&Path>,
    ) -> Self {
        let parsed = parse_document(&text);
        let symbolic = analyze_local_symbolic_from_parse(uri, &text, &parsed, &roots);
        let lines = LineMap::new(&text);
        let mut tokens = Vec::new();
        let mut names = Vec::new();
        collect_model(&text, &lines, &parsed.model, &symbolic, &mut tokens, &mut names);
        tokens.sort_by_key(|token| (token.start, token.end));
        let mut refs = Vec::new();
        walk_refs(&parsed.model, &mut |target, _| refs.push(target.clone()));
        refs.sort_by_key(|target| target_span(target).start);
        Self {
            text,
            lines,
            roots,
            workspace: workspace.map(Path::to_path_buf),
            file_path: file_path.map(Path::to_path_buf),
            names,
            tokens,
            model: parsed.model,
            parse_diagnostics: parsed.diagnostics,
            refs,
            located: RefCell::new(HashMap::new()),
        }
    }

    pub fn has_idea(&self, name: &str) -> bool {
        self.names.iter().any(|idea| idea.name == name)
    }

    /// Name token of a declared idea, or the line of an import binding when the name is an alias.
    pub(crate) fn idea_range(&self, name: &str) -> Option<Range> {
        if let Some(idea) = self.names.iter().find(|idea| idea.name == name) {
            return Some(idea.range);
        }
        self.model
            .import_bindings()
            .into_iter()
            .find(|(binding, _)| binding == name)
            .map(|(_, line)| line_range(line, name))
    }

    fn byte_at(&self, pos: Position) -> usize {
        self.lines.byte_at(&self.text, pos)
    }

    fn ref_at(&self, byte: usize) -> Option<&ReferenceTarget> {
        let after = self.refs.partition_point(|target| target_span(target).start <= byte);
        let target = self.refs.get(after.checked_sub(1)?)?;
        span_has(target_span(target), byte).then_some(target)
    }

    /// True when `name` is an import alias in this file, not a declared idea.
    pub fn binds_import(&self, name: &str) -> bool {
        self.model.import_bindings().iter().any(|(binding, _line)| binding == name)
    }

    fn local_name_resolves<F>(&self, idea: &str, neighbor_has: &mut F) -> bool
    where
        F: FnMut(&str, &str) -> bool,
    {
        if self.has_idea(idea) {
            return true;
        }
        match local_name_binding(&self.model.imports, idea) {
            Some(LocalNameBinding::Namespace { .. }) => true,
            Some(LocalNameBinding::Imported { path, idea: imported }) => {
                neighbor_has(&path, &imported)
            }
            None => false,
        }
    }

    fn push_unresolved_idea(
        &self,
        out: &mut Vec<Diagnostic>,
        ignored: &std::collections::HashSet<u32>,
        span: &Span,
        idea: &str,
    ) {
        push_diag(
            out,
            ignored,
            self.lines.range(&self.text, span.start, span.end),
            format!("Could not resolve reference to IdeaDeclaration named '{idea}'."),
            DiagnosticSeverity::ERROR,
        );
    }

    fn push_missing_import_ideas<F>(
        &self,
        import: &Import,
        out: &mut Vec<Diagnostic>,
        ignored: &std::collections::HashSet<u32>,
        neighbor_has: &mut F,
    ) where
        F: FnMut(&str, &str) -> bool,
    {
        match import {
            Import::From(from) => {
                for spec in &from.specifiers {
                    if spec.idea.is_empty() || neighbor_has(&from.path, &spec.idea) {
                        continue;
                    }
                    self.push_unresolved_idea(out, ignored, &spec.idea_span, &spec.idea);
                }
            }
            Import::Qualified(qualified) => {
                if !qualified.idea.is_empty() && !neighbor_has(&qualified.path, &qualified.idea) {
                    self.push_unresolved_idea(out, ignored, &qualified.idea_span, &qualified.idea);
                }
            }
            Import::Namespace(_) | Import::InvalidFrom(_) => {}
        }
    }

    fn locate(&self, authored: &str) -> Option<PathBuf> {
        if authored.contains("://") {
            return None;
        }
        if let Some(found) = self.located.borrow().get(authored) {
            return found.clone();
        }
        let found = self.locate_on_disk(authored);
        self.located.borrow_mut().insert(authored.to_string(), found.clone());
        found
    }

    fn locate_on_disk(&self, authored: &str) -> Option<PathBuf> {
        let from = self
            .file_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default();
        if let Some(workspace) = self.workspace.as_deref() {
            // Same definition as `reqlan check` (workspace join after resolve_rq_path).
            return locate_authored_rq_path(workspace, &from, authored, &self.roots);
        }
        // Absolute resolve_rq_path results (document-relative from an absolute from_file).
        existing_path_candidates(authored, &from, &self.roots)
    }

    /// Import targets and import-bound local names for the open-file hot path.
    pub fn import_neighbor_queries(&self) -> Vec<(String, String)> {
        let mut pairs = Vec::new();
        for import in &self.model.imports {
            match import {
                Import::From(from) => {
                    for spec in &from.specifiers {
                        pairs.push((from.path.clone(), spec.idea.clone()));
                    }
                }
                Import::Qualified(qualified) => {
                    pairs.push((qualified.path.clone(), qualified.idea.clone()));
                }
                Import::Namespace(_) | Import::InvalidFrom(_) => {}
            }
        }
        walk_refs(&self.model, &mut |target, _| match target {
            ReferenceTarget::Qualified { path: None, qualifier: Some(qualifier), idea, .. } => {
                if let Some(LocalNameBinding::Namespace { path }) =
                    local_name_binding(&self.model.imports, qualifier)
                {
                    pairs.push((path, idea.clone()));
                }
            }
            ReferenceTarget::Local { idea, .. } => {
                if let Some(LocalNameBinding::Imported { path, idea: imported }) =
                    local_name_binding(&self.model.imports, idea)
                {
                    pairs.push((path, imported));
                }
            }
            _ => {}
        });
        pairs
    }

    /// Path-qualified body references confirmed after the hot path.
    pub fn qualified_neighbor_queries(&self) -> Vec<(String, String)> {
        let mut pairs = Vec::new();
        walk_refs(&self.model, &mut |target, _| {
            if let ReferenceTarget::Qualified { path: Some(path), idea, .. } = target {
                pairs.push((path.clone(), idea.clone()));
            }
        });
        pairs
    }

    pub fn first_body_indent(&self) -> Option<u32> {
        fn walk(text: &str, lines: &LineMap, elements: &[BodyElement]) -> Option<u32> {
            for element in elements {
                match element {
                    BodyElement::BodyLine(line) => {
                        return Some(lines.position(text, line.span.start).character);
                    }
                    BodyElement::Attribute(attr) => {
                        if let Some(AttributeValue::Block(block)) = &attr.value {
                            if let Some(indent) = walk(text, lines, &block.elements) {
                                return Some(indent);
                            }
                        }
                    }
                    _ => {}
                }
            }
            None
        }
        for element in &self.model.elements {
            if let TopLevelElement::Idea(idea) = element {
                if let Some(indent) = walk(&self.text, &self.lines, &idea.elements) {
                    return Some(indent);
                }
            }
        }
        None
    }

    pub fn diagnostics<F, A>(
        &self,
        mut neighbor_has: F,
        mut neighbor_binds_import: A,
        confirm_path_qualified: bool,
    ) -> Vec<Diagnostic>
    where
        F: FnMut(&str, &str) -> bool,
        A: FnMut(&str, &str) -> bool,
    {
        let ignored = find_rq_ignore_error_target_lines(&self.text);
        let mut out = Vec::new();
        for diagnostic in &self.parse_diagnostics {
            let range = self.lines.range(
                &self.text,
                diagnostic.offset,
                diagnostic.offset.saturating_add(1),
            );
            push_diag(
                &mut out,
                &ignored,
                range,
                diagnostic.message.clone(),
                match diagnostic.severity {
                    reqlan_parse::Severity::Warning => DiagnosticSeverity::WARNING,
                    reqlan_parse::Severity::Error => DiagnosticSeverity::ERROR,
                },
            );
        }
        walk_refs(&self.model, &mut |target, _part_span| match target {
            ReferenceTarget::Local { span, idea } => {
                if idea.is_empty() || self.local_name_resolves(idea, &mut neighbor_has) {
                    return;
                }
                self.push_unresolved_idea(&mut out, &ignored, span, idea);
            }
            ReferenceTarget::Qualified { span, path, qualifier, idea, ideaset } => {
                if let Some(path) = path {
                    if !confirm_path_qualified {
                        return;
                    }
                    if !neighbor_has(path, idea)
                        && !neighbor_binds_import(path, idea)
                        && !self.has_idea(idea)
                    {
                        let leaf =
                            ident_span_from(&self.text, *span, span.start, idea).unwrap_or(*span);
                        self.push_unresolved_idea(&mut out, &ignored, &leaf, idea);
                    }
                } else if let Some(qualifier) = qualifier {
                    self.diagnose_dotted(
                        &mut out,
                        &ignored,
                        span,
                        qualifier,
                        ideaset.as_deref(),
                        idea,
                        &mut neighbor_has,
                        &mut neighbor_binds_import,
                    );
                } else if !self.has_idea(idea) {
                    let leaf =
                        ident_span_from(&self.text, *span, span.start, idea).unwrap_or(*span);
                    self.push_unresolved_idea(&mut out, &ignored, &leaf, idea);
                }
            }
            ReferenceTarget::File { span, file }
            | ReferenceTarget::FileSymbol { span, file, .. } => {
                let authored = unquote_path(file);
                if authored.contains("://") || self.locate(&authored).is_some() {
                    return;
                }
                push_diag(
                    &mut out,
                    &ignored,
                    self.lines.range(&self.text, span.start, span.end),
                    format!("Could not resolve file reference '{authored}'."),
                    DiagnosticSeverity::ERROR,
                );
            }
            _ => {}
        });
        for import in &self.model.imports {
            let Some(path) = import.path() else {
                continue;
            };
            if path.contains("://") {
                continue;
            }
            if self.locate(path).is_none() {
                let span = import.path_span().unwrap_or_else(|| import_span(import));
                push_diag(
                    &mut out,
                    &ignored,
                    self.lines.range(&self.text, span.start, span.end),
                    format!("Could not resolve import '{path}'."),
                    DiagnosticSeverity::ERROR,
                );
                continue;
            }
            self.push_missing_import_ideas(import, &mut out, &ignored, &mut neighbor_has);
        }
        out
    }

    pub fn semantic_tokens(&self) -> SemanticTokens {
        let mut ordered = self.tokens.clone();
        ordered.sort_by_key(|token| (token.start, token.end));
        let mut data = Vec::new();
        let mut prev_line = 0u32;
        let mut prev_start = 0u32;
        for token in &ordered {
            let range = self.lines.range(&self.text, token.start, token.end);
            let line = range.start.line;
            let start = range.start.character;
            let length = utf16_len(
                &self.text[token.start.min(self.text.len())..token.end.min(self.text.len())],
            );
            let delta_line = line - prev_line;
            let delta_start = if delta_line == 0 { start - prev_start } else { start };
            data.push(SemanticToken {
                delta_line,
                delta_start,
                length,
                token_type: token.kind,
                token_modifiers_bitset: token.modifiers,
            });
            prev_line = line;
            prev_start = start;
        }
        SemanticTokens { result_id: None, data }
    }

    pub fn links<N>(&self, doc_uri: &str, mut neighbor_range_of: N) -> Vec<DocumentLink>
    where
        N: FnMut(&Path, &str) -> Option<Range>,
    {
        let mut neighbor_line_of =
            |path: &Path, idea: &str| neighbor_range_of(path, idea).map(|range| range.start.line);
        let mut links = Vec::new();
        walk_refs(&self.model, &mut |target, _| match target {
            ReferenceTarget::Local { span, idea } => {
                if let Some(decl) = self.names.iter().find(|item| item.name == *idea) {
                    links.push(self.idea_link(doc_uri, span, decl.line, idea));
                } else if let Some(binding) = local_name_binding(&self.model.imports, idea) {
                    self.push_binding_link(&mut links, span, &binding, &mut neighbor_line_of);
                }
            }
            ReferenceTarget::File { span, file }
            | ReferenceTarget::FileSymbol { span, file, .. } => {
                if let Some(target) = self.path_document_url(file) {
                    links.push(link(self, *span, target));
                }
            }
            ReferenceTarget::Wildcard { span, path_pattern, idea_pattern } => {
                if let Some(target) = wildcard_command_url(path_pattern, idea_pattern, doc_uri) {
                    links.push(link(self, *span, target));
                }
            }
            ReferenceTarget::Url { span, url } => {
                if let Ok(target) = Url::parse(url) {
                    links.push(link(self, *span, target));
                }
            }
            ReferenceTarget::Qualified { span, path, qualifier, ideaset, idea } => {
                if let Some(path) = path.as_deref() {
                    if let Some(file) = self.locate(path) {
                        if file.is_dir() {
                            if let (Some(path_span), Some(target)) = (
                                authored_path_span(&self.text, *span, path),
                                folder_command_url(&file),
                            ) {
                                links.push(link(self, path_span, target));
                            }
                        } else if let Ok(target) = Url::from_file_path(&file) {
                            if let Some(path_span) = authored_path_span(&self.text, *span, path) {
                                links.push(link(self, path_span, target.clone()));
                            }
                            if let Some(line) = neighbor_line_of(&file, idea) {
                                if let Some(leaf) =
                                    ident_span_from(&self.text, *span, span.start, idea)
                                {
                                    links.push(self.foreign_idea_link(leaf, &target, line, idea));
                                }
                            }
                        }
                    }
                } else if let Some(qualifier) = qualifier {
                    self.push_dotted_links(
                        &mut links,
                        doc_uri,
                        span,
                        qualifier,
                        ideaset.as_deref(),
                        idea,
                        &mut neighbor_line_of,
                    );
                } else if let Some(decl) = self.names.iter().find(|item| item.name == *idea) {
                    let leaf =
                        ident_span_from(&self.text, *span, span.start, idea).unwrap_or(*span);
                    links.push(self.idea_link(doc_uri, &leaf, decl.line, idea));
                }
            }
        });
        for import in &self.model.imports {
            self.push_import_token_links(&mut links, import, &mut neighbor_line_of);
        }
        links
    }

    fn idea_link(&self, doc_uri: &str, span: &Span, line: u32, idea: &str) -> DocumentLink {
        DocumentLink {
            range: self.lines.range(&self.text, span.start, span.end),
            target: Some(location_uri(doc_uri, line)),
            tooltip: Some(idea.to_string()),
            data: None,
        }
    }

    fn push_binding_link<N>(
        &self,
        links: &mut Vec<DocumentLink>,
        span: &Span,
        binding: &LocalNameBinding,
        neighbor_line_of: &mut N,
    ) where
        N: FnMut(&Path, &str) -> Option<u32>,
    {
        match binding {
            LocalNameBinding::Namespace { path } => {
                if let Some(target) = self.path_document_url(path) {
                    links.push(link(self, *span, target));
                }
            }
            LocalNameBinding::Imported { path, idea } => {
                let Some(file) = self.locate(path) else {
                    return;
                };
                let Some(line) = neighbor_line_of(&file, idea) else {
                    return;
                };
                if let Ok(target) = Url::from_file_path(&file) {
                    links.push(link(self, *span, location_url(&target, line)));
                }
            }
        }
    }

    /// File URL, or a folder-picker command when the path is a directory.
    fn path_document_url(&self, authored: &str) -> Option<Url> {
        if authored.contains("://") {
            return Url::parse(authored).ok();
        }
        let path = self.locate(authored)?;
        if path.is_dir() {
            return folder_command_url(&path);
        }
        Url::from_file_path(path).ok()
    }

    fn local_name_kind(&self, name: &str) -> Option<LocalNameKind> {
        for element in &self.model.elements {
            match element {
                TopLevelElement::Idea(idea) if idea.name == name => {
                    return Some(LocalNameKind::Block)
                }
                TopLevelElement::OneLiner(idea) if idea.name == name => {
                    return Some(LocalNameKind::OneLiner);
                }
                TopLevelElement::IdeaSet(set) if set.name == name => {
                    return Some(LocalNameKind::IdeaSet);
                }
                _ => {}
            }
        }
        None
    }

    fn dotted_parts(
        &self,
        span: Span,
        qualifier: Option<&str>,
        ideaset: Option<&str>,
        idea: &str,
    ) -> DottedParts {
        let mut cursor = span.start;
        let qualifier_span = qualifier.and_then(|name| {
            let found = ident_span_from(&self.text, span, cursor, name)?;
            cursor = found.end;
            Some(found)
        });
        let ideaset_span = ideaset.and_then(|name| {
            let found = ident_span_from(&self.text, span, cursor, name)?;
            cursor = found.end;
            Some(found)
        });
        let idea_span = ident_span_from(&self.text, span, cursor, idea).unwrap_or(span);
        DottedParts { qualifier: qualifier_span, ideaset: ideaset_span, idea: idea_span }
    }

    #[allow(clippy::too_many_arguments)]
    #[allow(clippy::too_many_arguments)]
    fn diagnose_dotted<F, A>(
        &self,
        out: &mut Vec<Diagnostic>,
        ignored: &std::collections::HashSet<u32>,
        span: &Span,
        qualifier: &str,
        ideaset: Option<&str>,
        idea: &str,
        neighbor_has: &mut F,
        neighbor_binds_import: &mut A,
    ) where
        F: FnMut(&str, &str) -> bool,
        A: FnMut(&str, &str) -> bool,
    {
        let parts = self.dotted_parts(*span, Some(qualifier), ideaset, idea);
        if ideaset.is_none() {
            match self.local_name_kind(qualifier) {
                Some(LocalNameKind::Block) | Some(LocalNameKind::OneLiner) => return,
                Some(LocalNameKind::IdeaSet) => {
                    if !self.has_idea(idea) {
                        self.push_unresolved_idea(out, ignored, &parts.idea, idea);
                    }
                    return;
                }
                None => {}
            }
        }
        if let Some(LocalNameBinding::Namespace { path }) =
            local_name_binding(&self.model.imports, qualifier)
        {
            if !neighbor_has(&path, idea) && !neighbor_binds_import(&path, idea) {
                self.push_unresolved_idea(out, ignored, &parts.idea, idea);
            }
            return;
        }
        if let Some(qualifier_span) = parts.qualifier {
            if self.local_name_kind(qualifier).is_none() {
                self.push_unresolved_idea(out, ignored, &qualifier_span, qualifier);
            }
        }
        if !self.has_idea(idea) {
            self.push_unresolved_idea(out, ignored, &parts.idea, idea);
        }
    }

    fn push_dotted_links<N>(
        &self,
        links: &mut Vec<DocumentLink>,
        doc_uri: &str,
        span: &Span,
        qualifier: &str,
        ideaset: Option<&str>,
        idea: &str,
        neighbor_line_of: &mut N,
    ) where
        N: FnMut(&Path, &str) -> Option<u32>,
    {
        let parts = self.dotted_parts(*span, Some(qualifier), ideaset, idea);
        if ideaset.is_none() {
            match self.local_name_kind(qualifier) {
                Some(LocalNameKind::Block) | Some(LocalNameKind::OneLiner) => return,
                Some(LocalNameKind::IdeaSet) => {
                    self.push_local_name_link(links, doc_uri, parts.qualifier, qualifier);
                    self.push_local_name_link(links, doc_uri, Some(parts.idea), idea);
                    return;
                }
                None => {}
            }
        }
        if let Some(LocalNameBinding::Namespace { path }) =
            local_name_binding(&self.model.imports, qualifier)
        {
            if let Some(qualifier_span) = parts.qualifier {
                if let Some(target) = self.path_document_url(&path) {
                    links.push(link(self, qualifier_span, target));
                }
            }
            if let Some(file) = self.locate(&path) {
                if let Ok(target) = Url::from_file_path(&file) {
                    if let (Some(name), Some(middle)) = (ideaset, parts.ideaset) {
                        if let Some(line) = neighbor_line_of(&file, name) {
                            links.push(self.foreign_idea_link(middle, &target, line, name));
                        }
                    }
                    if let Some(line) = neighbor_line_of(&file, idea) {
                        if parts.idea.end.saturating_sub(parts.idea.start) == idea.len() {
                            links.push(self.foreign_idea_link(parts.idea, &target, line, idea));
                        }
                    }
                }
            }
            return;
        }
        self.push_local_name_link(links, doc_uri, Some(parts.idea), idea);
    }

    fn push_local_name_link(
        &self,
        links: &mut Vec<DocumentLink>,
        doc_uri: &str,
        span: Option<Span>,
        name: &str,
    ) {
        let Some(span) = span else {
            return;
        };
        if let Some(decl) = self.names.iter().find(|item| item.name == name) {
            links.push(self.idea_link(doc_uri, &span, decl.line, name));
        }
    }

    fn foreign_idea_link(&self, span: Span, file: &Url, line: u32, idea: &str) -> DocumentLink {
        DocumentLink {
            range: self.lines.range(&self.text, span.start, span.end),
            target: Some(location_url(file, line)),
            tooltip: Some(idea.to_string()),
            data: None,
        }
    }

    fn push_import_token_links<N>(
        &self,
        links: &mut Vec<DocumentLink>,
        import: &Import,
        neighbor_line_of: &mut N,
    ) where
        N: FnMut(&Path, &str) -> Option<u32>,
    {
        let Some(path) = import.path() else {
            return;
        };
        let Some(path_span) = import.path_span() else {
            return;
        };
        if let Some(target) = self.path_document_url(path) {
            links.push(link(self, path_span, target));
        }
        match import {
            Import::From(from) => {
                for spec in &from.specifiers {
                    self.push_imported_idea_link(
                        links,
                        path,
                        spec.idea_span,
                        &spec.idea,
                        neighbor_line_of,
                    );
                    if let Some(alias_span) = spec.alias_span {
                        self.push_imported_idea_link(
                            links,
                            path,
                            alias_span,
                            &spec.idea,
                            neighbor_line_of,
                        );
                    }
                }
            }
            Import::Namespace(namespace) => {
                if let Some(alias_span) = namespace.alias_span {
                    if let Some(target) = self.path_document_url(path) {
                        links.push(link(self, alias_span, target));
                    }
                }
            }
            Import::Qualified(qualified) => {
                self.push_imported_idea_link(
                    links,
                    path,
                    qualified.ideaset_span,
                    &qualified.ideaset,
                    neighbor_line_of,
                );
                self.push_imported_idea_link(
                    links,
                    path,
                    qualified.idea_span,
                    &qualified.idea,
                    neighbor_line_of,
                );
                if let Some(alias_span) = qualified.alias_span {
                    self.push_imported_idea_link(
                        links,
                        path,
                        alias_span,
                        &qualified.idea,
                        neighbor_line_of,
                    );
                }
            }
            Import::InvalidFrom(_) => {}
        }
    }

    fn push_imported_idea_link<N>(
        &self,
        links: &mut Vec<DocumentLink>,
        path: &str,
        span: Span,
        idea: &str,
        neighbor_line_of: &mut N,
    ) where
        N: FnMut(&Path, &str) -> Option<u32>,
    {
        if idea.is_empty() {
            return;
        }
        let Some((file, line)) = self.neighbor_idea(path, idea, neighbor_line_of) else {
            return;
        };
        links.push(self.foreign_idea_link(span, &file, line, idea));
    }

    fn neighbor_idea<N>(
        &self,
        path: &str,
        idea: &str,
        neighbor_line_of: &mut N,
    ) -> Option<(Url, u32)>
    where
        N: FnMut(&Path, &str) -> Option<u32>,
    {
        let file = self.locate(path)?;
        let line = neighbor_line_of(&file, idea)?;
        let uri = Url::from_file_path(&file).ok()?;
        Some((uri, line))
    }

    /// A file target for go-to-definition. A folder has no definition; its link is a command.
    /// The landing range is one character so the editor records a JUMP for Alt+Left navigate-back.
    fn file_definition(&self, path: &str) -> Option<Location> {
        if path.contains("://") {
            return Some(Location { uri: Url::parse(path).ok()?, range: file_landing_range() });
        }
        let file = self.locate(path)?;
        if file.is_dir() {
            return None;
        }
        Some(Location { uri: Url::from_file_path(file).ok()?, range: file_landing_range() })
    }

    fn idea_location<N>(
        &self,
        path: &str,
        idea: &str,
        neighbor_range_of: &mut N,
    ) -> Option<Location>
    where
        N: FnMut(&Path, &str) -> Option<Range>,
    {
        let file = self.locate(path)?;
        let range = non_empty_selection(neighbor_range_of(&file, idea)?);
        Some(Location { uri: Url::from_file_path(&file).ok()?, range })
    }

    fn local_location(&self, doc_uri: &str, idea: &str) -> Option<Location> {
        let decl = self.names.iter().find(|item| item.name == idea)?;
        Some(Location { uri: parse_url(doc_uri), range: non_empty_selection(decl.range) })
    }

    /// Build a LocationLink. Skip when origin and target are the same place — that is not a
    /// JUMP, so navigate-back (Alt+Left) would have nothing to restore.
    fn definition_link(
        &self,
        doc_uri: &str,
        origin: Span,
        target: Location,
    ) -> Option<LocationLink> {
        let origin_range = self.lines.range(&self.text, origin.start, origin.end);
        let target_range = non_empty_selection(target.range);
        if target.uri.as_str() == doc_uri && origin_range == target_range {
            return None;
        }
        Some(LocationLink {
            origin_selection_range: Some(origin_range),
            target_uri: target.uri,
            target_range,
            target_selection_range: target_range,
        })
    }

    fn import_definition<N>(
        &self,
        doc_uri: &str,
        byte: usize,
        neighbor_range_of: &mut N,
    ) -> Option<LocationLink>
    where
        N: FnMut(&Path, &str) -> Option<Range>,
    {
        let import =
            self.model.imports.iter().find(|import| span_has(import_span(import), byte))?;
        let path = import.path()?;
        if let Some(path_span) = import.path_span().filter(|span| span_has(*span, byte)) {
            return self.definition_link(doc_uri, path_span, self.file_definition(path)?);
        }
        match import {
            Import::From(from) => {
                let spec = from.specifiers.iter().find(|spec| {
                    span_has(spec.idea_span, byte)
                        || spec.alias_span.is_some_and(|span| span_has(span, byte))
                })?;
                let origin =
                    spec.alias_span.filter(|span| span_has(*span, byte)).unwrap_or(spec.idea_span);
                self.definition_link(
                    doc_uri,
                    origin,
                    self.idea_location(path, &spec.idea, neighbor_range_of)?,
                )
            }
            Import::Namespace(namespace) => {
                let origin = namespace.alias_span.filter(|span| span_has(*span, byte))?;
                self.definition_link(doc_uri, origin, self.file_definition(path)?)
            }
            Import::Qualified(qualified) => {
                if span_has(qualified.ideaset_span, byte) {
                    return self.definition_link(
                        doc_uri,
                        qualified.ideaset_span,
                        self.idea_location(path, &qualified.ideaset, neighbor_range_of)?,
                    );
                }
                if span_has(qualified.idea_span, byte)
                    || qualified.alias_span.is_some_and(|span| span_has(span, byte))
                {
                    let origin = qualified
                        .alias_span
                        .filter(|span| span_has(*span, byte))
                        .unwrap_or(qualified.idea_span);
                    return self.definition_link(
                        doc_uri,
                        origin,
                        self.idea_location(path, &qualified.idea, neighbor_range_of)?,
                    );
                }
                None
            }
            Import::InvalidFrom(_) => None,
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn define_dotted<N>(
        &self,
        byte: usize,
        doc_uri: &str,
        span: &Span,
        qualifier: Option<&str>,
        ideaset: Option<&str>,
        idea: &str,
        neighbor_range_of: &mut N,
    ) -> Option<LocationLink>
    where
        N: FnMut(&Path, &str) -> Option<Range>,
    {
        let parts = self.dotted_parts(*span, qualifier, ideaset, idea);
        if let (Some(qualifier_name), Some(qualifier_span)) = (qualifier, parts.qualifier) {
            if span_has(qualifier_span, byte) {
                let target = match local_name_binding(&self.model.imports, qualifier_name) {
                    Some(LocalNameBinding::Namespace { path }) => self.file_definition(&path)?,
                    _ => self.local_location(doc_uri, qualifier_name)?,
                };
                return self.definition_link(doc_uri, qualifier_span, target);
            }
        }
        if let (Some(name), Some(middle)) = (ideaset, parts.ideaset) {
            if span_has(middle, byte) {
                return self.definition_link(
                    doc_uri,
                    middle,
                    self.neighbor_or_local_definition(doc_uri, qualifier, name, neighbor_range_of)?,
                );
            }
        }
        if !span_has(parts.idea, byte) {
            return None;
        }
        self.definition_link(
            doc_uri,
            parts.idea,
            self.neighbor_or_local_definition(doc_uri, qualifier, idea, neighbor_range_of)?,
        )
    }

    fn neighbor_or_local_definition<N>(
        &self,
        doc_uri: &str,
        qualifier: Option<&str>,
        idea: &str,
        neighbor_range_of: &mut N,
    ) -> Option<Location>
    where
        N: FnMut(&Path, &str) -> Option<Range>,
    {
        if let Some(LocalNameBinding::Namespace { path }) =
            qualifier.and_then(|name| local_name_binding(&self.model.imports, name))
        {
            return self.idea_location(&path, idea, neighbor_range_of);
        }
        self.local_location(doc_uri, idea)
    }

    /// Go-to-definition. The origin span is the lexer token under the cursor
    /// (path string or idea id), so Ctrl+hover underlines that token — not an editor word.
    pub fn definition<N>(
        &self,
        pos: Position,
        doc_uri: &str,
        mut neighbor_range_of: N,
    ) -> Vec<LocationLink>
    where
        N: FnMut(&Path, &str) -> Option<Range>,
    {
        // Already on the declaration name: a self-target is not a JUMP, so Alt+Left
        // would have nothing to restore. Fall through in case a reference overlaps.
        let byte = self.byte_at(pos);
        let on_decl = self.names.iter().any(|idea| range_contains(idea.range, pos));
        let found = match self.ref_at(byte) {
            Some(ReferenceTarget::Local { span, idea }) => {
                let target =
                    self.local_location(doc_uri, idea).or_else(|| {
                        match local_name_binding(&self.model.imports, idea)? {
                            LocalNameBinding::Imported { path, idea } => {
                                self.idea_location(&path, &idea, &mut neighbor_range_of)
                            }
                            LocalNameBinding::Namespace { path } => self.file_definition(&path),
                        }
                    });
                target.and_then(|target| self.definition_link(doc_uri, *span, target))
            }
            Some(ReferenceTarget::Qualified { span, path: None, qualifier, ideaset, idea }) => self
                .define_dotted(
                    byte,
                    doc_uri,
                    span,
                    qualifier.as_deref(),
                    ideaset.as_deref(),
                    idea,
                    &mut neighbor_range_of,
                ),
            Some(ReferenceTarget::Qualified { span, path: Some(path), idea, .. }) => {
                if let Some(path_span) = authored_path_span(&self.text, *span, path) {
                    if span_has(path_span, byte) {
                        return self
                            .file_definition(path)
                            .and_then(|target| self.definition_link(doc_uri, path_span, target))
                            .into_iter()
                            .collect();
                    }
                }
                let Some(leaf) = ident_span_from(&self.text, *span, span.start, idea) else {
                    return Vec::new();
                };
                if !span_has(leaf, byte) {
                    return Vec::new();
                }
                self.idea_location(path, idea, &mut neighbor_range_of)
                    .or_else(|| self.file_definition(path))
                    .and_then(|target| self.definition_link(doc_uri, leaf, target))
            }
            Some(
                ReferenceTarget::File { span, file }
                | ReferenceTarget::FileSymbol { span, file, .. },
            ) => self
                .file_definition(file)
                .and_then(|target| self.definition_link(doc_uri, *span, target)),
            Some(ReferenceTarget::Url { .. } | ReferenceTarget::Wildcard { .. }) => None,
            None if on_decl => None,
            None => self.import_definition(doc_uri, byte, &mut neighbor_range_of),
        };
        found.into_iter().collect()
    }

    pub(crate) fn resolve_path(&self, authored: &str) -> Option<PathBuf> {
        self.locate(authored)
    }

    pub(crate) fn idea_markdown(&self, name: &str) -> Option<String> {
        crate::hover_content::markdown_for_name(&self.text, &self.model, name)
    }

    pub(crate) fn hover_hit(&self, pos: Position, with_markdown: bool) -> Option<HoverHit> {
        let markdown_of = |name: &str| with_markdown.then(|| self.idea_markdown(name)).flatten();
        if let Some(idea) = self.names.iter().find(|idea| range_contains(idea.range, pos)) {
            return Some(HoverHit {
                range: idea.range,
                name: idea.name.clone(),
                summary: idea.summary.clone(),
                markdown: markdown_of(&idea.name),
                external: None,
            });
        }
        let byte = self.byte_at(pos);
        let target = self.ref_at(byte)?;
        let (span, hit) = self.hover_token(byte, target)?;
        let range = self.lines.range(&self.text, span.start, span.end);
        Some(self.hover_hit_for_token(range, hit, &markdown_of))
    }

    /// Lexer token under the cursor inside a reference (path string or idea id).
    fn hover_token<'a>(
        &self,
        byte: usize,
        target: &'a ReferenceTarget,
    ) -> Option<(Span, HoverToken<'a>)> {
        match target {
            ReferenceTarget::Local { span, idea } => Some((*span, HoverToken::Idea(idea))),
            ReferenceTarget::Qualified { span, path: Some(path), idea, .. } => {
                if let Some(path_span) = authored_path_span(&self.text, *span, path) {
                    if span_has(path_span, byte) {
                        return Some((path_span, HoverToken::Path(path)));
                    }
                }
                let leaf = ident_span_from(&self.text, *span, span.start, idea)?;
                span_has(leaf, byte).then_some((leaf, HoverToken::ExternalIdea(path, idea)))
            }
            ReferenceTarget::Qualified { span, path: None, qualifier, ideaset, idea } => {
                let parts =
                    self.dotted_parts(*span, qualifier.as_deref(), ideaset.as_deref(), idea);
                if let (Some(name), Some(part)) = (qualifier.as_deref(), parts.qualifier) {
                    if span_has(part, byte) {
                        return Some((part, HoverToken::Idea(name)));
                    }
                }
                if let (Some(name), Some(part)) = (ideaset.as_deref(), parts.ideaset) {
                    if span_has(part, byte) {
                        return Some((part, HoverToken::Idea(name)));
                    }
                }
                span_has(parts.idea, byte).then_some((parts.idea, HoverToken::Idea(idea)))
            }
            ReferenceTarget::File { span, file }
            | ReferenceTarget::FileSymbol { span, file, .. } => {
                Some((*span, HoverToken::Path(file)))
            }
            ReferenceTarget::Url { span, url } => Some((*span, HoverToken::Path(url))),
            ReferenceTarget::Wildcard { span, path_pattern, idea_pattern } => {
                if let Some(path_span) = authored_path_span(&self.text, *span, path_pattern) {
                    if span_has(path_span, byte) {
                        return Some((path_span, HoverToken::Path(path_pattern)));
                    }
                }
                if let Some(leaf) = ident_span_from(&self.text, *span, span.start, idea_pattern) {
                    if span_has(leaf, byte) {
                        return Some((leaf, HoverToken::Wildcard(path_pattern, idea_pattern)));
                    }
                }
                None
            }
        }
    }

    fn hover_hit_for_token(
        &self,
        range: Range,
        token: HoverToken<'_>,
        markdown_of: &dyn Fn(&str) -> Option<String>,
    ) -> HoverHit {
        match token {
            HoverToken::Idea(idea) => {
                let summary = self.summary_of(idea);
                let local = self.has_idea(idea);
                let external = match local_name_binding(&self.model.imports, idea) {
                    Some(LocalNameBinding::Imported { path, idea: imported }) if !local => {
                        Some((path, imported))
                    }
                    _ => None,
                };
                let markdown = if local { markdown_of(idea) } else { None };
                HoverHit { range, name: idea.to_string(), summary, markdown, external }
            }
            HoverToken::ExternalIdea(path, idea) => HoverHit {
                range,
                name: idea.to_string(),
                summary: self.summary_of(idea),
                markdown: None,
                external: Some((path.to_string(), idea.to_string())),
            },
            HoverToken::Path(path) => HoverHit {
                range,
                name: path.to_string(),
                summary: String::new(),
                markdown: None,
                external: None,
            },
            HoverToken::Wildcard(path_pattern, idea_pattern) => HoverHit {
                range,
                name: format!("{path_pattern}.{idea_pattern}"),
                summary: String::new(),
                markdown: None,
                external: None,
            },
        }
    }

    fn summary_of(&self, name: &str) -> String {
        self.names
            .iter()
            .find(|item| item.name == name)
            .map(|item| item.summary.clone())
            .unwrap_or_default()
    }

    pub fn highlights(&self, pos: Position) -> Vec<DocumentHighlight> {
        let Some(name) = self.name_at(pos) else {
            return Vec::new();
        };
        let mut out = Vec::new();
        for idea in &self.names {
            if idea.name == name {
                out.push(DocumentHighlight {
                    range: idea.range,
                    kind: Some(DocumentHighlightKind::TEXT),
                });
            }
        }
        walk_refs(&self.model, &mut |target, _| {
            let label = match target {
                ReferenceTarget::Local { idea, .. } | ReferenceTarget::Qualified { idea, .. } => {
                    idea.as_str()
                }
                _ => return,
            };
            if label == name {
                let span = target_span(target);
                out.push(DocumentHighlight {
                    range: self.lines.range(&self.text, span.start, span.end),
                    kind: Some(DocumentHighlightKind::TEXT),
                });
            }
        });
        out
    }

    pub(crate) fn syntax(&self) -> &Model {
        &self.model
    }

    /// Expand-selection chain, innermost range first.
    /// rq:["../../../reqlan rq/extension/language/vsc-primitives.rq".selection_range]
    pub fn selection_range(&self, pos: Position) -> SelectionRange {
        let mut byte = self.lines.byte_at(&self.text, pos);
        if byte >= self.text.len() && !self.text.is_empty() {
            byte = self.text.len() - 1;
        }
        let mut spans = Vec::new();
        if !self.text.is_empty() {
            collect_selection_spans(&self.text, &self.model, byte, &mut spans);
            spans.push((0, self.text.len()));
        }
        chain_selection(nested_selection_ranges(&self.text, &self.lines, byte, spans))
            .unwrap_or(SelectionRange { range: Range { start: pos, end: pos }, parent: None })
    }

    pub(crate) fn workspace_root(&self) -> Option<&Path> {
        self.workspace.as_deref()
    }

    /// Attribute key and value completion. Other sites return an empty list.
    pub fn completion(&self, pos: Position, catalog: &AttributeCatalog) -> Vec<CompletionItem> {
        let prefix = line_prefix(&self.text, &self.lines, pos);
        let mut items = Vec::new();
        if let Some((key, value_prefix)) = attribute_value_prefix(&prefix) {
            let values = catalog.values_by_key.get(key).into_iter().flatten();
            for value in values {
                if value.starts_with(value_prefix) {
                    items.push(CompletionItem {
                        label: value.clone(),
                        kind: Some(CompletionItemKind::VALUE),
                        detail: Some(format!("@{key}")),
                        ..CompletionItem::default()
                    });
                }
            }
            return items;
        }
        if let Some(attr) = attribute_prefix(&prefix) {
            let keys = if catalog.keys.is_empty() {
                ENDORSED_ATTRIBUTE_KEYS.iter().map(|key| (*key).to_string()).collect()
            } else {
                catalog.keys.clone()
            };
            for key in keys {
                if key.starts_with(attr) {
                    items.push(CompletionItem {
                        label: key,
                        kind: Some(CompletionItemKind::PROPERTY),
                        ..CompletionItem::default()
                    });
                }
            }
            return items;
        }
        items
    }

    pub(crate) fn attribute_completion_site(&self, pos: Position) -> bool {
        let prefix = line_prefix(&self.text, &self.lines, pos);
        attribute_value_prefix(&prefix).is_some() || attribute_prefix(&prefix).is_some()
    }

    pub fn reference_locations(&self, doc_uri: &str, name: &str) -> Vec<Location> {
        let mut out = Vec::new();
        for idea in &self.names {
            if idea.name == name {
                out.push(Location { uri: parse_url(doc_uri), range: idea.range });
            }
        }
        walk_refs(&self.model, &mut |target, _| {
            let label = match target {
                ReferenceTarget::Local { idea, .. } | ReferenceTarget::Qualified { idea, .. } => {
                    idea.as_str()
                }
                _ => return,
            };
            if label != name {
                return;
            }
            let span = target_span(target);
            out.push(Location {
                uri: parse_url(doc_uri),
                range: self.lines.range(&self.text, span.start, span.end),
            });
        });
        out
    }

    pub fn prepare_rename(&self, pos: Position) -> Option<Range> {
        self.names
            .iter()
            .find(|idea| range_contains(idea.range, pos))
            .map(|idea| idea.range)
            .or_else(|| {
                let mut found = None;
                walk_refs(&self.model, &mut |target, _| {
                    let span = target_span(target);
                    let range = self.lines.range(&self.text, span.start, span.end);
                    if range_contains(range, pos) {
                        if let ReferenceTarget::Local { .. } | ReferenceTarget::Qualified { .. } =
                            target
                        {
                            found = Some(range);
                        }
                    }
                });
                found
            })
    }

    pub fn name_at(&self, pos: Position) -> Option<String> {
        if let Some(idea) = self.names.iter().find(|idea| range_contains(idea.range, pos)) {
            return Some(idea.name.clone());
        }
        let mut found = None;
        walk_refs(&self.model, &mut |target, _| {
            let span = target_span(target);
            if range_contains(self.lines.range(&self.text, span.start, span.end), pos) {
                if let ReferenceTarget::Local { idea, .. }
                | ReferenceTarget::Qualified { idea, .. } = target
                {
                    found = Some(idea.clone());
                }
            }
        });
        found
    }

    pub(crate) fn exported_names(&self) -> Vec<(String, &'static str)> {
        self.model
            .elements
            .iter()
            .filter_map(|element| match element {
                TopLevelElement::Idea(idea) => Some((idea.name.clone(), "idea")),
                TopLevelElement::OneLiner(idea) => Some((idea.name.clone(), "oneliner")),
                TopLevelElement::IdeaSet(set) => Some((set.name.clone(), "ideaset")),
                TopLevelElement::Anonymous(_) => None,
            })
            .collect()
    }

    pub fn code_actions(
        &self,
        range: Range,
        doc_uri: &str,
        context_diagnostics: &[Diagnostic],
        only: &[String],
        server_diagnostics: &[Diagnostic],
        symbols: &[crate::code_actions::SymbolHit],
    ) -> Vec<CodeActionOrCommand> {
        crate::code_actions::collect(crate::code_actions::ActionRequest {
            text: &self.text,
            lines: &self.lines,
            model: &self.model,
            names: &self.names,
            range,
            doc_uri,
            context_diagnostics,
            only,
            server_diagnostics,
            symbols,
        })
    }

    pub fn inlays(
        &self,
        doc_uri: &str,
        referencers: &[(String, Vec<InboundReferencer>)],
    ) -> Vec<InlayHint> {
        let mut hints = Vec::new();
        for (name, names) in referencers {
            let Some((label, tooltip)) = inbound_inlay(doc_uri, name, names) else {
                continue;
            };
            if let Some(idea) = self.names.iter().find(|idea| idea.name == *name) {
                hints.push(InlayHint {
                    position: idea.range.end,
                    label,
                    kind: None,
                    text_edits: None,
                    tooltip: Some(InlayHintTooltip::MarkupContent(tooltip)),
                    padding_left: Some(true),
                    padding_right: None,
                    data: None,
                });
            }
        }
        hints
    }

    pub fn file_reference_at(&self, pos: Position) -> Option<serde_json::Value> {
        let byte = self.byte_at(pos);
        if let Some(
            ReferenceTarget::File { span, file } | ReferenceTarget::FileSymbol { span, file, .. },
        ) = self.ref_at(byte)
        {
            let range = self.lines.range(&self.text, span.start, span.end);
            return Some(file_reference_value(file, range, self.locate(file)));
        }
        let import =
            self.model.imports.iter().find(|import| span_has(import_span(import), byte))?;
        let span = import_span(import);
        let range = self.lines.range(&self.text, span.start, span.end);
        let path = import.path()?;
        Some(file_reference_value(path, range, self.locate(path)))
    }

    pub fn wildcard_at(&self, pos: Position, from_uri: &str) -> Option<serde_json::Value> {
        let ReferenceTarget::Wildcard { path_pattern, idea_pattern, .. } =
            self.ref_at(self.byte_at(pos))?
        else {
            return None;
        };
        Some(serde_json::json!({
            "pathPattern": path_pattern,
            "ideaPattern": idea_pattern,
            "fromUri": from_uri,
        }))
    }

    pub fn search_site(&self, range: Range, doc_uri: &str) -> Option<serde_json::Value> {
        let mut site = None;
        walk_refs(&self.model, &mut |target, _| {
            let span = target_span(target);
            let target_range = self.lines.range(&self.text, span.start, span.end);
            if ranges_overlap(target_range, range) {
                if let ReferenceTarget::Local { idea, .. }
                | ReferenceTarget::Qualified { idea, .. } = target
                {
                    site = Some(serde_json::json!({
                        "documentUri": doc_uri,
                        "refText": idea,
                        "range": target_range,
                        "mode": "replace",
                    }));
                }
            }
        });
        if site.is_some() {
            return site;
        }
        let start = self.lines.byte_at(&self.text, range.start);
        let end = self.lines.byte_at(&self.text, range.end);
        if end > start {
            let text = self.text[start..end].trim().to_string();
            if !text.is_empty() {
                return Some(serde_json::json!({
                    "documentUri": doc_uri,
                    "refText": text,
                    "range": range,
                    "mode": "wrap",
                }));
            }
        }
        None
    }
}

pub fn rename_edits(text: &str, lines: &LineMap, old: &str, new_name: &str) -> Vec<TextEdit> {
    if old.is_empty() || old == new_name {
        return Vec::new();
    }
    let mut edits = Vec::new();
    for (index, line) in text.split('\n').enumerate() {
        let trimmed = line.trim_end_matches('\r');
        if definition_line(trimmed, old) {
            let character = utf16_len(&trimmed[..trimmed.find(old).unwrap_or(0)]);
            edits.push(TextEdit {
                range: Range {
                    start: Position { line: index as u32, character },
                    end: Position { line: index as u32, character: character + utf16_len(old) },
                },
                new_text: new_name.to_string(),
            });
        }
    }
    let needles = [
        format!("[{old}]"),
        format!("[[{old}]]"),
        format!("[[{old}|"),
        format!("rq:[{old}]"),
        format!("rq:[[{old}]]"),
    ];
    let replacements = [
        format!("[{new_name}]"),
        format!("[[{new_name}]]"),
        format!("[[{new_name}|"),
        format!("rq:[{new_name}]"),
        format!("rq:[[{new_name}]]"),
    ];
    for (needle, replacement) in needles.iter().zip(replacements.iter()) {
        let mut from = 0;
        while let Some(found) = text[from..].find(needle) {
            let start = from + found;
            let end = start + needle.len();
            edits.push(TextEdit {
                range: lines.range(text, start, end),
                new_text: replacement.clone(),
            });
            from = end;
        }
    }
    // Also rewrite path-qualified comment sites that end with ."old"] / .'old'] / ."old" / .'old'
    let qualified = [
        (format!("\".{old}]"), format!("\".{new_name}]")),
        (format!("'.{old}]"), format!("'.{new_name}]")),
        (format!("\".{old}\""), format!("\".{new_name}\"")),
        (format!("'.{old}'"), format!("'.{new_name}'")),
    ];
    for (needle, replacement) in qualified {
        let mut from = 0;
        while let Some(found) = text[from..].find(&needle) {
            let start = from + found;
            let end = start + needle.len();
            let before = &text[..start];
            if before.contains("rq:[") || before.rfind('[').is_some() {
                edits.push(TextEdit {
                    range: lines.range(text, start, end),
                    new_text: replacement.clone(),
                });
            }
            from = end;
        }
    }
    edits.sort_by_key(|edit| (edit.range.start.line, edit.range.start.character));
    edits.dedup_by(|left, right| left.range == right.range);
    edits
}

fn definition_line(line: &str, name: &str) -> bool {
    let Some(rest) = line.trim_start().strip_prefix(name) else {
        return false;
    };
    rest.is_empty()
        || rest.starts_with(' ')
        || rest.starts_with('{')
        || rest.starts_with(':')
        || rest.starts_with('(')
}

fn collect_model(
    text: &str,
    lines: &LineMap,
    model: &Model,
    symbolic: &LocalSymbolicDocument,
    tokens: &mut Vec<RawToken>,
    names: &mut Vec<NameLoc>,
) {
    for import in &model.imports {
        push_import_tokens(text, import, tokens);
    }
    for element in &model.elements {
        match element {
            TopLevelElement::Idea(idea) => {
                push_name(text, lines, idea.span, &idea.name, symbolic, tokens, names, TYPE_IDEA);
                walk_body(text, idea.span, &idea.elements, tokens);
            }
            TopLevelElement::OneLiner(idea) => {
                push_name(text, lines, idea.span, &idea.name, symbolic, tokens, names, TYPE_IDEA);
                walk_parts(text, &idea.body, tokens);
            }
            TopLevelElement::IdeaSet(set) => {
                push_name(
                    text,
                    lines,
                    set.span,
                    &set.name,
                    symbolic,
                    tokens,
                    names,
                    TYPE_NAMESPACE,
                );
            }
            TopLevelElement::Anonymous(block) => {
                walk_body(text, block.span, &block.elements, tokens)
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn push_name(
    text: &str,
    lines: &LineMap,
    span: Span,
    name: &str,
    symbolic: &LocalSymbolicDocument,
    tokens: &mut Vec<RawToken>,
    names: &mut Vec<NameLoc>,
    kind: u32,
) {
    let Some((start, end)) = find_in_span(text, span, name) else {
        return;
    };
    tokens.push(RawToken { start, end, kind, modifiers: MOD_DEFINITION });
    let range = lines.range(text, start, end);
    let summary = symbolic
        .ideas
        .iter()
        .find(|idea| idea.name == name)
        .map(|idea| idea.summary.clone())
        .unwrap_or_default();
    names.push(NameLoc { name: name.to_string(), range, summary, line: range.start.line });
}

fn walk_body(text: &str, _span: Span, elements: &[BodyElement], tokens: &mut Vec<RawToken>) {
    for element in elements {
        match element {
            BodyElement::Attribute(attr) => walk_attribute(text, attr, tokens),
            BodyElement::BodyLine(line) => walk_parts(text, &line.parts, tokens),
            BodyElement::NamedList(list) => walk_items(text, &list.items, tokens),
            BodyElement::NestedList(list) => walk_items(text, &list.items, tokens),
            BodyElement::CodeSnippet(_) => {}
        }
    }
}

fn walk_attribute(text: &str, attr: &Attribute, tokens: &mut Vec<RawToken>) {
    if let Some((start, end)) = find_in_span(text, attr.span, &attr.name) {
        if start > 0 && text.as_bytes().get(start - 1) == Some(&b'@') {
            tokens.push(RawToken {
                start: start - 1,
                end: start,
                kind: TYPE_OPERATOR,
                modifiers: 0,
            });
        }
        tokens.push(RawToken { start, end, kind: TYPE_DECORATOR, modifiers: 0 });
    }
    match &attr.value {
        Some(AttributeValue::Scalar(value)) => walk_parts(text, &value.parts, tokens),
        Some(AttributeValue::List(value)) => walk_items(text, &value.items, tokens),
        Some(AttributeValue::Block(value)) => walk_body(text, value.span, &value.elements, tokens),
        None => {}
    }
}

fn walk_items(text: &str, items: &[ListItem], tokens: &mut Vec<RawToken>) {
    for item in items {
        match item {
            ListItem::OneLiner(parts) => walk_parts(text, parts, tokens),
            ListItem::Anonymous(block) => walk_body(text, block.span, &block.elements, tokens),
            ListItem::NamedBlock(item) => walk_body(text, item.span, &item.elements, tokens),
            ListItem::Nested(list) => walk_items(text, &list.items, tokens),
        }
    }
}

fn walk_parts(text: &str, parts: &[RichPart], tokens: &mut Vec<RawToken>) {
    for part in parts {
        match part {
            RichPart::BracketRef { target, .. } | RichPart::WikiLink { target, .. } => {
                token_for_target(text, target, tokens);
            }
            RichPart::InlineCode { .. } | RichPart::Text { .. } | RichPart::MarkdownLink { .. } => {
            }
        }
    }
}

fn token_for_target(text: &str, target: &ReferenceTarget, tokens: &mut Vec<RawToken>) {
    match target {
        ReferenceTarget::Local { span, idea } => {
            if let Some((start, end)) = find_in_span(text, *span, idea) {
                tokens.push(RawToken { start, end, kind: TYPE_VARIABLE, modifiers: 0 });
            }
        }
        ReferenceTarget::Qualified { span, path, qualifier, ideaset, idea } => {
            if let Some(path) = path {
                if let Some((start, end)) = find_in_span(text, *span, path) {
                    tokens.push(RawToken { start, end, kind: TYPE_STRING, modifiers: 0 });
                }
            }
            if let Some(qualifier) = qualifier.as_ref().or(ideaset.as_ref()) {
                if let Some((start, end)) = find_in_span(text, *span, qualifier) {
                    tokens.push(RawToken { start, end, kind: TYPE_NAMESPACE, modifiers: 0 });
                }
            }
            if let Some((start, end)) = find_in_span(text, *span, idea) {
                tokens.push(RawToken { start, end, kind: TYPE_VARIABLE, modifiers: 0 });
            }
        }
        ReferenceTarget::File { span, file } => {
            if let Some((start, end)) = find_in_span(text, *span, file) {
                tokens.push(RawToken { start, end, kind: TYPE_STRING, modifiers: 0 });
            }
        }
        ReferenceTarget::FileSymbol { span, file, symbols } => {
            let mut cursor = span.start;
            if let Some((start, end)) = find_in_span(text, *span, file) {
                tokens.push(RawToken { start, end, kind: TYPE_STRING, modifiers: 0 });
                cursor = end;
            }
            for symbol in symbols {
                if let Some((start, end)) = find_keyword(text, cursor, span.end, symbol) {
                    tokens.push(RawToken { start, end, kind: TYPE_METHOD, modifiers: 0 });
                    cursor = end;
                }
            }
        }
        ReferenceTarget::Url { span, url } => {
            if let Some((start, end)) = find_in_span(text, *span, url) {
                tokens.push(RawToken { start, end, kind: TYPE_STRING, modifiers: 0 });
            }
        }
        ReferenceTarget::Wildcard { span, path_pattern, idea_pattern } => {
            if let Some((start, end)) = find_in_span(text, *span, path_pattern) {
                tokens.push(RawToken { start, end, kind: TYPE_STRING, modifiers: 0 });
            }
            if let Some((start, end)) = find_in_span(text, *span, idea_pattern) {
                tokens.push(RawToken { start, end, kind: TYPE_VARIABLE, modifiers: 0 });
            }
        }
    }
}

pub(crate) fn walk_refs(model: &Model, visit: &mut dyn FnMut(&ReferenceTarget, Span)) {
    for element in &model.elements {
        match element {
            TopLevelElement::Idea(idea) => walk_body_refs(&idea.elements, visit),
            TopLevelElement::OneLiner(idea) => walk_part_refs(&idea.body, visit),
            TopLevelElement::Anonymous(block) => walk_body_refs(&block.elements, visit),
            TopLevelElement::IdeaSet(_) => {}
        }
    }
}

fn walk_body_refs(elements: &[BodyElement], visit: &mut dyn FnMut(&ReferenceTarget, Span)) {
    for element in elements {
        match element {
            BodyElement::Attribute(attr) => match &attr.value {
                Some(AttributeValue::Scalar(value)) => walk_part_refs(&value.parts, visit),
                Some(AttributeValue::List(value)) => walk_item_refs(&value.items, visit),
                Some(AttributeValue::Block(value)) => walk_body_refs(&value.elements, visit),
                None => {}
            },
            BodyElement::BodyLine(line) => walk_part_refs(&line.parts, visit),
            BodyElement::NamedList(list) => walk_item_refs(&list.items, visit),
            BodyElement::NestedList(list) => walk_item_refs(&list.items, visit),
            BodyElement::CodeSnippet(_) => {}
        }
    }
}

fn walk_item_refs(items: &[ListItem], visit: &mut dyn FnMut(&ReferenceTarget, Span)) {
    for item in items {
        match item {
            ListItem::OneLiner(parts) => walk_part_refs(parts, visit),
            ListItem::Anonymous(block) => walk_body_refs(&block.elements, visit),
            ListItem::NamedBlock(item) => walk_body_refs(&item.elements, visit),
            ListItem::Nested(list) => walk_item_refs(&list.items, visit),
        }
    }
}

fn walk_part_refs(parts: &[RichPart], visit: &mut dyn FnMut(&ReferenceTarget, Span)) {
    for part in parts {
        match part {
            RichPart::BracketRef { span, target } | RichPart::WikiLink { span, target, .. } => {
                visit(target, *span);
            }
            _ => {}
        }
    }
}

enum LocalNameKind {
    Block,
    OneLiner,
    IdeaSet,
}

struct DottedParts {
    qualifier: Option<Span>,
    ideaset: Option<Span>,
    idea: Span,
}

pub(crate) fn authored_path_span(text: &str, statement: Span, path: &str) -> Option<Span> {
    let double = format!("\"{path}\"");
    let single = format!("'{path}'");
    let (start, end) = find_in_span(text, statement, &double)
        .or_else(|| find_in_span(text, statement, &single))
        .or_else(|| find_in_span(text, statement, path))?;
    Some(Span { start, end, line_start: statement.line_start, line_end: statement.line_end })
}

pub(crate) fn ident_span_from(text: &str, span: Span, from: usize, name: &str) -> Option<Span> {
    if name.is_empty() {
        return None;
    }
    let start = from.max(span.start).min(text.len());
    let end = span.end.min(text.len()).max(start);
    let bytes = text.as_bytes();
    let needle = name.as_bytes();
    let mut index = start;
    while index + needle.len() <= end {
        if &bytes[index..index + needle.len()] == needle {
            let before_ok = index == 0 || !is_ident_byte(bytes[index - 1]);
            let after = index + needle.len();
            let after_ok = after >= bytes.len() || !is_ident_byte(bytes[after]);
            if before_ok && after_ok {
                return Some(Span {
                    start: index,
                    end: after,
                    line_start: span.line_start,
                    line_end: span.line_end,
                });
            }
        }
        index += 1;
    }
    None
}

fn is_ident_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-'
}

fn push_import_tokens(text: &str, import: &Import, tokens: &mut Vec<RawToken>) {
    match import {
        Import::From(from) => {
            push_keyword(text, from.span.start, from.path_span.start, "from", tokens);
            push_span(tokens, from.path_span, TYPE_STRING);
            if !from.specifiers.is_empty() {
                push_keyword(text, from.path_span.end, from.span.end, "import", tokens);
            }
            if let Some(alias) = from.alias_span {
                push_keyword(text, from.path_span.end, alias.start, "as", tokens);
            }
            for specifier in &from.specifiers {
                if let Some(alias) = specifier.alias_span {
                    push_keyword(text, specifier.idea_span.end, alias.start, "as", tokens);
                }
            }
        }
        Import::Namespace(namespace) => {
            push_keyword(text, namespace.span.start, namespace.path_span.start, "import", tokens);
            push_span(tokens, namespace.path_span, TYPE_STRING);
            if let Some(alias) = namespace.alias_span {
                push_keyword(text, namespace.path_span.end, alias.start, "as", tokens);
            }
        }
        Import::Qualified(qualified) => {
            push_keyword(text, qualified.span.start, qualified.path_span.start, "import", tokens);
            push_span(tokens, qualified.path_span, TYPE_STRING);
            if let Some(alias) = qualified.alias_span {
                push_keyword(text, qualified.idea_span.end, alias.start, "as", tokens);
            }
        }
        Import::InvalidFrom(invalid) => {
            push_keyword(text, invalid.span.start, invalid.span.end, "from", tokens);
        }
    }
}

fn push_span(tokens: &mut Vec<RawToken>, span: Span, kind: u32) {
    tokens.push(RawToken { start: span.start, end: span.end, kind, modifiers: 0 });
}

fn push_keyword(text: &str, from: usize, limit: usize, word: &str, tokens: &mut Vec<RawToken>) {
    if let Some((start, end)) = find_keyword(text, from, limit, word) {
        tokens.push(RawToken { start, end, kind: TYPE_KEYWORD, modifiers: 0 });
    }
}

/// Whole-word match. Quoted strings are skipped so a path cannot supply the keyword.
fn find_keyword(text: &str, from: usize, limit: usize, word: &str) -> Option<(usize, usize)> {
    let bytes = text.as_bytes();
    let start = from.min(bytes.len());
    let end = limit.min(bytes.len()).max(start);
    let needle = word.as_bytes();
    if needle.is_empty() || start + needle.len() > end {
        return None;
    }
    let mut index = start;
    while index + needle.len() <= end {
        let byte = bytes[index];
        if byte == b'"' || byte == b'\'' {
            let quote = byte;
            index += 1;
            while index < end && bytes[index] != quote {
                if bytes[index] == b'\\' {
                    index += 1;
                }
                index += 1;
            }
            index += 1;
            continue;
        }
        let before_ok = index == 0 || !is_ident_byte(bytes[index - 1]);
        if before_ok && bytes[index..].starts_with(needle) {
            let after = index + needle.len();
            let after_ok = after >= bytes.len() || !is_ident_byte(bytes[after]);
            if after_ok && after <= end {
                return Some((index, after));
            }
        }
        index += 1;
    }
    None
}

fn find_in_span(text: &str, span: Span, needle: &str) -> Option<(usize, usize)> {
    if needle.is_empty() {
        return None;
    }
    let start = span.start.min(text.len());
    let end = span.end.min(text.len()).max(start);
    let slice = &text[start..end];
    let index = slice.find(needle)?;
    Some((start + index, start + index + needle.len()))
}

fn target_span(target: &ReferenceTarget) -> Span {
    match target {
        ReferenceTarget::Local { span, .. }
        | ReferenceTarget::Qualified { span, .. }
        | ReferenceTarget::File { span, .. }
        | ReferenceTarget::Url { span, .. }
        | ReferenceTarget::FileSymbol { span, .. }
        | ReferenceTarget::Wildcard { span, .. } => *span,
    }
}

fn import_span(import: &Import) -> Span {
    match import {
        Import::From(import) => import.span,
        Import::Namespace(import) => import.span,
        Import::Qualified(import) => import.span,
        Import::InvalidFrom(import) => import.span,
    }
}

fn push_diag(
    out: &mut Vec<Diagnostic>,
    ignored: &std::collections::HashSet<u32>,
    range: Range,
    message: String,
    severity: DiagnosticSeverity,
) {
    if ignored.contains(&range.start.line) {
        return;
    }
    out.push(Diagnostic {
        range,
        message,
        severity: Some(severity),
        source: Some("reqlan".into()),
        ..Diagnostic::default()
    });
}

fn link(doc: &DocModel, span: Span, target: Url) -> DocumentLink {
    DocumentLink {
        range: doc.lines.range(&doc.text, span.start, span.end),
        target: Some(target),
        tooltip: None,
        data: None,
    }
}

fn line_prefix(text: &str, lines: &LineMap, pos: Position) -> String {
    let byte = lines.byte_at(text, pos);
    let line_start = text[..byte].rfind('\n').map(|index| index + 1).unwrap_or(0);
    text[line_start..byte].to_string()
}

fn attribute_prefix(prefix: &str) -> Option<&str> {
    let trimmed = prefix.trim_start();
    let rest = trimmed.strip_prefix('@')?;
    if rest.contains(char::is_whitespace) {
        return None;
    }
    Some(rest)
}

fn attribute_value_prefix(prefix: &str) -> Option<(&str, &str)> {
    let trimmed = prefix.trim_start();
    let rest = trimmed.strip_prefix('@')?;
    let mut parts = rest.splitn(2, char::is_whitespace);
    let key = parts.next()?;
    let value = parts.next()?;
    if key.is_empty() {
        return None;
    }
    Some((key, value))
}

fn existing_path(path: &str) -> Option<PathBuf> {
    let unquoted = unquote_path(path);
    if unquoted.contains("://") {
        return None;
    }
    for candidate in import_path_candidates(&unquoted) {
        let path = PathBuf::from(&candidate);
        if path.is_file() || path.is_dir() {
            return Some(path);
        }
    }
    None
}

fn existing_path_candidates(
    authored: &str,
    from_file: &str,
    roots: &[ImportRootMapping],
) -> Option<PathBuf> {
    let unquoted = unquote_path(authored);
    if unquoted.contains("://") {
        return None;
    }
    for candidate in import_path_candidates(&unquoted) {
        let resolved = reqlan_parse::resolve_rq_path(&candidate, from_file, roots);
        if let Some(path) = existing_path(&resolved) {
            return Some(path);
        }
    }
    None
}

fn inbound_inlay(
    doc_uri: &str,
    idea: &str,
    referencers: &[InboundReferencer],
) -> Option<(InlayHintLabel, MarkupContent)> {
    if referencers.is_empty() {
        return None;
    }
    let tooltip = inbound_tooltip(referencers);
    let mut parts = vec![inlay_text("@referenced-by: (")];
    for (index, referencer) in referencers.iter().take(3).enumerate() {
        if index > 0 {
            parts.push(inlay_text(", "));
        }
        parts.push(inlay_referencer(referencer));
    }
    let extra = referencers.len().saturating_sub(3);
    if extra > 0 {
        parts.push(inlay_text(", "));
        parts.push(InlayHintLabelPart {
            value: format!("+{extra} more"),
            tooltip: Some(InlayHintLabelPartTooltip::MarkupContent(tooltip.clone())),
            location: None,
            command: Some(Command {
                title: "Show all inbound references".into(),
                command: "reqlan.openInboundReferencesSummary".into(),
                arguments: Some(vec![serde_json::json!(doc_uri), serde_json::json!(idea)]),
            }),
        });
    }
    parts.push(inlay_text(")"));
    Some((InlayHintLabel::LabelParts(parts), tooltip))
}

fn inbound_tooltip(referencers: &[InboundReferencer]) -> MarkupContent {
    let items = referencers
        .iter()
        .map(|referencer| format!("- {}", referencer_markdown_link(referencer)))
        .collect::<Vec<_>>()
        .join("\n");
    MarkupContent { kind: MarkupKind::Markdown, value: format!("**Referenced by**\n\n{items}") }
}

/// File URL for an inbound referencer — same encoding as goto (`Url::from_file_path`).
/// Inlay label clicks use this as `location`; tooltips use it via `location_url`.
/// rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".traceable_inlay_hints]
fn referencer_file_url(uri: &str) -> Option<Url> {
    if uri.is_empty() {
        return None;
    }
    Some(parse_url(uri))
}

fn referencer_markdown_link(referencer: &InboundReferencer) -> String {
    let Some(base) = referencer_file_url(&referencer.uri) else {
        return referencer.name.clone();
    };
    // Document-link fragment builder; markdown `#L` is 1-based.
    let target = location_url(&base, referencer.line.saturating_add(1));
    format!("[{}]({})", referencer.name, target.as_str())
}

fn inlay_text(value: &str) -> InlayHintLabelPart {
    InlayHintLabelPart { value: value.to_string(), tooltip: None, location: None, command: None }
}

fn inlay_referencer(referencer: &InboundReferencer) -> InlayHintLabelPart {
    let link = referencer_markdown_link(referencer);
    // Command only: when Location is also set, VS Code ignores the command on click.
    // Host `reqlan.openInboundReferencer` opens via openIndexFile (same as activity bar).
    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".traceable_inlay_hints]
    let command = referencer_file_url(&referencer.uri).map(|uri| Command {
        title: format!("Open {}", referencer.name),
        command: "reqlan.openInboundReferencer".into(),
        arguments: Some(vec![serde_json::json!(uri.as_str()), serde_json::json!(referencer.line)]),
    });
    InlayHintLabelPart {
        value: referencer.name.clone(),
        tooltip: Some(InlayHintLabelPartTooltip::MarkupContent(MarkupContent {
            kind: MarkupKind::Markdown,
            value: link,
        })),
        location: None,
        command,
    }
}

pub(crate) fn span_has(span: Span, byte: usize) -> bool {
    span.start <= byte && byte < span.end
}

fn collect_selection_spans(text: &str, model: &Model, byte: usize, out: &mut Vec<(usize, usize)>) {
    push_covered(out, model.span, byte, text.len());
    for import in &model.imports {
        collect_import(text, import, byte, out);
    }
    for element in &model.elements {
        collect_top(text, element, byte, out);
    }
}

fn collect_import(text: &str, import: &Import, byte: usize, out: &mut Vec<(usize, usize)>) {
    match import {
        Import::From(from) => {
            push_covered(out, from.span, byte, text.len());
            push_covered(out, from.path_span, byte, text.len());
            if let Some(span) = from.alias_span {
                push_covered(out, span, byte, text.len());
            }
            for specifier in &from.specifiers {
                push_covered(out, specifier.span, byte, text.len());
                push_covered(out, specifier.idea_span, byte, text.len());
                if let Some(span) = specifier.alias_span {
                    push_covered(out, span, byte, text.len());
                }
            }
        }
        Import::Namespace(import) => {
            push_covered(out, import.span, byte, text.len());
            push_covered(out, import.path_span, byte, text.len());
            if let Some(span) = import.alias_span {
                push_covered(out, span, byte, text.len());
            }
        }
        Import::Qualified(import) => {
            push_covered(out, import.span, byte, text.len());
            push_covered(out, import.path_span, byte, text.len());
            push_covered(out, import.ideaset_span, byte, text.len());
            push_covered(out, import.idea_span, byte, text.len());
            if let Some(span) = import.alias_span {
                push_covered(out, span, byte, text.len());
            }
        }
        Import::InvalidFrom(import) => push_covered(out, import.span, byte, text.len()),
    }
}

fn collect_top(text: &str, element: &TopLevelElement, byte: usize, out: &mut Vec<(usize, usize)>) {
    match element {
        TopLevelElement::Idea(idea) => {
            push_covered(out, idea.span, byte, text.len());
            push_leading_name(text, idea.span, &idea.name, byte, out);
            collect_body(text, &idea.elements, byte, out);
        }
        TopLevelElement::IdeaSet(set) => {
            push_covered(out, set.span, byte, text.len());
            push_leading_name(text, set.span, &set.name, byte, out);
            push_piece(text, set.span, byte, out);
        }
        TopLevelElement::OneLiner(idea) => {
            push_covered(out, idea.span, byte, text.len());
            push_leading_name(text, idea.span, &idea.name, byte, out);
            collect_parts(text, &idea.body, byte, out);
        }
        TopLevelElement::Anonymous(block) => {
            push_covered(out, block.span, byte, text.len());
            collect_body(text, &block.elements, byte, out);
        }
    }
}

fn collect_body(text: &str, elements: &[BodyElement], byte: usize, out: &mut Vec<(usize, usize)>) {
    for element in elements {
        match element {
            BodyElement::Attribute(attr) => collect_attribute(text, attr, byte, out),
            BodyElement::CodeSnippet(snippet) => push_covered(out, snippet.span, byte, text.len()),
            BodyElement::NamedList(list) => {
                push_covered(out, list.span, byte, text.len());
                push_leading_name(text, list.span, &list.label, byte, out);
                collect_items(text, &list.items, byte, out);
            }
            BodyElement::NestedList(list) => {
                push_covered(out, list.span, byte, text.len());
                collect_items(text, &list.items, byte, out);
            }
            BodyElement::BodyLine(line) => {
                push_covered(out, line.span, byte, text.len());
                collect_parts(text, &line.parts, byte, out);
            }
        }
    }
}

fn collect_attribute(text: &str, attr: &Attribute, byte: usize, out: &mut Vec<(usize, usize)>) {
    push_covered(out, attr.span, byte, text.len());
    if let Some(span) = attribute_key_span(text, attr) {
        push_covered(out, span, byte, text.len());
    }
    match &attr.value {
        Some(AttributeValue::Scalar(value)) => {
            push_covered(out, value.span, byte, text.len());
            collect_parts(text, &value.parts, byte, out);
        }
        Some(AttributeValue::List(value)) => {
            push_covered(out, value.span, byte, text.len());
            collect_items(text, &value.items, byte, out);
        }
        Some(AttributeValue::Block(value)) => {
            push_covered(out, value.span, byte, text.len());
            collect_body(text, &value.elements, byte, out);
        }
        None => {}
    }
}

fn collect_items(text: &str, items: &[ListItem], byte: usize, out: &mut Vec<(usize, usize)>) {
    for item in items {
        match item {
            ListItem::OneLiner(parts) => {
                if let Some(span) = parts_span(parts) {
                    push_covered(out, span, byte, text.len());
                }
                collect_parts(text, parts, byte, out);
            }
            ListItem::Anonymous(block) => {
                push_covered(out, block.span, byte, text.len());
                collect_body(text, &block.elements, byte, out);
            }
            ListItem::NamedBlock(item) => {
                push_covered(out, item.span, byte, text.len());
                push_leading_name(text, item.span, &item.name, byte, out);
                collect_body(text, &item.elements, byte, out);
            }
            ListItem::Nested(list) => {
                push_covered(out, list.span, byte, text.len());
                collect_items(text, &list.items, byte, out);
            }
        }
    }
}

fn collect_parts(text: &str, parts: &[RichPart], byte: usize, out: &mut Vec<(usize, usize)>) {
    for part in parts {
        push_covered(out, part.span(), byte, text.len());
        match part {
            RichPart::BracketRef { target, .. } | RichPart::WikiLink { target, .. } => {
                push_covered(out, target.span(), byte, text.len());
                push_piece(text, target.span(), byte, out);
            }
            RichPart::InlineCode { span, .. } | RichPart::MarkdownLink { span, .. } => {
                push_piece(text, *span, byte, out);
            }
            RichPart::Text { .. } => {}
        }
    }
}

fn attribute_key_span(text: &str, attr: &Attribute) -> Option<Span> {
    if attr.name.is_empty() {
        return None;
    }
    let start = attr.span.start.min(text.len());
    let end = attr.span.end.min(text.len()).max(start);
    let bytes = text.as_bytes();
    if bytes.get(start) != Some(&b'@') {
        return ident_span_from(text, attr.span, start, &attr.name);
    }
    let name_at = start + 1;
    if name_at + attr.name.len() > end || !text[name_at..].starts_with(&attr.name) {
        return ident_span_from(text, attr.span, start, &attr.name);
    }
    let mut key_end = name_at + attr.name.len();
    if attr.negated && bytes.get(key_end) == Some(&b'!') {
        key_end += 1;
    }
    Some(Span {
        start,
        end: key_end,
        line_start: attr.span.line_start,
        line_end: attr.span.line_end,
    })
}

fn parts_span(parts: &[RichPart]) -> Option<Span> {
    let mut spans = parts.iter().map(RichPart::span);
    let first = spans.next()?;
    let mut start = first.start;
    let mut end = first.end;
    let mut line_start = first.line_start;
    let mut line_end = first.line_end;
    for span in spans {
        start = start.min(span.start);
        end = end.max(span.end);
        line_start = line_start.min(span.line_start);
        line_end = line_end.max(span.line_end);
    }
    Some(Span { start, end, line_start, line_end })
}

fn push_leading_name(
    text: &str,
    span: Span,
    name: &str,
    byte: usize,
    out: &mut Vec<(usize, usize)>,
) {
    if name.is_empty() {
        return;
    }
    let found = if text.get(span.start..).is_some_and(|rest| rest.starts_with(name)) {
        Some(Span {
            start: span.start,
            end: span.start + name.len(),
            line_start: span.line_start,
            line_end: span.line_end,
        })
    } else {
        ident_span_from(text, span, span.start, name)
    };
    if let Some(found) = found {
        push_covered(out, found, byte, text.len());
    }
}

/// The identifier or quoted string under `byte`, when it is smaller than `span`.
fn push_piece(text: &str, span: Span, byte: usize, out: &mut Vec<(usize, usize)>) {
    let start = span.start.min(text.len());
    let end = span.end.min(text.len()).max(start);
    if !span_has(Span { start, end, line_start: 0, line_end: 0 }, byte) {
        return;
    }
    let bytes = text.as_bytes();
    let mut index = start;
    while index < end {
        if bytes[index] == b'"' || bytes[index] == b'\'' {
            let quote = bytes[index];
            let piece_start = index;
            index += 1;
            while index < end && bytes[index] != quote {
                index += 1;
            }
            if index < end {
                index += 1;
            }
            if piece_start <= byte && byte < index && (piece_start > start || index < end) {
                out.push((piece_start, index));
            }
            continue;
        }
        if is_ident_byte(bytes[index]) {
            let piece_start = index;
            while index < end && is_ident_byte(bytes[index]) {
                index += 1;
            }
            if piece_start <= byte && byte < index && (piece_start > start || index < end) {
                out.push((piece_start, index));
            }
            continue;
        }
        index += 1;
    }
}

fn push_covered(out: &mut Vec<(usize, usize)>, span: Span, byte: usize, text_len: usize) {
    let start = span.start.min(text_len);
    let end = span.end.min(text_len).max(start);
    if start < end && start <= byte && byte < end {
        out.push((start, end));
    }
}

fn nested_selection_ranges(
    text: &str,
    lines: &LineMap,
    byte: usize,
    mut spans: Vec<(usize, usize)>,
) -> Vec<Range> {
    spans.retain(|(start, end)| *start <= byte && byte < *end && start < end);
    spans.sort_by_key(|(start, end)| (*end - *start, *start));
    spans.dedup();
    let mut kept: Vec<(usize, usize)> = Vec::new();
    for (start, end) in spans {
        if let Some((prev_start, prev_end)) = kept.last() {
            if start > *prev_start || end < *prev_end {
                continue;
            }
            if start == *prev_start && end == *prev_end {
                continue;
            }
        }
        kept.push((start, end));
    }
    kept.into_iter().map(|(start, end)| lines.range(text, start, end)).collect()
}

fn chain_selection(ranges: Vec<Range>) -> Option<SelectionRange> {
    let mut parent = None;
    for range in ranges.into_iter().rev() {
        parent = Some(SelectionRange { range, parent: parent.map(Box::new) });
    }
    parent
}

pub(crate) fn line_range(line: u32, name: &str) -> Range {
    Range {
        start: Position { line, character: 0 },
        end: Position { line, character: utf16_len(name) },
    }
}

fn folder_command_url(path: &Path) -> Option<Url> {
    let uri = Url::from_file_path(path).ok()?.to_string();
    command_url("reqlan.openFolderReference", &serde_json::json!([uri]))
}

fn wildcard_command_url(path_pattern: &str, idea_pattern: &str, from_uri: &str) -> Option<Url> {
    command_url(
        "reqlan.openWildcardReference",
        &serde_json::json!([{
            "pathPattern": path_pattern,
            "ideaPattern": idea_pattern,
            "fromUri": from_uri,
        }]),
    )
}

fn command_url(command: &str, args: &serde_json::Value) -> Option<Url> {
    let encoded = encode_uri_component(&serde_json::to_string(args).ok()?);
    Url::parse(&format!("command:{command}?{encoded}")).ok()
}

fn encode_uri_component(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'!'
            | b'~'
            | b'*'
            | b'\''
            | b'('
            | b')' => out.push(byte as char),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// One character at the file start. An empty 0:0–0:0 range does not move the caret, so the
/// editor may skip the JUMP that Alt+Left (navigate-back) needs.
pub(crate) fn file_landing_range() -> Range {
    Range { start: Position { line: 0, character: 0 }, end: Position { line: 0, character: 1 } }
}

fn non_empty_selection(range: Range) -> Range {
    if range.start == range.end {
        file_landing_range()
    } else {
        range
    }
}

fn location_uri(doc_uri: &str, line: u32) -> Url {
    location_url(&parse_url(doc_uri), line)
}

pub(crate) fn location_url(uri: &Url, line: u32) -> Url {
    let mut url = uri.clone();
    url.set_fragment(Some(&format!("L{line}")));
    url
}

/// Parse a document / referencer URI.
/// File URIs round-trip through `Url::from_file_path` (goto encoding).
/// Unencoded `file:` paths with spaces rebuild the same way — `file:` only.
fn parse_url(uri: &str) -> Url {
    if let Ok(url) = Url::parse(uri) {
        if let Ok(path) = url.to_file_path() {
            if let Ok(normalized) = Url::from_file_path(path) {
                return normalized;
            }
        }
        return url;
    }
    if let Some(path) = raw_file_uri_path(uri) {
        if let Ok(url) = Url::from_file_path(path) {
            return url;
        }
    }
    Url::parse("file:///reqlan.rq").expect("static uri")
}

/// Filesystem path from an unencoded `file:` URI or absolute path (not remote schemes).
fn raw_file_uri_path(uri: &str) -> Option<PathBuf> {
    if let Some(rest) = uri.strip_prefix("file://") {
        if rest.starts_with('/') {
            return Some(PathBuf::from(rest));
        }
        let (_, path) = rest.split_once('/')?;
        return Some(PathBuf::from(format!("/{path}")));
    }
    let path = PathBuf::from(uri);
    path.is_absolute().then_some(path)
}

fn file_reference_value(path: &str, range: Range, existing: Option<PathBuf>) -> serde_json::Value {
    let trimmed = path.trim_matches('"').trim_matches('\'');
    let is_dir = existing.as_ref().is_some_and(|path| path.is_dir());
    let target = existing
        .as_ref()
        .and_then(|path| Url::from_file_path(path).ok())
        .map(|url| url.to_string())
        .unwrap_or_else(|| trimmed.to_string());
    let folder_files = if is_dir {
        existing.as_ref().and_then(|path| std::fs::read_dir(path).ok()).map(|read| {
            read.flatten()
                .filter(|entry| entry.path().is_file())
                .filter_map(|entry| entry.file_name().into_string().ok())
                .collect::<Vec<_>>()
        })
    } else {
        None
    };
    let resolution = if is_dir {
        "folder"
    } else if existing.is_some() {
        "file"
    } else {
        "missing"
    };
    serde_json::json!({
        "sourceRange": range,
        "targetUri": target,
        "resolution": resolution,
        "folderFiles": folder_files,
    })
}

fn ranges_overlap(left: Range, right: Range) -> bool {
    range_contains(left, right.start)
        || range_contains(right, left.start)
        || (left.start == right.start)
}

pub fn resolve_neighbor_file(
    from_file: &Path,
    authored: &str,
    roots: &[ImportRootMapping],
    workspace: Option<&Path>,
) -> Option<PathBuf> {
    let from = from_file.display().to_string();
    if let Some(root) = workspace {
        return locate_authored_rq_path(root, &from, authored, roots).or_else(|| {
            let parent = from_file.parent()?;
            existing_path(&parent.join(authored.trim_matches('"')).display().to_string())
        });
    }
    existing_path_candidates(authored, &from, roots).or_else(|| {
        let parent = from_file.parent()?;
        existing_path(&parent.join(authored.trim_matches('"')).display().to_string())
    })
}
