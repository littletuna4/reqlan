//! Declaration lookup, name usage sets, and span overlap helpers.
//! rq:["../../../reqlan rq/extension/mutation/refactor_native_planner.rq".refactor_native_planner]
//! rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_move]
//! rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_delete]

use crate::ast::{Model, ReferenceTarget, RichPart, TopLevelElement};
use crate::token::Span;
use std::collections::BTreeSet;

use super::walk::{walk_element, walk_model};

pub(crate) struct Decl {
    pub(crate) span: Span,
}

pub(crate) fn find_declaration(model: &Model, name: &str) -> Option<Decl> {
    for element in &model.elements {
        match element {
            TopLevelElement::Idea(idea) if idea.name == name => {
                return Some(Decl { span: idea.span });
            }
            TopLevelElement::OneLiner(idea) if idea.name == name => {
                return Some(Decl { span: idea.span });
            }
            _ => {}
        }
    }
    None
}

pub(crate) fn hit_name(target: &ReferenceTarget) -> Option<&str> {
    match target {
        ReferenceTarget::Local { idea, .. } | ReferenceTarget::Qualified { idea, .. } => {
            Some(idea.as_str())
        }
        _ => None,
    }
}

pub(crate) fn source_keeps_name(model: &Model, idea_name: &str, decl: Span) -> bool {
    let mut found = false;
    let mut visit = |part: &RichPart| {
        let (span, target) = match part {
            RichPart::BracketRef { span, target } | RichPart::WikiLink { span, target, .. } => {
                (*span, target)
            }
            _ => return,
        };
        if hit_name(target) == Some(idea_name) && !spans_overlap(span, decl) {
            found = true;
        }
    };
    walk_model(model, &mut visit);
    found
}

pub(crate) fn used_names_outside(model: &Model, skip: Span) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    for element in &model.elements {
        if spans_overlap(element.span(), skip) && element_is_decl(element, skip) {
            continue;
        }
        if let TopLevelElement::IdeaSet(set) = element {
            for member in &set.members {
                if !member.is_empty() {
                    names.insert(member.clone());
                }
            }
        }
        walk_element(element, &mut |part| collect_binding(part, &mut names));
    }
    names
}

fn element_is_decl(element: &TopLevelElement, span: Span) -> bool {
    match element {
        TopLevelElement::Idea(idea) => idea.span.start == span.start,
        TopLevelElement::OneLiner(idea) => idea.span.start == span.start,
        _ => false,
    }
}

pub(crate) fn used_names_in_decl(model: &Model, span: Span) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    for element in &model.elements {
        if !element_is_decl(element, span) {
            continue;
        }
        walk_element(element, &mut |part| collect_binding(part, &mut names));
    }
    names
}

fn collect_binding(part: &RichPart, names: &mut BTreeSet<String>) {
    match part {
        RichPart::BracketRef { target, .. } | RichPart::WikiLink { target, .. } => match target {
            ReferenceTarget::Local { idea, .. } => {
                if !idea.is_empty() {
                    names.insert(idea.clone());
                }
            }
            ReferenceTarget::Qualified { qualifier, .. } => {
                if let Some(qualifier) = qualifier.as_ref().filter(|name| !name.is_empty()) {
                    names.insert(qualifier.clone());
                }
            }
            _ => {}
        },
        _ => {}
    }
}

pub(crate) fn bound_names(model: &Model) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    for element in &model.elements {
        if let Some(name) = element.name() {
            if !name.is_empty() {
                names.insert(name.to_string());
            }
        }
    }
    for (name, _) in model.import_bindings() {
        names.insert(name);
    }
    names
}

pub(crate) fn top_level_names(model: &Model) -> BTreeSet<String> {
    model.elements.iter().filter_map(|element| element.name().map(str::to_string)).collect()
}

pub(crate) fn spans_overlap(left: Span, right: Span) -> bool {
    left.start < right.end && right.start < left.end
}

pub(crate) fn byte_range_overlaps(start: usize, end: usize, span: Span) -> bool {
    start < span.end && span.start < end
}
