//! Shared parse snapshot for Langium ↔ Rust alignment tests.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_align]

use crate::ast::*;
use crate::parser::{parse_document, ParseResult, Severity};
use crate::path::unquote_path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AlignElement {
    pub type_name: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct AlignRef {
    pub form: String,
    pub kind: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseAlignSnapshot {
    pub ok: bool,
    pub elements: Vec<AlignElement>,
    pub refs: Vec<AlignRef>,
    pub inline_code_count: u32,
    pub code_snippet_count: u32,
}

pub fn parse_align_snapshot(source: &str) -> ParseAlignSnapshot {
    align_snapshot_from_parsed(&parse_document(source))
}

pub fn align_snapshot_from_parsed(parsed: &ParseResult) -> ParseAlignSnapshot {
    let mut snapshot = ParseAlignSnapshot {
        ok: parsed.incomplete.is_none()
            && parsed.diagnostics.iter().all(|diagnostic| diagnostic.severity != Severity::Error),
        elements: parsed
            .model
            .imports
            .iter()
            .map(import_element)
            .chain(parsed.model.elements.iter().map(top_level_element))
            .collect(),
        refs: Vec::new(),
        inline_code_count: 0,
        code_snippet_count: 0,
    };
    walk_model(&parsed.model, &mut snapshot);
    snapshot.refs.sort();
    snapshot
}

fn import_element(import: &Import) -> AlignElement {
    match import {
        Import::From(from) => {
            AlignElement { type_name: "FromImport".to_string(), name: Some(from.path.clone()) }
        }
        Import::Namespace(namespace) => AlignElement {
            type_name: "NamespaceImport".to_string(),
            name: Some(namespace.alias.clone().unwrap_or_else(|| namespace.path.clone())),
        },
        Import::Qualified(qualified) => AlignElement {
            type_name: "QualifiedImport".to_string(),
            name: Some(qualified.idea.clone()),
        },
        Import::InvalidFrom(_) => {
            AlignElement { type_name: "InvalidFromImport".to_string(), name: None }
        }
    }
}

fn top_level_element(element: &TopLevelElement) -> AlignElement {
    match element {
        TopLevelElement::Idea(idea) => {
            AlignElement { type_name: "Idea".to_string(), name: Some(idea.name.clone()) }
        }
        TopLevelElement::IdeaSet(set) => {
            AlignElement { type_name: "IdeaSet".to_string(), name: Some(set.name.clone()) }
        }
        TopLevelElement::OneLiner(one) => {
            AlignElement { type_name: "OneLinerIdea".to_string(), name: Some(one.name.clone()) }
        }
        TopLevelElement::Anonymous(_) => {
            AlignElement { type_name: "AnonymousBlock".to_string(), name: None }
        }
    }
}

fn walk_model(model: &Model, snapshot: &mut ParseAlignSnapshot) {
    let local_names: Vec<&str> = model
        .elements
        .iter()
        .filter_map(|element| match element {
            TopLevelElement::Idea(idea) => Some(idea.name.as_str()),
            TopLevelElement::OneLiner(one) => Some(one.name.as_str()),
            TopLevelElement::IdeaSet(set) => Some(set.name.as_str()),
            TopLevelElement::Anonymous(_) => None,
        })
        .collect();
    for element in &model.elements {
        match element {
            TopLevelElement::Idea(idea) => walk_body(&idea.elements, snapshot, &local_names),
            TopLevelElement::OneLiner(one) => walk_parts(&one.body, snapshot, &local_names),
            TopLevelElement::Anonymous(block) => walk_body(&block.elements, snapshot, &local_names),
            TopLevelElement::IdeaSet(_) => {}
        }
    }
}

fn walk_body(elements: &[BodyElement], snapshot: &mut ParseAlignSnapshot, local_names: &[&str]) {
    for element in elements {
        match element {
            BodyElement::Attribute(attribute) => walk_attribute(attribute, snapshot, local_names),
            BodyElement::CodeSnippet(_) => snapshot.code_snippet_count += 1,
            BodyElement::NamedList(list) => walk_list_items(&list.items, snapshot, local_names),
            BodyElement::NestedList(list) => walk_list_items(&list.items, snapshot, local_names),
            BodyElement::BodyLine(line) => walk_parts(&line.parts, snapshot, local_names),
        }
    }
}

fn walk_attribute(attribute: &Attribute, snapshot: &mut ParseAlignSnapshot, local_names: &[&str]) {
    match &attribute.value {
        Some(AttributeValue::Scalar(scalar)) => walk_parts(&scalar.parts, snapshot, local_names),
        Some(AttributeValue::List(list)) => walk_list_items(&list.items, snapshot, local_names),
        Some(AttributeValue::Block(block)) => walk_body(&block.elements, snapshot, local_names),
        None => {}
    }
}

fn walk_list_items(items: &[ListItem], snapshot: &mut ParseAlignSnapshot, local_names: &[&str]) {
    for item in items {
        match item {
            ListItem::OneLiner(parts) => walk_parts(parts, snapshot, local_names),
            ListItem::Anonymous(block) => walk_body(&block.elements, snapshot, local_names),
            ListItem::NamedBlock(block) => walk_body(&block.elements, snapshot, local_names),
            ListItem::Nested(list) => walk_list_items(&list.items, snapshot, local_names),
        }
    }
}

fn walk_parts(parts: &[RichPart], snapshot: &mut ParseAlignSnapshot, local_names: &[&str]) {
    for part in parts {
        match part {
            RichPart::InlineCode { .. } => snapshot.inline_code_count += 1,
            RichPart::BracketRef { target, .. } => {
                snapshot.refs.push(align_ref("bracket", target, local_names));
            }
            RichPart::WikiLink { target, .. } => {
                snapshot.refs.push(align_ref("wiki", target, local_names));
            }
            RichPart::Text { .. } | RichPart::MarkdownLink { .. } => {}
        }
    }
}

fn align_ref(form: &str, target: &ReferenceTarget, local_names: &[&str]) -> AlignRef {
    let (kind, label) = match target {
        ReferenceTarget::Local { idea, .. } => ("local", idea.clone()),
        ReferenceTarget::Qualified { qualifier, path, ideaset, idea, .. } => {
            let head =
                unquote_path(&qualifier.clone().or_else(|| path.clone()).unwrap_or_default());
            let label = match ideaset {
                Some(set) => format!("{head}.{set}.{idea}"),
                None => format!("{head}.{idea}"),
            };
            ("qualified", label)
        }
        ReferenceTarget::File { file, .. } => {
            let unquoted = unquote_path(file);
            if local_names.contains(&unquoted.as_str()) {
                ("local", unquoted)
            } else {
                ("file", unquoted)
            }
        }
        ReferenceTarget::Url { url, .. } => ("url", url.clone()),
        ReferenceTarget::FileSymbol { file, symbols, .. } => {
            ("file_symbol", format!("{}.{}", unquote_path(file), symbols.join(".")))
        }
        ReferenceTarget::Wildcard { path_pattern, idea_pattern, .. } => {
            ("wildcard", format!("{}.{}", unquote_path(path_pattern), idea_pattern))
        }
    };
    AlignRef { form: form.to_string(), kind: kind.to_string(), label }
}
