use crate::html_utils::{
    escape_html, export_idea_anchor_id, file_by_idea, file_page_enabled, filter_display_label,
    format_date, href_for, idea_status, idea_tags, is_filter_empty, is_filter_not_present,
    is_filter_unspecified, list_filter_href, page_href, related_clusters, render_attribute_value_html,
    render_definition_list, render_file_path_cell, render_idea_summary_html, render_linked_status_cell,
    render_linked_tags_cell, render_metric, render_optional_status_cell, render_optional_tags_cell,
    render_print_idea_attributes_html, render_text_with_refs_html, resolve_export_file_page,
    slug_attribute_key, status_or_tag_facet_href, stringify_json,
};
use crate::types::{
    format_attribute_value, ExportAttribute, ExportCluster, ExportCodeFile, ExportFile, ExportIdea,
    ExportPageInfo, ExportSnapshot, GraphViewSlice,
};
use reqlan_index::{FILTER_EMPTY, FILTER_NOT_PRESENT};
use std::collections::BTreeSet;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ActiveNav {
    Overview,
    Ideas,
    Files,
    CodeFiles,
    Clusters,
    Attributes,
    Graph,
    Print,
}

struct RenderOptions<'a> {
    current_path: &'a str,
    active_nav: ActiveNav,
    title: String,
    body: String,
    snapshot: &'a ExportSnapshot,
    breadcrumbs: Vec<(String, Option<String>)>,
    include_global_search: bool,
}

fn export_href(snapshot: &ExportSnapshot, current_path: &str, target_path: &str) -> String {
    href_for(current_path, target_path, snapshot.url_base.as_deref())
}

fn export_page_href(snapshot: &ExportSnapshot, current_path: &str, page: &ExportPageInfo) -> String {
    page_href(current_path, page, snapshot.url_base.as_deref())
}

fn render_multi_filter_select(attr: &str, counts: &std::collections::BTreeMap<String, usize>, empty_label: &str) -> String {
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

pub fn render_home_page(snapshot: &ExportSnapshot) -> String {
    let current_path = snapshot.manifest.home.path.as_str();
    let clusters_index_href = export_page_href(snapshot, current_path, &snapshot.manifest.clusters_index);
    let highlight_clusters = snapshot
        .clusters
        .iter()
        .take(8)
        .map(|cluster| {
            let href = if snapshot.page_options.include_cluster_pages {
                export_page_href(snapshot, current_path, &cluster.page)
            } else {
                list_filter_href(
                    snapshot,
                    current_path,
                    &snapshot.manifest.clusters_index,
                    &[("kind", cluster.kind.as_str()), ("cluster", cluster.label.as_str())],
                )
            };
            format!(
                r#"<a class="entity-card" href="{}"><div class="pill-row"><span class="pill">{}</span><span class="pill">{} ideas</span></div><h3>{}</h3><p class="subtle">{}</p></a>"#,
                escape_html(&href),
                escape_html(&cluster.kind),
                cluster.counts.ideas,
                escape_html(&cluster.label),
                escape_html(&cluster.description)
            )
        })
        .collect::<Vec<_>>()
        .join("");
    let status_href = |key: &str| Some(status_or_tag_facet_href(snapshot, current_path, "status", key));
    let tag_href = |key: &str| Some(status_or_tag_facet_href(snapshot, current_path, "tag", key));
    let body = format!(
        r#"<header class="hero">
            <div class="panel">
                <p class="eyebrow">reqlan export</p>
                <h1>{}</h1>
                <p class="subtle">Template: {} | Scope: {} | Mode: {}</p>
                <p class="prose">Documentation-grade export with idea pages, clusters, links, search, and printable views.</p>
            </div>
            <div class="card">
                <p><strong>Generated</strong></p>
                <p>{}</p>
                <p><strong>Workspace</strong></p>
                <p>{}</p>
            </div>
        </header>
        <section class="grid">
            {}
            {}
            {}
            {}
            {}
            {}
        </section>
        <section class="split">
            <div class="panel">
                <h2>Status Rollup</h2>
                <div class="scroll-window">{}</div>
            </div>
            <div class="panel">
                <h2>Tags</h2>
                <div class="scroll-window">{}</div>
            </div>
        </section>
        <section class="panel">
            <div class="toolbar">
                <h2>Highlighted Clusters</h2>
                <div class="actions">
                    <a class="pill" href="{}">Printable report</a>
                    <a class="pill" href="{}">Snapshot JSON</a>
                </div>
            </div>
            <div class="entity-list">{highlight_clusters}</div>
        </section>"#,
        escape_html(&snapshot.title),
        escape_html(&snapshot.template_id),
        escape_html(&snapshot.scope),
        escape_html(&snapshot.runtime_mode),
        escape_html(&format_date(&snapshot.generated_at)),
        escape_html(&snapshot.workspace_root),
        render_metric("Ideas", &snapshot.counts.ideas.to_string(), Some(&export_page_href(snapshot, current_path, &snapshot.manifest.ideas_index))),
        render_metric("References", &snapshot.counts.edges.to_string(), Some(&export_page_href(snapshot, current_path, &snapshot.manifest.graph))),
        render_metric("Files", &snapshot.counts.files.to_string(), Some(&export_page_href(snapshot, current_path, &snapshot.manifest.files_index))),
        render_metric("Code files", &snapshot.code_files.len().to_string(), Some(&export_page_href(snapshot, current_path, &snapshot.manifest.code_files_index))),
        render_metric("Clusters", &snapshot.counts.clusters.to_string(), Some(&clusters_index_href)),
        render_metric("Attributes", &snapshot.attributes.len().to_string(), Some(&export_page_href(snapshot, current_path, &snapshot.manifest.attributes_index))),
        render_definition_list(&snapshot.by_status, Some(&status_href)),
        render_definition_list(&snapshot.by_tag, Some(&tag_href)),
        escape_html(&export_page_href(snapshot, current_path, &snapshot.manifest.print_home)),
        escape_html(&export_page_href(snapshot, current_path, &snapshot.manifest.data_export)),
    );
    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::Overview,
        title: snapshot.title.clone(),
        body,
        snapshot,
        breadcrumbs: Vec::new(),
        include_global_search: true,
    })
}

pub fn render_ideas_index_page(snapshot: &ExportSnapshot) -> String {
    let current_path = snapshot.manifest.ideas_index.path.as_str();
    let rows = snapshot
        .ideas
        .iter()
        .map(|idea| {
            let filter_text = [
                idea.name.as_str(),
                idea.summary.as_str(),
                idea_status(idea).unwrap_or_default().as_str(),
                idea_tags(idea).join(" ").as_str(),
                idea.file_uri.as_str(),
            ]
            .join(" ");
            format!(
                r#"<tr data-filter-row="ideas" data-filter-text="{}"><td><strong>{}</strong></td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}/{}</td></tr>"#,
                escape_html(&filter_text),
                render_idea_anchor(snapshot, current_path, idea, &idea.name),
                render_file_path_cell(snapshot, current_path, &idea.file_uri),
                render_linked_status_cell(snapshot, current_path, idea),
                render_linked_tags_cell(snapshot, current_path, idea),
                render_idea_summary_html(snapshot, current_path, idea, "—", false),
                idea.references.inbound.len(),
                idea.references.outbound.len()
            )
        })
        .collect::<Vec<_>>()
        .join("");
    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::Ideas,
        title: format!("{} - Ideas", snapshot.title),
        snapshot,
        include_global_search: true,
        breadcrumbs: Vec::new(),
        body: format!(
            r#"<header class="page-header">
                <p class="eyebrow">Ideas index</p>
                <h1>{}</h1>
                <p class="subtle">Searchable list view for all exported ideas.</p>
            </header>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Ideas</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter ideas by name, path, status, tags, or summary" data-filter-input="ideas" />
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th data-filter-key="name">Name</th>
                            <th data-filter-key="path">Path</th>
                            <th data-filter-key="status">Status</th>
                            <th data-filter-key="tags">Tags</th>
                            <th data-filter-key="summary">Summary</th>
                            <th data-filter-key="refs">Refs in/out</th>
                        </tr>
                    </thead>
                    <tbody>{rows}</tbody>
                </table>
            </section>"#,
            escape_html(&snapshot.title)
        ),
    })
}

