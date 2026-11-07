//! Inbound referencer inlay hints.

use lsp_types::{
    Command, InlayHint, InlayHintLabel, InlayHintLabelPart, InlayHintLabelPartTooltip,
    InlayHintTooltip, MarkupContent, MarkupKind, Url,
};

use super::definition::{location_url, parse_url};
use super::model::DocModel;

/// One idea that references the declaration under the inlay.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InboundReferencer {
    pub name: String,
    pub uri: String,
    /// Zero-based line of the referencer. The tooltip link uses the next line number.
    pub line: u32,
}

impl DocModel {
    pub fn inlays(
        &self,
        doc_uri: &str,
        referencers: &[(String, Vec<InboundReferencer>)],
    ) -> Vec<InlayHint> {
        let mut hints = Vec::new();
        for (name, names) in referencers {
            let Some((label, tooltip)) = inbound_inlay(doc_uri, name, names) else {
                continue;
            };
            if let Some(idea) = self.names.iter().find(|idea| idea.name == *name) {
                hints.push(InlayHint {
                    position: idea.range.end,
                    label,
                    kind: None,
                    text_edits: None,
                    tooltip: Some(InlayHintTooltip::MarkupContent(tooltip)),
                    padding_left: Some(true),
                    padding_right: None,
                    data: None,
                });
            }
        }
        hints
    }
}

fn inbound_inlay(
    doc_uri: &str,
    idea: &str,
    referencers: &[InboundReferencer],
) -> Option<(InlayHintLabel, MarkupContent)> {
    if referencers.is_empty() {
        return None;
    }
    let tooltip = inbound_tooltip(referencers);
    let mut parts = vec![inlay_text("@referenced-by: (")];
    for (index, referencer) in referencers.iter().take(3).enumerate() {
        if index > 0 {
            parts.push(inlay_text(", "));
        }
        parts.push(inlay_referencer(referencer));
    }
    let extra = referencers.len().saturating_sub(3);
    if extra > 0 {
        parts.push(inlay_text(", "));
        parts.push(InlayHintLabelPart {
            value: format!("+{extra} more"),
            tooltip: Some(InlayHintLabelPartTooltip::MarkupContent(tooltip.clone())),
            location: None,
            command: Some(Command {
                title: "Show all inbound references".into(),
                command: "reqlan.openInboundReferencesSummary".into(),
                arguments: Some(vec![serde_json::json!(doc_uri), serde_json::json!(idea)]),
            }),
        });
    }
    parts.push(inlay_text(")"));
    Some((InlayHintLabel::LabelParts(parts), tooltip))
}

fn inbound_tooltip(referencers: &[InboundReferencer]) -> MarkupContent {
    let items = referencers
        .iter()
        .map(|referencer| format!("- {}", referencer_markdown_link(referencer)))
        .collect::<Vec<_>>()
        .join("\n");
    MarkupContent { kind: MarkupKind::Markdown, value: format!("**Referenced by**\n\n{items}") }
}

/// File URL for an inbound referencer — same encoding as goto (`Url::from_file_path`).
/// Inlay label clicks use this as `location`; tooltips use it via `location_url`.
/// rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".traceable_inlay_hints]
fn referencer_file_url(uri: &str) -> Option<Url> {
    if uri.is_empty() {
        return None;
    }
    Some(parse_url(uri))
}

fn referencer_markdown_link(referencer: &InboundReferencer) -> String {
    let Some(base) = referencer_file_url(&referencer.uri) else {
        return referencer.name.clone();
    };
    // Document-link fragment builder; markdown `#L` is 1-based.
    let target = location_url(&base, referencer.line.saturating_add(1));
    format!("[{}]({})", referencer.name, target.as_str())
}

fn inlay_text(value: &str) -> InlayHintLabelPart {
    InlayHintLabelPart { value: value.to_string(), tooltip: None, location: None, command: None }
}

fn inlay_referencer(referencer: &InboundReferencer) -> InlayHintLabelPart {
    let link = referencer_markdown_link(referencer);
    // Command only: when Location is also set, VS Code ignores the command on click.
    // Host `reqlan.openInboundReferencer` opens via openIndexFile (same as activity bar).
    // rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".traceable_inlay_hints]
    let command = referencer_file_url(&referencer.uri).map(|uri| Command {
        title: format!("Open {}", referencer.name),
        command: "reqlan.openInboundReferencer".into(),
        arguments: Some(vec![serde_json::json!(uri.as_str()), serde_json::json!(referencer.line)]),
    });
    InlayHintLabelPart {
        value: referencer.name.clone(),
        tooltip: Some(InlayHintLabelPartTooltip::MarkupContent(MarkupContent {
            kind: MarkupKind::Markdown,
            value: link,
        })),
        location: None,
        command,
    }
}
