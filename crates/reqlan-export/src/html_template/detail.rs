//! Detail page templates.

use crate::html_template::common::{
    enrich_graph_urls, format_katz, render_idea_anchor, render_idea_attributes, render_katz_cell,
    render_maybe_linked_card, render_reference_section,
};
use crate::html_template::layout::{
    heading_tip_attr, render_entity_layout_card, render_layout_card,
    render_layout_card_with_actions,
};
use crate::html_template::shell::{
    export_href, export_page_href, render_shell, ActiveNav, RenderOptions,
};
use crate::html_utils::{
    escape_html, file_by_idea, idea_status, idea_tags, list_filter_href, related_clusters,
    render_file_path_cell, render_idea_summary_html, render_linked_status_cell,
    render_linked_tags_cell, render_metric, stringify_json,
};
use crate::types::{
    format_attribute_value, ExportAttribute, ExportCluster, ExportCodeFile, ExportFile, ExportIdea,
    ExportSnapshot, GraphViewSlice,
};

pub fn render_attribute_detail_page(
    snapshot: &ExportSnapshot,
    attribute: &ExportAttribute,
) -> String {
    let current_path = attribute.page.path.as_str();
    let ideas: Vec<&ExportIdea> =
        attribute.idea_ids.iter().filter_map(|id| snapshot.ideas_by_id.get(id)).collect();
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
        r#"<tr><td colspan="6" class="subtle">No ideas declare this attribute.</td></tr>"#.into()
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
                    r#"<tr data-filter-row="attributeIdeas" data-filter-text="{}"><td>{}</td><td data-sort-value="{}"><a href="{}">{}</a></td><td>{}</td><td>{}</td><td>{}</td>{}</tr>"#,
                    escape_html(&format!("{} {value} {} {} {}", idea.name, idea_status(idea).unwrap_or_default(), idea_tags(idea).join(" "), idea.summary)),
                    render_idea_anchor(snapshot, current_path, idea, &idea.name),
                    escape_html(&value),
                    escape_html(&list_filter_href(snapshot, current_path, &attribute.page, &[("value", value.as_str())])),
                    escape_html(&value),
                    render_linked_status_cell(snapshot, current_path, idea),
                    render_linked_tags_cell(snapshot, current_path, idea),
                    escape_html(&idea.summary),
                    render_katz_cell(idea.katz_centrality)
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
            <div class="layout-stack" data-layout-group="attribute-main">
            {}
            {}
            </div>"#,
            escape_html(&attribute.key),
            attribute.idea_count,
            attribute.values.len(),
            render_metric("Ideas", &attribute.idea_count.to_string(), None),
            render_metric("Values", &attribute.values.len().to_string(), None),
            render_layout_card_with_actions(
                "attribute-values",
                "section",
                "table-shell layout-card-span-full",
                "Value distribution",
                "How often each value appears on this attribute.",
                r#"<input class="searchbar" type="search" placeholder="Filter values" data-filter-input="attributeValues" />"#,
                &format!(
                    r#"<div class="scroll-window">
                    <table>
                        <thead><tr><th data-filter-key="value">Value</th><th data-filter-key="distribution">Distribution</th><th data-filter-key="ideas">Ideas</th><th data-filter-key="share">Share</th></tr></thead>
                        <tbody>{value_rows}</tbody>
                    </table>
                </div>"#
                ),
                "",
            ),
            render_layout_card_with_actions(
                "attribute-ideas",
                "section",
                "table-shell layout-card-span-full",
                "Ideas with this attribute",
                "Ideas that declare this attribute key.",
                r#"<input class="searchbar" type="search" placeholder="Filter ideas by name, value, status, or tags" data-filter-input="attributeIdeas" />"#,
                &format!(
                    r#"<table>
                    <thead><tr><th data-filter-key="idea">Idea</th><th data-filter-key="value">Value</th><th data-filter-key="status">Status</th><th data-filter-key="tags">Tags</th><th data-filter-key="summary">Summary</th><th data-filter-key="katz">Katz</th></tr></thead>
                    <tbody>{idea_rows}</tbody>
                </table>"#
                ),
                "",
            )
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
            let href = export_page_href(snapshot, current_path, &file.page);
            let href_opt = snapshot.page_options.include_file_pages.then_some(href);
            render_entity_layout_card(
                "nav-source-file",
                href_opt.as_deref(),
                "Source file",
                &file.file_uri,
                &file.file_uri,
                "",
            )
        })
        .unwrap_or_default();
    let cluster_cards = clusters
        .iter()
        .map(|cluster| {
            let href = export_page_href(snapshot, current_path, &cluster.page);
            let href_opt = snapshot.page_options.include_cluster_pages.then_some(href);
            let subtitle = format!("{} cluster", cluster.kind);
            render_entity_layout_card(
                &format!("nav-cluster-{}", cluster.id),
                href_opt.as_deref(),
                &cluster.label,
                &subtitle,
                &subtitle,
                "",
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
            let href = export_href(snapshot, current_path, path);
            render_entity_layout_card(
                "nav-print",
                Some(href.as_str()),
                "Printable page",
                "Static print-friendly idea sheet.",
                "Static print-friendly idea sheet.",
                "",
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
                    let href = export_page_href(snapshot, current_path, &linked.page);
                    let href_opt = snapshot.page_options.include_idea_pages.then_some(href);
                    render_entity_layout_card(
                        &format!("ancestor-{}", linked.id),
                        href_opt.as_deref(),
                        &ancestor.name,
                        &ancestor.summary,
                        &ancestor.summary,
                        "",
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
                <h1 id="summary"{}>{}</h1>
                <p class="subtle">{}:{}</p>
                <div class="pill-row">
                    <span class="pill">{}</span>
                    {status_pill}
                    {tag_pills}
                </div>
            </header>
            <section class="grid">{}</section>
            <div class="layout-stack" data-layout-group="idea-main">
            {}
            {}
            {}
            {}
            {}
            {}
            {}
            {}
            </div>"##,
            heading_tip_attr(idea.summary.trim()),
            escape_html(&idea.name),
            escape_html(&idea.file_uri),
            idea.line_start + 1,
            escape_html(&idea.kind),
            render_metric("Katz", &format_katz(idea.katz_centrality), None),
            render_layout_card(
                "idea-summary",
                "div",
                "panel prose print-break-avoid",
                "Summary",
                "Idea body and quick jumps to references.",
                &format!(
                    r##"<p class="idea-summary">{}</p>
                    <p><a class="section-link" href="#references-out">Jump to outbound references</a></p>
                    <p><a class="section-link" href="#references-in">Jump to inbound references</a></p>"##,
                    render_idea_summary_html(
                        snapshot,
                        current_path,
                        idea,
                        "No summary provided.",
                        false
                    ),
                ),
                "",
            ),
            render_layout_card(
                "idea-navigation",
                "div",
                "panel print-break-avoid",
                "Navigation",
                "Links to the source file, clusters, and print sheet.",
                &format!(
                    r#"<div class="entity-list" data-layout-group="idea-nav-cards">{file_card}{cluster_cards}{print_card}</div>"#
                ),
                "",
            ),
            render_layout_card(
                "attributes",
                "div",
                "panel print-break-avoid",
                "Attributes",
                "Declared metadata on this idea.",
                &render_idea_attributes(snapshot, current_path, idea),
                r#"id="attributes""#,
            ),
            render_layout_card(
                "ancestor-context",
                "div",
                "panel print-break-avoid",
                "Ancestor context",
                "Parent ideas in the containment chain.",
                &format!(
                    r#"<div class="scroll-window"><div class="entity-list" data-layout-group="idea-ancestors">{ancestors}</div></div>"#
                ),
                "",
            ),
            render_reference_section(
                snapshot,
                current_path,
                "references-out",
                "Outbound references",
                "Ideas and files this idea references.",
                &idea.references.outbound
            ),
            render_reference_section(
                snapshot,
                current_path,
                "references-in",
                "Inbound references",
                "Ideas that reference this idea.",
                &idea.references.inbound
            ),
            render_reference_section(
                snapshot,
                current_path,
                "references-unresolved",
                "Unresolved references",
                "References that did not resolve.",
                &idea.references.unresolved
            ),
            render_layout_card(
                "graph",
                "section",
                "graph-shell print-break-avoid layout-card-span-full",
                "Local graph",
                "Neighbourhood graph for this idea.",
                &format!(
                    r#"<div class="graph-controls-bar" data-graph-controls="graph-data">
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
                <script id="graph-data" type="application/json">{}</script>"#,
                    stringify_json(&graph)
                ),
                r#"id="graph""#,
            ),
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
                r#"<tr data-filter-row="fileIdeas" data-filter-text="{}"><td>{}</td><td>{}</td><td>{}</td><td>{}</td>{}</tr>"#,
                escape_html(&format!("{} {} {} {}", idea.name, idea.summary, idea_status(idea).unwrap_or_default(), idea_tags(idea).join(" "))),
                render_idea_anchor(snapshot, current_path, idea, &idea.name),
                render_linked_status_cell(snapshot, current_path, idea),
                render_linked_tags_cell(snapshot, current_path, idea),
                escape_html(&idea.summary),
                render_katz_cell(idea.katz_centrality)
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
            <div class="layout-stack" data-layout-group="file-main">
            {}
            {}
            {}
            </div>"#,
            escape_html(&file.name),
            escape_html(&file.file_uri),
            render_metric("Ideas", &file.ideas.len().to_string(), None),
            render_metric("References", &file.edge_count.to_string(), None),
            render_metric("Statuses", &file.statuses.len().to_string(), None),
            render_metric("Tags", &file.tags.len().to_string(), None),
            render_layout_card_with_actions(
                "file-ideas",
                "div",
                "table-shell layout-card-span-full",
                "Ideas in file",
                "Ideas declared in this file.",
                r#"<input class="searchbar" type="search" placeholder="Filter file ideas" data-filter-input="fileIdeas" />"#,
                &format!(
                    r#"<div class="scroll-window">
                        <table>
                            <thead><tr><th data-filter-key="idea">Idea</th><th data-filter-key="status">Status</th><th data-filter-key="tags">Tags</th><th data-filter-key="summary">Summary</th><th data-filter-key="katz">Katz</th></tr></thead>
                            <tbody>{idea_rows}</tbody>
                        </table>
                    </div>"#
                ),
                "",
            ),
            render_layout_card(
                "file-clusters",
                "div",
                "panel",
                "Related clusters",
                "Clusters that include this file.",
                &format!(
                    r#"<div class="scroll-window"><div class="entity-list" data-layout-group="file-cluster-cards">{}</div></div>"#,
                    if cluster_links.is_empty() {
                        r#"<p class="subtle">No related clusters.</p>"#.into()
                    } else {
                        cluster_links
                    }
                ),
                "",
            ),
            render_layout_card(
                "file-graph",
                "section",
                "graph-shell print-break-avoid layout-card-span-full",
                "Local graph",
                "Neighbourhood graph for this file.",
                &format!(
                    r#"<div class="graph-controls-bar" data-graph-controls="graph-data">
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
                <script id="graph-data" type="application/json">{}</script>"#,
                    stringify_json(&graph)
                ),
                "",
            ),
        ),
    })
}

pub fn render_code_file_detail_page(snapshot: &ExportSnapshot, file: &ExportCodeFile) -> String {
    let current_path = file.page.path.as_str();
    let referencing: Vec<&ExportIdea> =
        file.referencing_idea_ids.iter().filter_map(|id| snapshot.ideas_by_id.get(id)).collect();
    let rows = if referencing.is_empty() {
        r#"<tr><td colspan="5" class="subtle">No referencing ideas.</td></tr>"#.into()
    } else {
        referencing
            .iter()
            .map(|idea| {
                format!(
                    r#"<tr data-filter-row="codeFileIdeas" data-filter-text="{}"><td>{}</td><td>{}</td><td>{}</td><td>{}</td>{}</tr>"#,
                    escape_html(&format!("{} {} {} {}", idea.name, idea.summary, idea_status(idea).unwrap_or_default(), idea_tags(idea).join(" "))),
                    render_idea_anchor(snapshot, current_path, idea, &idea.name),
                    render_linked_status_cell(snapshot, current_path, idea),
                    render_linked_tags_cell(snapshot, current_path, idea),
                    escape_html(&idea.summary),
                    render_katz_cell(idea.katz_centrality)
                )
            })
            .collect::<Vec<_>>()
            .join("")
    };
    let labels = if file.labels.is_empty() {
        String::new()
    } else {
        render_layout_card(
            "code-labels",
            "section",
            "panel",
            "Reference labels",
            "Labels used when ideas reference this file.",
            &format!("<p>{}</p>", escape_html(&file.labels.join(", "))),
            "",
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
            <div class="layout-stack" data-layout-group="code-file-main">
            {}
            {labels}
            </div>"#,
            escape_html(&file.name),
            escape_html(&file.file_uri),
            render_metric("Referenced by", &referencing.len().to_string(), None),
            render_metric("Labels", &file.labels.len().to_string(), None),
            render_layout_card_with_actions(
                "code-referencing",
                "section",
                "table-shell layout-card-span-full",
                "Referencing ideas",
                "Ideas that reference this code file.",
                r#"<input class="searchbar" type="search" placeholder="Filter referencing ideas" data-filter-input="codeFileIdeas" />"#,
                &format!(
                    r#"<div class="scroll-window">
                    <table>
                        <thead><tr><th data-filter-key="idea">Idea</th><th data-filter-key="status">Status</th><th data-filter-key="tags">Tags</th><th data-filter-key="summary">Summary</th><th data-filter-key="katz">Katz</th></tr></thead>
                        <tbody>{rows}</tbody>
                    </table>
                </div>"#
                ),
                "",
            ),
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
    let members: Vec<&ExportIdea> =
        cluster.idea_ids.iter().filter_map(|id| snapshot.ideas_by_id.get(id)).collect();
    let rows = members
        .iter()
        .map(|idea| {
            format!(
                r#"<tr data-filter-row="clusterIdeas" data-filter-text="{}"><td>{}</td><td>{}</td><td>{}</td><td>{}</td>{}</tr>"#,
                escape_html(&format!("{} {} {} {}", idea.name, idea.file_uri, idea_status(idea).unwrap_or_default(), idea.summary)),
                render_idea_anchor(snapshot, current_path, idea, &idea.name),
                render_file_path_cell(snapshot, current_path, &idea.file_uri),
                render_linked_status_cell(snapshot, current_path, idea),
                escape_html(&idea.summary),
                render_katz_cell(idea.katz_centrality)
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
                <h1{}>{}</h1>
                <p class="subtle">{}</p>
                <div class="pill-row">
                    <span class="pill">{}</span>
                    <span class="pill">{} ideas</span>
                    <span class="pill">{} files</span>
                </div>
            </header>
            <div class="layout-stack" data-layout-group="cluster-main">
            {}
            {}
            </div>"#,
            heading_tip_attr(cluster.description.trim()),
            escape_html(&cluster.label),
            escape_html(&cluster.description),
            escape_html(&cluster.kind),
            cluster.counts.ideas,
            cluster.counts.files,
            render_layout_card_with_actions(
                "cluster-members",
                "section",
                "table-shell layout-card-span-full",
                "Members",
                "Ideas that belong to this cluster.",
                r#"<input class="searchbar" type="search" placeholder="Filter cluster members" data-filter-input="clusterIdeas" />"#,
                &format!(
                    r#"<div class="scroll-window">
                    <table>
                        <thead><tr><th data-filter-key="idea">Idea</th><th data-filter-key="path">File</th><th data-filter-key="status">Status</th><th data-filter-key="summary">Summary</th><th data-filter-key="katz">Katz</th></tr></thead>
                        <tbody>{rows}</tbody>
                    </table>
                </div>"#
                ),
                "",
            ),
            render_layout_card(
                "cluster-graph",
                "section",
                "graph-shell print-break-avoid layout-card-span-full",
                "Cluster graph",
                "Neighbourhood graph for this cluster.",
                &format!(
                    r#"<div class="graph-controls-bar" data-graph-controls="graph-data">
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
                <script id="graph-data" type="application/json">{}</script>"#,
                    stringify_json(&graph)
                ),
                "",
            ),
        ),
    })
}
