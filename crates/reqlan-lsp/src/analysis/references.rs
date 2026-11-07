//! Highlights, find-references, and rename edits.

use lsp_types::{DocumentHighlight, DocumentHighlightKind, Location, Position, Range, TextEdit};
use reqlan_parse::ReferenceTarget;

use crate::utf16::{range_contains, utf16_len, LineMap};

use super::definition::parse_url;
use super::model::DocModel;
use super::refs::walk_refs;
use super::text::target_span;

impl DocModel {
    pub fn highlights(&self, pos: Position) -> Vec<DocumentHighlight> {
        let Some(name) = self.name_at(pos) else {
            return Vec::new();
        };
        let mut out = Vec::new();
        for idea in &self.names {
            if idea.name == name {
                out.push(DocumentHighlight {
                    range: idea.range,
                    kind: Some(DocumentHighlightKind::TEXT),
                });
            }
        }
        walk_refs(&self.model, &mut |target, _| {
            let label = match target {
                ReferenceTarget::Local { idea, .. } | ReferenceTarget::Qualified { idea, .. } => {
                    idea.as_str()
                }
                _ => return,
            };
            if label == name {
                let span = target_span(target);
                out.push(DocumentHighlight {
                    range: self.lines.range(&self.text, span.start, span.end),
                    kind: Some(DocumentHighlightKind::TEXT),
                });
            }
        });
        out
    }

    pub fn reference_locations(&self, doc_uri: &str, name: &str) -> Vec<Location> {
        let mut out = Vec::new();
        for idea in &self.names {
            if idea.name == name {
                out.push(Location { uri: parse_url(doc_uri), range: idea.range });
            }
        }
        walk_refs(&self.model, &mut |target, _| {
            let label = match target {
                ReferenceTarget::Local { idea, .. } | ReferenceTarget::Qualified { idea, .. } => {
                    idea.as_str()
                }
                _ => return,
            };
            if label != name {
                return;
            }
            let span = target_span(target);
            out.push(Location {
                uri: parse_url(doc_uri),
                range: self.lines.range(&self.text, span.start, span.end),
            });
        });
        out
    }

    pub fn prepare_rename(&self, pos: Position) -> Option<Range> {
        self.names
            .iter()
            .find(|idea| range_contains(idea.range, pos))
            .map(|idea| idea.range)
            .or_else(|| {
                let mut found = None;
                walk_refs(&self.model, &mut |target, _| {
                    let span = target_span(target);
                    let range = self.lines.range(&self.text, span.start, span.end);
                    if range_contains(range, pos) {
                        if let ReferenceTarget::Local { .. } | ReferenceTarget::Qualified { .. } =
                            target
                        {
                            found = Some(range);
                        }
                    }
                });
                found
            })
    }
}

pub fn rename_edits(text: &str, lines: &LineMap, old: &str, new_name: &str) -> Vec<TextEdit> {
    if old.is_empty() || old == new_name {
        return Vec::new();
    }
    let mut edits = Vec::new();
    for (index, line) in text.split('\n').enumerate() {
        let trimmed = line.trim_end_matches('\r');
        if definition_line(trimmed, old) {
            let character = utf16_len(&trimmed[..trimmed.find(old).unwrap_or(0)]);
            edits.push(TextEdit {
                range: Range {
                    start: Position { line: index as u32, character },
                    end: Position { line: index as u32, character: character + utf16_len(old) },
                },
                new_text: new_name.to_string(),
            });
        }
    }
    let needles = [
        format!("[{old}]"),
        format!("[[{old}]]"),
        format!("[[{old}|"),
        format!("rq:[{old}]"),
        format!("rq:[[{old}]]"),
    ];
    let replacements = [
        format!("[{new_name}]"),
        format!("[[{new_name}]]"),
        format!("[[{new_name}|"),
        format!("rq:[{new_name}]"),
        format!("rq:[[{new_name}]]"),
    ];
    for (needle, replacement) in needles.iter().zip(replacements.iter()) {
        let mut from = 0;
        while let Some(found) = text[from..].find(needle) {
            let start = from + found;
            let end = start + needle.len();
            edits.push(TextEdit {
                range: lines.range(text, start, end),
                new_text: replacement.clone(),
            });
            from = end;
        }
    }
    // Also rewrite path-qualified comment sites that end with ."old"] / .'old'] / ."old" / .'old'
    let qualified = [
        (format!("\".{old}]"), format!("\".{new_name}]")),
        (format!("'.{old}]"), format!("'.{new_name}]")),
        (format!("\".{old}\""), format!("\".{new_name}\"")),
        (format!("'.{old}'"), format!("'.{new_name}'")),
    ];
    for (needle, replacement) in qualified {
        let mut from = 0;
        while let Some(found) = text[from..].find(&needle) {
            let start = from + found;
            let end = start + needle.len();
            let before = &text[..start];
            if before.contains("rq:[") || before.rfind('[').is_some() {
                edits.push(TextEdit {
                    range: lines.range(text, start, end),
                    new_text: replacement.clone(),
                });
            }
            from = end;
        }
    }
    edits.sort_by_key(|edit| (edit.range.start.line, edit.range.start.character));
    edits.dedup_by(|left, right| left.range == right.range);
    edits
}

fn definition_line(line: &str, name: &str) -> bool {
    let Some(rest) = line.trim_start().strip_prefix(name) else {
        return false;
    };
    rest.is_empty()
        || rest.starts_with(' ')
        || rest.starts_with('{')
        || rest.starts_with(':')
        || rest.starts_with('(')
}