pub fn render_files_index_page(snapshot: &ExportSnapshot) -> String {
    let current_path = snapshot.manifest.files_index.path.as_str();
    let rows = snapshot
        .files
        .iter()
        .map(|file| {
            let tags = file.tags.keys().cloned().collect::<Vec<_>>().join(" ");
            let tag_links = if file.tags.is_empty() {
                "—".into()
            } else {
                file.tags
                    .keys()
                    .map(|tag| {
                        let href = status_or_tag_facet_href(snapshot, current_path, "tag", tag);
                        format!(r#"<a href="{}">{}</a>"#, escape_html(&href), escape_html(tag))
                    })
                    .collect::<Vec<_>>()
                    .join(", ")
            };
            let name_cell = if snapshot.page_options.include_file_pages {
                format!(
                    r#"<a href="{}">{}</a>"#,
                    escape_html(&export_page_href(snapshot, current_path, &file.page)),
                    escape_html(&file.name)
                )
            } else {
                escape_html(&file.name)
            };
            format!(
                r#"<tr data-filter-row="files" data-filter-text="{}"><td><strong>{name_cell}</strong></td><td>{}</td><td>{}</td><td>{}</td><td>{tag_links}</td></tr>"#,
                escape_html(&format!("{} {} {tags}", file.name, file.file_uri)),
                escape_html(if file.directory.is_empty() { "." } else { &file.directory }),
                file.ideas.len(),
                file.edge_count
            )
        })
        .collect::<Vec<_>>()
        .join("");
    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::Files,
        title: format!("{} - Files", snapshot.title),
        snapshot,
        include_global_search: true,
        breadcrumbs: Vec::new(),
        body: format!(
            r#"<header class="page-header">
                <p class="eyebrow">Files index</p>
                <h1>{}</h1>
                <p class="subtle">List view by source file with local counts and drill-down pages.</p>
            </header>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Files</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter files by path or tags" data-filter-input="files" />
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th data-filter-key="file">File</th>
                            <th data-filter-key="directory">Directory</th>
                            <th data-filter-key="ideas">Ideas</th>
                            <th data-filter-key="references">References</th>
                            <th data-filter-key="tags">Tags</th>
                        </tr>
                    </thead>
                    <tbody>{rows}</tbody>
                </table>
            </section>"#,
            escape_html(&snapshot.title)
        ),
    })
}

pub fn render_code_files_index_page(snapshot: &ExportSnapshot) -> String {
    let current_path = snapshot.manifest.code_files_index.path.as_str();
    let rows = if snapshot.code_files.is_empty() {
        r#"<tr><td colspan="4" class="subtle">No outbound code file references.</td></tr>"#.into()
    } else {
        snapshot
            .code_files
            .iter()
            .map(|file| {
                let name_cell = if snapshot.page_options.include_code_file_pages {
                    format!(
                        r#"<a href="{}">{}</a>"#,
                        escape_html(&export_page_href(snapshot, current_path, &file.page)),
                        escape_html(&file.name)
                    )
                } else {
                    escape_html(&file.name)
                };
                format!(
                    r#"<tr data-filter-row="codeFiles" data-filter-text="{}"><td><strong>{name_cell}</strong></td><td>{}</td><td>{}</td><td>{}</td></tr>"#,
                    escape_html(&format!("{} {} {}", file.name, file.file_uri, file.labels.join(" "))),
                    escape_html(if file.directory.is_empty() { "." } else { &file.directory }),
                    file.referencing_idea_ids.len(),
                    escape_html(&if file.labels.is_empty() { "—".into() } else { file.labels.join(", ") })
                )
            })
            .collect::<Vec<_>>()
            .join("")
    };
    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::CodeFiles,
        title: format!("{} - Code files", snapshot.title),
        snapshot,
        include_global_search: true,
        breadcrumbs: Vec::new(),
        body: format!(
            r#"<header class="page-header">
                <p class="eyebrow">Code reference index</p>
                <h1>{}</h1>
                <p class="subtle">Outbound file_reference targets that are not idea-hosting reqlan files.</p>
            </header>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Code files</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter code files by path or label" data-filter-input="codeFiles" />
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th data-filter-key="file">File</th>
                            <th data-filter-key="directory">Directory</th>
                            <th data-filter-key="referenced-by">Referenced by</th>
                            <th data-filter-key="labels">Labels</th>
                        </tr>
                    </thead>
                    <tbody>{rows}</tbody>
                </table>
            </section>"#,
            escape_html(&snapshot.title)
        ),
    })
}

pub fn render_clusters_index_page(snapshot: &ExportSnapshot) -> String {
    let current_path = snapshot.manifest.clusters_index.path.as_str();
    let rows = snapshot
        .clusters
        .iter()
        .map(|cluster| {
            let label_cell = if snapshot.page_options.include_cluster_pages {
                format!(
                    r#"<a href="{}">{}</a>"#,
                    escape_html(&export_page_href(snapshot, current_path, &cluster.page)),
                    escape_html(&cluster.label)
                )
            } else {
                escape_html(&cluster.label)
            };
            let kind_href = list_filter_href(
                snapshot,
                current_path,
                &snapshot.manifest.clusters_index,
                &[("kind", cluster.kind.as_str())],
            );
            format!(
                r#"<tr data-filter-row="clusters" data-filter-text="{}"><td><strong>{label_cell}</strong></td><td data-sort-value="{}"><a href="{}">{}</a></td><td>{}</td><td>{}</td><td>{}</td></tr>"#,
                escape_html(&format!("{} {} {}", cluster.label, cluster.kind, cluster.description)),
                escape_html(&cluster.kind),
                escape_html(&kind_href),
                escape_html(&cluster.kind),
                cluster.counts.ideas,
                cluster.counts.files,
                escape_html(&cluster.description)
            )
        })
        .collect::<Vec<_>>()
        .join("");
    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::Clusters,
        title: format!("{} - Clusters", snapshot.title),
        snapshot,
        include_global_search: true,
        breadcrumbs: Vec::new(),
        body: format!(
            r#"<header class="page-header">
                <p class="eyebrow">Clusters</p>
                <h1>{}</h1>
                <p class="subtle">Deterministic and computed groupings for easier exploration.</p>
            </header>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Clusters</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter clusters by label, kind, or description" data-filter-input="clusters" />
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th data-filter-key="cluster">Cluster</th>
                            <th data-filter-key="kind">Kind</th>
                            <th data-filter-key="ideas">Ideas</th>
                            <th data-filter-key="files">Files</th>
                            <th data-filter-key="description">Description</th>
                        </tr>
                    </thead>
                    <tbody>{rows}</tbody>
                </table>
            </section>"#,
            escape_html(&snapshot.title)
        ),
    })
}

