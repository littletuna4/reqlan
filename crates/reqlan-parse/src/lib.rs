//! Index-path lexer and parser for reqlan documents.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".analytical_rust_port]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".lexer_rust]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_align]

pub mod align;
pub mod ast;
pub mod barrel;
pub mod budget;
pub mod lexer;
pub mod parser;
pub mod path;
pub mod token;

pub use align::{
    align_snapshot_from_parsed, parse_align_snapshot, AlignElement, AlignRef, ParseAlignSnapshot,
};
pub use ast::*;
pub use barrel::{
    file_basename_alias, plan_barrel_page, rewrite_sibling_refs, BarrelChildPlan, BarrelPagePlan,
};
pub use budget::{ParseBudget, DEFAULT_PARSE_BUDGET, PARSE_HANG_SENTINEL};
pub use lexer::{is_inside_line_fence, lex, LexResult};
pub use parser::{
    parse_document, parse_document_with_budget, ParseDiagnostic, ParseResult, Severity,
};
pub use path::{
    default_import_roots, file_from_idea_id, import_path_candidates,
    import_path_with_implicit_extension, is_absolute_uri_or_path, is_windows_absolute_path,
    match_import_root_alias, match_import_root_mapping, parse_file_reference_string, posix_dirname,
    posix_join, resolve_rq_path, unquote_path, ImportRootMapping, ParsedFileReference,
    DEFAULT_IMPORT_ROOT_ALIAS,
};
pub use token::{Span, Token, TokenKind};
