//! Comment-reference resolution: links, definitions, and diagnostics for `rq:` comment references.

use std::path::{Path, PathBuf};

use lsp_types::{
    Diagnostic, DiagnosticSeverity, DocumentLink, LocationLink, NumberOrString, Position, Range,
    Url,
};
use reqlan_index::{find_comment_references_in_text, find_rq_ignore_error_target_lines};
use reqlan_parse::{import_path_candidates, resolve_rq_path, ImportRootMapping, Span};

use crate::analysis::{
    authored_path_span, file_landing_range, ident_span_from, location_url, span_has,
};
use crate::utf16::LineMap;

use super::index::indexed_file_uri;
use super::records::Session;
use super::support::path_of_file;

impl Session {
    pub(super) fn comment_links_for(&mut self, uri: &str) -> Vec<DocumentLink> {
        let Some(doc) = self.comments.get(uri) else {
            return Vec::new();
        };
        let text = doc.text.clone();
        let path = doc.path.clone();
        self.comment_links(&text, &path)
    }

    pub(super) fn comment_definition_for(
        &mut self,
        uri: &str,
        pos: Position,
    ) -> Option<LocationLink> {
        let doc = self.comments.get(uri)?;
        let text = doc.text.clone();
        let path = doc.path.clone();
        self.comment_definition_at(&text, &path, uri, pos)
    }

    /// Go-to-definition for a comment reference site.
    /// Same resolution as document links and missing-idea diagnostics.
    // rq-ignore-error
    /// Origin is the path string or idea id under the cursor — not the whole `rq:[…]`.
    /// A found file stays a path target when the idea is absent.
    /// rq:["../../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_qualified_token_links]
    /// rq:["../../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_resolution_error_state]
    pub(super) fn comment_definition_at(
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

    pub(super) fn comment_links(&mut self, text: &str, source: &Path) -> Vec<DocumentLink> {
        // rq:["../../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_qualified_token_links]
        // rq:["../../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_resolution_error_state]
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

    pub(super) fn comment_diagnostics(&mut self, text: &str, source: &Path) -> Vec<Diagnostic> {
        // rq:["../../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_resolution_error_state]
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
            let Ok(rows) = index.store().ideas_named(idea) else {
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
