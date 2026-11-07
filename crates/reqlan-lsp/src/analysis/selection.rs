//! Expand-selection chain over the parse tree.

use lsp_types::{Position, Range, SelectionRange};
use reqlan_parse::{
    Attribute, AttributeValue, BodyElement, Import, ListItem, Model, RichPart, Span,
    TopLevelElement,
};

use crate::utf16::LineMap;

use super::model::DocModel;
use super::text::{ident_span_from, is_ident_byte, span_has};

impl DocModel {
    /// Expand-selection chain, innermost range first.
    /// rq:["../../../../reqlan rq/extension/language/vsc-primitives.rq".selection_range]
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
