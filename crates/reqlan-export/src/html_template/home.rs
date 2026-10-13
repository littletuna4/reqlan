//! Home / overview page template.

use crate::html_template::layout::{
    render_entity_layout_card, render_layout_card, render_layout_card_with_actions,
};
use crate::html_template::shell::{export_page_href, render_shell, ActiveNav, RenderOptions};
use crate::html_utils::{
    escape_html, format_date, list_filter_href, render_definition_list, render_metric,
    status_or_tag_facet_href,
};
use crate::types::ExportSnapshot;

pub fn render_home_page(snapshot: &ExportSnapshot) -> String {
    let current_path = snapshot.manifest.home.path.as_str();
    let clusters_index_href =
        export_page_href(snapshot, current_path, &snapshot.manifest.clusters_index);
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
            let prefix = format!(
                r#"<div class="pill-row"><span class="pill">{}</span><span class="pill">{} ideas</span></div>"#,
                escape_html(&cluster.kind),
                cluster.counts.ideas
            );
            render_entity_layout_card(
                &format!("cluster-{}", cluster.id),
                Some(&href),
                &cluster.label,
                &cluster.description,
                &cluster.description,
                &prefix,
            )
        })
        .collect::<Vec<_>>()
        .join("");
    let status_href =
        |key: &str| Some(status_or_tag_facet_href(snapshot, current_path, "status", key));
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
        <section class="layout-stack" data-layout-group="home-rollups">
            {}
            {}
        </section>
        {}"#,
        escape_html(&snapshot.title),
        escape_html(&snapshot.template_id),
        escape_html(&snapshot.scope),
        escape_html(&snapshot.runtime_mode),
        escape_html(&format_date(&snapshot.generated_at)),
        escape_html(&snapshot.workspace_root),
        render_metric(
            "Ideas",
            &snapshot.counts.ideas.to_string(),
            Some(&export_page_href(snapshot, current_path, &snapshot.manifest.ideas_index))
        ),
        render_metric(
            "References",
            &snapshot.counts.edges.to_string(),
            Some(&export_page_href(snapshot, current_path, &snapshot.manifest.graph))
        ),
        render_metric(
            "Files",
            &snapshot.counts.files.to_string(),
            Some(&export_page_href(snapshot, current_path, &snapshot.manifest.files_index))
        ),
        render_metric(
            "Code files",
            &snapshot.code_files.len().to_string(),
            Some(&export_page_href(snapshot, current_path, &snapshot.manifest.code_files_index))
        ),
        render_metric(
            "Clusters",
            &snapshot.counts.clusters.to_string(),
            Some(&clusters_index_href)
        ),
        render_metric(
            "Attributes",
            &snapshot.attributes.len().to_string(),
            Some(&export_page_href(snapshot, current_path, &snapshot.manifest.attributes_index))
        ),
        render_layout_card(
            "status-rollup",
            "div",
            "panel",
            "Status Rollup",
            "Counts of ideas by status.",
            &format!(
                r#"<div class="scroll-window">{}</div>"#,
                render_definition_list(&snapshot.by_status, Some(&status_href))
            ),
            "",
        ),
        render_layout_card(
            "tags-rollup",
            "div",
            "panel",
            "Tags",
            "Counts of ideas by tag.",
            &format!(
                r#"<div class="scroll-window">{}</div>"#,
                render_definition_list(&snapshot.by_tag, Some(&tag_href))
            ),
            "",
        ),
        render_layout_card_with_actions(
            "highlighted-clusters",
            "section",
            "panel",
            "Highlighted Clusters",
            "Sample clusters from this export.",
            &format!(
                r#"<a class="pill" href="{}">Printable report</a><a class="pill" href="{}">Snapshot JSON</a>"#,
                escape_html(&export_page_href(
                    snapshot,
                    current_path,
                    &snapshot.manifest.print_home
                )),
                escape_html(&export_page_href(
                    snapshot,
                    current_path,
                    &snapshot.manifest.data_export
                )),
            ),
            &format!(
                r#"<div class="entity-list" data-layout-group="home-clusters">{highlight_clusters}</div>"#
            ),
            "",
        ),
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
