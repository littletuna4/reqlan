//! Attribute key and value completion.
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".attribute_code_completion_attribute_key]
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_replaces_the_tail]
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_reentry_is_lossless]

use std::collections::{HashMap, HashSet};

use lsp_types::{
    CompletionItem, CompletionItemKind, CompletionTextEdit, Position, Range, TextEdit,
};

use crate::path_completion::merge_tail;
use crate::utf16::{utf16_len, LineMap};

use super::model::DocModel;

/// Endorsed attribute keys used until the host pushes a catalog.
pub const ENDORSED_ATTRIBUTE_KEYS: &[&str] = &[
    "plan",
    "status",
    "priority",
    "criticality",
    "confirmation",
    "owner",
    "log",
    "tags",
    "references",
    "refs",
    "required",
    "tests",
];

/// Host-pushed attribute completion catalog.
#[derive(Debug, Clone, Default)]
pub struct AttributeCatalog {
    pub keys: Vec<String>,
    pub values_by_key: HashMap<String, Vec<String>>,
}

impl AttributeCatalog {
    pub fn endorsed() -> Self {
        Self {
            keys: ENDORSED_ATTRIBUTE_KEYS.iter().map(|key| (*key).to_string()).collect(),
            values_by_key: HashMap::new(),
        }
    }
}

impl DocModel {
    /// Attribute key and value completion. Other sites return an empty list.
    pub fn completion(&self, pos: Position, catalog: &AttributeCatalog) -> Vec<CompletionItem> {
        let mut items = Vec::new();
        let prefix = line_prefix(&self.text, &self.lines, pos);
        let suffix = line_suffix(&self.text, &self.lines, pos);
        if let Some((key, value_prefix)) = attribute_value_prefix(&prefix) {
            // The value token runs from the value start through the word after
            // the cursor, so completing mid-value replaces the whole token.
            let value_tail = token_after(&suffix, char::is_whitespace);
            let range = token_range(pos.line, &prefix, value_prefix, value_tail);
            let values = catalog.values_by_key.get(key).into_iter().flatten();
            for value in values {
                if value.starts_with(value_prefix) {
                    items.push(CompletionItem {
                        label: value.clone(),
                        kind: Some(CompletionItemKind::VALUE),
                        detail: Some(format!("@{key}")),
                        text_edit: Some(CompletionTextEdit::Edit(TextEdit {
                            range,
                            new_text: merge_tail(value, value_prefix, value_tail),
                        })),
                        ..CompletionItem::default()
                    });
                }
            }
            return items;
        }
        if let Some(attr) = attribute_prefix(&prefix) {
            // The key token runs from the key start through the word after the
            // cursor. A key the cursor is still inside is offered even when the
            // document already uses it: the replace edit is lossless.
            let key_tail = token_after(&suffix, |ch| ch == ':' || ch.is_whitespace());
            let range = token_range(pos.line, &prefix, attr, key_tail);
            let keys = if catalog.keys.is_empty() {
                ENDORSED_ATTRIBUTE_KEYS.iter().map(|key| (*key).to_string()).collect()
            } else {
                catalog.keys.clone()
            };
            let used: HashSet<&str> = self.model.attribute_names().into_iter().collect();
            let inside = !key_tail.is_empty();
            for key in keys {
                if key.starts_with(attr) && (!used.contains(key.as_str()) || inside) {
                    items.push(CompletionItem {
                        label: key.clone(),
                        kind: Some(CompletionItemKind::PROPERTY),
                        text_edit: Some(CompletionTextEdit::Edit(TextEdit {
                            range,
                            new_text: merge_tail(&key, attr, key_tail),
                        })),
                        ..CompletionItem::default()
                    });
                }
            }
            return items;
        }
        items
    }

    pub(crate) fn attribute_completion_site(&self, pos: Position) -> bool {
        let prefix = line_prefix(&self.text, &self.lines, pos);
        attribute_value_prefix(&prefix).is_some() || attribute_prefix(&prefix).is_some()
    }
}

fn line_prefix(text: &str, lines: &LineMap, pos: Position) -> String {
    let byte = lines.byte_at(text, pos);
    let line_start = text[..byte].rfind('\n').map(|index| index + 1).unwrap_or(0);
    text[line_start..byte].to_string()
}

/// The text after the cursor to the end of the line, mirroring `line_prefix`.
fn line_suffix(text: &str, lines: &LineMap, pos: Position) -> String {
    let byte = lines.byte_at(text, pos);
    let line_end = text[byte..].find('\n').map(|index| byte + index).unwrap_or(text.len());
    text[byte..line_end].to_string()
}

/// The word after the cursor, up to the first `stop` character or end of line.
fn token_after(suffix: &str, stop: impl Fn(char) -> bool) -> &str {
    match suffix.find(stop) {
        Some(end) => &suffix[..end],
        None => suffix,
    }
}

/// One-line replace range for a token: from the byte-tail `token_prefix` of the
/// typed prefix through the cursor plus `tail`. Columns are UTF-16.
fn token_range(line: u32, prefix: &str, token_prefix: &str, tail: &str) -> Range {
    Range {
        start: Position { line, character: utf16_len(prefix) - utf16_len(token_prefix) },
        end: Position { line, character: utf16_len(prefix) + utf16_len(tail) },
    }
}

/// A key prefix ends at whitespace or at the `:` separator; `@key:` is a value site.
fn attribute_prefix(prefix: &str) -> Option<&str> {
    let trimmed = prefix.trim_start();
    let rest = trimmed.strip_prefix('@')?;
    if rest.contains(':') || rest.contains(char::is_whitespace) {
        return None;
    }
    Some(rest)
}

/// `@key value`, `@key:value`, and `@key: value` all point at a value.
fn attribute_value_prefix(prefix: &str) -> Option<(&str, &str)> {
    let trimmed = prefix.trim_start();
    let rest = trimmed.strip_prefix('@')?;
    let split = rest.find(|ch: char| ch == ':' || ch.is_whitespace())?;
    let key = &rest[..split];
    if key.is_empty() {
        return None;
    }
    let value = rest[split..].trim_start_matches([':', ' ', '\t']);
    Some((key, value))
}
