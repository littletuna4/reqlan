//! Go-to-definition targets and location URL encoding.
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_goto_definition_speed]

use std::path::{Path, PathBuf};

use lsp_types::{Location, LocationLink, Position, Range, Url};
use reqlan_index::{local_name_binding, LocalNameBinding};
use reqlan_parse::{Import, ReferenceTarget, Span};

use crate::utf16::range_contains;

use super::model::DocModel;
use super::text::{authored_path_span, file_landing_range, ident_span_from, import_span, span_has};

impl DocModel {
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
}

fn non_empty_selection(range: Range) -> Range {
    if range.start == range.end {
        file_landing_range()
    } else {
        range
    }
}

pub(crate) fn location_url(uri: &Url, line: u32) -> Url {
    let mut url = uri.clone();
    url.set_fragment(Some(&format!("L{line}")));
    url
}

/// Parse a document / referencer URI.
/// File URIs round-trip through `Url::from_file_path` (goto encoding).
/// Unencoded `file:` paths with spaces rebuild the same way — `file:` only.
pub(super) fn parse_url(uri: &str) -> Url {
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
