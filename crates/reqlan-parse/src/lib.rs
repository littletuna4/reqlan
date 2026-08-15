//! Index-path lexer and parser for reqlan documents.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".analytical_rust_port]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".lexer_rust]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]

pub mod ast;
pub mod budget;
pub mod lexer;
pub mod parser;
pub mod token;

pub use ast::*;
pub use budget::{ParseBudget, DEFAULT_PARSE_BUDGET, PARSE_HANG_SENTINEL};
pub use lexer::{lex, LexResult};
pub use parser::{
    parse_document, parse_document_with_budget, ParseDiagnostic, ParseResult, Severity,
};
pub use token::{Span, Token, TokenKind};
