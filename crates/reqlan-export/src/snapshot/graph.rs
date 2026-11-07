//! Graph catalog and graph view slice building for the export snapshot.
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_graph_page]
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_graph_metadata]

use super::util::resolve_referenced_file_path;
use crate::types::{
    ExportCluster, ExportFile, ExportGraphCatalog, ExportIdea, ExportRequest, GraphEdgeView,
    GraphNodeView, GraphViewQuery, GraphViewSlice,
};
use reqlan_index::{EdgeKind, EdgeRecord};
use std::collections::{BTreeMap, HashSet};

const GRAPH_MAX_NODES: usize = 120;

pub(crate) fn build_graph_catalog(
    ideas: &[ExportIdea],
    files: &[ExportFile],
    clusters: &[ExportCluster],
    edges: &[EdgeRecord],
    request: &ExportRequest,
) -> ExportGraphCatalog {
    let budget = request.max_graph_nodes.unwrap_or(GRAPH_MAX_NODES);
    let idea_ids: Vec<String> = ideas.iter().map(|idea| idea.id.clone()).collect();
    let workspace =
        build_graph_slice_for_ids(ideas, edges, &idea_ids, budget.max(ideas.len()), 1, None, true);
    let by_idea_id = ideas
        .iter()
        .map(|idea| (idea.id.clone(), expand_from_center(ideas, edges, &idea.id, 2, budget)))
        .collect();
    let by_file_id = files
        .iter()
        .map(|file| {
            let ids: Vec<String> = file.ideas.iter().map(|idea| idea.id.clone()).collect();
            (
                file.id.clone(),
                build_graph_slice_for_ids(
                    ideas,
                    edges,
                    &ids,
                    budget.max(ids.len()),
                    2,
                    None,
                    false,
                ),
            )
        })
        .collect();
    let by_cluster_id = clusters
        .iter()
        .map(|cluster| {
            (
                cluster.id.clone(),
                build_graph_slice_for_ids(
                    ideas,
                    edges,
                    &cluster.idea_ids,
                    budget.max(cluster.idea_ids.len()),
                    2,
                    None,
                    false,
                ),
            )
        })
        .collect();
    ExportGraphCatalog { workspace, by_idea_id, by_file_id, by_cluster_id }
}

fn build_graph_slice_for_ids(
    ideas: &[ExportIdea],
    edges: &[EdgeRecord],
    idea_ids: &[String],
    max_nodes: usize,
    depth: u32,
    center_id: Option<&str>,
    include_ideasets: bool,
) -> GraphViewSlice {
    let allowed: HashSet<&str> = idea_ids.iter().map(String::as_str).collect();
    let seeds: Vec<&ExportIdea> =
        ideas.iter().filter(|idea| allowed.contains(idea.id.as_str())).take(max_nodes).collect();
    collect_slice(
        ideas,
        edges,
        &seeds,
        depth,
        max_nodes,
        seeds.len() < allowed.len(),
        allowed.len(),
        center_id,
        include_ideasets,
    )
}

fn expand_from_center(
    ideas: &[ExportIdea],
    edges: &[EdgeRecord],
    center_id: &str,
    depth: u32,
    max_nodes: usize,
) -> GraphViewSlice {
    let Some(center) = ideas.iter().find(|idea| idea.id == center_id) else {
        return empty_slice(Some(center_id), depth);
    };
    let mut nodes: BTreeMap<String, &ExportIdea> = BTreeMap::new();
    nodes.insert(center.id.clone(), center);
    let mut visited = HashSet::from([center_id.to_string()]);
    let mut frontier = vec![center_id.to_string()];
    let mut truncated = false;
    for _ in 0..depth {
        let mut next = Vec::new();
        for id in &frontier {
            for edge in edges.iter().filter(|edge| {
                edge.source_id == *id || edge.target_id.as_deref() == Some(id.as_str())
            }) {
                for endpoint in
                    [Some(edge.source_id.as_str()), edge.target_id.as_deref()].into_iter().flatten()
                {
                    if !visited.insert(endpoint.to_string()) {
                        continue;
                    }
                    if let Some(idea) = ideas.iter().find(|idea| idea.id == endpoint) {
                        if nodes.len() >= max_nodes {
                            truncated = true;
                            continue;
                        }
                        nodes.insert(idea.id.clone(), idea);
                        next.push(idea.id.clone());
                    }
                }
            }
        }
        frontier = next;
    }
    let seed_ids: Vec<&ExportIdea> = nodes.values().copied().collect();
    collect_slice(
        ideas,
        edges,
        &seed_ids,
        depth,
        max_nodes,
        truncated,
        nodes.len(),
        Some(center_id),
        true,
    )
}

