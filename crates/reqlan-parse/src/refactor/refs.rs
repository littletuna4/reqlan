//! Bracket and wiki references that name an idea.
//! rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_move]
//! rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_delete]

use crate::ast::RichPart;
use crate::parser::parse_document;
use crate::token::Span;
use std::collections::BTreeMap;

use super::decl::{hit_name, spans_overlap};
use super::edits::{edit_range, push, LineMap};
use super::types::TextEdit;
use super::walk::walk_model;

pub(crate) fn clear_name_hits(
    by_uri: &mut BTreeMap<String, Vec<TextEdit>>,
    uri: &str,
    text: &str,
    idea_name: &str,
    skip: Option<Span>,
) {
    let parsed = parse_document(text);
    let lines = LineMap::new(text);
    let mut visit = |part: &RichPart| {
        let (span, target) = match part {
            RichPart::BracketRef { span, target } | RichPart::WikiLink { span, target, .. } => {
                (*span, target)
            }
            _ => return,
        };
        if hit_name(target) != Some(idea_name) {
            return;
        }
        if skip.is_some_and(|decl| spans_overlap(span, decl)) {
            return;
        }
        let range = lines.range(text, span.start, span.end);
        push(by_uri, uri, edit_range(range, String::new()));
    };
    walk_model(&parsed.model, &mut visit);
}