pub fn render_attributes_index_page(snapshot: &ExportSnapshot) -> String {
    let current_path = snapshot.manifest.attributes_index.path.as_str();
    let rows = if snapshot.attributes.is_empty() {
        r#"<tr><td colspan="4" class="subtle">No attributes declared.</td></tr>"#.into()
    } else {
        snapshot
            .attributes
            .iter()
            .map(|attribute| {
                let anchor = format!("attr-{}", slug_attribute_key(&attribute.key));
                let value_summary = attribute
                    .values
                    .iter()
                    .take(6)
                    .map(|entry| format!("{} ({})", entry.value, entry.count))
                    .collect::<Vec<_>>()
                    .join("; ");
                let key_cell = if snapshot.page_options.include_attribute_pages {
                    format!(
                        r#"<a href="{}">{}</a>"#,
                        escape_html(&export_page_href(snapshot, current_path, &attribute.page)),
                        escape_html(&attribute.key)
                    )
                } else {
                    escape_html(&attribute.key)
                };
                format!(
                    r#"<tr id="{}" data-filter-row="attributes" data-filter-text="{}"><td><strong>{key_cell}</strong></td><td>{}</td><td>{}</td><td>{}</td></tr>"#,
                    escape_html(&anchor),
                    escape_html(&format!("{} {value_summary} {}", attribute.key, attribute.idea_ids.join(" "))),
                    attribute.idea_count,
                    attribute.values.len(),
                    escape_html(if value_summary.is_empty() { "—" } else { &value_summary })
                )
            })
            .collect::<Vec<_>>()
            .join("")
    };
    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::Attributes,
        title: format!("{} - Attributes", snapshot.title),
        snapshot,
        include_global_search: true,
        breadcrumbs: Vec::new(),
        body: format!(
            r#"<header class="page-header">
                <p class="eyebrow">Attributes</p>
                <h1>{}</h1>
                <p class="subtle">Every attribute key in this export with values and idea counts.</p>
            </header>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Attributes</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter attributes by key or value" data-filter-input="attributes" />
                    </div>
                </div>
                <table>
                    <thead><tr><th data-filter-key="attribute">Attribute</th><th data-filter-key="ideas">Ideas</th><th data-filter-key="values">Values</th><th data-filter-key="value-summary">Value summary</th></tr></thead>
                    <tbody>{rows}</tbody>
                </table>
            </section>"#,
            escape_html(&snapshot.title)
        ),
    })
}

pub fn render_attribute_detail_page(snapshot: &ExportSnapshot, attribute: &ExportAttribute) -> String {
    let current_path = attribute.page.path.as_str();
    let ideas: Vec<&ExportIdea> = attribute
        .idea_ids
        .iter()
        .filter_map(|id| snapshot.ideas_by_id.get(id))
        .collect();
    let total_ideas = attribute.idea_count.max(1);
    let value_rows = if attribute.values.is_empty() {
        r#"<tr><td colspan="4" class="subtle">No values.</td></tr>"#.into()
    } else {
        attribute
            .values
            .iter()
            .map(|entry| {
                let percent = ((entry.count as f64 / total_ideas as f64) * 1000.0).round() / 10.0;
                let width = ((entry.count as f64 / total_ideas as f64) * 100.0).clamp(if entry.count > 0 { 1.5 } else { 0.0 }, 100.0);
                let value_href = list_filter_href(snapshot, current_path, &attribute.page, &[("value", entry.value.as_str())]);
                format!(
                    r#"<tr data-filter-row="attributeValues" data-filter-text="{}"><td data-sort-value="{}"><a href="{}">{}</a></td><td><div class="distribution-track" title="{}" role="img" aria-label="{}"><span class="distribution-fill" style="width: {width}%"></span></div></td><td>{}</td><td>{percent}%</td></tr>"#,
                    escape_html(&format!("{} {} {percent}% {}", entry.value, entry.count, entry.idea_ids.join(" "))),
                    escape_html(&entry.value),
                    escape_html(&value_href),
                    escape_html(&entry.value),
                    escape_html(&format!("{} of {} ideas ({percent}%)", entry.count, attribute.idea_count)),
                    escape_html(&format!("{}: {} ideas, {percent}%", entry.value, entry.count)),
                    entry.count
                )
            })
            .collect::<Vec<_>>()
            .join("")
    };
    let idea_rows = if ideas.is_empty() {
        r#"<tr><td colspan="5" class="subtle">No ideas declare this attribute.</td></tr>"#.into()
    } else {
        ideas
            .iter()
            .map(|idea| {
                let value = idea
                    .attributes
                    .get(&attribute.key)
                    .map(format_attribute_value)
                    .filter(|value| !value.is_empty())
                    .unwrap_or_else(|| "(empty)".into());
                format!(
                    r#"<tr data-filter-row="attributeIdeas" data-filter-text="{}"><td>{}</td><td data-sort-value="{}"><a href="{}">{}</a></td><td>{}</td><td>{}</td><td>{}</td></tr>"#,
                    escape_html(&format!("{} {value} {} {} {}", idea.name, idea_status(idea).unwrap_or_default(), idea_tags(idea).join(" "), idea.summary)),
                    render_idea_anchor(snapshot, current_path, idea, &idea.name),
                    escape_html(&value),
                    escape_html(&list_filter_href(snapshot, current_path, &attribute.page, &[("value", value.as_str())])),
                    escape_html(&value),
                    render_linked_status_cell(snapshot, current_path, idea),
                    render_linked_tags_cell(snapshot, current_path, idea),
                    escape_html(&idea.summary)
                )
            })
            .collect::<Vec<_>>()
            .join("")
    };
    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::Attributes,
        title: format!("{} - {}", snapshot.title, attribute.key),
        snapshot,
        include_global_search: snapshot.runtime_mode == "interactive",
        breadcrumbs: vec![
            (
                "Attributes".into(),
                Some(export_page_href(snapshot, current_path, &snapshot.manifest.attributes_index)),
            ),
            (attribute.key.clone(), None),
        ],
        body: format!(
            r#"<header class="page-header">
                <p class="eyebrow">Attribute detail</p>
                <h1>{}</h1>
                <p class="subtle">{} ideas · {} distinct values</p>
            </header>
            <section class="grid">
                {}
                {}
            </section>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Value distribution</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter values" data-filter-input="attributeValues" />
                    </div>
                </div>
                <div class="scroll-window">
                    <table>
                        <thead><tr><th data-filter-key="value">Value</th><th data-filter-key="distribution">Distribution</th><th data-filter-key="ideas">Ideas</th><th data-filter-key="share">Share</th></tr></thead>
                        <tbody>{value_rows}</tbody>
                    </table>
                </div>
            </section>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Ideas with this attribute</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter ideas by name, value, status, or tags" data-filter-input="attributeIdeas" />
                    </div>
                </div>
                <table>
                    <thead><tr><th data-filter-key="idea">Idea</th><th data-filter-key="value">Value</th><th data-filter-key="status">Status</th><th data-filter-key="tags">Tags</th><th data-filter-key="summary">Summary</th></tr></thead>
                    <tbody>{idea_rows}</tbody>
                </table>
            </section>"#,
            escape_html(&attribute.key),
            attribute.idea_count,
            attribute.values.len(),
            render_metric("Ideas", &attribute.idea_count.to_string(), None),
            render_metric("Values", &attribute.values.len().to_string(), None)
        ),
    })
}