#[allow(clippy::too_many_arguments)]
fn collect_slice(
    ideas: &[ExportIdea],
    edges: &[EdgeRecord],
    seeds: &[&ExportIdea],
    depth: u32,
    max_nodes: usize,
    mut truncated: bool,
    total_matching: usize,
    center_id: Option<&str>,
    include_ideasets: bool,
) -> GraphViewSlice {
    let mut nodes: BTreeMap<String, GraphNodeView> = BTreeMap::new();
    for idea in seeds {
        if !include_ideasets && idea.kind == "ideaset" {
            continue;
        }
        nodes.insert(idea.id.clone(), to_graph_node(idea));
    }
    let seed_ids: HashSet<String> = nodes.keys().cloned().collect();
    let mut graph_edges = Vec::new();
    for edge in edges {
        let source_visible = seed_ids.contains(&edge.source_id);
        if !source_visible && depth <= 1 {
            continue;
        }
        if matches!(edge.kind, EdgeKind::FileReference | EdgeKind::UrlReference)
            && edge.target_id.is_none()
        {
            if let Some(target_file) = &edge.target_file {
                if seed_ids.contains(&edge.source_id) {
                    let external_id = format!("file:{target_file}");
                    if !nodes.contains_key(&external_id) {
                        nodes.insert(
                            external_id.clone(),
                            external_graph_node(
                                target_file,
                                &edge.source_id,
                                edge.label.as_deref(),
                            ),
                        );
                    }
                    graph_edges.push(GraphEdgeView {
                        id: edge.id.clone(),
                        source_id: edge.source_id.clone(),
                        target_id: external_id,
                        kind: edge.kind.as_str().to_string(),
                        label: edge.label.clone().or_else(|| Some(target_file.clone())),
                    });
                }
            }
            continue;
        }
        let Some(target_id) = &edge.target_id else { continue };
        let both_visible = seed_ids.contains(&edge.source_id) && seed_ids.contains(target_id);
        let incident = seed_ids.contains(&edge.source_id) || seed_ids.contains(target_id);
        if depth > 1 && incident && !both_visible {
            if let Some(missing) = ideas.iter().find(|idea| {
                (idea.id == edge.source_id || idea.id == *target_id)
                    && !nodes.contains_key(&idea.id)
            }) {
                if nodes.len() < max_nodes {
                    nodes.insert(missing.id.clone(), to_graph_node(missing));
                } else {
                    truncated = true;
                }
            }
        }
        if nodes.contains_key(&edge.source_id) && nodes.contains_key(target_id) {
            graph_edges.push(GraphEdgeView {
                id: edge.id.clone(),
                source_id: edge.source_id.clone(),
                target_id: target_id.clone(),
                kind: edge.kind.as_str().to_string(),
                label: edge.label.clone(),
            });
        }
    }
    graph_edges.sort_by(|left, right| left.id.cmp(&right.id));
    GraphViewSlice {
        query: GraphViewQuery {
            include_indirect: depth > 1,
            max_nodes: Some(max_nodes),
            ignore_hard_cap: Some(true),
            include_ideasets: Some(include_ideasets),
        },
        center_id: center_id.map(str::to_string),
        depth,
        truncated,
        total_matching: Some(total_matching),
        nodes: nodes.into_values().collect(),
        edges: graph_edges,
    }
}

fn to_graph_node(idea: &ExportIdea) -> GraphNodeView {
    GraphNodeView {
        id: idea.id.clone(),
        name: idea.name.clone(),
        kind: idea.kind.clone(),
        file_uri: idea.file_uri.clone(),
        line_start: idea.line_start,
        status: idea.status.clone(),
        status_key: Some(idea.status_key.clone()),
        tags: idea.tags.clone(),
        tags_keys: idea.tags_keys.clone(),
        is_external: None,
        page_url: None,
        host_file_page_url: None,
        is_subject: None,
        attribute_keys: None,
        attributes: None,
    }
}

fn external_graph_node(target_file: &str, source_id: &str, label: Option<&str>) -> GraphNodeView {
    GraphNodeView {
        id: format!("file:{target_file}"),
        name: label.unwrap_or(target_file).to_string(),
        kind: "file".into(),
        file_uri: resolve_referenced_file_path(target_file, source_id),
        line_start: 0,
        status: None,
        status_key: None,
        tags: Vec::new(),
        tags_keys: Vec::new(),
        is_external: Some(true),
        page_url: None,
        host_file_page_url: None,
        is_subject: None,
        attribute_keys: None,
        attributes: None,
    }
}

fn empty_slice(center_id: Option<&str>, depth: u32) -> GraphViewSlice {
    GraphViewSlice {
        query: GraphViewQuery {
            include_indirect: true,
            max_nodes: Some(GRAPH_MAX_NODES),
            ignore_hard_cap: None,
            include_ideasets: None,
        },
        center_id: center_id.map(str::to_string),
        depth,
        truncated: false,
        total_matching: Some(0),
        nodes: Vec::new(),
        edges: Vec::new(),
    }
}
