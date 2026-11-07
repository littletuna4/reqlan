//! Open-buffer feature dispatch: tokens, links, definition, hover, highlights, selection, symbols, folds, and site payloads.
//! rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq".token_colour_sequence]
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax.rq".syntax_hovering]
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax.rq".idea_content_tooltip]
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_document_links]
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_goto_definition_speed]
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax.rq".file_references]

use lsp_types::{
    DocumentHighlight, DocumentLink, GotoDefinitionResponse, Hover, Position, Range,
    SelectionRange, SemanticTokens,
};

use super::records::Session;

impl Session {
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
        // rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
        // rq:["../../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".references_in_functional_code_comments]
        if self.comments.contains_key(uri) {
            let link = self.comment_definition_for(uri, pos)?;
            return Some(GotoDefinitionResponse::Link(vec![link]));
        }
        let doc = self.documents.remove(uri)?;
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

    pub fn highlights(&self, uri: &str, pos: Position) -> Vec<DocumentHighlight> {
        self.documents.get(uri).map(|doc| doc.model.highlights(pos)).unwrap_or_default()
    }

    /// Expand-selection chains for the open buffer. One chain per caret.
    /// rq:["../../../../reqlan rq/extension/language/vsc-primitives.rq".selection_range]
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
                    range: loc.range,
                    selection_range: loc.range,
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

    pub fn file_reference_at(&self, uri: &str, pos: Position) -> Option<serde_json::Value> {
        self.documents.get(uri)?.model.file_reference_at(pos)
    }

    pub fn wildcard_at(&self, uri: &str, pos: Position) -> Option<serde_json::Value> {
        self.documents.get(uri)?.model.wildcard_at(pos, uri)
    }

    pub fn search_site(&self, uri: &str, range: Range) -> Option<serde_json::Value> {
        self.documents.get(uri)?.model.search_site(range, uri)
    }
}
