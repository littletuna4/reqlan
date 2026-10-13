//! Index list page templates.

use crate::html_template::common::{render_idea_anchor, render_katz_cell};
use crate::html_template::layout::render_layout_card_with_actions;
use crate::html_template::shell::{export_page_href, render_shell, ActiveNav, RenderOptions};
use crate::html_utils::{
    escape_html, idea_status, idea_tags, list_filter_href, render_file_path_cell,
    render_idea_summary_html, render_linked_status_cell, render_linked_tags_cell,
    slug_attribute_key, status_or_tag_facet_href,
};
use crate::types::ExportSnapshot;

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
                r#"<tr data-filter-row="ideas" data-filter-text="{}"><td><strong>{}</strong></td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td class="count">{}</td><td class="count">{}</td>{}</tr>"#,
                escape_html(&filter_text),
                render_idea_anchor(snapshot, current_path, idea, &idea.name),
                render_file_path_cell(snapshot, current_path, &idea.file_uri),
                render_linked_status_cell(snapshot, current_path, idea),
                render_linked_tags_cell(snapshot, current_path, idea),
                render_idea_summary_html(snapshot, current_path, idea, "—", false),
                idea.references.inbound.len(),
                idea.references.outbound.len(),
                render_katz_cell(idea.katz_centrality)
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
            <div data-layout-group="ideas-index">{}</div>"#,
            escape_html(&snapshot.title),
            render_layout_card_with_actions(
                "ideas-table",
                "section",
                "table-shell",
                "Ideas",
                "Searchable list of all exported ideas.",
                r#"<input class="searchbar" type="search" placeholder="Filter ideas by name, path, status, tags, or summary" data-filter-input="ideas" />"#,
                &format!(
                    r#"<table>
                    <thead>
                        <tr>
                            <th data-filter-key="name">Name</th>
                            <th data-filter-key="path">Path</th>
                            <th data-filter-key="status">Status</th>
                            <th data-filter-key="tags">Tags</th>
                            <th data-filter-key="summary">Summary</th>
                            <th data-filter-key="in">In</th>
                            <th data-filter-key="out">Out</th>
                            <th data-filter-key="katz">Katz</th>
                        </tr>
                    </thead>
                    <tbody>{rows}</tbody>
                </table>"#
                ),
                "",
            )
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
            <div data-layout-group="files-index">{}</div>"#,
            escape_html(&snapshot.title),
            render_layout_card_with_actions(
                "files-table",
                "section",
                "table-shell",
                "Files",
                "List of source files with idea and reference counts.",
                r#"<input class="searchbar" type="search" placeholder="Filter files by path or tags" data-filter-input="files" />"#,
                &format!(
                    r#"<table>
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
                </table>"#
                ),
                "",
            )
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
            <div data-layout-group="code-files-index">{}</div>"#,
            escape_html(&snapshot.title),
            render_layout_card_with_actions(
                "code-files-table",
                "section",
                "table-shell",
                "Code files",
                "Outbound code file references that are not idea-hosting files.",
                r#"<input class="searchbar" type="search" placeholder="Filter code files by path or label" data-filter-input="codeFiles" />"#,
                &format!(
                    r#"<table>
                    <thead>
                        <tr>
                            <th data-filter-key="file">File</th>
                            <th data-filter-key="directory">Directory</th>
                            <th data-filter-key="referenced-by">Referenced by</th>
                            <th data-filter-key="labels">Labels</th>
                        </tr>
                    </thead>
                    <tbody>{rows}</tbody>
                </table>"#
                ),
                "",
            )
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
            <div data-layout-group="clusters-index">{}</div>"#,
            escape_html(&snapshot.title),
            render_layout_card_with_actions(
                "clusters-table",
                "section",
                "table-shell",
                "Clusters",
                "Deterministic and computed groupings for exploration.",
                r#"<input class="searchbar" type="search" placeholder="Filter clusters by label, kind, or description" data-filter-input="clusters" />"#,
                &format!(
                    r#"<table>
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
                </table>"#
                ),
                "",
            )
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
            <div data-layout-group="attributes-index">{}</div>"#,
            escape_html(&snapshot.title),
            render_layout_card_with_actions(
                "attributes-table",
                "section",
                "table-shell",
                "Attributes",
                "Every attribute key with values and idea counts.",
                r#"<input class="searchbar" type="search" placeholder="Filter attributes by key or value" data-filter-input="attributes" />"#,
                &format!(
                    r#"<table>
                    <thead><tr><th data-filter-key="attribute">Attribute</th><th data-filter-key="ideas">Ideas</th><th data-filter-key="values">Values</th><th data-filter-key="value-summary">Value summary</th></tr></thead>
                    <tbody>{rows}</tbody>
                </table>"#
                ),
                "",
            )
        ),
    })
}
