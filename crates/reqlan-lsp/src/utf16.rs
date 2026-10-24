//! UTF-8 byte offsets to LSP UTF-16 positions.
//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
//! rq:["../../../reqlan rq/extension/language/support/ts-lsp-vs-rust-gaps.rq".lsp_incremental_sync]
use lsp_types::{Position, Range, TextDocumentContentChangeEvent};

#[derive(Debug, Clone)]
pub struct LineMap {
    starts: Vec<usize>,
}

impl LineMap {
    pub fn new(text: &str) -> Self {
        let mut starts = vec![0];
        for (index, byte) in text.bytes().enumerate() {
            if byte == b'\n' {
                starts.push(index + 1);
            }
        }
        Self { starts }
    }

    pub fn position(&self, text: &str, byte: usize) -> Position {
        let byte = byte.min(text.len());
        let line = match self.starts.binary_search(&byte) {
            Ok(index) => index,
            Err(index) => index.saturating_sub(1),
        };
        let line_start = self.starts[line];
        Position { line: line as u32, character: utf16_len(&text[line_start..byte]) }
    }

    pub fn byte_at(&self, text: &str, pos: Position) -> usize {
        if self.starts.is_empty() {
            return 0;
        }
        let line = (pos.line as usize).min(self.starts.len() - 1);
        let start = self.starts[line];
        let line_end = if line + 1 < self.starts.len() {
            self.starts[line + 1].saturating_sub(1).max(start)
        } else {
            text.len()
        };
        let slice_end = line_end.min(text.len());
        start + utf16_prefix_bytes(&text[start..slice_end], pos.character)
    }

    pub fn range(&self, text: &str, start: usize, end: usize) -> Range {
        let start = start.min(text.len());
        let end = end.min(text.len()).max(start);
        Range { start: self.position(text, start), end: self.position(text, end) }
    }
}

/// Apply LSP content changes in order.
/// A missing range replaces the buffer. `range_length` is ignored.
/// Each later range refers to the buffer after the earlier changes.
/// rq:["../../../reqlan rq/extension/language/support/ts-lsp-vs-rust-gaps.rq".lsp_incremental_sync]
pub fn apply_content_changes(text: &str, changes: &[TextDocumentContentChangeEvent]) -> String {
    let mut current = text.to_string();
    for change in changes {
        current = match change.range {
            None => change.text.clone(),
            Some(range) => splice(&current, range, &change.text),
        };
    }
    current
}

fn splice(text: &str, range: Range, replacement: &str) -> String {
    let lines = LineMap::new(text);
    let start = lines.byte_at(text, range.start).min(text.len());
    let mut end = lines.byte_at(text, range.end).min(text.len());
    if start > end {
        end = start;
    }
    let mut out = String::with_capacity(text.len() - (end - start) + replacement.len());
    out.push_str(&text[..start]);
    out.push_str(replacement);
    out.push_str(&text[end..]);
    out
}

pub fn utf16_len(text: &str) -> u32 {
    text.chars().map(|ch| if (ch as u32) > 0xFFFF { 2 } else { 1 }).sum()
}

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

pub fn range_contains(range: Range, pos: Position) -> bool {
    position_leq(range.start, pos) && position_lt(pos, range.end)
}

fn position_leq(left: Position, right: Position) -> bool {
    left.line < right.line || (left.line == right.line && left.character <= right.character)
}

fn position_lt(left: Position, right: Position) -> bool {
    left.line < right.line || (left.line == right.line && left.character < right.character)
}

#[cfg(test)]
mod tests {
    use super::{apply_content_changes, LineMap};
    use lsp_types::{Position, Range, TextDocumentContentChangeEvent};

    fn ranged(
        start_line: u32,
        start: u32,
        end_line: u32,
        end: u32,
        text: &str,
    ) -> TextDocumentContentChangeEvent {
        TextDocumentContentChangeEvent {
            range: Some(Range {
                start: Position { line: start_line, character: start },
                end: Position { line: end_line, character: end },
            }),
            range_length: None,
            text: text.to_string(),
        }
    }

    #[test]
    fn emoji_column_counts_two_utf16_units() {
        let text = "a😀";
        let lines = LineMap::new(text);
        let pos = lines.position(text, text.len());
        assert_eq!(pos.character, 3);
        assert_eq!(lines.byte_at(text, pos), text.len());
    }

    #[test]
    fn replaces_a_word() {
        let text = apply_content_changes("alpha beta", &[ranged(0, 6, 0, 10, "gamma")]);
        assert_eq!(text, "alpha gamma");
    }

    #[test]
    fn inserts_a_newline() {
        let text = apply_content_changes("ab", &[ranged(0, 1, 0, 1, "\n")]);
        assert_eq!(text, "a\nb");
    }

    #[test]
    fn deletes_across_a_newline() {
        let text = apply_content_changes("a\nb\nc", &[ranged(0, 1, 2, 0, "")]);
        assert_eq!(text, "ac");
    }

    #[test]
    fn applies_later_ranges_to_the_updated_buffer() {
        let text =
            apply_content_changes("ab", &[ranged(0, 1, 0, 1, "12"), ranged(0, 2, 0, 4, "Z")]);
        assert_eq!(text, "a1Z");
    }

    #[test]
    fn snaps_a_surrogate_pair_to_the_next_char() {
        let replaced = apply_content_changes("a😀b", &[ranged(0, 1, 0, 3, "x")]);
        assert_eq!(replaced, "axb");
        let inserted = apply_content_changes("a😀", &[ranged(0, 2, 0, 2, "x")]);
        assert_eq!(inserted, "a😀x");
    }

    #[test]
    fn omitted_range_replaces_the_buffer() {
        let change = TextDocumentContentChangeEvent {
            range: None,
            range_length: Some(4),
            text: "zz".into(),
        };
        assert_eq!(apply_content_changes("hello", &[change]), "zz");
    }

    #[test]
    fn range_length_does_not_move_the_splice() {
        let mut change = ranged(0, 1, 0, 3, "Z");
        change.range_length = Some(99);
        assert_eq!(apply_content_changes("abcdef", &[change]), "aZdef");
    }
}
