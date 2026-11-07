//! Byte offsets mapped to UTF-16 line and column positions, plus edit bookkeeping.
//! rq:["../../../reqlan rq/extension/mutation/refactor_native_planner.rq".refactor_native_planner]

use crate::token::Span;
use std::collections::BTreeMap;

use super::types::{DocumentEdits, TextEdit};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Pos {
    pub(crate) line: u32,
    pub(crate) character: u32,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct Rng {
    start: Pos,
    end: Pos,
}

pub(crate) struct LineMap {
    starts: Vec<usize>,
}

impl LineMap {
    pub(crate) fn new(text: &str) -> Self {
        let mut starts = vec![0];
        for (index, byte) in text.bytes().enumerate() {
            if byte == b'\n' {
                starts.push(index + 1);
            }
        }
        Self { starts }
    }

    pub(crate) fn position(&self, text: &str, byte: usize) -> Pos {
        let byte = byte.min(text.len());
        let line = match self.starts.binary_search(&byte) {
            Ok(index) => index,
            Err(index) => index.saturating_sub(1),
        };
        let line_start = self.starts[line];
        Pos { line: line as u32, character: utf16_len(&text[line_start..byte]) }
    }

    pub(crate) fn range(&self, text: &str, start: usize, end: usize) -> Rng {
        let start = start.min(text.len());
        let end = end.min(text.len()).max(start);
        Rng { start: self.position(text, start), end: self.position(text, end) }
    }

    #[cfg(test)]
    pub(crate) fn byte_at(&self, text: &str, line: u32, character: u32) -> usize {
        if self.starts.is_empty() {
            return 0;
        }
        let line = (line as usize).min(self.starts.len() - 1);
        let start = self.starts[line];
        let line_end = if line + 1 < self.starts.len() {
            self.starts[line + 1].saturating_sub(1).max(start)
        } else {
            text.len()
        };
        start + utf16_prefix_bytes(&text[start..line_end.min(text.len())], character)
    }
}

fn utf16_len(text: &str) -> u32 {
    text.chars().map(|ch| if (ch as u32) > 0xFFFF { 2 } else { 1 }).sum()
}

#[cfg(test)]
fn utf16_prefix_bytes(text: &str, utf16_col: u32) -> usize {
    let mut units = 0u32;
    for (index, ch) in text.char_indices() {
        if units >= utf16_col {
            return index;
        }
        units += if (ch as u32) > 0xFFFF { 2 } else { 1 };
    }
    text.len()
}

pub(crate) fn full_line_range(lines: &LineMap, text: &str, span: Span) -> Rng {
    let start = lines.position(text, span.start);
    let end = lines.position(text, span.end);
    let end_line = if end.character == 0 { end.line } else { end.line + 1 };
    Rng { start: Pos { line: start.line, character: 0 }, end: Pos { line: end_line, character: 0 } }
}

pub(crate) fn edit_range(range: Rng, new_text: String) -> TextEdit {
    TextEdit {
        start_line: range.start.line,
        start_character: range.start.character,
        end_line: range.end.line,
        end_character: range.end.character,
        new_text,
    }
}

pub(crate) fn push(map: &mut BTreeMap<String, Vec<TextEdit>>, uri: &str, edit: TextEdit) {
    map.entry(uri.to_string()).or_default().push(edit);
}

pub(crate) fn finish(map: BTreeMap<String, Vec<TextEdit>>) -> Vec<DocumentEdits> {
    map.into_iter()
        .filter(|(_, edits)| !edits.is_empty())
        .map(|(uri, mut edits)| {
            edits.sort_by(|left, right| {
                right
                    .start_line
                    .cmp(&left.start_line)
                    .then(right.start_character.cmp(&left.start_character))
                    .then(right.end_line.cmp(&left.end_line))
                    .then(right.end_character.cmp(&left.end_character))
            });
            DocumentEdits { uri, edits }
        })
        .collect()
}
