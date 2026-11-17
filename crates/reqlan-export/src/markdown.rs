//! Markdown export writes a multi-file static site mirroring the HTML export: a
//! `README.md` overview index plus per-idea pages when pages are enabled.
//! rq:["../../../reqlan rq/core_analysis/export.rq".markdown_export]

use crate::html_utils::href_for;
use crate::types::{
    format_attribute_value, ExportIdea, ExportReferenceRow, ExportRequest, ExportResult,
    ExportSnapshot,
};
use reqlan_index::AttributeValue;
use std::fs;

pub fn write_markdown_export(
    snapshot: &ExportSnapshot,
    request: &ExportRequest,
) -> Result<ExportResult, crate::json::ExportError> {
    let output_dir = request.output_dir.join(&request.export_name);
    fs::create_dir_all(&output_dir)?;

    let writes: Vec<(std::path::PathBuf, String)> = {
        let mut writes = vec![(output_dir.join("README.md"), render_readme(snapshot))];

        if snapshot.page_options.include_idea_pages {
            for idea in &snapshot.ideas {
                let path = output_dir.join(to_markdown_path(&idea.page.path));
                writes.push((path, render_idea_markdown(snapshot, idea, None, false)));
            }
        }

        if snapshot.page_options.include_file_pages {
            for file in &snapshot.files {
                let path = output_dir.join(to_markdown_path(&file.page.path));
                writes.push((path, render_file_markdown(snapshot, file)));
            }
        }

        if snapshot.page_options.include_cluster_pages {
            for cluster in &snapshot.clusters {
                let path = output_dir.join(to_markdown_path(&cluster.page.path));
                writes.push((path, render_cluster_markdown(snapshot, cluster)));
            }
        }

        if snapshot.page_options.include_attribute_pages {
            for attribute in &snapshot.attributes {
                let path = output_dir.join(to_markdown_path(&attribute.page.path));
                writes.push((path, render_attribute_markdown(snapshot, attribute)));
            }
        }

        writes
    };

    for (path, content) in writes {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, content)?;
    }

    let index = output_dir.join("README.md");
    Ok(ExportResult {
        output_dir,
        index_file_path: index.clone(),
        print_file_path: index.clone(),
        data_file_path: index.clone(),
        ideas_index_file_path: Some(index.clone()),
        files_index_file_path: Some(index.clone()),
        clusters_index_file_path: Some(index.clone()),
        attributes_index_file_path: Some(index),
        ..ExportResult::default()
    })
}

/// Build markdown paths from HTML-oriented snapshot page paths.
fn to_markdown_path(html_path: &str) -> String {
    let lower = html_path.to_ascii_lowercase();
    if lower.ends_with(".html") {
        format!("{}.md", &html_path[..html_path.len() - ".html".len()])
    } else {
        html_path.to_string()
    }
}

/// Link path from one page to another, matching HTML `href_for` semantics and
/// prefixing `./` for same-directory targets.
fn md_href(current_path: &str, target_path: &str, url_base: Option<&str>) -> String {
    let href = href_for(current_path, target_path, url_base);
    if href.starts_with("../")
        || href.starts_with("./")
        || href.starts_with('/')
        || href.contains(':')
    {
        return href;
    }
    format!("./{href}")
}

