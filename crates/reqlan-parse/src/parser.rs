//! Recursive-descent parser for the reqlan index path.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]
//! rq:["../../../reqlan rq/language/parser_lexer.rq".recovery_vs_budget]
//! rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]

use crate::ast::*;
use crate::budget::{
    parse_timeout_error_message, ParseBudget, PARSE_HANG_SENTINEL, PARSE_TIMEOUT_WARNING,
};
use crate::lexer::{lex, visible_tokens};
use crate::token::{Span, Token, TokenKind};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseDiagnostic {
    pub offset: usize,
    pub line: u32,
    pub message: String,
    pub severity: Severity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Debug, Clone)]
pub struct ParseResult {
    pub model: Model,
    pub diagnostics: Vec<ParseDiagnostic>,
    pub incomplete: Option<IncompleteParse>,
}

#[derive(Debug, Clone)]
pub struct IncompleteParse {
    pub reason: IncompleteReason,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IncompleteReason {
    Timeout,
    Failure,
}

pub fn parse_document(source: &str) -> ParseResult {
    parse_document_with_budget(source, ParseBudget::default_limit())
}

pub fn parse_document_with_budget(source: &str, budget: ParseBudget) -> ParseResult {
    if source.contains(PARSE_HANG_SENTINEL) {
        while !budget.expired() {
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        return incomplete_timeout(budget);
    }

    let lexed = lex(source, budget);
    if lexed.timed_out {
        return incomplete_timeout(budget);
    }

    let visible: Vec<Token> = visible_tokens(&lexed.tokens).into_iter().cloned().collect();
    let mut parser = Parser {
        source,
        tokens: visible,
        index: 0,
        budget,
        diagnostics: lexed
            .errors
            .into_iter()
            .map(|error| ParseDiagnostic {
                offset: error.offset,
                line: error.line,
                message: error.message,
                severity: Severity::Error,
            })
            .collect(),
        steps: 0,
    };
    let model = parser.parse_model();
    if parser.budget.expired() {
        return incomplete_timeout(budget);
    }
    ParseResult { model, diagnostics: parser.diagnostics, incomplete: None }
}

fn incomplete_timeout(budget: ParseBudget) -> ParseResult {
    let timeout_ms = 8_000u64.saturating_sub(budget.remaining().as_millis() as u64).max(1);
    ParseResult {
        model: Model { span: Span::dummy(), imports: Vec::new(), elements: Vec::new() },
        diagnostics: vec![
            ParseDiagnostic {
                offset: 0,
                line: 0,
                message: PARSE_TIMEOUT_WARNING.to_string(),
                severity: Severity::Warning,
            },
            ParseDiagnostic {
                offset: 0,
                line: 0,
                message: parse_timeout_error_message(timeout_ms),
                severity: Severity::Error,
            },
        ],
        incomplete: Some(IncompleteParse {
            reason: IncompleteReason::Timeout,
            timeout_ms: Some(timeout_ms),
        }),
    }
}

struct Parser<'s> {
    source: &'s str,
    tokens: Vec<Token>,
    index: usize,
    budget: ParseBudget,
    diagnostics: Vec<ParseDiagnostic>,
    steps: u32,
}

impl<'s> Parser<'s> {
    fn check_budget(&mut self) -> bool {
        self.steps += 1;
        if self.steps % 128 == 0 && self.budget.expired() {
            return true;
        }
        false
    }

    fn current(&self) -> &Token {
        self.tokens.get(self.index).unwrap_or_else(|| self.tokens.last().expect("eof token"))
    }

    fn kind(&self) -> TokenKind {
        self.current().kind
    }

    fn at(&self, kind: TokenKind) -> bool {
        self.kind() == kind
    }

    fn peek_kind(&self, offset: usize) -> TokenKind {
        self.tokens.get(self.index + offset).map(|t| t.kind).unwrap_or(TokenKind::Eof)
    }

    fn bump(&mut self) -> Token {
        let token = self.current().clone();
        if token.kind != TokenKind::Eof && self.index + 1 < self.tokens.len() {
            self.index += 1;
        }
        token
    }

    fn eat(&mut self, kind: TokenKind) -> Option<Token> {
        if self.at(kind) {
            Some(self.bump())
        } else {
            None
        }
    }

    fn skip_nl(&mut self) {
        while self.at(TokenKind::Nl) {
            self.bump();
        }
    }

