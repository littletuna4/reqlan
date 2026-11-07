//! Rich-part collection walking over idea body elements.
//! rq:["../../../../reqlan rq/ontology.rq.reference]

use reqlan_parse::{AttributeValue as AstAttrValue, BodyElement, ListItem, RichPart};

pub(crate) fn walk_idea_parts(elements: &[BodyElement]) -> Vec<RichPart> {
    let mut parts = Vec::new();
    for element in elements {
        match element {
            BodyElement::BodyLine(line) => parts.extend(line.parts.clone()),
            BodyElement::Attribute(attribute) => {
                if let Some(value) = &attribute.value {
                    collect_value_parts(value, &mut parts);
                }
            }
            BodyElement::NamedList(list) => {
                for item in &list.items {
                    collect_item_parts(item, &mut parts);
                }
            }
            BodyElement::NestedList(list) => {
                for item in &list.items {
                    collect_item_parts(item, &mut parts);
                }
            }
            BodyElement::CodeSnippet(_) => {}
        }
    }
    parts
}

fn collect_value_parts(value: &AstAttrValue, parts: &mut Vec<RichPart>) {
    match value {
        AstAttrValue::Scalar(scalar) => parts.extend(scalar.parts.clone()),
        AstAttrValue::List(list) => {
            for item in &list.items {
                collect_item_parts(item, parts);
            }
        }
        AstAttrValue::Block(block) => parts.extend(walk_idea_parts(&block.elements)),
    }
}

fn collect_item_parts(item: &ListItem, parts: &mut Vec<RichPart>) {
    match item {
        ListItem::OneLiner(body) => parts.extend(body.clone()),
        ListItem::Anonymous(block) => parts.extend(walk_idea_parts(&block.elements)),
        ListItem::NamedBlock(block) => parts.extend(walk_idea_parts(&block.elements)),
        ListItem::Nested(list) => {
            for nested in &list.items {
                collect_item_parts(nested, parts);
            }
        }
    }
}
