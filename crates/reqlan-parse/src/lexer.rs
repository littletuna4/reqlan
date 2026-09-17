//! Context-sensitive reqlan lexer.
//! Ports packages/language/src/reqlan-token-builder.ts
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".lexer_rust]
//! rq:["../../../reqlan rq/language/parser_lexer.rq".lexer_bridge_to_syntax]
//! rq:["../../../reqlan rq/language/syntax-edge-cases.rq".context_sensitive_lexer_scaling]
//! rq:["../../../reqlan rq/language/syntax-edge-cases.rq".nested_curly_braces]
//! rq:["../../../reqlan rq/language/syntax-edge-cases.rq".fencing_comments]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".comment_span_align]

use crate::budget::ParseBudget;
use crate::token::{Token, TokenKind};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LexerError {
    pub offset: usize,
    pub line: u32,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct LexResult {
    pub tokens: Vec<Token>,
    pub errors: Vec<LexerError>,
    pub timed_out: bool,
}

struct BraceScanCache {
    offsets: Vec<usize>,
    structural_depth: Vec<i32>,
    prose_depth: Vec<i32>,
}

#[derive(Clone, Copy)]
struct BraceScanState {
    structural_depth: i32,
    prose_depth: i32,
}

pub fn lex(source: &str, budget: ParseBudget) -> LexResult {
    let bytes = source.as_bytes();
    let cache = build_brace_scan_cache(bytes);
    let mut tokens = Vec::new();
    let mut errors = Vec::new();
    let mut offset = 0usize;
    let mut line = 0u32;
    let mut line_start = 0usize;
    let mut steps = 0u32;

    while offset < bytes.len() {
        steps += 1;
        if steps % 256 == 0 && budget.expired() {
            return LexResult { tokens, errors, timed_out: true };
        }

        let column = (offset - line_start) as u32;
        if let Some((kind, len)) = match_token(bytes, offset, &cache) {
            if kind == TokenKind::Nl {
                tokens.push(Token { kind, start: offset, end: offset + len, line, column });
                if bytes[offset] == b'\r' && offset + 1 < bytes.len() && bytes[offset + 1] == b'\n'
                {
                    line += 1;
                    line_start = offset + 2;
                } else {
                    line += 1;
                    line_start = offset + len;
                }
                offset += len;
                continue;
            }
            tokens.push(Token { kind, start: offset, end: offset + len, line, column });
            offset += len;
            continue;
        }

        let ch_len = utf8_len(bytes, offset);
        errors.push(LexerError {
            offset,
            line,
            message: format!(
                "unexpected character {:?}",
                source.get(offset..offset + ch_len).unwrap_or("?")
            ),
        });
        tokens.push(Token {
            kind: TokenKind::Other,
            start: offset,
            end: offset + ch_len,
            line,
            column,
        });
        offset += ch_len;
    }

    tokens.push(Token {
        kind: TokenKind::Eof,
        start: offset,
        end: offset,
        line,
        column: (offset - line_start) as u32,
    });

    LexResult { tokens, errors, timed_out: false }
}

/// Visible (non-hidden) tokens for the parser, including NL and EOF.
pub fn visible_tokens(tokens: &[Token]) -> Vec<&Token> {
    tokens.iter().filter(|token| !token.kind.is_hidden()).collect()
}

fn match_token(bytes: &[u8], offset: usize, cache: &BraceScanCache) -> Option<(TokenKind, usize)> {
    if offset >= bytes.len() {
        return None;
    }

    if let Some(len) = match_ws(bytes, offset) {
        return Some((TokenKind::Ws, len));
    }
    if let Some(len) = match_nl(bytes, offset) {
        return Some((TokenKind::Nl, len));
    }
    if let Some(len) = match_sl_comment(bytes, offset) {
        return Some((TokenKind::SlComment, len));
    }
    if let Some(len) = match_ml_comment(bytes, offset) {
        return Some((TokenKind::MlComment, len));
    }
    if let Some(len) = match_markdown_link(bytes, offset) {
        return Some((TokenKind::MarkdownLink, len));
    }
    if let Some(len) = match_url(bytes, offset) {
        return Some((TokenKind::Url, len));
    }
    if let Some(len) = match_code_fence(bytes, offset) {
        return Some((TokenKind::CodeFence, len));
    }
    if let Some(len) = match_inline_code(bytes, offset) {
        return Some((TokenKind::InlineCode, len));
    }
    if let Some(len) = match_string(bytes, offset, cache) {
        return Some((TokenKind::String, len));
    }
    if let Some(len) = match_from_kw(bytes, offset, cache) {
        return Some((TokenKind::FromKw, len));
    }
    if let Some(len) = match_import_kw(bytes, offset, cache) {
        return Some((TokenKind::ImportKw, len));
    }
    if let Some(len) = match_as_kw(bytes, offset, cache) {
        return Some((TokenKind::AsKw, len));
    }
    if bytes[offset] == b'{' && is_structural_open_brace_at(bytes, offset, cache) {
        return Some((TokenKind::LBrace, 1));
    }
    if bytes[offset] == b'}' && is_structural_close_brace_at(bytes, offset, cache) {
        return Some((TokenKind::RBrace, 1));
    }
    if bytes[offset] == b'@' && at_sign_is_attribute(bytes, offset) {
        return Some((TokenKind::At, 1));
    }
    if offset + 1 < bytes.len() && bytes[offset] == b'[' && bytes[offset + 1] == b'[' {
        return Some((TokenKind::LWiki, 2));
    }
    if offset + 1 < bytes.len() && bytes[offset] == b']' && bytes[offset + 1] == b']' {
        return Some((TokenKind::RWiki, 2));
    }

    match bytes[offset] {
        b'(' => return Some((TokenKind::LParen, 1)),
        b')' => return Some((TokenKind::RParen, 1)),
        b'[' => return Some((TokenKind::LBrack, 1)),
        b']' => return Some((TokenKind::RBrack, 1)),
        b'.' => return Some((TokenKind::Dot, 1)),
        b',' => return Some((TokenKind::Comma, 1)),
        b':' => return Some((TokenKind::Colon, 1)),
        b';' => return Some((TokenKind::Semicolon, 1)),
        b'!' => return Some((TokenKind::Bang, 1)),
        b'?' => return Some((TokenKind::Question, 1)),
        b'-' => return Some((TokenKind::Minus, 1)),
        b'|' => return Some((TokenKind::Pipe, 1)),
        b'`' => return Some((TokenKind::Backtick, 1)),
        _ => {}
    }

    if let Some(len) = match_wildcard_name(bytes, offset) {
        return Some((TokenKind::WildcardName, len));
    }
    if let Some(len) = match_word(bytes, offset) {
        return Some((TokenKind::Word, len));
    }
    if let Some(len) = match_id(bytes, offset) {
        return Some((TokenKind::Id, len));
    }
    if let Some(len) = match_number(bytes, offset) {
        return Some((TokenKind::Number, len));
    }
    if bytes[offset] == b'{' || bytes[offset] == b'}' {
        return Some((TokenKind::Other, 1));
    }
    if bytes[offset] >= 0x80 {
        return Some((TokenKind::Other, utf8_len(bytes, offset)));
    }
    if is_other_char(bytes[offset]) {
        return Some((TokenKind::Other, 1));
    }
    None
}

fn is_other_char(byte: u8) -> bool {
    // OTHER: /[^\s\w\[\]()`]/
    !byte.is_ascii_whitespace()
        && !is_word_byte(byte)
        && !matches!(byte, b'[' | b']' | b'(' | b')' | b'`')
}

fn is_word_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

fn utf8_len(bytes: &[u8], offset: usize) -> usize {
    if offset >= bytes.len() {
        return 0;
    }
    let width = match bytes[offset] {
        0x00..=0x7F => 1,
        0xC0..=0xDF => 2,
        0xE0..=0xEF => 3,
        0xF0..=0xF7 => 4,
        _ => 1,
    };
    width.min(bytes.len() - offset).max(1)
}

fn match_ws(bytes: &[u8], offset: usize) -> Option<usize> {
    let mut index = offset;
    while index < bytes.len() && (bytes[index] == b' ' || bytes[index] == b'\t') {
        index += 1;
    }
    (index > offset).then_some(index - offset)
}

fn match_nl(bytes: &[u8], offset: usize) -> Option<usize> {
    if bytes[offset] == b'\n' {
        return Some(1);
    }
    if bytes[offset] == b'\r' {
        if offset + 1 < bytes.len() && bytes[offset + 1] == b'\n' {
            return Some(2);
        }
        return Some(1);
    }
    None
}

fn is_inside_naked_quote(bytes: &[u8], offset: usize) -> bool {
    is_inside_line_fence(bytes, offset)
}

/// True when `offset` sits inside a complete same-line `"..."`, `'...'`, or `` `...` `` fence.
/// Unclosed openers are not fences, so `//` after them is a line comment.
/// rq:["../../../reqlan rq/language/syntax-edge-cases.rq".fencing_comments]
pub fn is_inside_line_fence(bytes: &[u8], offset: usize) -> bool {
    let line_start = line_start_offset(bytes, offset);
    let line_end = line_end_offset(bytes, line_start);
    let mut index = line_start;
    while index < offset && index < line_end {
        if index + 2 < line_end
            && bytes[index] == b'`'
            && bytes[index + 1] == b'`'
            && bytes[index + 2] == b'`'
        {
            index += 3;
            continue;
        }
        if let Some(end) = closed_fence_end(bytes, index, line_end) {
            if offset < end {
                return true;
            }
            index = end;
            continue;
        }
        index += 1;
    }
    false
}

fn line_end_offset(bytes: &[u8], line_start: usize) -> usize {
    let mut index = line_start;
    while index < bytes.len() && bytes[index] != b'\n' && bytes[index] != b'\r' {
        index += 1;
    }
    index
}

fn closed_fence_end(bytes: &[u8], start: usize, line_end: usize) -> Option<usize> {
    let open = bytes[start];
    if open == b'`' {
        let mut index = start + 1;
        while index < line_end {
            if bytes[index] == b'`' {
                return (index > start + 1).then_some(index + 1);
            }
            index += 1;
        }
        return None;
    }
    if open != b'"' && open != b'\'' {
        return None;
    }
    let mut index = start + 1;
    while index < line_end {
        let char = bytes[index];
        if char == b'\\' {
            index += 2;
            continue;
        }
        if char == open {
            return Some(index + 1);
        }
        index += 1;
    }
    None
}

fn match_sl_comment(bytes: &[u8], offset: usize) -> Option<usize> {
    if offset + 1 >= bytes.len() || bytes[offset] != b'/' || bytes[offset + 1] != b'/' {
        return None;
    }
    if is_inside_naked_quote(bytes, offset) {
        return None;
    }
    let mut previous_index = offset as isize - 1;
    while previous_index >= 0 {
        let previous = bytes[previous_index as usize];
        if previous != b' ' && previous != b'\t' {
            break;
        }
        previous_index -= 1;
    }
    let previous = if previous_index >= 0 { bytes[previous_index as usize] } else { 0 };
    if previous == b':' || previous == b'/' {
        return None;
    }
    let mut end = offset + 2;
    while end < bytes.len() && bytes[end] != b'\n' && bytes[end] != b'\r' {
        end += 1;
    }
    Some(end - offset)
}

fn match_ml_comment(bytes: &[u8], offset: usize) -> Option<usize> {
    if offset + 1 >= bytes.len() || bytes[offset] != b'/' || bytes[offset + 1] != b'*' {
        return None;
    }
    if is_inside_naked_quote(bytes, offset) {
        return None;
    }
    let mut end = offset + 2;
    while end + 1 < bytes.len() {
        if bytes[end] == b'*' && bytes[end + 1] == b'/' {
            let len = end + 2 - offset;
            if len == 4 {
                return None;
            }
            return Some(len);
        }
        end += 1;
    }
    None
}

fn at_sign_is_attribute(bytes: &[u8], offset: usize) -> bool {
    if bytes[offset] != b'@' {
        return false;
    }
    let mut previous_index = offset as isize - 1;
    while previous_index >= 0 {
        let previous = bytes[previous_index as usize];
        if previous != b' ' && previous != b'\t' {
            break;
        }
        previous_index -= 1;
    }
    previous_index < 0
        || bytes[previous_index as usize] == b'\n'
        || bytes[previous_index as usize] == b'\r'
}

fn match_markdown_link(bytes: &[u8], offset: usize) -> Option<usize> {
    if bytes[offset] != b'[' || (offset + 1 < bytes.len() && bytes[offset + 1] == b'[') {
        return None;
    }
    let mut index = offset + 1;
    while index < bytes.len() {
        if bytes[index] == b']' && index + 1 < bytes.len() && bytes[index + 1] == b'(' {
            let label_len = index - (offset + 1);
            let target_start = index + 2;
            let mut target_end = target_start;
            while target_end < bytes.len() && bytes[target_end] != b')' {
                if bytes[target_end] == b'\n' || bytes[target_end] == b'\r' {
                    return None;
                }
                target_end += 1;
            }
            if target_end >= bytes.len() || label_len == 0 || target_end == target_start {
                return None;
            }
            return Some(target_end + 1 - offset);
        }
        if bytes[index] == b'\n' || bytes[index] == b'\r' {
            return None;
        }
        index += 1;
    }
    None
}

fn match_url(bytes: &[u8], offset: usize) -> Option<usize> {
    if offset >= bytes.len() || !bytes[offset].is_ascii_alphabetic() {
        return None;
    }
    let mut end = offset + 1;
    while end < bytes.len() {
        let byte = bytes[end];
        if byte.is_ascii_alphanumeric() || byte == b'+' || byte == b'.' || byte == b'-' {
            end += 1;
            continue;
        }
        break;
    }
    if end + 2 >= bytes.len()
        || bytes[end] != b':'
        || bytes[end + 1] != b'/'
        || bytes[end + 2] != b'/'
    {
        return None;
    }
    end += 3;
    let rest_start = end;
    while end < bytes.len() {
        let byte = bytes[end];
        if byte == b' '
            || byte == b'\t'
            || byte == b'\n'
            || byte == b'\r'
            || byte == b'['
            || byte == b']'
        {
            break;
        }
        end += 1;
    }
    if end == rest_start {
        return None;
    }
    Some(end - offset)
}

fn is_code_fence_open(bytes: &[u8], offset: usize) -> bool {
    offset + 2 < bytes.len()
        && bytes[offset] == b'`'
        && bytes[offset + 1] == b'`'
        && bytes[offset + 2] == b'`'
        && is_line_start_at(bytes, offset)
}

fn match_code_fence(bytes: &[u8], offset: usize) -> Option<usize> {
    if !is_code_fence_open(bytes, offset) {
        return None;
    }
    Some(fence_end_after(bytes, offset) - offset)
}

fn fence_end_after(bytes: &[u8], open_offset: usize) -> usize {
    if open_offset + 2 >= bytes.len()
        || bytes[open_offset] != b'`'
        || bytes[open_offset + 1] != b'`'
        || bytes[open_offset + 2] != b'`'
    {
        return open_offset;
    }
    let after_open = open_offset + 3;
    if let Some(first_nl) = find_nl(bytes, after_open) {
        if let Some(close) = find_line_start_triple_tick(bytes, first_nl + 1) {
            return close + 3;
        }
        return bytes.len();
    }
    if let Some(same_line_close) = find_triple_tick(bytes, after_open) {
        return same_line_close + 3;
    }
    bytes.len()
}

fn find_nl(bytes: &[u8], from: usize) -> Option<usize> {
    bytes[from..].iter().position(|&b| b == b'\n').map(|i| from + i)
}

fn find_triple_tick(bytes: &[u8], from: usize) -> Option<usize> {
    let mut index = from;
    while index + 2 < bytes.len() {
        if bytes[index] == b'`' && bytes[index + 1] == b'`' && bytes[index + 2] == b'`' {
            return Some(index);
        }
        index += 1;
    }
    None
}

fn find_line_start_triple_tick(bytes: &[u8], from: usize) -> Option<usize> {
    let mut index = from;
    while index + 2 < bytes.len() {
        if is_code_fence_open(bytes, index) {
            return Some(index);
        }
        index += 1;
    }
    None
}

fn match_inline_code(bytes: &[u8], offset: usize) -> Option<usize> {
    if bytes[offset] != b'`' {
        return None;
    }
    if offset + 2 < bytes.len() && bytes[offset + 1] == b'`' && bytes[offset + 2] == b'`' {
        return None;
    }
    let mut index = offset + 1;
    while index < bytes.len() {
        if bytes[index] == b'`' {
            if index == offset + 1 {
                return None;
            }
            return Some(index + 1 - offset);
        }
        if bytes[index] == b'\n' {
            return None;
        }
        index += 1;
    }
    None
}

fn match_string(bytes: &[u8], offset: usize, cache: &BraceScanCache) -> Option<usize> {
    let quote = bytes[offset];
    if quote != b'"' && quote != b'\'' {
        return None;
    }
    if !is_string_literal_context(bytes, offset, cache) {
        return None;
    }
    let mut index = offset + 1;
    while index < bytes.len() {
        let char = bytes[index];
        if char == b'\n' || char == b'\r' {
            return None;
        }
        if char == b'\\' {
            index += 2;
            continue;
        }
        if char == quote {
            return Some(index + 1 - offset);
        }
        index += 1;
    }
    None
}

fn is_string_literal_context(bytes: &[u8], offset: usize, cache: &BraceScanCache) -> bool {
    let depth = brace_state_before(cache, offset).structural_depth;
    let trimmed = text_before_on_line(bytes, offset);
    if depth == 0 && (trimmed.ends_with("from") || trimmed.ends_with("import")) {
        let prefix_ok = trimmed.len() == 4
            || trimmed.len() == 6
            || trimmed
                .as_bytes()
                .get(trimmed.len().saturating_sub(5))
                .is_some_and(|b| !is_ident_continue(*b))
            || (trimmed.ends_with("import")
                && trimmed
                    .as_bytes()
                    .get(trimmed.len().saturating_sub(7))
                    .is_some_and(|b| !is_ident_continue(*b)));
        if prefix_ok
            && ends_with_keyword(
                &trimmed,
                if trimmed.ends_with("from") { "from" } else { "import" },
            )
        {
            return true;
        }
    }
    if trimmed.ends_with('[') || trimmed.ends_with("[ ") || trimmed.trim_end().ends_with('[') {
        return true;
    }
    if trimmed.is_empty() && depth == 0 {
        return true;
    }
    false
}

fn ends_with_keyword(trimmed: &str, keyword: &str) -> bool {
    if !trimmed.ends_with(keyword) {
        return false;
    }
    let before = trimmed.len() - keyword.len();
    if before == 0 {
        return true;
    }
    let bytes = trimmed.as_bytes();
    let prev = bytes[before - 1];
    prev.is_ascii_whitespace()
}

fn match_from_kw(bytes: &[u8], offset: usize, cache: &BraceScanCache) -> Option<usize> {
    if !starts_with_word(bytes, offset, b"from") {
        return None;
    }
    if brace_state_before(cache, offset).structural_depth != 0 || !is_line_start_at(bytes, offset) {
        return None;
    }
    Some(4)
}

fn match_import_kw(bytes: &[u8], offset: usize, cache: &BraceScanCache) -> Option<usize> {
    if !starts_with_word(bytes, offset, b"import") {
        return None;
    }
    if brace_state_before(cache, offset).structural_depth != 0 {
        return None;
    }
    if is_line_start_at(bytes, offset) {
        return Some(6);
    }
    let before = text_before_on_line(bytes, offset);
    if quoted_or_qualified_path_suffix(&before) {
        return Some(6);
    }
    None
}

fn match_as_kw(bytes: &[u8], offset: usize, cache: &BraceScanCache) -> Option<usize> {
    if !starts_with_word(bytes, offset, b"as") {
        return None;
    }
    if brace_state_before(cache, offset).structural_depth != 0 {
        return None;
    }
    let line_prefix = line_prefix(bytes, offset);
    if !line_starts_with_from_or_import(&line_prefix) {
        return None;
    }
    let before = text_before_on_line(bytes, offset);
    if quoted_or_id_suffix(&before) {
        return Some(2);
    }
    None
}

fn starts_with_word(bytes: &[u8], offset: usize, word: &[u8]) -> bool {
    if offset + word.len() > bytes.len() {
        return false;
    }
    if &bytes[offset..offset + word.len()] != word {
        return false;
    }
    let next = bytes.get(offset + word.len()).copied();
    !matches!(next, Some(b) if is_ident_continue(b))
}

fn is_ident_start(byte: u8) -> bool {
    byte.is_ascii_alphabetic() || byte == b'_'
}

fn is_ident_continue(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-'
}

fn match_id(bytes: &[u8], offset: usize) -> Option<usize> {
    if !is_ident_start(bytes[offset]) {
        return None;
    }
    let mut end = offset + 1;
    while end < bytes.len() && is_ident_continue(bytes[end]) {
        end += 1;
    }
    Some(end - offset)
}

fn match_wildcard_name(bytes: &[u8], offset: usize) -> Option<usize> {
    // *[\w*?-]* | ?[\w*?-]* | [_a-zA-Z][\w-]*[*?][\w*?-]*
    if bytes[offset] == b'*' || bytes[offset] == b'?' {
        let mut end = offset + 1;
        while end < bytes.len() && is_wildcard_continue(bytes[end]) {
            end += 1;
        }
        return Some(end - offset);
    }
    if !is_ident_start(bytes[offset]) {
        return None;
    }
    let mut end = offset + 1;
    let mut saw_meta = false;
    while end < bytes.len() {
        let byte = bytes[end];
        if byte == b'*' || byte == b'?' {
            saw_meta = true;
            end += 1;
            continue;
        }
        if is_ident_continue(byte) {
            end += 1;
            continue;
        }
        break;
    }
    if saw_meta {
        Some(end - offset)
    } else {
        None
    }
}

fn is_wildcard_continue(byte: u8) -> bool {
    is_word_byte(byte) || byte == b'*' || byte == b'?' || byte == b'-'
}

fn match_word(bytes: &[u8], offset: usize) -> Option<usize> {
    if !is_ident_start(bytes[offset]) {
        return None;
    }
    let mut end = offset + 1;
    let mut saw_quote = false;
    while end < bytes.len() {
        let byte = bytes[end];
        if byte.is_ascii_alphanumeric() || byte == b'_' {
            end += 1;
            continue;
        }
        if byte == b'\'' {
            saw_quote = true;
            end += 1;
            continue;
        }
        break;
    }
    if saw_quote {
        Some(end - offset)
    } else {
        None
    }
}

fn match_number(bytes: &[u8], offset: usize) -> Option<usize> {
    if !bytes[offset].is_ascii_digit() {
        return None;
    }
    let mut end = offset + 1;
    while end < bytes.len() && bytes[end].is_ascii_digit() {
        end += 1;
    }
    Some(end - offset)
}

fn line_start_offset(bytes: &[u8], offset: usize) -> usize {
    let mut index = offset;
    while index > 0 {
        if bytes[index - 1] == b'\n' {
            return index;
        }
        index -= 1;
    }
    0
}

fn line_prefix(bytes: &[u8], offset: usize) -> String {
    let start = line_start_offset(bytes, offset);
    String::from_utf8_lossy(&bytes[start..offset]).into_owned()
}

fn text_before_on_line(bytes: &[u8], offset: usize) -> String {
    let raw = line_prefix(bytes, offset);
    raw.trim_end_matches([' ', '\t']).to_string()
}

fn is_line_start_at(bytes: &[u8], offset: usize) -> bool {
    let mut previous_index = offset as isize - 1;
    while previous_index >= 0 {
        let previous = bytes[previous_index as usize];
        if previous != b' ' && previous != b'\t' {
            break;
        }
        previous_index -= 1;
    }
    previous_index < 0
        || bytes[previous_index as usize] == b'\n'
        || bytes[previous_index as usize] == b'\r'
}

fn is_escaped_at(bytes: &[u8], offset: usize) -> bool {
    let mut backslashes = 0usize;
    let mut index = offset as isize - 1;
    while index >= 0 && bytes[index as usize] == b'\\' {
        backslashes += 1;
        index -= 1;
    }
    backslashes % 2 == 1
}

fn rest_of_line_is_blank(bytes: &[u8], offset: usize) -> bool {
    let mut index = offset + 1;
    while index < bytes.len() {
        let char = bytes[index];
        if char == b'\n' || char == b'\r' {
            return true;
        }
        if char != b' ' && char != b'\t' {
            return false;
        }
        index += 1;
    }
    true
}

fn is_structural_open_brace_at_depth(bytes: &[u8], offset: usize, depth: i32) -> bool {
    if bytes[offset] != b'{' {
        return false;
    }
    if is_escaped_at(bytes, offset) {
        return false;
    }
    let before = text_before_on_line(bytes, offset);
    if depth == 0
        && (is_block_opener_line(&before)
            || (is_line_start_at(bytes, offset) && before.trim().is_empty()))
    {
        return true;
    }
    if is_attribute_opener(&before) {
        return true;
    }
    if depth >= 1 && is_line_start_at(bytes, offset) {
        return true;
    }
    if depth >= 1 && ident_suffix(&before) && !is_line_start_at(bytes, offset) {
        return rest_of_line_is_blank(bytes, offset);
    }
    false
}

fn is_block_opener_line(before: &str) -> bool {
    let trimmed = before.trim_start_matches([' ', '\t']);
    if trimmed.is_empty() {
        return false;
    }
    is_bare_name(trimmed) || is_quoted_name(trimmed)
}

fn is_bare_name(text: &str) -> bool {
    let bytes = text.as_bytes();
    if bytes.is_empty() || !(bytes[0].is_ascii_alphabetic() || bytes[0] == b'_' || bytes[0] == b'.')
    {
        return false;
    }
    bytes.iter().all(|&b| is_ident_continue(b) || b == b'.')
}

fn is_quoted_name(text: &str) -> bool {
    let bytes = text.as_bytes();
    if bytes.len() < 2 {
        return false;
    }
    let quote = bytes[0];
    if quote != b'"' && quote != b'\'' {
        return false;
    }
    if bytes[bytes.len() - 1] != quote {
        return false;
    }
    true
}

fn is_attribute_opener(before: &str) -> bool {
    // /@[A-Za-z_][\w-]*(?::)?\s*$/
    let trimmed = before.trim_end_matches([' ', '\t']);
    let Some(at) = trimmed.rfind('@') else {
        return false;
    };
    if at > 0 && !trimmed.as_bytes()[..at].iter().all(|&b| b == b' ' || b == b'\t') {
        return false;
    }
    let rest = &trimmed[at + 1..];
    let rest = rest.strip_suffix(':').unwrap_or(rest);
    let bytes = rest.as_bytes();
    if bytes.is_empty() || !(bytes[0].is_ascii_alphabetic() || bytes[0] == b'_') {
        return false;
    }
    bytes[1..].iter().all(|&b| is_ident_continue(b))
}

fn ident_suffix(before: &str) -> bool {
    // Slice after the last non-ident char, not start+1 (middle-dot `·` is two UTF-8 bytes).
    // rq:["../../../reqlan rq/core_analysis/rust_port.rq".lexer_rust]
    let trimmed = before.trim_end_matches([' ', '\t']);
    let Some((start, ch)) = trimmed
        .char_indices()
        .rev()
        .find(|(_, c)| !(c.is_ascii_alphanumeric() || *c == '_' || *c == '-'))
    else {
        return !trimmed.is_empty() && is_ident_start(trimmed.as_bytes()[0]);
    };
    let ident = &trimmed[start + ch.len_utf8()..];
    !ident.is_empty() && is_ident_start(ident.as_bytes()[0])
}

fn is_structural_close_brace_at(bytes: &[u8], offset: usize, cache: &BraceScanCache) -> bool {
    if bytes[offset] != b'}' {
        return false;
    }
    if is_escaped_at(bytes, offset) {
        return false;
    }
    if !rest_of_line_is_blank(bytes, offset) {
        return false;
    }
    let state = brace_state_before(cache, offset);
    if state.structural_depth <= 0 {
        return false;
    }
    if is_line_start_at(bytes, offset) {
        return true;
    }
    state.prose_depth == 0
}

fn is_structural_open_brace_at(bytes: &[u8], offset: usize, cache: &BraceScanCache) -> bool {
    let depth = brace_state_before(cache, offset).structural_depth;
    is_structural_open_brace_at_depth(bytes, offset, depth)
}

fn brace_state_before(cache: &BraceScanCache, offset: usize) -> BraceScanState {
    let offsets = &cache.offsets;
    let mut low = 0isize;
    let mut high = offsets.len() as isize - 1;
    while low <= high {
        let mid = (low + high) >> 1;
        if offsets[mid as usize] <= offset {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    let index = high.max(0) as usize;
    BraceScanState {
        structural_depth: cache.structural_depth.get(index).copied().unwrap_or(0),
        prose_depth: cache.prose_depth.get(index).copied().unwrap_or(0),
    }
}

fn build_brace_scan_cache(bytes: &[u8]) -> BraceScanCache {
    let mut structural_depth = 0i32;
    let mut prose_depth_by_structural: Vec<i32> = vec![0];
    let mut offsets = vec![0usize];
    let mut structural_depth_at = vec![0i32];
    let mut prose_depth_at_offsets = vec![0i32];

    let prose_depth_at = |structural_depth: i32, prose: &[i32]| -> i32 {
        prose.get(structural_depth as usize).copied().unwrap_or(0)
    };

    let mut index = 0usize;
    while index < bytes.len() {
        if is_code_fence_open(bytes, index) {
            index = fence_end_after(bytes, index);
            continue;
        }
        let char = bytes[index];
        if char == b'{' {
            if !is_escaped_at(bytes, index) {
                if is_structural_open_brace_at_depth(bytes, index, structural_depth) {
                    structural_depth += 1;
                    if prose_depth_by_structural.len() <= structural_depth as usize {
                        prose_depth_by_structural.resize(structural_depth as usize + 1, 0);
                    }
                    prose_depth_by_structural[structural_depth as usize] = 0;
                } else {
                    let current = prose_depth_at(structural_depth, &prose_depth_by_structural);
                    if prose_depth_by_structural.len() <= structural_depth as usize {
                        prose_depth_by_structural.resize(structural_depth as usize + 1, 0);
                    }
                    prose_depth_by_structural[structural_depth as usize] = current + 1;
                }
                record_state(
                    index + 1,
                    structural_depth,
                    prose_depth_at(structural_depth, &prose_depth_by_structural),
                    &mut offsets,
                    &mut structural_depth_at,
                    &mut prose_depth_at_offsets,
                );
            }
            index += 1;
            continue;
        }
        if char != b'}' {
            index += 1;
            continue;
        }
        if is_escaped_at(bytes, index) {
            index += 1;
            continue;
        }
        let at_end_of_line = rest_of_line_is_blank(bytes, index);
        if !at_end_of_line {
            let current = prose_depth_at(structural_depth, &prose_depth_by_structural);
            if current > 0 {
                prose_depth_by_structural[structural_depth as usize] = current - 1;
                record_state(
                    index + 1,
                    structural_depth,
                    current - 1,
                    &mut offsets,
                    &mut structural_depth_at,
                    &mut prose_depth_at_offsets,
                );
            }
            index += 1;
            continue;
        }
        if structural_depth <= 0 {
            let current = prose_depth_at(structural_depth, &prose_depth_by_structural);
            if current > 0 {
                prose_depth_by_structural[structural_depth as usize] = current - 1;
                record_state(
                    index + 1,
                    structural_depth,
                    current - 1,
                    &mut offsets,
                    &mut structural_depth_at,
                    &mut prose_depth_at_offsets,
                );
            }
            index += 1;
            continue;
        }
        if is_line_start_at(bytes, index) {
            structural_depth -= 1;
            record_state(
                index + 1,
                structural_depth,
                prose_depth_at(structural_depth, &prose_depth_by_structural),
                &mut offsets,
                &mut structural_depth_at,
                &mut prose_depth_at_offsets,
            );
            index += 1;
            continue;
        }
        let current = prose_depth_at(structural_depth, &prose_depth_by_structural);
        if current > 0 {
            prose_depth_by_structural[structural_depth as usize] = current - 1;
            record_state(
                index + 1,
                structural_depth,
                current - 1,
                &mut offsets,
                &mut structural_depth_at,
                &mut prose_depth_at_offsets,
            );
        } else {
            structural_depth -= 1;
            record_state(
                index + 1,
                structural_depth,
                prose_depth_at(structural_depth, &prose_depth_by_structural),
                &mut offsets,
                &mut structural_depth_at,
                &mut prose_depth_at_offsets,
            );
        }
        index += 1;
    }

    BraceScanCache {
        offsets,
        structural_depth: structural_depth_at,
        prose_depth: prose_depth_at_offsets,
    }
}

fn record_state(
    offset: usize,
    structural_depth: i32,
    prose_depth: i32,
    offsets: &mut Vec<usize>,
    structural_depth_at: &mut Vec<i32>,
    prose_depth_at_offsets: &mut Vec<i32>,
) {
    let last = offsets.len() - 1;
    if offsets[last] == offset {
        structural_depth_at[last] = structural_depth;
        prose_depth_at_offsets[last] = prose_depth;
        return;
    }
    offsets.push(offset);
    structural_depth_at.push(structural_depth);
    prose_depth_at_offsets.push(prose_depth);
}

fn quoted_or_qualified_path_suffix(before: &str) -> bool {
    // /(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/
    ends_with_quoted(before)
}

fn quoted_or_id_suffix(before: &str) -> bool {
    // (?:quoted(?:\.[ID])*|ID)$
    if ident_only_suffix(before) {
        return true;
    }
    if let Some(quoted_end) = rfind_quoted_end(before) {
        let after = &before[quoted_end..];
        return after.is_empty()
            || after.bytes().all(|b| is_ident_continue(b) || b == b'.') && after.starts_with('.');
    }
    false
}

fn ident_only_suffix(before: &str) -> bool {
    let trimmed = before.trim_end_matches([' ', '\t']);
    let Some(start) = trimmed.rfind(|c: char| !(c.is_ascii_alphanumeric() || c == '_' || c == '-'))
    else {
        return !trimmed.is_empty() && is_ident_start(trimmed.as_bytes()[0]);
    };
    let ident = &trimmed[start + 1..];
    !ident.is_empty() && is_ident_start(ident.as_bytes()[0])
}

fn ends_with_quoted(before: &str) -> bool {
    rfind_quoted_end(before).is_some_and(|end| end == before.len())
}

fn rfind_quoted_end(before: &str) -> Option<usize> {
    let bytes = before.as_bytes();
    if bytes.is_empty() {
        return None;
    }
    let quote = *bytes.last()?;
    if quote != b'"' && quote != b'\'' {
        return None;
    }
    let mut index = bytes.len() - 1;
    while index > 0 {
        index -= 1;
        if bytes[index] == quote && !is_escaped_at(bytes, index) {
            return Some(bytes.len());
        }
    }
    None
}

fn line_starts_with_from_or_import(line_prefix: &str) -> bool {
    let trimmed = line_prefix.trim_start_matches([' ', '\t']);
    trimmed.starts_with("from")
        && (trimmed.len() == 4 || trimmed.as_bytes().get(4).is_some_and(|b| !is_ident_continue(*b)))
        || trimmed.starts_with("import")
            && (trimmed.len() == 6
                || trimmed.as_bytes().get(6).is_some_and(|b| !is_ident_continue(*b)))
}