    fn span_of(&self, start: &Token, end: &Token) -> Span {
        Span { start: start.start, end: end.end, line_start: start.line, line_end: end.line }
    }

    fn token_text(&self, token: &Token) -> String {
        token.text(self.source).to_string()
    }

    fn bump_text(&mut self) -> String {
        let token = self.bump();
        self.token_text(&token)
    }

    fn unquote(text: &str) -> String {
        let bytes = text.as_bytes();
        if bytes.len() >= 2 {
            let quote = bytes[0];
            if (quote == b'"' || quote == b'\'') && bytes[bytes.len() - 1] == quote {
                let inner = &text[1..text.len() - 1];
                let mut out = String::with_capacity(inner.len());
                let mut chars = inner.chars().peekable();
                while let Some(ch) = chars.next() {
                    if ch == '\\' {
                        if let Some(next) = chars.next() {
                            out.push(next);
                        }
                    } else {
                        out.push(ch);
                    }
                }
                return out;
            }
        }
        text.to_string()
    }

    fn idea_name_from(&self, token: &Token) -> String {
        match token.kind {
            TokenKind::String => Self::unquote(token.text(self.source)),
            _ => token.text(self.source).to_string(),
        }
    }

    fn bump_idea_name(&mut self) -> String {
        let token = self.bump();
        self.idea_name_from(&token)
    }

    fn parse_model(&mut self) -> Model {
        let start = self.current().clone();
        let mut imports = Vec::new();
        let mut elements = Vec::new();

        loop {
            if self.check_budget() {
                break;
            }
            self.skip_nl();
            if self.at(TokenKind::Eof) {
                break;
            }
            if self.at(TokenKind::FromKw) || self.at(TokenKind::ImportKw) {
                imports.push(self.parse_import());
                continue;
            }
            break;
        }

        loop {
            if self.check_budget() {
                break;
            }
            self.skip_nl();
            if self.at(TokenKind::Eof) {
                break;
            }
            if self.at(TokenKind::FromKw) || self.at(TokenKind::ImportKw) {
                imports.push(self.parse_import());
                continue;
            }
            elements.push(self.parse_top_level());
        }

        let end = self.current().clone();
        Model { span: self.span_of(&start, &end), imports, elements }
    }

    fn parse_import(&mut self) -> Import {
        if self.at(TokenKind::FromKw) {
            return self.parse_from_import();
        }
        self.parse_import_kw_line()
    }

    fn parse_from_import(&mut self) -> Import {
        let start = self.bump();
        if !self.at(TokenKind::String) {
            let mut text = String::from("from");
            while !self.at(TokenKind::Nl) && !self.at(TokenKind::Eof) {
                text.push(' ');
                text.push_str(&self.token_text(self.current()));
                self.bump();
            }
            let end = self.current().clone();
            return Import::InvalidFrom(InvalidFromImport {
                span: self.span_of(&start, &end),
                text,
            });
        }
        let path = Self::unquote(&self.bump_text());
        if self.eat(TokenKind::ImportKw).is_some() {
            let mut specifiers = vec![self.parse_from_specifier()];
            while self.eat(TokenKind::Comma).is_some() {
                specifiers.push(self.parse_from_specifier());
            }
            let end = self.current().clone();
            return Import::From(FromImport {
                span: self.span_of(&start, &end),
                path,
                specifiers,
                alias: None,
            });
        }
        if self.eat(TokenKind::AsKw).is_some() {
            let alias = self.expect_id();
            let end = self.current().clone();
            return Import::From(FromImport {
                span: self.span_of(&start, &end),
                path,
                specifiers: Vec::new(),
                alias,
            });
        }
        let end = self.current().clone();
        Import::From(FromImport {
            span: self.span_of(&start, &end),
            path,
            specifiers: Vec::new(),
            alias: None,
        })
    }

    fn parse_from_specifier(&mut self) -> FromImportSpecifier {
        let start = self.current().clone();
        let idea = self.expect_id().unwrap_or_default();
        let alias = if self.eat(TokenKind::AsKw).is_some() { self.expect_id() } else { None };
        let end = self.current().clone();
        FromImportSpecifier { span: self.span_of(&start, &end), idea, alias }
    }

