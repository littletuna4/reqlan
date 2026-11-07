//! Traversal that visits every rich-text part of a parsed model.
//! rq:["../../../../reqlan rq/extension/mutation/refactor_native_planner.rq".refactor_native_planner]

use crate::ast::{AttributeValue, BodyElement, ListItem, Model, RichPart, TopLevelElement};

pub(crate) fn walk_model(model: &Model, visit: &mut dyn FnMut(&RichPart)) {
    for element in &model.elements {
        walk_element(element, visit);
    }
}

pub(crate) fn walk_element(element: &TopLevelElement, visit: &mut dyn FnMut(&RichPart)) {
    match element {
        TopLevelElement::Idea(idea) => walk_elements(&idea.elements, visit),
        TopLevelElement::OneLiner(idea) => walk_parts(&idea.body, visit),
        TopLevelElement::Anonymous(block) => walk_elements(&block.elements, visit),
        TopLevelElement::IdeaSet(_) => {}
    }
}

fn walk_elements(elements: &[BodyElement], visit: &mut dyn FnMut(&RichPart)) {
    for element in elements {
        match element {
            BodyElement::Attribute(attr) => match &attr.value {
                Some(AttributeValue::Scalar(value)) => walk_parts(&value.parts, visit),
                Some(AttributeValue::List(value)) => walk_items(&value.items, visit),
                Some(AttributeValue::Block(value)) => walk_elements(&value.elements, visit),
                None => {}
            },
            BodyElement::BodyLine(line) => walk_parts(&line.parts, visit),
            BodyElement::NamedList(list) => walk_items(&list.items, visit),
            BodyElement::NestedList(list) => walk_items(&list.items, visit),
            BodyElement::CodeSnippet(_) => {}
        }
    }
}

fn walk_items(items: &[ListItem], visit: &mut dyn FnMut(&RichPart)) {
    for item in items {
        match item {
            ListItem::OneLiner(parts) => walk_parts(parts, visit),
            ListItem::Anonymous(block) => walk_elements(&block.elements, visit),
            ListItem::NamedBlock(item) => walk_elements(&item.elements, visit),
            ListItem::Nested(list) => walk_items(&list.items, visit),
        }
    }
}

fn walk_parts(parts: &[RichPart], visit: &mut dyn FnMut(&RichPart)) {
    for part in parts {
        visit(part);
    }
}
