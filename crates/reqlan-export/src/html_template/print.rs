//! Printable page templates.
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_print_body_whitespace]

use crate::html_template::common::{format_katz, render_katz_cell};
use crate::html_template::shell::{export_href, render_shell, ActiveNav, RenderOptions};
use crate::html_utils::{
    escape_html, export_idea_anchor_id, format_date, render_definition_list,
    render_idea_summary_html, render_metric, render_optional_status_cell,
    render_optional_tags_cell, render_print_idea_attributes_html,
};
use crate::types::{ExportCluster, ExportCodeFile, ExportFile, ExportIdea, ExportSnapshot};

pub fn render_print_home_page(snapshot: &ExportSnapshot) -> String {
    let current_path = snapshot.manifest.print_home.path.as_str();
    let cards = snapshot
        .ideas
        .iter()
        .map(|idea| {
            let anchor_id = export_idea_anchor_id(idea);
            format!(
                r##"<article class="print-card print-break-avoid" id="{}"><h3><a href="#{}">{}</a></h3><p class="subtle">{}</p><p class="print-idea-body">{}</p>{}</article>"##,
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

// rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_print_body_whitespace]
pub fn render_print_idea_page(snapshot: &ExportSnapshot, idea: &ExportIdea) -> String {
    let current_path =
        idea.page.printable_path.as_deref().unwrap_or(snapshot.manifest.print_home.path.as_str());
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
                <p><strong>Katz</strong> {}</p>
                <p class="print-idea-body">{}</p>
                {}
                {interactive}
            </section>"#,
            escape_html(&export_idea_anchor_id(idea)),
            escape_html(&idea.name),
            escape_html(&idea.file_uri),
            idea.line_start + 1,
            format_katz(idea.katz_centrality),
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
                "<tr><td>{name}</td><td>{}</td><td>{}</td><td>{}</td>{}</tr>",
                render_optional_status_cell(idea),
                render_optional_tags_cell(idea),
                escape_html(&idea.summary),
                render_katz_cell(idea.katz_centrality)
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
                    <thead><tr><th>Idea</th><th>Status</th><th>Tags</th><th>Summary</th><th>Katz</th></tr></thead>
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
    let referencing: Vec<&ExportIdea> =
        file.referencing_idea_ids.iter().filter_map(|id| snapshot.ideas_by_id.get(id)).collect();
    let rows = if referencing.is_empty() {
        r#"<tr><td colspan="5" class="subtle">No referencing ideas.</td></tr>"#.into()
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
                    "<tr><td>{name}</td><td>{}</td><td>{}</td><td>{}</td>{}</tr>",
                    render_optional_status_cell(idea),
                    render_optional_tags_cell(idea),
                    escape_html(&idea.summary),
                    render_katz_cell(idea.katz_centrality)
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
                    <thead><tr><th>Idea</th><th>Status</th><th>Tags</th><th>Summary</th><th>Katz</th></tr></thead>
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
    let members: Vec<&ExportIdea> =
        cluster.idea_ids.iter().filter_map(|id| snapshot.ideas_by_id.get(id)).collect();
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
                "<tr><td>{name}</td><td>{}</td><td>{}</td><td>{}</td>{}</tr>",
                escape_html(&idea.file_uri),
                render_optional_status_cell(idea),
                escape_html(&idea.summary),
                render_katz_cell(idea.katz_centrality)
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
                    <thead><tr><th>Idea</th><th>File</th><th>Status</th><th>Summary</th><th>Katz</th></tr></thead>
                    <tbody>{rows}</tbody>
                </table>
            </section>"#,
            escape_html(&cluster.label),
            escape_html(&cluster.description)
        ),
    })
}