    fn parse_import_kw_line(&mut self) -> Import {
        let start = self.bump();
        if !self.at(TokenKind::String) {
            self.error("expected import path string");
            let end = self.current().clone();
            return Import::InvalidFrom(InvalidFromImport {
                span: self.span_of(&start, &end),
                text: "import".into(),
            });
        }
        let path = Self::unquote(&self.bump_text());
        if self.eat(TokenKind::Dot).is_some() {
            let ideaset = self.expect_id().unwrap_or_default();
            self.eat(TokenKind::Dot);
            let idea = self.expect_id().unwrap_or_default();
            let alias = if self.eat(TokenKind::AsKw).is_some() { self.expect_id() } else { None };
            let end = self.current().clone();
            return Import::Qualified(QualifiedImport {
                span: self.span_of(&start, &end),
                path,
                ideaset,
                idea,
                alias,
            });
        }
        let alias = if self.eat(TokenKind::AsKw).is_some() { self.expect_id() } else { None };
        let end = self.current().clone();
        Import::Namespace(NamespaceImport { span: self.span_of(&start, &end), path, alias })
    }

    fn parse_top_level(&mut self) -> TopLevelElement {
        if self.at(TokenKind::LBrace) {
            return TopLevelElement::Anonymous(self.parse_anonymous_block());
        }
        if self.is_idea_name() {
            let name_token = self.current().clone();
            let next = self.peek_kind(1);
            if next == TokenKind::LBrace {
                return TopLevelElement::Idea(self.parse_idea());
            }
            if next == TokenKind::LParen {
                return TopLevelElement::IdeaSet(self.parse_ideaset());
            }
            if matches!(next, TokenKind::Nl | TokenKind::Eof) {
                let name = self.bump_idea_name();
                return TopLevelElement::OneLiner(OneLinerIdea {
                    span: Span::from_token(&name_token),
                    name,
                    body: Vec::new(),
                });
            }
            return TopLevelElement::OneLiner(self.parse_one_liner());
        }
        self.error("expected idea, ideaset, or one-liner");
        self.skip_until_nl();
        TopLevelElement::OneLiner(OneLinerIdea {
            span: Span::from_token(self.current()),
            name: String::new(),
            body: Vec::new(),
        })
    }

    fn is_idea_name(&self) -> bool {
        matches!(self.kind(), TokenKind::Id | TokenKind::String)
    }

    fn parse_idea(&mut self) -> Idea {
        let start = self.current().clone();
        let name = self.bump_idea_name();
        self.eat(TokenKind::LBrace);
        let elements = self.parse_body_elements(TokenKind::RBrace);
        let end = self.eat(TokenKind::RBrace).unwrap_or_else(|| self.current().clone());
        Idea { span: self.span_of(&start, &end), name, elements }
    }

    fn parse_anonymous_block(&mut self) -> AnonymousBlock {
        let start = self.bump();
        let elements = self.parse_body_elements(TokenKind::RBrace);
        let end = self.eat(TokenKind::RBrace).unwrap_or_else(|| self.current().clone());
        AnonymousBlock { span: self.span_of(&start, &end), elements }
    }

    fn parse_ideaset(&mut self) -> IdeaSet {
        let start = self.current().clone();
        let name = self.bump_idea_name();
        self.eat(TokenKind::LParen);
        self.skip_nl();
        let mut members = Vec::new();
        if self.is_idea_name() {
            members.push(self.bump_idea_name());
            loop {
                self.skip_nl();
                if self.eat(TokenKind::Comma).is_none() {
                    break;
                }
                self.skip_nl();
                if self.is_idea_name() {
                    members.push(self.bump_idea_name());
                }
            }
        }
        self.skip_nl();
        let end = self.eat(TokenKind::RParen).unwrap_or_else(|| self.current().clone());
        IdeaSet { span: self.span_of(&start, &end), name, members }
    }

    fn parse_one_liner(&mut self) -> OneLinerIdea {
        let start = self.current().clone();
        let name = self.bump_idea_name();
        let mut body = Vec::new();
        while !self.at(TokenKind::Nl) && !self.at(TokenKind::Eof) {
            if let Some(part) = self.parse_rich_part(false) {
                body.push(part);
            } else {
                break;
            }
        }
        let end = body.last().map(RichPart::span).unwrap_or(Span::from_token(&start));
        OneLinerIdea {
            span: Span {
                start: start.start,
                end: end.end,
                line_start: start.line,
                line_end: end.line_end,
            },
            name,
            body,
        }
    }

