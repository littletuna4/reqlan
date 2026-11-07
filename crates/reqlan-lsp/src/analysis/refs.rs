//! Walk over the reference targets of a parsed document.
//! rq:["../../../../reqlan rq/language/syntax.rq".reference_resolution_order]

use reqlan_parse::{
    AttributeValue, BodyElement, ListItem, Model, ReferenceTarget, RichPart, Span, TopLevelElement,
};

pub(crate) fn walk_refs(model: &Model, visit: &mut dyn FnMut(&ReferenceTarget, Span)) {
    for element in &model.elements {
        match element {
            TopLevelElement::Idea(idea) => walk_body_refs(&idea.elements, visit),
            TopLevelElement::OneLiner(idea) => walk_part_refs(&idea.body, visit),
            TopLevelElement::Anonymous(block) => walk_body_refs(&block.elements, visit),
            TopLevelElement::IdeaSet(_) => {}
        }
    }
}

fn walk_body_refs(elements: &[BodyElement], visit: &mut dyn FnMut(&ReferenceTarget, Span)) {
    for element in elements {
        match element {
            BodyElement::Attribute(attr) => match &attr.value {
                Some(AttributeValue::Scalar(value)) => walk_part_refs(&value.parts, visit),
                Some(AttributeValue::List(value)) => walk_item_refs(&value.items, visit),
                Some(AttributeValue::Block(value)) => walk_body_refs(&value.elements, visit),
                None => {}
            },
            BodyElement::BodyLine(line) => walk_part_refs(&line.parts, visit),
            BodyElement::NamedList(list) => walk_item_refs(&list.items, visit),
            BodyElement::NestedList(list) => walk_item_refs(&list.items, visit),
            BodyElement::CodeSnippet(_) => {}
        }
    }
}

fn walk_item_refs(items: &[ListItem], visit: &mut dyn FnMut(&ReferenceTarget, Span)) {
    for item in items {
        match item {
            ListItem::OneLiner(parts) => walk_part_refs(parts, visit),
            ListItem::Anonymous(block) => walk_body_refs(&block.elements, visit),
            ListItem::NamedBlock(item) => walk_body_refs(&item.elements, visit),
            ListItem::Nested(list) => walk_item_refs(&list.items, visit),
        }
    }
}

fn walk_part_refs(parts: &[RichPart], visit: &mut dyn FnMut(&ReferenceTarget, Span)) {
    for part in parts {
        match part {
            RichPart::BracketRef { span, target } | RichPart::WikiLink { span, target, .. } => {
                visit(target, *span);
            }
            _ => {}
        }
    }
}