pub fn render_graph_page(snapshot: &ExportSnapshot) -> String {
    let current_path = snapshot.manifest.graph.path.as_str();
    let graph = enrich_graph_urls(snapshot, &snapshot.graphs.workspace, current_path);
    let clusters = snapshot
        .clusters
        .iter()
        .take(16)
        .map(|cluster| {
            if snapshot.page_options.include_cluster_pages {
                format!(
                    r#"<a class="pill" href="{}">{}</a>"#,
                    escape_html(&export_page_href(snapshot, current_path, &cluster.page)),
                    escape_html(&cluster.label)
                )
            } else {
                format!(r#"<span class="pill">{}</span>"#, escape_html(&cluster.label))
            }
        })
        .collect::<Vec<_>>()
        .join("");
    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::Graph,
        title: format!("{} - Graph", snapshot.title),
        snapshot,
        include_global_search: snapshot.runtime_mode == "interactive",
        breadcrumbs: Vec::new(),
        body: format!(
            r#"<header class="page-header">
                <p class="eyebrow">Graph</p>
                <h1>{}</h1>
                <p class="subtle">Workspace graph with links into idea detail pages.</p>
            </header>
            <section class="graph-shell">
                <div class="toolbar">
                    <h2>Reference graph</h2>
                    <div class="actions">
                        <a class="pill" href="{}">Graph JSON</a>
                    </div>
                </div>
                <div class="graph-controls-bar" data-graph-controls="graph-data">
                    <input class="searchbar graph-filter" type="search" placeholder="Search graph nodes" data-graph-search />
                    <input class="searchbar graph-filter" type="search" placeholder="Path filter" data-graph-path />
                    {}
                    {}
                    <button type="button" class="graph-action" data-graph-toggle-external="true">Hide external</button>
                    <button type="button" class="graph-action" data-graph-toggle-ideasets="true">Hide ideasets</button>
                    <label class="graph-file-treatment">
                        <span class="visually-hidden">File treatment</span>
                        <select class="graph-action graph-select" data-graph-file-treatment aria-label="Hosting .rq file treatment" title="How hosting .rq files appear in the graph">
                            <option value="invisible" title="Do not show hosting .rq files — ideas float freely.">Files: hidden</option>
                            <option value="compound" title="Draw each hosting .rq file as a container. Drag the box; click the title to open the file.">Files: compound</option>
                            <option value="linked" selected title="Show each hosting .rq file as a linked ideaset node. Click the node to open the file.">Files: linked</option>
                        </select>
                    </label>
                    <button type="button" class="graph-action is-active" data-graph-toggle-wildcard aria-pressed="true" title="Show edges expanded from path+idea wildcard references">Wildcard refs</button>
                    <button type="button" class="graph-action is-active" data-graph-toggle-labels data-label-mode="auto" aria-pressed="mixed">Labels: auto</button>
                    <button type="button" class="graph-action" data-graph-toggle-physics aria-pressed="false">Live physics</button>
                    <button type="button" class="graph-action" data-graph-fit>Fit</button>
                    <button type="button" class="graph-action" data-graph-reset>Reset</button>
                    <span class="graph-status" data-graph-status-text></span>
                </div>
                <div class="pill-row">{clusters}</div>
                <div class="graph-root is-booting" data-graph-json="graph-data">
                    <div class="graph-boot" data-graph-boot role="status" aria-live="polite" aria-busy="true">
                        <span class="graph-boot-spinner" aria-hidden="true"></span>
                        <p>Initialising graph…</p>
                    </div>
                </div>
                <script id="graph-data" type="application/json">{}</script>
            </section>"#,
            escape_html(&snapshot.title),
            escape_html(&export_page_href(snapshot, current_path, &snapshot.manifest.data_graph)),
            render_multi_filter_select("status", &snapshot.by_status, "Filter by status"),
            render_multi_filter_select("tag", &snapshot.by_tag, "Filter by tag"),
            stringify_json(&graph)
        ),
    })
}

