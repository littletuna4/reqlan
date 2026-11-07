//! The parsed open document and its name, reference, and token stores.
//! rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq.ast_lifecycle]

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use lsp_types::{CodeActionOrCommand, Diagnostic, Position, Range};
use reqlan_index::{analyze_local_symbolic_from_parse, local_name_binding, LocalNameBinding};
use reqlan_parse::{
    parse_document, AttributeValue, BodyElement, ImportRootMapping, Model, ReferenceTarget, Span,
    TopLevelElement,
};

use crate::utf16::{range_contains, LineMap};

use super::refs::walk_refs;
use super::text::{ident_span_from, line_range, span_has, target_span};
use super::tokens::{collect_model, RawToken};

#[derive(Debug, Clone)]
pub struct NameLoc {
    pub name: String,
    pub range: Range,
    pub summary: String,
    pub line: u32,
}

pub struct DocModel {
    pub text: String,
    pub lines: LineMap,
    pub roots: Vec<ImportRootMapping>,
    /// Workspace / applying-base folder for `@/` and other relative `resolve_rq_path` results.
    /// Same join as `reqlan check` ([locate_authored_rq_path]).
    pub(super) workspace: Option<PathBuf>,
    pub(super) file_path: Option<PathBuf>,
    pub(crate) names: Vec<NameLoc>,
    pub(super) tokens: Vec<RawToken>,
    pub(super) model: Model,
    pub(super) parse_diagnostics: Vec<reqlan_parse::ParseDiagnostic>,
    /// Body references sorted by start byte. A cursor lookup is a binary search.
    pub(super) refs: Vec<ReferenceTarget>,
    /// Authored path to resolved file, filled on first use for this parse.
    pub(super) located: RefCell<HashMap<String, Option<PathBuf>>>,
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

    pub(super) fn byte_at(&self, pos: Position) -> usize {
        self.lines.byte_at(&self.text, pos)
    }

    pub(super) fn ref_at(&self, byte: usize) -> Option<&ReferenceTarget> {
        let after = self.refs.partition_point(|target| target_span(target).start <= byte);
        let target = self.refs.get(after.checked_sub(1)?)?;
        span_has(target_span(target), byte).then_some(target)
    }

    /// True when `name` is an import alias in this file, not a declared idea.
    pub fn binds_import(&self, name: &str) -> bool {
        self.model.import_bindings().iter().any(|(binding, _line)| binding == name)
    }

    pub(super) fn local_name_resolves<F>(&self, idea: &str, neighbor_has: &mut F) -> bool
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

    pub(super) fn local_name_kind(&self, name: &str) -> Option<LocalNameKind> {
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

    pub(super) fn dotted_parts(
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

    pub(crate) fn syntax(&self) -> &Model {
        &self.model
    }

    pub(crate) fn workspace_root(&self) -> Option<&Path> {
        self.workspace.as_deref()
    }

    pub(crate) fn resolve_path(&self, authored: &str) -> Option<PathBuf> {
        self.locate(authored)
    }

    pub(crate) fn idea_markdown(&self, name: &str) -> Option<String> {
        crate::hover_content::markdown_for_name(&self.text, &self.model, name)
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
        workspace_files: &[String],
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
            workspace_files,
        })
    }
}

pub(super) enum LocalNameKind {
    Block,
    OneLiner,
    IdeaSet,
}

pub(super) struct DottedParts {
    pub(super) qualifier: Option<Span>,
    pub(super) ideaset: Option<Span>,
    pub(super) idea: Span,
}
