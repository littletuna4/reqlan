//! Page shell, navigation, and href helpers for HTML export templates.

use crate::html_utils::{escape_html, href_for, page_href};
use crate::types::{ExportPageInfo, ExportSnapshot};

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum ActiveNav {
    Overview,
    Ideas,
    Files,
    CodeFiles,
    Clusters,
    Attributes,
    Graph,
    Print,
}

pub(crate) struct RenderOptions<'a> {
    pub(crate) current_path: &'a str,
    pub(crate) active_nav: ActiveNav,
    pub(crate) title: String,
    pub(crate) body: String,
    pub(crate) snapshot: &'a ExportSnapshot,
    pub(crate) breadcrumbs: Vec<(String, Option<String>)>,
    pub(crate) include_global_search: bool,
}

pub(crate) fn export_href(
    snapshot: &ExportSnapshot,
    current_path: &str,
    target_path: &str,
) -> String {
    href_for(current_path, target_path, snapshot.url_base.as_deref())
}

pub(crate) fn export_page_href(
    snapshot: &ExportSnapshot,
    current_path: &str,
    page: &ExportPageInfo,
) -> String {
    page_href(current_path, page, snapshot.url_base.as_deref())
}

pub(crate) fn render_shell(options: RenderOptions<'_>) -> String {
    let stylesheet_href = export_href(options.snapshot, options.current_path, "assets/styles.css");
    let app_href = export_href(options.snapshot, options.current_path, "assets/app.js");
    let search_index_href =
        export_href(options.snapshot, options.current_path, "assets/search-index.js");
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
        nav_link(
            &options,
            ActiveNav::Attributes,
            &options.snapshot.manifest.attributes_index,
            true,
        ),
        nav_link(
            &options,
            ActiveNav::Graph,
            &options.snapshot.manifest.graph,
            options.snapshot.page_options.include_graph_page
                && options.snapshot.runtime_mode != "print",
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

fn nav_link(
    options: &RenderOptions<'_>,
    nav_id: ActiveNav,
    page: &ExportPageInfo,
    enabled: bool,
) -> String {
    if !enabled {
        return String::new();
    }
    let href = export_page_href(options.snapshot, options.current_path, page);
    let active = if options.active_nav == nav_id { "active" } else { "" };
    format!(r#"<a class="{active}" href="{}">{}</a>"#, escape_html(&href), escape_html(&page.title))
}
