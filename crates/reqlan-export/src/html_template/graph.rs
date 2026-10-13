//! Workspace graph page template.

use crate::html_template::common::{enrich_graph_urls, render_multi_filter_select};
use crate::html_template::layout::render_layout_card_with_actions;
use crate::html_template::shell::{export_page_href, render_shell, ActiveNav, RenderOptions};
use crate::html_utils::{escape_html, stringify_json};
use crate::types::ExportSnapshot;

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
            <div data-layout-group="graph-page">{}</div>"#,
            escape_html(&snapshot.title),
            render_layout_card_with_actions(
                "workspace-graph",
                "section",
                "graph-shell layout-card-span-full",
                "Reference graph",
                "Workspace graph with filters and links into idea pages.",
                &format!(
                    r#"<a class="pill" href="{}">Graph JSON</a>"#,
                    escape_html(&export_page_href(
                        snapshot,
                        current_path,
                        &snapshot.manifest.data_graph
                    ))
                ),
                &format!(
                    r#"<div class="graph-controls-bar" data-graph-controls="graph-data">
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
                <script id="graph-data" type="application/json">{}</script>"#,
                    render_multi_filter_select("status", &snapshot.by_status, "Filter by status"),
                    render_multi_filter_select("tag", &snapshot.by_tag, "Filter by tag"),
                    stringify_json(&graph)
                ),
                "",
            )
        ),
    })
}