fn escape_md(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + value.len() / 4);
    for ch in value.chars() {
        if matches!(
            ch,
            '\\' | '`'
                | '*'
                | '_'
                | '{'
                | '}'
                | '['
                | ']'
                | '('
                | ')'
                | '#'
                | '+'
                | '-'
                | '.'
                | '!'
                | '|'
                | '>'
        ) {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

fn escape_md_link_text(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + value.len() / 4);
    for ch in value.chars() {
        if matches!(ch, '\\' | '[' | ']') {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

fn one_line(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn render_readme(snapshot: &ExportSnapshot) -> String {
    let mut lines: Vec<String> = vec![
        format!("# {}", escape_md(&snapshot.title)),
        String::new(),
        format!("Generated {}", snapshot.generated_at),
        String::new(),
        format!(
            "Ideas: **{}** · Files: **{}** · Clusters: **{}**",
            snapshot.counts.ideas, snapshot.counts.files, snapshot.counts.clusters
        ),
        String::new(),
    ];

    if !snapshot.by_status.is_empty() {
        lines.push("## Status".into());
        lines.push(String::new());
        for (status, count) in &snapshot.by_status {
            lines.push(format!("- {}: {}", escape_md(status), count));
        }
        lines.push(String::new());
    }

    if !snapshot.by_tag.is_empty() {
        lines.push("## Tags".into());
        lines.push(String::new());
        for (tag, count) in &snapshot.by_tag {
            lines.push(format!("- {}: {}", escape_md(tag), count));
        }
        lines.push(String::new());
    }

    lines.push("## Ideas".into());
    lines.push(String::new());
    if snapshot.ideas.is_empty() {
        lines.push("_No ideas in this export scope._".into());
        lines.push(String::new());
    } else if snapshot.page_options.include_idea_pages {
        for idea in &snapshot.ideas {
            let href = to_markdown_path(&idea.page.path);
            let status =
                idea.status.as_deref().map(|s| format!(" · {}", escape_md(s))).unwrap_or_default();
            lines.push(format!("- [{}]({}){}", escape_md_link_text(&idea.name), href, status));
            if !idea.summary.trim().is_empty() {
                lines.push(format!("  - {}", escape_md(&one_line(&idea.summary))));
            }
        }
        lines.push(String::new());
    } else {
        for idea in &snapshot.ideas {
            lines.push(render_idea_markdown(snapshot, idea, Some(3), true));
            lines.push(String::new());
        }
    }

    if !snapshot.files.is_empty() {
        lines.push("## Files".into());
        lines.push(String::new());
        for file in &snapshot.files {
            lines.push(format!("- `{}` ({} ideas)", escape_md(&file.file_uri), file.ideas.len()));
        }
        lines.push(String::new());
    }

    if !snapshot.clusters.is_empty() {
        lines.push("## Clusters".into());
        lines.push(String::new());
        for cluster in &snapshot.clusters {
            lines.push(format!(
                "- {}",
                escape_md(&format!(
                    "{}: {} ({} ideas)",
                    cluster.kind, cluster.label, cluster.counts.ideas
                ))
            ));
        }
        lines.push(String::new());
    }

    finish_document(lines)
}

fn render_idea_markdown(
    snapshot: &ExportSnapshot,
    idea: &ExportIdea,
    heading_level: Option<usize>,
    omit_back_link: bool,
) -> String {
    let level = heading_level.unwrap_or(1);
    let heading = format!("{} {}", "#".repeat(level), escape_md(&idea.name));
    let url_base = snapshot.url_base.as_deref();
    let mut lines: Vec<String> = vec![heading, String::new()];

    if !omit_back_link {
        lines.push("[← Back to index](../README.md)".into());
        lines.push(String::new());
    }

    if !idea.summary.trim().is_empty() {
        lines.push(idea.summary.trim().to_string());
        lines.push(String::new());
    }

    lines.push(format!("- **File:** `{}`", escape_md(&idea.file_uri)));
    if let Some(status) = &idea.status {
        lines.push(format!("- **Status:** {}", escape_md(status)));
    }
    if !idea.tags.is_empty() {
        let tags = idea
            .tags
            .iter()
            .map(|tag| format!("`{}`", escape_md(tag)))
            .collect::<Vec<_>>()
            .join(", ");
        lines.push(format!("- **Tags:** {tags}"));
    }
    lines.push(String::new());

    let attr_entries: Vec<(&String, &AttributeValue)> = idea
        .attributes
        .iter()
        .filter(|(key, _)| key.as_str() != "status" && key.as_str() != "tags")
        .collect();
    if !attr_entries.is_empty() {
        lines.push("## Attributes".into());
        lines.push(String::new());
        for (key, value) in attr_entries {
            lines.push(format!(
                "- **{}:** {}",
                escape_md(key),
                escape_md(&format_attribute_value(value))
            ));
        }
        lines.push(String::new());
    }

    append_ref_section(&mut lines, snapshot, "Outbound", &idea.references.outbound, idea, url_base);
    append_ref_section(&mut lines, snapshot, "Backlinks", &idea.references.inbound, idea, url_base);

    if !idea.references.unresolved.is_empty() {
        lines.push("## Unresolved references".into());
        lines.push(String::new());
        for row in &idea.references.unresolved {
            let text = [row.label.as_str(), row.target_name.as_str(), row.target_path.as_str()]
                .into_iter()
                .find(|s| !s.is_empty())
                .unwrap_or("unresolved");
            lines.push(format!("- {}", escape_md(text)));
        }
        lines.push(String::new());
    }

    finish_document(lines)
}

fn append_ref_section(
    lines: &mut Vec<String>,
    snapshot: &ExportSnapshot,
    title: &str,
    rows: &[ExportReferenceRow],
    from_idea: &ExportIdea,
    url_base: Option<&str>,
) {
    if rows.is_empty() {
        return;
    }
    lines.push(format!("## {title}"));
    lines.push(String::new());
    for row in rows {
        // Inbound rows target this idea; sourceIdeaId is the backlink origin.
        let row_idea_id = if row.direction == "inbound" {
            Some(row.source_idea_id.as_str())
        } else {
            row.target_idea_id.as_deref()
        };
        let target = row_idea_id.and_then(|id| snapshot.ideas_by_id.get(id));
        if let Some(target) = target {
            if snapshot.page_options.include_idea_pages {
                let from_path = to_markdown_path(&from_idea.page.path);
                let to_path = to_markdown_path(&target.page.path);
                lines.push(format!(
                    "- [{}]({})",
                    escape_md_link_text(&target.name),
                    md_href(&from_path, &to_path, url_base)
                ));
            } else {
                lines.push(format!("- {}", escape_md(&target.name)));
            }
        } else if !row.target_path.is_empty() {
            lines.push(format!("- `{}`", escape_md(&row.target_path)));
        } else {
            let text = if row.target_name.is_empty() { &row.label } else { &row.target_name };
            lines.push(format!("- {}", escape_md(text)));
        }
    }
    lines.push(String::new());
}

fn render_file_markdown(snapshot: &ExportSnapshot, file: &crate::types::ExportFile) -> String {
    let mut lines: Vec<String> = vec![
        format!("# {}", escape_md(&file.name)),
        String::new(),
        format!("File: `{}`", escape_md(&file.file_uri)),
        String::new(),
        format!("Ideas: {}", file.ideas.len()),
        String::new(),
        "## Ideas".into(),
        String::new(),
    ];

    let from_path = to_markdown_path(&file.page.path);
    for idea in &file.ideas {
        let idea_path = to_markdown_path(&idea.page.path);
        lines.push(format!(
            "- [{}]({})",
            escape_md_link_text(&idea.name),
            md_href(&from_path, &idea_path, snapshot.url_base.as_deref())
        ));
        if !idea.summary.trim().is_empty() {
            lines.push(format!("  - {}", escape_md(&one_line(&idea.summary))));
        }
    }

    lines.push(String::new());
    lines.push("## Clusters".into());
    let mut seen = std::collections::BTreeSet::new();
    for idea in &file.ideas {
        for cluster_id in &idea.cluster_ids {
            seen.insert(cluster_id.clone());
        }
    }
    for cluster_id in seen {
        if let Some(cluster) = snapshot.clusters_by_id.get(&cluster_id) {
            lines.push(format!("- {} ({})", escape_md(&cluster.label), escape_md(&cluster.kind)));
        }
    }
    lines.push(String::new());

    if file.edge_count > 0 {
        for idea in &file.ideas {
            if !idea.references.outbound.is_empty() {
                append_ref_section(
                    &mut lines,
                    snapshot,
                    &format!("Outbound — {}", escape_md(&idea.name)),
                    &idea.references.outbound,
                    idea,
                    snapshot.url_base.as_deref(),
                );
            }
        }
    }

    finish_document(lines)
}

fn render_cluster_markdown(
    snapshot: &ExportSnapshot,
    cluster: &crate::types::ExportCluster,
) -> String {
    let mut lines: Vec<String> = vec![
        format!("# {}", escape_md(&cluster.label)),
        String::new(),
        format!("Kind: {}", escape_md(&cluster.kind)),
        String::new(),
        format!("Ideas: {}", cluster.counts.ideas),
        String::new(),
        "## Ideas".into(),
        String::new(),
    ];

    let from_path = to_markdown_path(&cluster.page.path);
    for idea_id in &cluster.idea_ids {
        if let Some(idea) = snapshot.ideas_by_id.get(idea_id) {
            let idea_path = to_markdown_path(&idea.page.path);
            lines.push(format!(
                "- [{}]({})",
                escape_md_link_text(&idea.name),
                md_href(&from_path, &idea_path, snapshot.url_base.as_deref())
            ));
        }
    }

    lines.push(String::new());
    lines.push("## Attributes".into());
    let mut attr_keys = std::collections::BTreeSet::new();
    for idea_id in &cluster.idea_ids {
        if let Some(idea) = snapshot.ideas_by_id.get(idea_id) {
            for key in idea.attributes.keys() {
                attr_keys.insert(key.clone());
            }
        }
    }
    for key in attr_keys {
        if let Some(attribute) = snapshot.attributes_by_key.get(&key) {
            lines.push(format!("- `{}`: {} ideas", escape_md(&key), attribute.idea_count));
        }
    }
    lines.push(String::new());

    finish_document(lines)
}

fn render_attribute_markdown(
    snapshot: &ExportSnapshot,
    attribute: &crate::types::ExportAttribute,
) -> String {
    let mut lines: Vec<String> = vec![
        format!("# `{}` attribute", escape_md(&attribute.key)),
        String::new(),
        format!("Ideas: {}", attribute.idea_count),
        String::new(),
        "## Values".into(),
        String::new(),
    ];

    for value in &attribute.values {
        lines.push(format!("- `{}`: {} ideas", escape_md(&value.value), value.count));
    }
    lines.push(String::new());

    lines.push("## Ideas".into());
    lines.push(String::new());
    let from_path = to_markdown_path(&attribute.page.path);
    for idea_id in &attribute.idea_ids {
        if let Some(idea) = snapshot.ideas_by_id.get(idea_id) {
            let idea_path = to_markdown_path(&idea.page.path);
            lines.push(format!(
                "- [{}]({})",
                escape_md_link_text(&idea.name),
                md_href(&from_path, &idea_path, snapshot.url_base.as_deref())
            ));
        }
    }
    lines.push(String::new());

    finish_document(lines)
}

fn finish_document(lines: Vec<String>) -> String {
    let mut out = lines.join("\n");
    while out.ends_with('\n') {
        out.pop();
    }
    out.push('\n');
    out
}
