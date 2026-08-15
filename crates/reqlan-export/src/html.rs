//! HTML export writes the TS page-template set and embeds existing CSS/JS assets.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".export_rust]
//! rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export]

use crate::html_template::{
    render_attribute_detail_page, render_attributes_index_page, render_cluster_detail_page,
    render_clusters_index_page, render_code_file_detail_page, render_code_files_index_page,
    render_file_detail_page, render_files_index_page, render_graph_page, render_home_page,
    render_idea_detail_page, render_ideas_index_page, render_print_cluster_page,
    render_print_code_file_page, render_print_file_page, render_print_home_page, render_print_idea_page,
};
use crate::html_utils::stringify_json;
use crate::json::ExportError;
use crate::snapshot::ensure_html_file_name;
use crate::types::{ExportRequest, ExportResult, ExportSnapshot};
use std::fs;
use std::path::Path;

const SHARED_STYLES: &str = include_str!("../assets/styles.css");
const APP_JS: &str = include_str!("../assets/app.js");

pub fn write_html_export(
    snapshot: &ExportSnapshot,
    request: &ExportRequest,
) -> Result<ExportResult, ExportError> {
    let output_dir = request.output_dir.join(&request.export_name);
    let assets_dir = output_dir.join("assets");
    let data_dir = output_dir.join("data");
    fs::create_dir_all(&assets_dir)?;
    fs::create_dir_all(&data_dir)?;
    for dir in [
        "ideas",
        "files",
        "code-files",
        "clusters",
        "attributes",
        "print/ideas",
        "print/files",
        "print/code-files",
        "print/clusters",
    ] {
        fs::create_dir_all(output_dir.join(dir))?;
    }

    let print_file_name = ensure_html_file_name(&request.print_entry_file_name);
    let index_file_path = output_dir.join(&snapshot.manifest.home.path);
    let ideas_index_file_path = output_dir.join(&snapshot.manifest.ideas_index.path);
    let files_index_file_path = output_dir.join(&snapshot.manifest.files_index.path);
    let code_files_index_file_path = output_dir.join(&snapshot.manifest.code_files_index.path);
    let clusters_index_file_path = output_dir.join(&snapshot.manifest.clusters_index.path);
    let attributes_index_file_path = output_dir.join(&snapshot.manifest.attributes_index.path);
    let print_file_path = output_dir.join(&print_file_name);
    let data_file_path = data_dir.join("export.json");
    let manifest_file_path = output_dir.join(&snapshot.manifest.data_manifest.path);
    let requirements_file_path = request.include_requirements_page.then(|| output_dir.join("requirements.html"));
    let graph_file_path = request.include_graph_page.then(|| output_dir.join("graph.html"));

    fs::write(assets_dir.join("styles.css"), SHARED_STYLES)?;
    fs::write(assets_dir.join("app.js"), APP_JS)?;
    fs::write(
        assets_dir.join("search-index.js"),
        build_search_index_script(&snapshot.search_documents),
    )?;
    fs::write(&data_file_path, stringify_json(snapshot))?;
    fs::write(data_dir.join("graph.json"), stringify_json(&snapshot.graphs.workspace))?;
    fs::write(data_dir.join("search.json"), stringify_json(&snapshot.search_documents))?;
    fs::write(
        &manifest_file_path,
        stringify_json(&serde_json::json!({
            "home": snapshot.manifest.home,
            "ideasIndex": snapshot.manifest.ideas_index,
            "filesIndex": snapshot.manifest.files_index,
            "clustersIndex": snapshot.manifest.clusters_index,
            "attributesIndex": snapshot.manifest.attributes_index,
            "codeFilesIndex": snapshot.manifest.code_files_index,
            "graph": snapshot.manifest.graph,
            "printHome": snapshot.manifest.print_home,
            "dataExport": snapshot.manifest.data_export,
            "dataGraph": snapshot.manifest.data_graph,
            "dataSearch": snapshot.manifest.data_search,
            "dataManifest": snapshot.manifest.data_manifest,
            "pageOptions": snapshot.page_options,
            "runtimeMode": snapshot.runtime_mode,
            "clusterStrategy": snapshot.cluster_strategy
        })),
    )?;

    let is_print_mode = snapshot.runtime_mode == "print";
    write_page(
        &index_file_path,
        if is_print_mode {
            render_print_home_page(snapshot)
        } else {
            render_home_page(snapshot)
        },
    )?;
    if snapshot.page_options.include_print_pages {
        write_page(&print_file_path, render_print_home_page(snapshot))?;
    }
    if !is_print_mode {
        if let Some(path) = &requirements_file_path {
            write_page(path, render_ideas_index_page(snapshot))?;
        }
        if let Some(path) = &graph_file_path {
            if snapshot.page_options.include_graph_page {
                write_page(path, render_graph_page(snapshot))?;
            }
        }
        write_page(&ideas_index_file_path, render_ideas_index_page(snapshot))?;
        if snapshot.page_options.include_file_pages {
            write_page(&files_index_file_path, render_files_index_page(snapshot))?;
        }
        if snapshot.page_options.include_code_file_pages {
            write_page(&code_files_index_file_path, render_code_files_index_page(snapshot))?;
        }
        if snapshot.page_options.include_cluster_pages {
            write_page(&clusters_index_file_path, render_clusters_index_page(snapshot))?;
        }
        write_page(&attributes_index_file_path, render_attributes_index_page(snapshot))?;
        if snapshot.page_options.include_idea_pages {
            for idea in &snapshot.ideas {
                write_page(&output_dir.join(&idea.page.path), render_idea_detail_page(snapshot, idea))?;
            }
        }
        if snapshot.page_options.include_file_pages {
            for file in &snapshot.files {
                write_page(&output_dir.join(&file.page.path), render_file_detail_page(snapshot, file))?;
            }
        }
        if snapshot.page_options.include_code_file_pages {
            for file in &snapshot.code_files {
                write_page(
                    &output_dir.join(&file.page.path),
                    render_code_file_detail_page(snapshot, file),
                )?;
            }
        }
        if snapshot.page_options.include_cluster_pages {
            for cluster in &snapshot.clusters {
                write_page(
                    &output_dir.join(&cluster.page.path),
                    render_cluster_detail_page(snapshot, cluster),
                )?;
            }
        }
        if snapshot.page_options.include_attribute_pages {
            for attribute in &snapshot.attributes {
                write_page(
                    &output_dir.join(&attribute.page.path),
                    render_attribute_detail_page(snapshot, attribute),
                )?;
            }
        }
    }
    if snapshot.page_options.include_print_pages {
        for idea in &snapshot.ideas {
            if let Some(path) = &idea.page.printable_path {
                write_page(&output_dir.join(path), render_print_idea_page(snapshot, idea))?;
            }
        }
        for file in &snapshot.files {
            write_page(
                &output_dir.join(&file.print_page.path),
                render_print_file_page(snapshot, file),
            )?;
        }
        if snapshot.page_options.include_code_file_pages {
            for file in &snapshot.code_files {
                write_page(
                    &output_dir.join(&file.print_page.path),
                    render_print_code_file_page(snapshot, file),
                )?;
            }
        }
        if snapshot.page_options.include_cluster_pages {
            for cluster in &snapshot.clusters {
                if let Some(path) = &cluster.page.printable_path {
                    write_page(&output_dir.join(path), render_print_cluster_page(snapshot, cluster))?;
                }
            }
        }
    }

    Ok(ExportResult {
        output_dir,
        index_file_path,
        print_file_path,
        data_file_path,
        requirements_file_path,
        graph_file_path: graph_file_path.filter(|_| snapshot.page_options.include_graph_page),
        ideas_index_file_path: Some(ideas_index_file_path),
        files_index_file_path: snapshot.page_options.include_file_pages.then_some(files_index_file_path),
        code_files_index_file_path: snapshot
            .page_options
            .include_code_file_pages
            .then_some(code_files_index_file_path),
        clusters_index_file_path: Some(clusters_index_file_path),
        attributes_index_file_path: Some(attributes_index_file_path),
        manifest_file_path: Some(manifest_file_path),
    })
}

fn write_page(path: &Path, html: String) -> Result<(), ExportError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, html)?;
    Ok(())
}

fn build_search_index_script(documents: &[crate::types::ExportSearchDocument]) -> String {
    format!(
        "globalThis.__REQLAN_SEARCH_INDEX__ = {};\n",
        serde_json::to_string(documents)
            .unwrap_or_else(|_| "[]".into())
            .replace('<', "\\u003c")
    )
}