pub fn render_idea_detail_page(snapshot: &ExportSnapshot, idea: &ExportIdea) -> String {
    let current_path = idea.page.path.as_str();
    let clusters = related_clusters(snapshot, idea);
    let parent_file = file_by_idea(snapshot, idea);
    let empty = GraphViewSlice {
        query: crate::types::GraphViewQuery {
            include_indirect: true,
            max_nodes: None,
            ignore_hard_cap: None,
            include_ideasets: None,
        },
        center_id: Some(idea.id.clone()),
        depth: 2,
        truncated: false,
        total_matching: Some(0),
        nodes: Vec::new(),
        edges: Vec::new(),
    };
    let graph = enrich_graph_urls(
        snapshot,
        snapshot.graphs.by_idea_id.get(&idea.id).unwrap_or(&empty),
        current_path,
    );
    let status_pill = idea_status(idea)
        .map(|status| format!(r#"<span class="pill">{}</span>"#, escape_html(&status)))
        .unwrap_or_default();
    let tag_pills = idea_tags(idea)
        .iter()
        .map(|tag| format!(r#"<span class="pill">{}</span>"#, escape_html(tag)))
        .collect::<Vec<_>>()
        .join("");
    let file_card = parent_file
        .map(|file| {
            render_maybe_linked_card(
                snapshot.page_options.include_file_pages,
                &export_page_href(snapshot, current_path, &file.page),
                "Source file",
                &file.file_uri,
            )
        })
        .unwrap_or_default();
    let cluster_cards = clusters
        .iter()
        .map(|cluster| {
            render_maybe_linked_card(
                snapshot.page_options.include_cluster_pages,
                &export_page_href(snapshot, current_path, &cluster.page),
                &cluster.label,
                &format!("{} cluster", cluster.kind),
            )
        })
        .collect::<Vec<_>>()
        .join("");
    let print_card = idea
        .page
        .printable_path
        .as_ref()
        .filter(|_| snapshot.page_options.include_print_pages)
        .map(|path| {
            format!(
                r#"<a class="entity-card" href="{}"><strong>Printable page</strong><p class="subtle">Static print-friendly idea sheet.</p></a>"#,
                escape_html(&export_href(snapshot, current_path, path))
            )
        })
        .unwrap_or_default();
    let ancestors = if idea.ancestors.ancestors.is_empty() {
        r#"<p class="subtle">No ancestor chain recorded.</p>"#.into()
    } else {
        idea.ancestors
            .ancestors
            .iter()
            .filter_map(|ancestor| {
                snapshot.ideas_by_id.get(&ancestor.id).map(|linked| {
                    render_maybe_linked_card(
                        snapshot.page_options.include_idea_pages,
                        &export_page_href(snapshot, current_path, &linked.page),
                        &ancestor.name,
                        &ancestor.summary,
                    )
                })
            })
            .collect::<Vec<_>>()
            .join("")
    };
    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::Ideas,
        title: format!("{} - {}", snapshot.title, idea.name),
        snapshot,
        include_global_search: snapshot.runtime_mode == "interactive",
        breadcrumbs: vec![
            (
                "Ideas".into(),
                Some(export_page_href(snapshot, current_path, &snapshot.manifest.ideas_index)),
            ),
            (idea.name.clone(), None),
        ],
        body: format!(
            r##"<header class="page-header">
                <p class="eyebrow">Idea detail</p>
                <h1 id="summary">{}</h1>
                <p class="subtle">{}:{}</p>
                <div class="pill-row">
                    <span class="pill">{}</span>
                    {status_pill}
                    {tag_pills}
                </div>
            </header>
            <section class="detail-grid">
                <div class="panel prose print-break-avoid">
                    <h2>Summary</h2>
                    <p class="idea-summary">{}</p>
                    <p><a class="section-link" href="#references-out">Jump to outbound references</a></p>
                    <p><a class="section-link" href="#references-in">Jump to inbound references</a></p>
                </div>
                <div class="panel print-break-avoid">
                    <h2>Navigation</h2>
                    <div class="entity-list">{file_card}{cluster_cards}{print_card}</div>
                </div>
            </section>
            <section class="split">
                <div class="panel print-break-avoid" id="attributes">
                    <h2>Attributes</h2>
                    {}
                </div>
                <div class="panel print-break-avoid">
                    <h2>Ancestor context</h2>
                    <div class="scroll-window">
                        <div class="entity-list">{ancestors}</div>
                    </div>
                </div>
            </section>
            {}
            {}
            {}
            <section class="graph-shell print-break-avoid" id="graph">
                <div class="toolbar"><h2>Local graph</h2></div>
                <div class="graph-controls-bar" data-graph-controls="graph-data">
                    <button type="button" class="graph-action is-active" data-graph-toggle-labels data-label-mode="auto" aria-pressed="mixed">Labels: auto</button>
                    <button type="button" class="graph-action" data-graph-toggle-physics aria-pressed="false">Live physics</button>
                    <button type="button" class="graph-action" data-graph-fit>Fit</button>
                    <span class="graph-status" data-graph-status-text></span>
                </div>
                <div class="graph-root is-booting" data-graph-json="graph-data">
                    <div class="graph-boot" data-graph-boot role="status" aria-live="polite" aria-busy="true">
                        <span class="graph-boot-spinner" aria-hidden="true"></span>
                        <p>Initialising graph…</p>
                    </div>
                </div>
                <script id="graph-data" type="application/json">{}</script>
            </section>"##,
            escape_html(&idea.name),
            escape_html(&idea.file_uri),
            idea.line_start + 1,
            escape_html(&idea.kind),
            render_idea_summary_html(snapshot, current_path, idea, "No summary provided.", false),
            render_idea_attributes(snapshot, current_path, idea),
            render_reference_section(snapshot, current_path, "references-out", "Outbound references", &idea.references.outbound),
            render_reference_section(snapshot, current_path, "references-in", "Inbound references", &idea.references.inbound),
            render_reference_section(snapshot, current_path, "references-unresolved", "Unresolved references", &idea.references.unresolved),
            stringify_json(&graph)
        ),
    })
}

pub fn render_file_detail_page(snapshot: &ExportSnapshot, file: &ExportFile) -> String {
    let current_path = file.page.path.as_str();
    let empty = GraphViewSlice {
        query: crate::types::GraphViewQuery {
            include_indirect: true,
            max_nodes: None,
            ignore_hard_cap: None,
            include_ideasets: None,
        },
        center_id: None,
        depth: 2,
        truncated: false,
        total_matching: Some(0),
        nodes: Vec::new(),
        edges: Vec::new(),
    };
    let graph = enrich_graph_urls(
        snapshot,
        snapshot.graphs.by_file_id.get(&file.id).unwrap_or(&empty),
        current_path,
    );
    let cluster_links = snapshot
        .clusters
        .iter()
        .filter(|cluster| cluster.file_uris.iter().any(|uri| uri == &file.file_uri))
        .take(12)
        .map(|cluster| {
            render_maybe_linked_card(
                snapshot.page_options.include_cluster_pages,
                &export_page_href(snapshot, current_path, &cluster.page),
                &cluster.label,
                &cluster.kind,
            )
        })
        .collect::<Vec<_>>()
        .join("");
    let idea_rows = file
        .ideas
        .iter()
        .map(|idea| {
            format!(
                r#"<tr data-filter-row="fileIdeas" data-filter-text="{}"><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>"#,
                escape_html(&format!("{} {} {} {}", idea.name, idea.summary, idea_status(idea).unwrap_or_default(), idea_tags(idea).join(" "))),
                render_idea_anchor(snapshot, current_path, idea, &idea.name),
                render_linked_status_cell(snapshot, current_path, idea),
                render_linked_tags_cell(snapshot, current_path, idea),
                escape_html(&idea.summary)
            )
        })
        .collect::<Vec<_>>()
        .join("");
    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::Files,
        title: format!("{} - {}", snapshot.title, file.name),
        snapshot,
        include_global_search: snapshot.runtime_mode == "interactive",
        breadcrumbs: vec![
            (
                "Files".into(),
                Some(export_page_href(snapshot, current_path, &snapshot.manifest.files_index)),
            ),
            (file.name.clone(), None),
        ],
        body: format!(
            r#"<header class="page-header">
                <p class="eyebrow">File detail</p>
                <h1>{}</h1>
                <p class="subtle">{}</p>
            </header>
            <section class="grid">
                {}
                {}
                {}
                {}
            </section>
            <section class="split">
                <div class="table-shell">
                    <div class="toolbar">
                        <h2>Ideas in file</h2>
                        <div class="actions">
                            <input class="searchbar" type="search" placeholder="Filter file ideas" data-filter-input="fileIdeas" />
                        </div>
                    </div>
                    <div class="scroll-window">
                        <table>
                            <thead><tr><th data-filter-key="idea">Idea</th><th data-filter-key="status">Status</th><th data-filter-key="tags">Tags</th><th data-filter-key="summary">Summary</th></tr></thead>
                            <tbody>{idea_rows}</tbody>
                        </table>
                    </div>
                </div>
                <div class="panel">
                    <h2>Related clusters</h2>
                    <div class="scroll-window">
                        <div class="entity-list">{}</div>
                    </div>
                </div>
            </section>
            <section class="graph-shell print-break-avoid">
                <div class="toolbar"><h2>Local graph</h2></div>
                <div class="graph-controls-bar" data-graph-controls="graph-data">
                    <button type="button" class="graph-action is-active" data-graph-toggle-labels data-label-mode="auto" aria-pressed="mixed">Labels: auto</button>
                    <button type="button" class="graph-action" data-graph-toggle-physics aria-pressed="false">Live physics</button>
                    <button type="button" class="graph-action" data-graph-fit>Fit</button>
                    <span class="graph-status" data-graph-status-text></span>
                </div>
                <div class="graph-root is-booting" data-graph-json="graph-data">
                    <div class="graph-boot" data-graph-boot role="status" aria-live="polite" aria-busy="true">
                        <span class="graph-boot-spinner" aria-hidden="true"></span>
                        <p>Initialising graph…</p>
                    </div>
                </div>
                <script id="graph-data" type="application/json">{}</script>
            </section>"#,
            escape_html(&file.name),
            escape_html(&file.file_uri),
            render_metric("Ideas", &file.ideas.len().to_string(), None),
            render_metric("References", &file.edge_count.to_string(), None),
            render_metric("Statuses", &file.statuses.len().to_string(), None),
            render_metric("Tags", &file.tags.len().to_string(), None),
            if cluster_links.is_empty() {
                r#"<p class="subtle">No related clusters.</p>"#.into()
            } else {
                cluster_links
            },
            stringify_json(&graph)
        ),
    })
}

