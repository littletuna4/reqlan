//! Token kinds for the reqlan index-path lexer.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".lexer_rust]

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TokenKind {
    Nl,
    Ws,
    SlComment,
    MlComment,
    MarkdownLink,
    Id,
    WildcardName,
    String,
    Number,
    Word,
    Other,
    InlineCode,
    CodeFence,
    FromKw,
    ImportKw,
    AsKw,
    At,
    LBrace,
    RBrace,
    LParen,
    RParen,
    LBrack,
    RBrack,
    LWiki,
    RWiki,
    Dot,
    Comma,
    Colon,
    Semicolon,
    Bang,
    Question,
    Minus,
    Pipe,
    Backtick,
    Eof,
}

impl TokenKind {
    pub fn is_hidden(self) -> bool {
        matches!(self, Self::Ws | Self::SlComment | Self::MlComment)
    }

    pub fn is_trivia(self) -> bool {
        self.is_hidden()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Token {
    pub kind: TokenKind,
    pub start: usize,
    pub end: usize,
    pub line: u32,
    pub column: u32,
}

impl Token {
    pub fn text<'a>(&self, source: &'a str) -> &'a str {
        source.get(self.start..self.end).unwrap_or("")
    }

    pub fn len(&self) -> usize {
        self.end.saturating_sub(self.start)
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Span {
    pub start: usize,
    pub end: usize,
    pub line_start: u32,
    pub line_end: u32,
}

impl Span {
    pub fn from_token(token: &Token) -> Self {
        Self { start: token.start, end: token.end, line_start: token.line, line_end: token.line }
    }

    pub fn union(self, other: Self) -> Self {
        Self {
            start: self.start.min(other.start),
            end: self.end.max(other.end),
            line_start: self.line_start.min(other.line_start),
            line_end: self.line_end.max(other.line_end),
        }
    }

    pub fn dummy() -> Self {
        Self { start: 0, end: 0, line_start: 0, line_end: 0 }
    }
}