    fn parse_body_elements(&mut self, until: TokenKind) -> Vec<BodyElement> {
        let mut elements = Vec::new();
        loop {
            if self.check_budget() {
                break;
            }
            self.skip_nl();
            if self.at(until) || self.at(TokenKind::Eof) {
                break;
            }
            if self.at(TokenKind::At) {
                elements.push(BodyElement::Attribute(self.parse_attribute()));
                continue;
            }
            if self.at(TokenKind::CodeFence) {
                let token = self.bump();
                elements.push(BodyElement::CodeSnippet(CodeSnippet {
                    span: Span::from_token(&token),
                    raw: self.token_text(&token),
                }));
                continue;
            }
            if self.at(TokenKind::Id)
                && self.peek_kind(1) == TokenKind::LParen
                && self.named_list_follows()
            {
                elements.push(BodyElement::NamedList(self.parse_named_list()));
                continue;
            }
            if self.at(TokenKind::LParen) && self.nested_list_follows() {
                elements.push(BodyElement::NestedList(self.parse_nested_list()));
                continue;
            }
            elements.push(BodyElement::BodyLine(self.parse_body_line()));
        }
        elements
    }

    fn named_list_follows(&self) -> bool {
        // NamedList: ID '(' NL+
        self.at(TokenKind::Id)
            && self.peek_kind(1) == TokenKind::LParen
            && self.peek_kind(2) == TokenKind::Nl
    }

    fn nested_list_follows(&self) -> bool {
        self.at(TokenKind::LParen) && self.peek_kind(1) == TokenKind::Nl
    }

    fn parse_named_list(&mut self) -> NamedList {
        let start = self.current().clone();
        let label = self.bump_text();
        self.eat(TokenKind::LParen);
        let items = self.parse_list_items();
        let end = self.eat(TokenKind::RParen).unwrap_or_else(|| self.current().clone());
        NamedList { span: self.span_of(&start, &end), label, items }
    }

    fn parse_nested_list(&mut self) -> NestedList {
        let start = self.bump();
        let items = self.parse_list_items();
        let end = self.eat(TokenKind::RParen).unwrap_or_else(|| self.current().clone());
        NestedList { span: self.span_of(&start, &end), items }
    }

    fn parse_list_items(&mut self) -> Vec<ListItem> {
        let mut items = Vec::new();
        loop {
            self.skip_nl();
            if self.at(TokenKind::RParen) || self.at(TokenKind::Eof) {
                break;
            }
            if self.at(TokenKind::Comma) {
                self.bump();
                continue;
            }
            items.push(self.parse_list_item());
            self.skip_nl();
            self.eat(TokenKind::Comma);
        }
        items
    }

    fn parse_list_item(&mut self) -> ListItem {
        self.skip_nl();
        if self.at(TokenKind::LBrace) {
            return ListItem::Anonymous(self.parse_anonymous_block());
        }
        if self.at(TokenKind::Id) && self.peek_kind(1) == TokenKind::LBrace {
            let start = self.current().clone();
            let name = self.bump_text();
            self.eat(TokenKind::LBrace);
            let elements = self.parse_body_elements(TokenKind::RBrace);
            let end = self.eat(TokenKind::RBrace).unwrap_or_else(|| self.current().clone());
            return ListItem::NamedBlock(NamedBlockListItem {
                span: self.span_of(&start, &end),
                name,
                elements,
            });
        }
        if self.at(TokenKind::LParen) && self.nested_list_follows() {
            return ListItem::Nested(self.parse_nested_list());
        }
        let mut body = Vec::new();
        while !matches!(
            self.kind(),
            TokenKind::Comma | TokenKind::RParen | TokenKind::Nl | TokenKind::Eof
        ) {
            if let Some(part) = self.parse_rich_part(true) {
                body.push(part);
            } else {
                break;
            }
        }
        ListItem::OneLiner(body)
    }

    fn parse_attribute(&mut self) -> Attribute {
        let start = self.bump();
        let name = self.expect_id().unwrap_or_default();
        let negated = self.eat(TokenKind::Bang).is_some();
        let mut value = None;
        if !negated {
            self.eat(TokenKind::Colon);
            if self.at(TokenKind::LBrace) {
                value = Some(AttributeValue::Block(self.parse_block_value()));
            } else if self.at(TokenKind::LParen) {
                value = Some(AttributeValue::List(self.parse_list_value()));
            } else if !self.at(TokenKind::Nl) && !self.at(TokenKind::Eof) && !self.at(TokenKind::At)
            {
                value = Some(AttributeValue::Scalar(self.parse_scalar_value()));
            }
        }
        let end = self.current().clone();
        Attribute { span: self.span_of(&start, &end), name, negated, value }
    }

