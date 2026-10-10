//! UTF-8 byte offsets to LSP UTF-16 positions.
//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
use lsp_types::{Position, Range};

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
    use super::LineMap;

    #[test]
    fn emoji_column_counts_two_utf16_units() {
        let text = "a😀";
        let lines = LineMap::new(text);
        let pos = lines.position(text, text.len());
        assert_eq!(pos.character, 3);
        assert_eq!(lines.byte_at(text, pos), text.len());
    }
}
