//! Hover hits for ideas, imports, paths, and wildcards.

use lsp_types::{Position, Range};
use reqlan_index::{local_name_binding, LocalNameBinding};
use reqlan_parse::{ReferenceTarget, Span};

use crate::utf16::range_contains;

use super::model::DocModel;
use super::text::{authored_path_span, ident_span_from, span_has};

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

impl DocModel {
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
}