    fn parse_block_value(&mut self) -> BlockValue {
        let start = self.current().clone();
        self.eat(TokenKind::LBrace);
        let elements = self.parse_body_elements(TokenKind::RBrace);
        let end = self.eat(TokenKind::RBrace).unwrap_or_else(|| self.current().clone());
        let span = self.span_of(&start, &end);
        let raw = self.source.get(span.start..span.end).unwrap_or("");
        let inner = raw.trim_start_matches('{').trim_end_matches('}').trim().replace("\r\n", "\n");
        BlockValue { span, inner_text: inner, elements }
    }

    fn parse_list_value(&mut self) -> ListValue {
        let start = self.bump();
        let items = self.parse_list_items();
        let end = self.eat(TokenKind::RParen).unwrap_or_else(|| self.current().clone());
        ListValue { span: self.span_of(&start, &end), items }
    }

    fn parse_scalar_value(&mut self) -> ScalarValue {
        let start = self.current().clone();
        let mut parts = Vec::new();
        while !matches!(
            self.kind(),
            TokenKind::Nl | TokenKind::Eof | TokenKind::At | TokenKind::RBrace
        ) {
            if let Some(part) = self.parse_rich_part(false) {
                parts.push(part);
            } else {
                break;
            }
        }
        let end = parts.last().map(RichPart::span).unwrap_or(Span::from_token(&start));
        let text = self.source.get(start.start..end.end).unwrap_or("").replace('\n', " ");
        ScalarValue {
            span: Span {
                start: start.start,
                end: end.end,
                line_start: start.line,
                line_end: end.line_end,
            },
            text: collapse_ws(&text),
            parts,
        }
    }

    fn parse_body_line(&mut self) -> BodyLine {
        let start = self.current().clone();
        let mut parts = Vec::new();
        while !matches!(
            self.kind(),
            TokenKind::Nl | TokenKind::Eof | TokenKind::RBrace | TokenKind::At
        ) {
            if self.at(TokenKind::CodeFence) {
                break;
            }
            if self.at(TokenKind::Id) && self.named_list_follows() {
                break;
            }
            if self.at(TokenKind::LParen) && self.nested_list_follows() {
                break;
            }
            if let Some(part) = self.parse_rich_part(false) {
                parts.push(part);
            } else {
                break;
            }
        }
        if parts.is_empty() {
            let token = self.bump();
            parts.push(RichPart::Text {
                span: Span::from_token(&token),
                text: self.token_text(&token),
            });
        }
        let end = parts.last().map(RichPart::span).unwrap_or(Span::from_token(&start));
        BodyLine {
            span: Span {
                start: start.start,
                end: end.end,
                line_start: start.line,
                line_end: end.line_end,
            },
            parts,
        }
    }

    fn parse_rich_part(&mut self, list_item: bool) -> Option<RichPart> {
        match self.kind() {
            TokenKind::MarkdownLink => {
                let token = self.bump();
                Some(RichPart::MarkdownLink {
                    span: Span::from_token(&token),
                    raw: self.token_text(&token),
                })
            }
            TokenKind::InlineCode => {
                let token = self.bump();
                Some(RichPart::InlineCode {
                    span: Span::from_token(&token),
                    text: self.token_text(&token),
                })
            }
            TokenKind::LWiki => Some(self.parse_wiki_link()),
            TokenKind::LBrack => Some(self.parse_bracket_ref()),
            TokenKind::Eof | TokenKind::Nl => None,
            TokenKind::RBrace | TokenKind::At => None,
            TokenKind::Comma if list_item => None,
            TokenKind::RParen if list_item => None,
            _ => {
                let token = self.bump();
                Some(RichPart::Text {
                    span: Span::from_token(&token),
                    text: self.token_text(&token),
                })
            }
        }
    }

