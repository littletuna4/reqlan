//rq-ignore-error
//! `rq:[…]` comment reference scanning, clearing, and path rewriting.
//! rq:["../../../../reqlan rq/extension/mutation/refactor_support.rq".comment_reference_refactor_support]
//! rq:["../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_move]
//! rq:["../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_delete]

use crate::token::Span;
use std::collections::BTreeMap;

use super::decl::byte_range_overlaps;
use super::edits::{edit_range, push, LineMap};
use super::pathing::rewrite_path_to_moved_target;
use super::types::TextEdit;

pub(crate) fn clear_comments(
    by_uri: &mut BTreeMap<String, Vec<TextEdit>>,
    uri: &str,
    text: &str,
    idea_name: &str,
    skip: Option<Span>,
) {
    let lines = LineMap::new(text);
    for hit in comment_hits(text) {
        if !comment_names_idea(&hit.inner, idea_name) {
            continue;
        }
        if skip.is_some_and(|decl| byte_range_overlaps(hit.start, hit.end, decl)) {
            continue;
        }
        let range = lines.range(text, hit.start, hit.end);
        push(by_uri, uri, edit_range(range, String::new()));
    }
}

pub(crate) fn rewrite_comments(
    by_uri: &mut BTreeMap<String, Vec<TextEdit>>,
    uri: &str,
    text: &str,
    old_target: &str,
    new_target: &str,
    idea_name: &str,
) {
    let lines = LineMap::new(text);
    for hit in comment_hits(text) {
        let Some(quoted) = quoted_path(&hit.inner) else {
            continue;
        };
        let rest = &hit.inner[quoted.end_in_inner..];
        if comment_idea(rest) != Some(idea_name) {
            continue;
        }
        let Some(rewritten) =
            rewrite_path_to_moved_target(&quoted.path, uri, old_target, new_target)
        else {
            continue;
        };
        let abs_start = hit.inner_start + quoted.start_in_inner;
        let abs_end = hit.inner_start + quoted.end_in_inner;
        let range = lines.range(text, abs_start, abs_end);
        let new_text =
            serde_json::to_string(&rewritten).unwrap_or_else(|_| format!("\"{rewritten}\""));
        push(by_uri, uri, edit_range(range, new_text));
    }
}

struct CommentHit {
    start: usize,
    end: usize,
    inner_start: usize,
    inner: String,
}

fn comment_hits(text: &str) -> Vec<CommentHit> {
    let bytes = text.as_bytes();
    let mut hits = Vec::new();
    let mut index = 0;
    while index + 3 < bytes.len() {
        if bytes[index] == b'r' && bytes[index + 1] == b'q' && bytes[index + 2] == b':' {
            let mut cursor = index + 3;
            while cursor < bytes.len() && (bytes[cursor] == b' ' || bytes[cursor] == b'\t') {
                cursor += 1;
            }
            if cursor < bytes.len() && bytes[cursor] == b'[' {
                if let Some(rel) = text[cursor + 1..].find(']') {
                    let close = cursor + 1 + rel;
                    hits.push(CommentHit {
                        start: index,
                        end: close + 1,
                        inner_start: cursor + 1,
                        inner: text[cursor + 1..close].to_string(),
                    });
                    index = close + 1;
                    continue;
                }
            }
        }
        index += 1;
    }
    hits
}

fn comment_names_idea(inner: &str, idea_name: &str) -> bool {
    inner == idea_name
        || inner.ends_with(&format!(".{idea_name}"))
        || inner.ends_with(&format!(". {idea_name}"))
}

fn comment_idea(rest: &str) -> Option<&str> {
    let rest = rest.trim_start();
    let rest = rest.strip_prefix('.')?.trim_start();
    let mut last = None;
    for part in rest.split('.') {
        let part = part.trim();
        if !part.is_empty() {
            last = Some(part);
        }
    }
    last
}

struct QuotedPath {
    start_in_inner: usize,
    end_in_inner: usize,
    path: String,
}

fn quoted_path(inner: &str) -> Option<QuotedPath> {
    let bytes = inner.as_bytes();
    if bytes.is_empty() || (bytes[0] != b'"' && bytes[0] != b'\'') {
        return None;
    }
    let quote = bytes[0];
    let mut path = String::new();
    let mut index = 1;
    while index < bytes.len() {
        if bytes[index] == b'\\' && index + 1 < bytes.len() {
            path.push(bytes[index + 1] as char);
            index += 2;
            continue;
        }
        if bytes[index] == quote {
            return Some(QuotedPath { start_in_inner: 0, end_in_inner: index + 1, path });
        }
        path.push(bytes[index] as char);
        index += 1;
    }
    None
}
