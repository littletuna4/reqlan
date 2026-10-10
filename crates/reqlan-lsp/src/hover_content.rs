//! Styled markdown for an idea hover.
//! rq:["../../../reqlan rq/extension/language/syntax/features-syntax.rq".idea_content_tooltip]
use reqlan_parse::{
    Attribute, AttributeValue, BodyElement, ListItem, Model, RichPart, TopLevelElement,
};

pub fn markdown_for_name(text: &str, model: &Model, name: &str) -> Option<String> {
    for element in &model.elements {
        match element {
            TopLevelElement::Idea(idea) if idea.name == name => {
                return Some(render_block(text, &idea.name, &idea.elements));
            }
            TopLevelElement::OneLiner(idea) if idea.name == name => {
                return Some(render_oneliner(text, &idea.name, &idea.body));
            }
            TopLevelElement::IdeaSet(set) if set.name == name => {
                return Some(render_set(&set.name, &set.members));
            }
            _ => {}
        }
    }
    None
}

pub fn short_hover(name: &str, summary: &str) -> String {
    if summary.is_empty() {
        format!("**{name}**")
    } else {
        format!("**{name}**\n\n{summary}")
    }
}

fn render_block(text: &str, name: &str, elements: &[BodyElement]) -> String {
    let mut blocks = vec![format!("### {}", escape(name))];
    blocks.extend(render_elements(text, elements));
    blocks.join("\n\n")
}

fn render_oneliner(text: &str, name: &str, body: &[RichPart]) -> String {
    let mut blocks = vec![format!("### {}", escape(name))];
    let line = render_parts(text, body);
    if !line.is_empty() {
        blocks.push(line);
    }
    blocks.join("\n\n")
}

fn render_set(name: &str, members: &[String]) -> String {
    let mut blocks = vec![format!("### {}", escape(name))];
    if !members.is_empty() {
        blocks.push(
            members
                .iter()
                .map(|member| format!("- {}", escape(member)))
                .collect::<Vec<_>>()
                .join("\n"),
        );
    }
    blocks.join("\n\n")
}

fn render_elements(text: &str, elements: &[BodyElement]) -> Vec<String> {
    let mut blocks = Vec::new();
    for element in elements {
        match element {
            BodyElement::Attribute(attr) => push_block(&mut blocks, render_attribute(text, attr)),
            BodyElement::BodyLine(line) => push_block(&mut blocks, render_parts(text, &line.parts)),
            BodyElement::CodeSnippet(snippet) => {
                push_block(&mut blocks, snippet.raw.trim().to_string())
            }
            BodyElement::NamedList(list) => {
                push_block(&mut blocks, format!("**{}**", escape(&list.label)));
                push_block(&mut blocks, render_items(text, &list.items));
            }
            BodyElement::NestedList(list) => {
                push_block(&mut blocks, render_items(text, &list.items))
            }
        }
    }
    blocks
}

fn render_attribute(text: &str, attr: &Attribute) -> String {
    let mark = if attr.negated { format!("@!{}", attr.name) } else { format!("@{}", attr.name) };
    match &attr.value {
        None => format!("**{}**", escape(&mark)),
        Some(AttributeValue::Scalar(value)) => {
            let shown = render_parts(text, &value.parts);
            let shown =
                if shown.is_empty() { escape(value.text.trim().trim_matches('"')) } else { shown };
            if shown.is_empty() {
                format!("**{}**", escape(&mark))
            } else {
                format!("**{}** {shown}", escape(&mark))
            }
        }
        Some(AttributeValue::List(value)) => {
            format!("**{}**\n\n{}", escape(&mark), render_items(text, &value.items))
        }
        Some(AttributeValue::Block(value)) => {
            let inner = render_elements(text, &value.elements).join("\n\n");
            if inner.is_empty() {
                format!("**{}**", escape(&mark))
            } else {
                format!("**{}**\n\n{inner}", escape(&mark))
            }
        }
    }
}

fn render_items(text: &str, items: &[ListItem]) -> String {
    items.iter().filter_map(|item| render_item(text, item)).collect::<Vec<_>>().join("\n")
}

fn render_item(text: &str, item: &ListItem) -> Option<String> {
    match item {
        ListItem::OneLiner(parts) => {
            let shown = render_parts(text, parts);
            if shown.is_empty() {
                None
            } else {
                Some(format!("- {shown}"))
            }
        }
        ListItem::NamedBlock(block) => {
            let inner = render_elements(text, &block.elements).join("\n\n");
            if inner.is_empty() {
                Some(format!("- **{}**", escape(&block.name)))
            } else {
                Some(format!("- **{}**\n\n{inner}", escape(&block.name)))
            }
        }
        ListItem::Anonymous(block) => {
            let inner = render_elements(text, &block.elements).join("\n\n");
            if inner.is_empty() {
                None
            } else {
                Some(inner)
            }
        }
        ListItem::Nested(list) => {
            let inner = render_items(text, &list.items);
            if inner.is_empty() {
                None
            } else {
                Some(inner)
            }
        }
    }
}

fn render_parts(text: &str, parts: &[RichPart]) -> String {
    let mut out = String::new();
    let mut cursor = None;
    for part in parts {
        let span = part_span(part);
        if let Some(prev) = cursor {
            if let Some(gap) = text.get(prev..span.start) {
                out.push_str(gap);
            }
        }
        cursor = Some(span.end);
        match part {
            RichPart::Text { text: part_text, .. } => out.push_str(&escape(part_text)),
            RichPart::InlineCode { text: part_text, .. } => {
                out.push('`');
                out.push_str(part_text);
                out.push('`');
            }
            RichPart::MarkdownLink { raw, .. } => out.push_str(&escape(raw)),
            RichPart::BracketRef { target, .. } => {
                out.push('`');
                out.push('[');
                out.push_str(&target_label(target));
                out.push(']');
                out.push('`');
            }
            RichPart::WikiLink { target, alias, .. } => {
                out.push('`');
                if let Some(alias) = alias {
                    out.push_str(alias);
                } else {
                    out.push_str("[[");
                    out.push_str(&target_label(target));
                    out.push_str("]]");
                }
                out.push('`');
            }
        }
    }
    out.trim().to_string()
}

fn part_span(part: &RichPart) -> reqlan_parse::Span {
    match part {
        RichPart::Text { span, .. }
        | RichPart::InlineCode { span, .. }
        | RichPart::MarkdownLink { span, .. }
        | RichPart::BracketRef { span, .. }
        | RichPart::WikiLink { span, .. } => *span,
    }
}

fn target_label(target: &reqlan_parse::ReferenceTarget) -> String {
    match target {
        reqlan_parse::ReferenceTarget::Local { idea, .. }
        | reqlan_parse::ReferenceTarget::Qualified { idea, .. } => idea.clone(),
        reqlan_parse::ReferenceTarget::File { file, .. }
        | reqlan_parse::ReferenceTarget::FileSymbol { file, .. } => file.clone(),
        reqlan_parse::ReferenceTarget::Url { url, .. } => url.clone(),
        reqlan_parse::ReferenceTarget::Wildcard { path_pattern, idea_pattern, .. } => {
            format!("{path_pattern}.{idea_pattern}")
        }
    }
}

fn push_block(blocks: &mut Vec<String>, block: String) {
    let trimmed = block.trim();
    if !trimmed.is_empty() {
        blocks.push(trimmed.to_string());
    }
}

fn escape(text: &str) -> String {
    let mut out = String::new();
    for ch in text.chars() {
        if matches!(ch, '\\' | '`' | '*' | '_' | '[' | ']') {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}
