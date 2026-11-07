//! Top-level export snapshot assembly.
//! rq:["../../../../reqlan rq/core_analysis/export.rq".export_pipeline]
//! rq:["../../../../reqlan rq/core_analysis/rust_port.rq".export_rust]
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export]
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_url_base]

use super::attributes::build_attribute_records;
use super::clusters::{attach_cluster_membership, build_cluster_records, finalize_cluster_counts};
use super::files::{build_code_file_records, build_file_records};
use super::filter::filter_export_ideas;
use super::graph::build_graph_catalog;
use super::ideas::build_idea_records;
use super::manifest::{build_manifest, normalize_header_link};
use super::search::build_search_documents;
use super::util::{chrono_now, rollup_statuses, rollup_tags};
use crate::html_utils::normalize_url_base;
use crate::types::{ExportCounts, ExportPageOptions, ExportRequest, ExportSnapshot};
use reqlan_index::{IdeaSummary, IndexStore, StoreError};
use reqlan_search::{citation_edge_pairs, katz_centrality};
use std::collections::{BTreeMap, HashMap};

pub fn build_export_snapshot(
    store: &IndexStore,
    request: &ExportRequest,
) -> Result<ExportSnapshot, StoreError> {
    let title = if request.scope == "currentFile" {
        if let Some(uri) = &request.source_file_uri {
            format!("{} ({uri})", request.export_name)
        } else {
            request.export_name.clone()
        }
    } else {
        request.export_name.clone()
    };
    let runtime_mode = if request.runtime_mode.is_empty() {
        "interactive".into()
    } else {
        request.runtime_mode.clone()
    };
    let cluster_strategy = if request.cluster_strategy.is_empty() {
        "hybrid".into()
    } else {
        request.cluster_strategy.clone()
    };
    let url_base = normalize_url_base(request.url_base.as_deref());
    let header_link = normalize_header_link(request.header_link.as_ref());
    let page_options = ExportPageOptions {
        include_idea_pages: request.include_idea_pages,
        include_file_pages: request.include_file_pages,
        include_code_file_pages: request.include_code_file_pages,
        include_cluster_pages: request.include_cluster_pages,
        include_attribute_pages: request.include_attribute_pages,
        include_print_pages: request.include_print_pages,
        include_requirements_page: request.include_requirements_page,
        include_graph_page: request.include_graph_page,
    };
    let manifest = build_manifest(request);

    let summaries = if request.scope == "currentFile" {
        match &request.source_file_uri {
            Some(uri) => store.get_ideas_in_file(uri)?,
            None => Vec::new(),
        }
    } else {
        store.list_all_ideas()?
    };
    let raw = store.all_idea_records()?;
    let raw_by_id: HashMap<String, String> =
        raw.iter().map(|record| (record.id.clone(), record.attributes_json.clone())).collect();
    let summaries = filter_export_ideas(summaries, &raw_by_id, request);
    let edges = store.get_all_edges()?;
    let idea_lookup: HashMap<String, IdeaSummary> =
        summaries.iter().map(|idea| (idea.id.clone(), idea.clone())).collect();
    let node_ids: Vec<String> = summaries.iter().map(|idea| idea.id.clone()).collect();
    // rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_katz_column]
    let katz_scores = katz_centrality(&node_ids, &citation_edge_pairs(&node_ids, &edges));

    let mut ideas = build_idea_records(&summaries, &raw_by_id, &edges, &idea_lookup, &katz_scores);
    let by_status = rollup_statuses(&ideas);
    let by_tag = rollup_tags(&ideas);
    let mut clusters = build_cluster_records(&ideas, &cluster_strategy);
    attach_cluster_membership(&mut ideas, &clusters);
    finalize_cluster_counts(&mut clusters, &ideas);
    let files = build_file_records(&ideas);
    let code_files = build_code_file_records(&ideas, &files);
    let attributes = build_attribute_records(&ideas);
    let graphs = build_graph_catalog(&ideas, &files, &clusters, &edges, request);
    let search_documents =
        build_search_documents(&ideas, &files, &code_files, &clusters, &attributes);
    let all_files = {
        let mut uris: Vec<String> = ideas.iter().map(|idea| idea.file_uri.clone()).collect();
        uris.sort();
        uris.dedup();
        uris
    };
    let ideas_by_id =
        ideas.iter().map(|idea| (idea.id.clone(), idea.clone())).collect::<BTreeMap<_, _>>();
    let files_by_id =
        files.iter().map(|file| (file.id.clone(), file.clone())).collect::<BTreeMap<_, _>>();
    let code_files_by_id =
        code_files.iter().map(|file| (file.id.clone(), file.clone())).collect::<BTreeMap<_, _>>();
    let clusters_by_id = clusters
        .iter()
        .map(|cluster| (cluster.id.clone(), cluster.clone()))
        .collect::<BTreeMap<_, _>>();
    let attributes_by_key = attributes
        .iter()
        .map(|attribute| (attribute.key.clone(), attribute.clone()))
        .collect::<BTreeMap<_, _>>();

    Ok(ExportSnapshot {
        title,
        generated_at: chrono_now(),
        workspace_root: request.workspace_root.to_string_lossy().into_owned(),
        template_id: request.template_id.clone(),
        scope: request.scope.clone(),
        source_file_uri: request.source_file_uri.clone(),
        runtime_mode,
        cluster_strategy,
        page_options,
        url_base,
        header_link,
        manifest,
        counts: ExportCounts {
            ideas: ideas.len(),
            edges: if request.scope == "currentFile"
                || request.exclude_secret_files
                || request.exclude_ignored_files
            {
                graphs.workspace.edges.len()
            } else {
                edges.len()
            },
            files: files.len(),
            clusters: clusters.len(),
        },
        idea_order: ideas.iter().map(|idea| idea.id.clone()).collect(),
        ideas,
        ideas_by_id,
        files,
        files_by_id,
        code_files,
        code_files_by_id,
        clusters,
        clusters_by_id,
        attributes,
        attributes_by_key,
        graphs,
        search_documents,
        by_status,
        by_tag,
        all_files,
    })
}
