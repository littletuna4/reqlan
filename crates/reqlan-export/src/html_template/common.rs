//! Shared HTML template fragment helpers.

use crate::html_template::layout::{render_entity_layout_card, render_layout_card};
use crate::html_template::shell::export_page_href;
use crate::html_utils::{
    escape_html, file_page_enabled, filter_display_label, idea_status, idea_tags, idea_tip_attrs,
    is_filter_empty, is_filter_not_present, is_filter_unspecified, render_attribute_value_html,
    render_text_with_refs_html, resolve_export_file_page, slug_attribute_key,
};
use crate::types::{ExportIdea, ExportSnapshot, GraphViewSlice};
use reqlan_index::{FILTER_EMPTY, FILTER_NOT_PRESENT};
use std::collections::BTreeSet;

pub(crate) fn format_katz(score: f64) -> String {
    format!("{score:.3}")
}

pub(crate) fn render_katz_cell(score: f64) -> String {
    format!(r#"<td class="count" data-sort-value="{score:.12}">{}</td>"#, format_katz(score))
}

pub(crate) fn render_multi_filter_select(
    attr: &str,
    counts: &std::collections::BTreeMap<String, usize>,
    empty_label: &str,
) -> String {
    let mut values: BTreeSet<String> = counts.keys().cloned().collect();
    values.insert(FILTER_NOT_PRESENT.to_string());
    values.insert(FILTER_EMPTY.to_string());
    let mut options: Vec<(String, String, &'static str, usize)> = values
        .into_iter()
        .map(|value| {
            let kind = if is_filter_not_present(&value) {
                "not-present"
            } else if is_filter_empty(&value) {
                "empty"
            } else if is_filter_unspecified(&value) {
                "unspecified"
            } else {
                "concrete"
            };
            let count = counts.get(&value).copied().unwrap_or(0);
            let label = filter_display_label(&value);
            (value, label, kind, count)
        })
        .collect();
    options.sort_by(|left, right| {
        let rank = |kind: &str| match kind {
            "not-present" => 0,
            "empty" => 1,
            "unspecified" => 2,
            _ => 3,
        };
        rank(left.2).cmp(&rank(right.2)).then(left.1.cmp(&right.1))
    });
    let payload = serde_json::json!(options
        .iter()
        .map(|(value, label, kind, count)| {
            serde_json::json!({
                "value": value,
                "label": label,
                "special": *kind != "concrete",
                "kind": kind,
                "count": count
            })
        })
        .collect::<Vec<_>>());
    let label = if attr == "status" { "Status" } else { "Tags" };
    let trigger = if attr == "status" { "Status…" } else { "Tags…" };
    format!(
        r#"<div class="scd is-loading" data-graph-{attr}-scd data-placeholder="{}" data-label="{label}" data-options="{}">
            <button type="button" class="scd-trigger" aria-haspopup="listbox" aria-expanded="false" aria-busy="true">
                <span class="scd-trigger-label">{trigger}</span>
                <span class="scd-chevron" aria-hidden="true"></span>
            </button>
        </div>"#,
        escape_html(empty_label),
        escape_html(&payload.to_string())
    )
}

pub(crate) fn render_reference_section(
    snapshot: &ExportSnapshot,
    current_path: &str,
    id: &str,
    title: &str,
    heading_tip: &str,
    rows: &[crate::types::ExportReferenceRow],
) -> String {
    let body = if rows.is_empty() {
        r#"<tr><td colspan="4" class="subtle">None</td></tr>"#.into()
    } else {
        rows.iter()
            .map(|row| {
                let linked = if row.direction == "inbound" {
                    snapshot.ideas_by_id.get(&row.source_idea_id)
                } else {
                    row.target_idea_id.as_ref().and_then(|id| snapshot.ideas_by_id.get(id))
                };
                let label = if row.direction == "inbound" {
                    if row.label.is_empty() { row.target_name.as_str() } else { row.label.as_str() }
                } else {
                    row.target_name.as_str()
                };
                let file_target = if row.direction == "outbound" && linked.is_none() {
                    resolve_export_file_page(snapshot, None, Some(&row.target_path))
                } else {
                    None
                };
                let path_cell = if let Some((page, kind)) = file_target {
                    if file_page_enabled(snapshot, kind) {
                        format!(
                            r#"<a href="{}">{}</a>"#,
                            escape_html(&export_page_href(snapshot, current_path, page)),
                            escape_html(&row.target_path)
                        )
                    } else {
                        escape_html(&row.target_path)
                    }
                } else {
                    escape_html(&row.target_path)
                };
                let idea_cell = if let Some(linked) = linked {
                    render_idea_anchor(snapshot, current_path, linked, &linked.name)
                } else if let Some((page, kind)) = file_target {
                    if file_page_enabled(snapshot, kind) {
                        format!(
                            r#"<a class="idea-ref idea-ref--file" href="{}">{}</a>"#,
                            escape_html(&export_page_href(snapshot, current_path, page)),
                            escape_html(label)
                        )
                    } else {
                        escape_html(label)
                    }
                } else {
                    escape_html(label)
                };
                let snippet_cell = row.snippet.as_ref().map(|snippet| {
                    render_text_with_refs_html(
                        snapshot,
                        current_path,
                        snippet,
                        snapshot.ideas_by_id.get(&row.source_idea_id),
                        None,
                        false,
                    )
                }).unwrap_or_else(|| "—".into());
                format!(
                    "<tr><td>{}</td><td>{idea_cell}</td><td>{path_cell}</td><td>{snippet_cell}</td></tr>",
                    escape_html(&row.kind)
                )
            })
            .collect::<Vec<_>>()
            .join("")
    };
    render_layout_card(
        id,
        "section",
        "table-shell print-break-avoid layout-card-span-full",
        title,
        heading_tip,
        &format!(
            r#"<div class="scroll-window">
                <table>
                    <thead><tr><th>Kind</th><th>Idea</th><th>Path</th><th>Snippet</th></tr></thead>
                    <tbody>{body}</tbody>
                </table>
            </div>"#
        ),
        &format!(r#"id="{}""#, escape_html(id)),
    )
}

pub(crate) fn enrich_graph_urls(
    snapshot: &ExportSnapshot,
    graph: &GraphViewSlice,
    _current_path: &str,
) -> GraphViewSlice {
    let mut copy = graph.clone();
    let center_id = copy.center_id.clone();
    for node in &mut copy.nodes {
        if let Some(idea) = snapshot.ideas_by_id.get(&node.id) {
            if snapshot.page_options.include_idea_pages {
                node.page_url = Some(idea.page.url.clone());
            }
            let tags = idea_tags(idea);
            if tags.is_empty() {
                node.tags.clear();
            } else {
                node.tags = tags;
            }
            if let Some(status) = idea_status(idea) {
                node.status = Some(status);
            } else {
                node.status = None;
            }
            node.status_key = Some(idea.status_key.clone());
            node.tags_keys = idea.tags_keys.clone();
            node.attributes = Some(idea.attributes.clone());
            let mut keys: Vec<String> = idea.attributes.keys().cloned().collect();
            keys.sort();
            node.attribute_keys = if keys.is_empty() { None } else { Some(keys) };
            if let Some((page, kind)) =
                resolve_export_file_page(snapshot, None, Some(&idea.file_uri))
            {
                if file_page_enabled(snapshot, kind) {
                    node.host_file_page_url = Some(page.url.clone());
                } else {
                    node.host_file_page_url = None;
                }
            } else {
                node.host_file_page_url = None;
            }
        } else if let Some((page, kind)) =
            resolve_export_file_page(snapshot, Some(&node.id), Some(&node.file_uri))
        {
            if file_page_enabled(snapshot, kind) {
                node.page_url = Some(page.url.clone());
            }
        }
        if center_id.as_deref() == Some(node.id.as_str()) {
            node.is_subject = Some(true);
        }
    }
    copy
}

pub(crate) fn render_idea_attributes(
    snapshot: &ExportSnapshot,
    current_path: &str,
    idea: &ExportIdea,
) -> String {
    if idea.attributes.is_empty() {
        return r#"<p class="subtle">No attributes declared.</p>"#.into();
    }
    let rows = idea
        .attributes
        .iter()
        .map(|(key, value)| {
            let href = snapshot
                .attributes_by_key
                .get(key)
                .filter(|_| snapshot.page_options.include_attribute_pages)
                .map(|attribute| export_page_href(snapshot, current_path, &attribute.page))
                .unwrap_or_else(|| {
                    format!(
                        "{}#attr-{}",
                        export_page_href(
                            snapshot,
                            current_path,
                            &snapshot.manifest.attributes_index
                        ),
                        slug_attribute_key(key)
                    )
                });
            format!(
                "<tr id=\"attr-{}\"><td><a href=\"{}\">{}</a></td><td>{}</td></tr>",
                escape_html(&slug_attribute_key(key)),
                escape_html(&href),
                escape_html(key),
                render_attribute_value_html(snapshot, current_path, value, Some(idea), false)
            )
        })
        .collect::<Vec<_>>()
        .join("");
    format!(
        r#"<div class="scroll-window"><table><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>{rows}</tbody></table></div>
        <p class="subtle"><a href="{}">Browse all attributes</a></p>"#,
        escape_html(&export_page_href(snapshot, current_path, &snapshot.manifest.attributes_index))
    )
}

pub(crate) fn render_maybe_linked_card(
    enabled: bool,
    href: &str,
    title: &str,
    subtitle: &str,
) -> String {
    let layout_id = format!("entity-{}", title.to_lowercase().replace([' ', '/', '\\'], "-"));
    render_entity_layout_card(&layout_id, enabled.then_some(href), title, subtitle, subtitle, "")
}

pub(crate) fn render_idea_anchor(
    snapshot: &ExportSnapshot,
    current_path: &str,
    idea: &ExportIdea,
    label: &str,
) -> String {
    if snapshot.page_options.include_idea_pages {
        format!(
            r#"<a href="{}"{}>{}</a>"#,
            escape_html(&export_page_href(snapshot, current_path, &idea.page)),
            idea_tip_attrs(idea),
            escape_html(label)
        )
    } else {
        escape_html(label)
    }
}
