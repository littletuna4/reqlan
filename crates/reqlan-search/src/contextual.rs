//! Hop-distance rerank for `--context`.
//! rq:["../../../reqlan rq/core_analysis/search.rq".contextual_search]

use reqlan_index::{idea_id, EdgeRecord, IndexStore, SemanticMatch, StoreError};
use std::collections::{HashMap, HashSet, VecDeque};

pub const CONTEXT_UNREACHABLE_HOP: u32 = 8;

pub fn hop_distances_from_centers(
    center_ids: &[String],
    edges: &[(String, String)],
) -> HashMap<String, u32> {
    let mut adjacency: HashMap<String, HashSet<String>> = HashMap::new();
    for (source, target) in edges {
        adjacency.entry(source.clone()).or_default().insert(target.clone());
        adjacency.entry(target.clone()).or_default().insert(source.clone());
    }
    let mut distances = HashMap::new();
    let mut queue = VecDeque::new();
    for center in center_ids {
        if distances.insert(center.clone(), 0).is_none() {
            queue.push_back(center.clone());
        }
    }
    while let Some(current) = queue.pop_front() {
        let next_dist = distances.get(&current).copied().unwrap_or(0) + 1;
        if let Some(neighbours) = adjacency.get(&current) {
            for neighbour in neighbours {
                if let std::collections::hash_map::Entry::Vacant(entry) =
                    distances.entry(neighbour.clone())
                {
                    entry.insert(next_dist);
                    queue.push_back(neighbour.clone());
                }
            }
        }
    }
    distances
}

pub fn apply_context_distance_scoring(
    matches: Vec<SemanticMatch>,
    distances: &HashMap<String, u32>,
) -> Vec<SemanticMatch> {
    matches
        .into_iter()
        .map(|mut match_| {
            let hop = distances.get(&match_.idea.id).copied();
            let effective = hop.unwrap_or(CONTEXT_UNREACHABLE_HOP);
            let reason = hop
                .map(|h| format!("context:{h} hops"))
                .unwrap_or_else(|| "context:unreachable".into());
            match_.score *= 0.5_f64.powi(effective as i32);
            match_.reasons.push(reason);
            match_
        })
        .collect()
}

pub fn rerank_matches_with_context(
    store: &IndexStore,
    matches: Vec<SemanticMatch>,
    context_idea_ids: &[String],
) -> Result<Vec<SemanticMatch>, StoreError> {
    if context_idea_ids.is_empty() || matches.is_empty() {
        return Ok(matches);
    }
    let hop_edges: Vec<(String, String)> = store
        .get_all_edges()?
        .into_iter()
        .filter_map(|edge: EdgeRecord| edge.target_id.map(|target| (edge.source_id, target)))
        .collect();
    let distances = hop_distances_from_centers(context_idea_ids, &hop_edges);
    let mut ranked = apply_context_distance_scoring(matches, &distances);
    ranked.sort_by(|left, right| {
        right.score.partial_cmp(&left.score).unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(ranked)
}

pub fn resolve_search_context_refs(
    store: &IndexStore,
    workspace_root: &std::path::Path,
    refs: &[String],
) -> Result<Vec<String>, StoreError> {
    let mut ids = HashSet::new();
    for raw in refs {
        let token = normalize_context_ref(raw);
        if token.is_empty() {
            continue;
        }
        if let Some((path, name)) = token.rsplit_once('#') {
            if !path.is_empty() && !name.is_empty() {
                let uri = reqlan_index::sync::to_indexed_uri(workspace_root, path);
                let id = idea_id(&uri, name);
                if store.get_idea(&id)?.is_some() {
                    ids.insert(id);
                }
            }
            continue;
        }
        if token.to_lowercase().ends_with(".rq") {
            let uri = reqlan_index::sync::to_indexed_uri(workspace_root, &token);
            for idea in store.get_ideas_in_file(&uri)? {
                ids.insert(idea.id);
            }
            continue;
        }
        let as_file = reqlan_index::sync::to_indexed_uri(workspace_root, &token);
        let in_file = store.get_ideas_in_file(&as_file)?;
        if !in_file.is_empty() {
            for idea in in_file {
                ids.insert(idea.id);
            }
            continue;
        }
        for idea in store.search_by_name_or_summary(&token)? {
            if idea.name == token {
                ids.insert(idea.id);
            }
        }
    }
    Ok(ids.into_iter().collect())
}

pub fn normalize_context_ref(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.starts_with('[') && trimmed.ends_with(']') && trimmed.len() >= 2 {
        trimmed[1..trimmed.len() - 1].trim().to_string()
    } else {
        trimmed.to_string()
    }
}
