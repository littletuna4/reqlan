//! Semantic token collection and encoding.
//! rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq".token_colour_sequence]

use lsp_types::{SemanticToken, SemanticTokens};
use reqlan_index::LocalSymbolicDocument;
use reqlan_parse::{
    Attribute, AttributeValue, BodyElement, Import, ListItem, Model, ReferenceTarget, RichPart,
    Span, TopLevelElement,
};

use crate::utf16::{utf16_len, LineMap};

use super::model::{DocModel, NameLoc};
use super::text::{find_in_span, is_ident_byte};

const TYPE_IDEA: u32 = 0;
const TYPE_NAMESPACE: u32 = 1;
const TYPE_VARIABLE: u32 = 2;
const TYPE_STRING: u32 = 3;
const TYPE_DECORATOR: u32 = 4;
const TYPE_OPERATOR: u32 = 5;
const TYPE_KEYWORD: u32 = 6;
const TYPE_METHOD: u32 = 7;
const MOD_DEFINITION: u32 = 1;

#[derive(Debug, Clone, Copy)]
pub(super) struct RawToken {
    pub(super) start: usize,
    pub(super) end: usize,
    pub(super) kind: u32,
    pub(super) modifiers: u32,
}

impl DocModel {
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
}

pub(super) fn collect_model(
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