pub fn render_code_file_detail_page(snapshot: &ExportSnapshot, file: &ExportCodeFile) -> String {
    let current_path = file.page.path.as_str();
    let referencing: Vec<&ExportIdea> = file
        .referencing_idea_ids
        .iter()
        .filter_map(|id| snapshot.ideas_by_id.get(id))
        .collect();
    let rows = if referencing.is_empty() {
        r#"<tr><td colspan="4" class="subtle">No referencing ideas.</td></tr>"#.into()
    } else {
        referencing
            .iter()
            .map(|idea| {
                format!(
                    r#"<tr data-filter-row="codeFileIdeas" data-filter-text="{}"><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>"#,
                    escape_html(&format!("{} {} {} {}", idea.name, idea.summary, idea_status(idea).unwrap_or_default(), idea_tags(idea).join(" "))),
                    render_idea_anchor(snapshot, current_path, idea, &idea.name),
                    render_linked_status_cell(snapshot, current_path, idea),
                    render_linked_tags_cell(snapshot, current_path, idea),
                    escape_html(&idea.summary)
                )
            })
            .collect::<Vec<_>>()
            .join("")
    };
    let labels = if file.labels.is_empty() {
        String::new()
    } else {
        format!(
            r#"<section class="panel"><h2>Reference labels</h2><p>{}</p></section>"#,
            escape_html(&file.labels.join(", "))
        )
    };
    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::CodeFiles,
        title: format!("{} - {}", snapshot.title, file.name),
        snapshot,
        include_global_search: snapshot.runtime_mode == "interactive",
        breadcrumbs: vec![
            (
                "Code files".into(),
                Some(export_page_href(snapshot, current_path, &snapshot.manifest.code_files_index)),
            ),
            (file.name.clone(), None),
        ],
        body: format!(
            r#"<header class="page-header">
                <p class="eyebrow">Code reference detail</p>
                <h1>{}</h1>
                <p class="subtle">{}</p>
            </header>
            <section class="grid">
                {}
                {}
            </section>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Referencing ideas</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter referencing ideas" data-filter-input="codeFileIdeas" />
                    </div>
                </div>
                <div class="scroll-window">
                    <table>
                        <thead><tr><th data-filter-key="idea">Idea</th><th data-filter-key="status">Status</th><th data-filter-key="tags">Tags</th><th data-filter-key="summary">Summary</th></tr></thead>
                        <tbody>{rows}</tbody>
                    </table>
                </div>
            </section>
            {labels}"#,
            escape_html(&file.name),
            escape_html(&file.file_uri),
            render_metric("Referenced by", &referencing.len().to_string(), None),
            render_metric("Labels", &file.labels.len().to_string(), None)
        ),
    })
}

pub fn render_cluster_detail_page(snapshot: &ExportSnapshot, cluster: &ExportCluster) -> String {
    let current_path = cluster.page.path.as_str();
    let empty = GraphViewSlice {
        query: crate::types::GraphViewQuery {
            include_indirect: true,
            max_nodes: None,
            ignore_hard_cap: None,
            include_ideasets: None,
        },
        center_id: None,
        depth: 2,
        truncated: false,
        total_matching: Some(0),
        nodes: Vec::new(),
        edges: Vec::new(),
    };
    let graph = enrich_graph_urls(
        snapshot,
        snapshot.graphs.by_cluster_id.get(&cluster.id).unwrap_or(&empty),
        current_path,
    );
    let members: Vec<&ExportIdea> = cluster
        .idea_ids
        .iter()
        .filter_map(|id| snapshot.ideas_by_id.get(id))
        .collect();
    let rows = members
        .iter()
        .map(|idea| {
            format!(
                r#"<tr data-filter-row="clusterIdeas" data-filter-text="{}"><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>"#,
                escape_html(&format!("{} {} {} {}", idea.name, idea.file_uri, idea_status(idea).unwrap_or_default(), idea.summary)),
                render_idea_anchor(snapshot, current_path, idea, &idea.name),
                render_file_path_cell(snapshot, current_path, &idea.file_uri),
                render_linked_status_cell(snapshot, current_path, idea),
                escape_html(&idea.summary)
            )
        })
        .collect::<Vec<_>>()
        .join("");
    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::Clusters,
        title: format!("{} - {}", snapshot.title, cluster.label),
        snapshot,
        include_global_search: snapshot.runtime_mode == "interactive",
        breadcrumbs: vec![
            (
                "Clusters".into(),
                Some(export_page_href(snapshot, current_path, &snapshot.manifest.clusters_index)),
            ),
            (cluster.label.clone(), None),
        ],
        body: format!(
            r#"<header class="page-header">
                <p class="eyebrow">Cluster detail</p>
                <h1>{}</h1>
                <p class="subtle">{}</p>
                <div class="pill-row">
                    <span class="pill">{}</span>
                    <span class="pill">{} ideas</span>
                    <span class="pill">{} files</span>
                </div>
            </header>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Members</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter cluster members" data-filter-input="clusterIdeas" />
                    </div>
                </div>
                <div class="scroll-window">
                    <table>
                        <thead><tr><th data-filter-key="idea">Idea</th><th data-filter-key="path">File</th><th data-filter-key="status">Status</th><th data-filter-key="summary">Summary</th></tr></thead>
                        <tbody>{rows}</tbody>
                    </table>
                </div>
            </section>
            <section class="graph-shell print-break-avoid">
                <div class="toolbar"><h2>Cluster graph</h2></div>
                <div class="graph-controls-bar" data-graph-controls="graph-data">
                    <button type="button" class="graph-action is-active" data-graph-toggle-labels data-label-mode="auto" aria-pressed="mixed">Labels: auto</button>
                    <button type="button" class="graph-action" data-graph-toggle-physics aria-pressed="false">Live physics</button>
                    <button type="button" class="graph-action" data-graph-fit>Fit</button>
                    <span class="graph-status" data-graph-status-text></span>
                </div>
                <div class="graph-root is-booting" data-graph-json="graph-data">
                    <div class="graph-boot" data-graph-boot role="status" aria-live="polite" aria-busy="true">
                        <span class="graph-boot-spinner" aria-hidden="true"></span>
                        <p>Initialising graph…</p>
                    </div>
                </div>
                <script id="graph-data" type="application/json">{}</script>
            </section>"#,
            escape_html(&cluster.label),
            escape_html(&cluster.description),
            escape_html(&cluster.kind),
            cluster.counts.ideas,
            cluster.counts.files,
            stringify_json(&graph)
        ),
    })
}