    fn parse_wiki_link(&mut self) -> RichPart {
        let start = self.bump();
        let target = self.parse_reference_target();
        let alias = if self.eat(TokenKind::Pipe).is_some() {
            let mut text = String::new();
            while !self.at(TokenKind::RWiki) && !self.at(TokenKind::Nl) && !self.at(TokenKind::Eof)
            {
                text.push_str(&self.bump_text());
            }
            Some(collapse_ws(&text))
        } else {
            None
        };
        let end = self.eat(TokenKind::RWiki).unwrap_or_else(|| self.current().clone());
        RichPart::WikiLink { span: self.span_of(&start, &end), target, alias }
    }

    fn parse_bracket_ref(&mut self) -> RichPart {
        let start = self.bump();
        let target = self.parse_reference_target();
        let end = self.eat(TokenKind::RBrack).unwrap_or_else(|| self.current().clone());
        RichPart::BracketRef { span: self.span_of(&start, &end), target }
    }

    fn parse_reference_target(&mut self) -> ReferenceTarget {
        let start = self.current().clone();
        if self.at(TokenKind::String) {
            let file_token = self.bump();
            let file_raw = self.token_text(&file_token);
            if self.eat(TokenKind::Dot).is_some() {
                if self.at(TokenKind::WildcardName) {
                    let pattern = self.bump_text();
                    let end = self.current().clone();
                    return ReferenceTarget::Wildcard {
                        span: self.span_of(&start, &end),
                        path_pattern: file_raw,
                        idea_pattern: pattern,
                    };
                }
                let mut symbols = Vec::new();
                while self.at(TokenKind::Id) {
                    symbols.push(self.bump_text());
                    if !self.at(TokenKind::Dot) {
                        break;
                    }
                    if !matches!(self.peek_kind(1), TokenKind::Id | TokenKind::WildcardName) {
                        break;
                    }
                    self.bump();
                }
                let end = self.current().clone();
                let span = self.span_of(&start, &end);
                return match symbols.len() {
                    0 => ReferenceTarget::File { span, file: file_raw },
                    1 => ReferenceTarget::Qualified {
                        span,
                        path: Some(file_raw),
                        qualifier: None,
                        ideaset: None,
                        idea: symbols.remove(0),
                    },
                    2 => {
                        let idea = symbols.pop().unwrap();
                        let ideaset = symbols.pop();
                        ReferenceTarget::Qualified {
                            span,
                            path: Some(file_raw),
                            qualifier: None,
                            ideaset,
                            idea,
                        }
                    }
                    _ => ReferenceTarget::FileSymbol { span, file: file_raw, symbols },
                };
            }
            return ReferenceTarget::File { span: Span::from_token(&file_token), file: file_raw };
        }
        if self.at(TokenKind::Url) {
            let token = self.bump();
            return ReferenceTarget::Url {
                span: Span::from_token(&token),
                url: self.token_text(&token),
            };
        }
        if self.at(TokenKind::Id) {
            let first = self.bump_text();
            if self.eat(TokenKind::Dot).is_some() && self.at(TokenKind::Id) {
                let second = self.bump_text();
                if self.eat(TokenKind::Dot).is_some() && self.at(TokenKind::Id) {
                    let third = self.bump_text();
                    let end = self.current().clone();
                    return ReferenceTarget::Qualified {
                        span: self.span_of(&start, &end),
                        path: None,
                        qualifier: Some(first),
                        ideaset: Some(second),
                        idea: third,
                    };
                }
                let end = self.current().clone();
                return ReferenceTarget::Qualified {
                    span: self.span_of(&start, &end),
                    path: None,
                    qualifier: Some(first),
                    ideaset: None,
                    idea: second,
                };
            }
            return ReferenceTarget::Local { span: Span::from_token(&start), idea: first };
        }
        self.error("expected reference target");
        ReferenceTarget::Local { span: Span::from_token(&start), idea: String::new() }
    }

    fn expect_id(&mut self) -> Option<String> {
        if self.at(TokenKind::Id) {
            Some(self.bump_text())
        } else {
            self.error("expected identifier");
            None
        }
    }

    fn error(&mut self, message: &str) {
        let token = self.current().clone();
        self.diagnostics.push(ParseDiagnostic {
            offset: token.start,
            line: token.line,
            message: message.to_string(),
            severity: Severity::Error,
        });
    }

    fn skip_until_nl(&mut self) {
        while !self.at(TokenKind::Nl) && !self.at(TokenKind::Eof) {
            self.bump();
        }
    }
}

fn collapse_ws(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}
