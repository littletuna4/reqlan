//! Span and text primitives shared by the open-buffer features.
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq.editor_reference_activation]

use crate::utf16::utf16_len;
use lsp_types::{Position, Range};
use reqlan_parse::{Import, ReferenceTarget, Span};

pub(super) fn is_ident_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-'
}

pub(crate) fn span_has(span: Span, byte: usize) -> bool {
    span.start <= byte && byte < span.end
}

pub(super) fn find_in_span(text: &str, span: Span, needle: &str) -> Option<(usize, usize)> {
    if needle.is_empty() {
        return None;
    }
    let start = span.start.min(text.len());
    let end = span.end.min(text.len()).max(start);
    let slice = &text[start..end];
    let index = slice.find(needle)?;
    Some((start + index, start + index + needle.len()))
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

pub(crate) fn authored_path_span(text: &str, statement: Span, path: &str) -> Option<Span> {
    let double = format!("\"{path}\"");
    let single = format!("'{path}'");
    let (start, end) = find_in_span(text, statement, &double)
        .or_else(|| find_in_span(text, statement, &single))
        .or_else(|| find_in_span(text, statement, path))?;
    Some(Span { start, end, line_start: statement.line_start, line_end: statement.line_end })
}

pub(super) fn target_span(target: &ReferenceTarget) -> Span {
    match target {
        ReferenceTarget::Local { span, .. }
        | ReferenceTarget::Qualified { span, .. }
        | ReferenceTarget::File { span, .. }
        | ReferenceTarget::Url { span, .. }
        | ReferenceTarget::FileSymbol { span, .. }
        | ReferenceTarget::Wildcard { span, .. } => *span,
    }
}

pub(super) fn import_span(import: &Import) -> Span {
    match import {
        Import::From(import) => import.span,
        Import::Namespace(import) => import.span,
        Import::Qualified(import) => import.span,
        Import::InvalidFrom(import) => import.span,
    }
}

pub(crate) fn line_range(line: u32, name: &str) -> Range {
    Range {
        start: Position { line, character: 0 },
        end: Position { line, character: utf16_len(name) },
    }
}

/// One character at the file start. An empty 0:0–0:0 range does not move the caret, so the
/// editor may skip the JUMP that Alt+Left (navigate-back) needs.
pub(crate) fn file_landing_range() -> Range {
    Range { start: Position { line: 0, character: 0 }, end: Position { line: 0, character: 1 } }
}
