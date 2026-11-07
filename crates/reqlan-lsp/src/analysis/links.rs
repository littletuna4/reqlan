//! Document links for local ideas, imports, file references, and wildcards.

use std::path::Path;

use lsp_types::{DocumentLink, Range, Url};
use reqlan_index::{local_name_binding, LocalNameBinding};
use reqlan_parse::{Import, ReferenceTarget, Span};

use super::definition::{location_url, parse_url};
use super::model::{DocModel, LocalNameKind};
use super::refs::walk_refs;
use super::text::{authored_path_span, ident_span_from};

impl DocModel {
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
}

fn link(doc: &DocModel, span: Span, target: Url) -> DocumentLink {
    DocumentLink {
        range: doc.lines.range(&doc.text, span.start, span.end),
        target: Some(target),
        tooltip: None,
        data: None,
    }
}

fn location_uri(doc_uri: &str, line: u32) -> Url {
    location_url(&parse_url(doc_uri), line)
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
