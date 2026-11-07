//! Manifest and page info builders.
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_multi_file]
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_header_link]

use super::util::ensure_html_file_name;
use crate::types::{ExportHeaderLink, ExportManifest, ExportPageInfo, ExportRequest};

pub(crate) fn build_manifest(request: &ExportRequest) -> ExportManifest {
    let print_file_name = ensure_html_file_name(&request.print_entry_file_name);
    ExportManifest {
        home: build_page_info("Overview", "index.html", None),
        ideas_index: build_page_info("Ideas", "ideas.html", None),
        files_index: build_page_info("Files", "files.html", None),
        clusters_index: build_page_info("Clusters", "clusters.html", None),
        attributes_index: build_page_info("Attributes", "attributes.html", None),
        code_files_index: build_page_info("Code files", "code-files.html", None),
        graph: build_page_info("Graph", "graph.html", None),
        print_home: build_page_info("Print", &print_file_name, None),
        data_export: build_page_info("Export data", "data/export.json", None),
        data_graph: build_page_info("Graph data", "data/graph.json", None),
        data_search: build_page_info("Search data", "data/search.json", None),
        data_manifest: build_page_info("Manifest data", "data/site-manifest.json", None),
    }
}

pub fn build_page_info(title: &str, path: &str, printable_path: Option<&str>) -> ExportPageInfo {
    ExportPageInfo {
        title: title.to_string(),
        path: path.to_string(),
        url: format!("./{path}"),
        section: None,
        printable_path: printable_path.map(str::to_string),
        printable_url: printable_path.map(|value| format!("./{value}")),
    }
}

pub(crate) fn normalize_header_link(link: Option<&ExportHeaderLink>) -> Option<ExportHeaderLink> {
    let link = link?;
    let href = link.href.trim();
    let label = link.label.trim();
    if href.is_empty() || label.is_empty() {
        None
    } else {
        Some(ExportHeaderLink { href: href.to_string(), label: label.to_string() })
    }
}