pub fn render_print_home_page(snapshot: &ExportSnapshot) -> String {
    let current_path = snapshot.manifest.print_home.path.as_str();
    let cards = snapshot
        .ideas
        .iter()
        .map(|idea| {
            let anchor_id = export_idea_anchor_id(idea);
            format!(
                r##"<article class="print-card print-break-avoid" id="{}"><h3><a href="#{}">{}</a></h3><p class="subtle">{}</p><p>{}</p>{}</article>"##,
                escape_html(&anchor_id),
                escape_html(&anchor_id),
                escape_html(&idea.name),
                escape_html(&idea.file_uri),
                render_idea_summary_html(snapshot, current_path, idea, "—", true),
                render_print_idea_attributes_html(snapshot, current_path, idea, true)
            )
        })
        .collect::<Vec<_>>()
        .join("");
    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::Print,
        title: format!("{} - Print", snapshot.title),
        snapshot,
        include_global_search: false,
        breadcrumbs: Vec::new(),
        body: format!(
            r#"<header class="page-header">
                <p class="eyebrow">Printable report</p>
                <h1>{}</h1>
                <p class="subtle">Generated {}</p>
                <div class="toolbar">
                    <p class="subtle">{} ideas</p>
                    <div class="actions">
                        <button type="button" class="print-button hide-on-print" onclick="window.print()">Print</button>
                    </div>
                </div>
            </header>
            <section class="grid">
                {}
                {}
                {}
                {}
            </section>
            <section class="panel print-break-avoid">
                <h2>Status rollup</h2>
                <div class="scroll-window">{}</div>
            </section>
            <section class="entity-list">{cards}</section>"#,
            escape_html(&snapshot.title),
            escape_html(&format_date(&snapshot.generated_at)),
            snapshot.ideas.len(),
            render_metric("Ideas", &snapshot.counts.ideas.to_string(), None),
            render_metric("References", &snapshot.counts.edges.to_string(), None),
            render_metric("Files", &snapshot.counts.files.to_string(), None),
            render_metric("Clusters", &snapshot.counts.clusters.to_string(), None),
            render_definition_list(&snapshot.by_status, None)
        ),
    })
}

pub fn render_print_idea_page(snapshot: &ExportSnapshot, idea: &ExportIdea) -> String {
    let current_path = idea
        .page
        .printable_path
        .as_deref()
        .unwrap_or(snapshot.manifest.print_home.path.as_str());
    let interactive = if snapshot.page_options.include_idea_pages {
        format!(
            r#"<p><strong>Interactive page:</strong> <a href="{}">{}</a></p>"#,
            escape_html(&export_href(snapshot, current_path, &idea.page.path)),
            escape_html(&idea.name)
        )
    } else {
        String::new()
    };
    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::Print,
        title: format!("{} - {} print", snapshot.title, idea.name),
        snapshot,
        include_global_search: false,
        breadcrumbs: Vec::new(),
        body: format!(
            r#"<header class="page-header">
                <p class="eyebrow">Printable idea sheet</p>
                <h1 id="{}">{}</h1>
                <p class="subtle">{}:{}</p>
                <div class="toolbar">
                    <div></div>
                    <div class="actions">
                        <button type="button" class="print-button hide-on-print" onclick="window.print()">Print</button>
                    </div>
                </div>
            </header>
            <section class="print-card print-break-avoid">
                <p class="idea-summary">{}</p>
                {}
                {interactive}
            </section>"#,
            escape_html(&export_idea_anchor_id(idea)),
            escape_html(&idea.name),
            escape_html(&idea.file_uri),
            idea.line_start + 1,
            render_idea_summary_html(snapshot, current_path, idea, "No summary provided.", false),
            render_print_idea_attributes_html(snapshot, current_path, idea, false)
        ),
    })
}

pub fn render_print_file_page(snapshot: &ExportSnapshot, file: &ExportFile) -> String {
    let current_path = file.print_page.path.as_str();
    let rows = file
        .ideas
        .iter()
        .map(|idea| {
            let name = if snapshot.page_options.include_idea_pages {
                format!(
                    r#"<a href="{}">{}</a>"#,
                    escape_html(&export_href(snapshot, current_path, &idea.page.path)),
                    escape_html(&idea.name)
                )
            } else {
                escape_html(&idea.name)
            };
            format!(
                "<tr><td>{name}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
                render_optional_status_cell(idea),
                render_optional_tags_cell(idea),
                escape_html(&idea.summary)
            )
        })
        .collect::<Vec<_>>()
        .join("");
    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::Print,
        title: format!("{} - {} print", snapshot.title, file.name),
        snapshot,
        include_global_search: false,
        breadcrumbs: Vec::new(),
        body: format!(
            r#"<header class="page-header">
                <p class="eyebrow">Printable file sheet</p>
                <h1>{}</h1>
                <p class="subtle">{}</p>
            </header>
            <section class="table-shell">
                <table>
                    <thead><tr><th>Idea</th><th>Status</th><th>Tags</th><th>Summary</th></tr></thead>
                    <tbody>{rows}</tbody>
                </table>
            </section>"#,
            escape_html(&file.name),
            escape_html(&file.file_uri)
        ),
    })
}

pub fn render_print_code_file_page(snapshot: &ExportSnapshot, file: &ExportCodeFile) -> String {
    let current_path = file.print_page.path.as_str();
    let referencing: Vec<&ExportIdea> = file
        .referencing_idea_ids
        .iter()
        .filter_map(|id| snapshot.ideas_by_id.get(id))
        .collect();
    let rows = if referencing.is_empty() {
        r#"<tr><td colspan="4" class="subtle">No referencing ideas.</td></tr>"#.into()
    } else {
        referencing
            .iter()
            .map(|idea| {
                let name = if snapshot.page_options.include_idea_pages {
                    format!(
                        r#"<a href="{}">{}</a>"#,
                        escape_html(&export_href(snapshot, current_path, &idea.page.path)),
                        escape_html(&idea.name)
                    )
                } else {
                    escape_html(&idea.name)
                };
                format!(
                    "<tr><td>{name}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
                    render_optional_status_cell(idea),
                    render_optional_tags_cell(idea),
                    escape_html(&idea.summary)
                )
            })
            .collect::<Vec<_>>()
            .join("")
    };
    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::Print,
        title: format!("{} - {} print", snapshot.title, file.name),
        snapshot,
        include_global_search: false,
        breadcrumbs: Vec::new(),
        body: format!(
            r#"<header class="page-header">
                <p class="eyebrow">Printable code reference sheet</p>
                <h1>{}</h1>
                <p class="subtle">{}</p>
            </header>
            <section class="table-shell">
                <table>
                    <thead><tr><th>Idea</th><th>Status</th><th>Tags</th><th>Summary</th></tr></thead>
                    <tbody>{rows}</tbody>
                </table>
            </section>"#,
            escape_html(&file.name),
            escape_html(&file.file_uri)
        ),
    })
}

