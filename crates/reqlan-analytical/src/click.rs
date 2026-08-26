//! Click: local graph slice with session-filtered resurfacing.
//! rq:["../../../reqlan rq/cli/click.rq".click]
//! rq:["../../../reqlan rq/cli/click.rq".click_input]
//! rq:["../../../reqlan rq/cli/click.rq".click_max_detail]
//! rq:["../../../reqlan rq/cli/click.rq".click_output]
//! rq:["../../../reqlan rq/cli/click.rq".click_session]

use crate::click_sessions::ClickSessionStore;
use crate::types::{from_index_summary, ClickResult, EdgeDto, IdeaSummary};
use crate::AnalysisError;
use reqlan_index::{click_sessions_path, load_applying_rq_config, IndexStore};
use reqlan_search::resolve_search_context_refs;
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};

pub struct ClickOptions<'a> {
    pub target: &'a str,
    pub session_key: Option<&'a str>,
    pub max_detail: Option<u32>,
}

pub fn click(
    store: &IndexStore,
    workspace_root: &Path,
    memory_path: &Path,
    options: ClickOptions<'_>,
) -> Result<ClickResult, AnalysisError> {
    let config = load_applying_rq_config(workspace_root, None);
    let mut sessions =
        ClickSessionStore::open(&click_sessions_path(memory_path), config.click_max_sessions)?;
    let session_key = sessions.ensure_session(options.session_key)?;
    let depth = options.max_detail.unwrap_or(1).max(1);

    let center_ids =
        resolve_search_context_refs(store, workspace_root, &[options.target.to_string()])?;
    let mut centers = Vec::new();
    for id in &center_ids {
        if let Some(idea) = store.get_idea(id)? {
            centers.push(from_index_summary(idea));
        }
    }

    if center_ids.is_empty() {
        sessions.record_surfaced(&session_key, &[])?;
        return Ok(ClickResult {
            session_key,
            centers,
            depth,
            nodes: Vec::new(),
            edges: Vec::new(),
            suppressed_count: 0,
        });
    }

    let graph = local_graph_multi(store, &center_ids, depth)?;
    let seen = sessions.surfaced_hashes(&session_key)?;
    let center_set: HashSet<&str> = center_ids.iter().map(String::as_str).collect();

    let mut nodes = Vec::new();
    let mut to_record: Vec<(String, String)> = Vec::new();
    let mut suppressed_count = 0_u32;
    let mut kept_ids: HashSet<String> = HashSet::new();

    for center in &centers {
        kept_ids.insert(center.id.clone());
        let hash = idea_fingerprint(center);
        to_record.push((center.id.clone(), hash));
    }

    for node in &graph.nodes {
        if center_set.contains(node.id.as_str()) {
            continue;
        }
        let hash = idea_fingerprint(node);
        match seen.get(&node.id) {
            Some(previous) if previous == &hash => {
                suppressed_count += 1;
            }
            _ => {
                kept_ids.insert(node.id.clone());
                to_record.push((node.id.clone(), hash));
                nodes.push(node.clone());
            }
        }
    }

    let edges: Vec<EdgeDto> = graph
        .edges
        .into_iter()
        .filter(|edge| {
            kept_ids.contains(&edge.source_id)
                && edge.target_id.as_ref().map(|target| kept_ids.contains(target)).unwrap_or(false)
        })
        .collect();

    sessions.record_surfaced(&session_key, &to_record)?;

    Ok(ClickResult { session_key, centers, depth, nodes, edges, suppressed_count })
}

struct InternalGraph {
    nodes: Vec<IdeaSummary>,
    edges: Vec<EdgeDto>,
}

fn local_graph_multi(
    store: &IndexStore,
    center_ids: &[String],
    depth: u32,
) -> Result<InternalGraph, AnalysisError> {
    let mut nodes = HashMap::new();
    let mut edges = HashMap::new();
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();
    for center_id in center_ids {
        queue.push_back((center_id.clone(), depth));
    }
    while let Some((current, remaining)) = queue.pop_front() {
        if !visited.insert(current.clone()) {
            continue;
        }
        if let Some(idea) = store.get_idea(&current)? {
            nodes.insert(idea.id.clone(), from_index_summary(idea));
        }
        let outbound = store.get_edges_from(&current)?;
        let inbound = store.get_edges_to(&current)?;
        for edge in outbound.into_iter().chain(inbound) {
            edges.insert(edge.id.clone(), edge.clone());
            if remaining > 0 {
                let next =
                    if edge.source_id == current { edge.target_id } else { Some(edge.source_id) };
                if let Some(next_id) = next {
                    queue.push_back((next_id, remaining - 1));
                }
            }
        }
    }
    Ok(InternalGraph {
        nodes: nodes.into_values().collect(),
        edges: edges
            .into_values()
            .map(|edge| EdgeDto {
                id: edge.id,
                source_id: edge.source_id,
                target_id: edge.target_id,
                target_file: edge.target_file,
                kind: edge.kind.as_str().to_string(),
                label: edge.label,
            })
            .collect(),
    })
}

/// Fingerprint idea content for session change detection.
/// Uses summary/status/tags (idea-level) rather than document content_hash.
fn idea_fingerprint(idea: &IdeaSummary) -> String {
    let status = idea.status.as_deref().unwrap_or("");
    let mut tags = idea.tags.clone();
    tags.sort();
    format!("{}|{}|{}|{}", idea.name, idea.summary, status, tags.join(","))
}

/// Resolve application-memory path for click sessions (tests / callers).
pub fn click_memory_path(workspace_root: &Path, storage_path: Option<&Path>) -> PathBuf {
    reqlan_index::ignore::application_memory_path(workspace_root, storage_path)
}
