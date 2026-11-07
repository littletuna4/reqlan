//! Attribute collection and plain-text summarization of idea bodies.
//! rq:["../../../../reqlan rq/ontology.rq.attribute]

use crate::types::{AttributeValue, IdeaAttributeMap};
use reqlan_parse::{Attribute, AttributeValue as AstAttrValue, BodyElement, RichPart};

pub(crate) fn collect_attributes(source: &str, elements: &[BodyElement]) -> IdeaAttributeMap {
    let mut attributes = IdeaAttributeMap::new();
    for element in elements {
        if let BodyElement::Attribute(attribute) = element {
            attributes.insert(attribute.name.clone(), attribute_value(source, attribute));
        }
    }
    attributes
}

fn attribute_value(source: &str, attribute: &Attribute) -> AttributeValue {
    if attribute.negated {
        return AttributeValue::Flag(false);
    }
    match &attribute.value {
        None => AttributeValue::Flag(true),
        Some(AstAttrValue::Scalar(scalar)) => {
            AttributeValue::Text(normalize_attribute_text(&scalar.text))
        }
        Some(AstAttrValue::List(list)) => {
            let items = list
                .items
                .iter()
                .map(|item| normalize_attribute_text(&item.source_text(source)))
                .filter(|item| !item.is_empty())
                .collect();
            AttributeValue::List(items)
        }
        Some(AstAttrValue::Block(block)) => AttributeValue::Text(block.inner_text.clone()),
    }
}

pub(crate) fn summarize_block(source: &str, elements: &[BodyElement]) -> String {
    let mut lines = Vec::new();
    for element in elements {
        if let BodyElement::BodyLine(line) = element {
            let text = summarize_parts(source, &line.parts);
            if !text.is_empty() {
                lines.push(text);
            }
        }
    }
    lines.join("\n")
}

pub(crate) fn summarize_parts(source: &str, parts: &[RichPart]) -> String {
    let mut pieces = Vec::new();
    for part in parts {
        match part {
            RichPart::Text { text, .. } => pieces.push(text.clone()),
            RichPart::InlineCode { text, .. } => pieces.push(text.clone()),
            RichPart::MarkdownLink { raw, .. } => {
                pieces.push(parse_markdown_label(raw).unwrap_or_else(|| raw.clone()));
            }
            RichPart::BracketRef { span, .. } | RichPart::WikiLink { span, .. } => {
                pieces.push(normalize_attribute_text(span_text(source, *span)));
            }
        }
    }
    let joined = pieces.join(" ");
    collapse_punct(&joined)
}

fn span_text(source: &str, span: reqlan_parse::Span) -> &str {
    source.get(span.start..span.end).unwrap_or("")
}

fn normalize_attribute_text(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn collapse_punct(text: &str) -> String {
    let mut out = text.split_whitespace().collect::<Vec<_>>().join(" ");
    for punct in [",", ".", "!", "?", ";", ":"] {
        out = out.replace(&format!(" {punct}"), punct);
    }
    out
}

fn parse_markdown_label(raw: &str) -> Option<String> {
    let inner = raw.strip_prefix('[')?;
    let end = inner.find("](")?;
    Some(inner[..end].to_string())
}
