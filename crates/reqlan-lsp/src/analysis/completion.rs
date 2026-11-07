//! Attribute key and value completion.

use std::collections::HashMap;

use lsp_types::{CompletionItem, CompletionItemKind, Position};

use crate::utf16::LineMap;

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
    "deprecated",
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
        let prefix = line_prefix(&self.text, &self.lines, pos);
        let mut items = Vec::new();
        if let Some((key, value_prefix)) = attribute_value_prefix(&prefix) {
            let values = catalog.values_by_key.get(key).into_iter().flatten();
            for value in values {
                if value.starts_with(value_prefix) {
                    items.push(CompletionItem {
                        label: value.clone(),
                        kind: Some(CompletionItemKind::VALUE),
                        detail: Some(format!("@{key}")),
                        ..CompletionItem::default()
                    });
                }
            }
            return items;
        }
        if let Some(attr) = attribute_prefix(&prefix) {
            let keys = if catalog.keys.is_empty() {
                ENDORSED_ATTRIBUTE_KEYS.iter().map(|key| (*key).to_string()).collect()
            } else {
                catalog.keys.clone()
            };
            for key in keys {
                if key.starts_with(attr) {
                    items.push(CompletionItem {
                        label: key,
                        kind: Some(CompletionItemKind::PROPERTY),
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

fn attribute_prefix(prefix: &str) -> Option<&str> {
    let trimmed = prefix.trim_start();
    let rest = trimmed.strip_prefix('@')?;
    if rest.contains(char::is_whitespace) {
        return None;
    }
    Some(rest)
}

fn attribute_value_prefix(prefix: &str) -> Option<(&str, &str)> {
    let trimmed = prefix.trim_start();
    let rest = trimmed.strip_prefix('@')?;
    let mut parts = rest.splitn(2, char::is_whitespace);
    let key = parts.next()?;
    let value = parts.next()?;
    if key.is_empty() {
        return None;
    }
    Some((key, value))
}