pub fn render_print_cluster_page(snapshot: &ExportSnapshot, cluster: &ExportCluster) -> String {
    let current_path = cluster
        .page
        .printable_path
        .as_deref()
        .unwrap_or(snapshot.manifest.print_home.path.as_str());
    let members: Vec<&ExportIdea> = cluster
        .idea_ids
        .iter()
        .filter_map(|id| snapshot.ideas_by_id.get(id))
        .collect();
    let rows = members
        .iter()
        .map(|idea| {
            let name = if snapshot.page_options.include_idea_pages {
                format!(
                    r#"<a href="{}">{}</a>"#,
                    escape_html(&export_href(snapshot, current_path, &idea.page.path)),
                    escape_html(&idea.name)
                )
            } else {
                escape_html(&idea.name)
            };
            format!(
                "<tr><td>{name}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
                escape_html(&idea.file_uri),
                render_optional_status_cell(idea),
                escape_html(&idea.summary)
            )
        })
        .collect::<Vec<_>>()
        .join("");
    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::Print,
        title: format!("{} - {} print", snapshot.title, cluster.label),
        snapshot,
        include_global_search: false,
        breadcrumbs: Vec::new(),
        body: format!(
            r#"<header class="page-header">
                <p class="eyebrow">Printable cluster sheet</p>
                <h1>{}</h1>
                <p class="subtle">{}</p>
            </header>
            <section class="table-shell">
                <table>
                    <thead><tr><th>Idea</th><th>File</th><th>Status</th><th>Summary</th></tr></thead>
                    <tbody>{rows}</tbody>
                </table>
            </section>"#,
            escape_html(&cluster.label),
            escape_html(&cluster.description)
        ),
    })
}

fn render_reference_section(
    snapshot: &ExportSnapshot,
    current_path: &str,
    id: &str,
    title: &str,
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
    format!(
        r#"<section class="table-shell print-break-avoid" id="{}">
            <div class="toolbar"><h2>{}</h2></div>
            <div class="scroll-window">
                <table>
                    <thead><tr><th>Kind</th><th>Idea</th><th>Path</th><th>Snippet</th></tr></thead>
                    <tbody>{body}</tbody>
                </table>
            </div>
        </section>"#,
        escape_html(id),
        escape_html(title)
    )
}

fn enrich_graph_urls(snapshot: &ExportSnapshot, graph: &GraphViewSlice, _current_path: &str) -> GraphViewSlice {
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
            if let Some((page, kind)) = resolve_export_file_page(snapshot, None, Some(&idea.file_uri)) {
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

fn render_idea_attributes(snapshot: &ExportSnapshot, current_path: &str, idea: &ExportIdea) -> String {
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
                        export_page_href(snapshot, current_path, &snapshot.manifest.attributes_index),
                        slug_attribute_key(key)
                    )
                });
            format!(
                "<tr><td><a href=\"{}\">{}</a></td><td>{}</td></tr>",
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

fn render_shell(options: RenderOptions<'_>) -> String {
    let stylesheet_href = export_href(options.snapshot, options.current_path, "assets/styles.css");
    let app_href = export_href(options.snapshot, options.current_path, "assets/app.js");
    let search_index_href = export_href(options.snapshot, options.current_path, "assets/search-index.js");
    let search_href = export_href(
        options.snapshot,
        options.current_path,
        &options.snapshot.manifest.data_search.path,
    );
    let include_global_search =
        options.include_global_search && options.snapshot.runtime_mode == "interactive";
    let header_link = options
        .snapshot
        .header_link
        .as_ref()
        .map(|link| {
            format!(
                r#"<a class="brand-link" href="{}">{}</a>"#,
                escape_html(&link.href),
                escape_html(&link.label)
            )
        })
        .unwrap_or_default();
    let nav_links = [
        nav_link(&options, ActiveNav::Overview, &options.snapshot.manifest.home, true),
        nav_link(&options, ActiveNav::Ideas, &options.snapshot.manifest.ideas_index, true),
        nav_link(
            &options,
            ActiveNav::Files,
            &options.snapshot.manifest.files_index,
            options.snapshot.page_options.include_file_pages,
        ),
        nav_link(
            &options,
            ActiveNav::CodeFiles,
            &options.snapshot.manifest.code_files_index,
            options.snapshot.page_options.include_code_file_pages,
        ),
        nav_link(
            &options,
            ActiveNav::Clusters,
            &options.snapshot.manifest.clusters_index,
            options.snapshot.page_options.include_cluster_pages,
        ),
        nav_link(&options, ActiveNav::Attributes, &options.snapshot.manifest.attributes_index, true),
        nav_link(
            &options,
            ActiveNav::Graph,
            &options.snapshot.manifest.graph,
            options.snapshot.page_options.include_graph_page && options.snapshot.runtime_mode != "print",
        ),
        nav_link(
            &options,
            ActiveNav::Print,
            &options.snapshot.manifest.print_home,
            options.snapshot.page_options.include_print_pages,
        ),
    ]
    .into_iter()
    .collect::<String>();
    let breadcrumbs = if options.breadcrumbs.is_empty() {
        String::new()
    } else {
        let items = options
            .breadcrumbs
            .iter()
            .map(|(label, href)| {
                if let Some(href) = href {
                    format!(r#"<a href="{}">{}</a>"#, escape_html(href), escape_html(label))
                } else {
                    format!("<span>{}</span>", escape_html(label))
                }
            })
            .collect::<Vec<_>>()
            .join("<span>/</span>");
        format!(r#"<nav class="breadcrumbs">{items}</nav>"#)
    };
    let interactive_scripts = if options.snapshot.runtime_mode == "print" {
        String::new()
    } else {
        format!(
            r#"
    <script src="{}"></script>
    <script src="{}"></script>"#,
            escape_html(&search_index_href),
            escape_html(&app_href)
        )
    };
    let search_box = if include_global_search {
        r#"<div><input class="searchbar" type="search" placeholder="Search ideas, files, clusters, tags, statuses" data-global-search /></div>"#
    } else {
        ""
    };
    let search_results = if include_global_search {
        r#"<div class="search-results hidden" data-search-results></div>"#
    } else {
        ""
    };
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{}</title>
    <link rel="stylesheet" href="{}" />
</head>
<body data-runtime-mode="{}" data-search-index="{}">
    <main class="layout">
        <header class="topbar">
            <div class="topbar-inner">
                <div class="nav">{header_link}{nav_links}</div>
                {search_box}
            </div>
            {search_results}
        </header>
        {breadcrumbs}
        {}
    </main>{interactive_scripts}
</body>
</html>"#,
        escape_html(&options.title),
        escape_html(&stylesheet_href),
        escape_html(&options.snapshot.runtime_mode),
        escape_html(&search_href),
        options.body
    )
}

fn nav_link(options: &RenderOptions<'_>, nav_id: ActiveNav, page: &ExportPageInfo, enabled: bool) -> String {
    if !enabled {
        return String::new();
    }
    let href = export_page_href(options.snapshot, options.current_path, page);
    let active = if options.active_nav == nav_id { "active" } else { "" };
    format!(
        r#"<a class="{active}" href="{}">{}</a>"#,
        escape_html(&href),
        escape_html(&page.title)
    )
}

fn render_maybe_linked_card(enabled: bool, href: &str, title: &str, subtitle: &str) -> String {
    if enabled {
        format!(
            r#"<a class="entity-card" href="{}"><strong>{}</strong><p class="subtle">{}</p></a>"#,
            escape_html(href),
            escape_html(title),
            escape_html(subtitle)
        )
    } else {
        format!(
            r#"<div class="entity-card"><strong>{}</strong><p class="subtle">{}</p></div>"#,
            escape_html(title),
            escape_html(subtitle)
        )
    }
}

fn render_idea_anchor(snapshot: &ExportSnapshot, current_path: &str, idea: &ExportIdea, label: &str) -> String {
    if snapshot.page_options.include_idea_pages {
        format!(
            r#"<a href="{}">{}</a>"#,
            escape_html(&export_page_href(snapshot, current_path, &idea.page)),
            escape_html(label)
        )
    } else {
        escape_html(label)
    }
}
