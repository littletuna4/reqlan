//! Rope: compact cardinality-ranked context around a target, session-deduplicated.
//! rq:["../../../reqlan rq/core_analysis/rope.rq".rope]
//! rq:["../../../reqlan rq/core_analysis/rope.rq".rope-idea-cardinality]
//! rq:["../../../reqlan rq/core_analysis/rope.rq".fray]
//! rq:["../../../reqlan rq/core_analysis/rope.rq".rope-tuning]
//! rq:["../../../reqlan rq/core_analysis/rope.rq".dynamic-rope-tuning]
//! rq:["../../../reqlan rq/core_analysis/rope.rq".click-store-context-optimisation]

use crate::click::file_entry_id as click_file_entry_id;
use crate::click_sessions::{ClickSessionStore, ROLE_CLICKED, ROLE_CONTENT, ROLE_LISTED};
use crate::types::{from_index_summary, ClickCandidate, ClickResult, ClickTarget, IdeaSummary};
use crate::AnalysisError;
use reqlan_index::{click_sessions_path, load_applying_rq_config, EdgeKind, IndexStore};
use reqlan_search::{
    citation_edge_pairs, file_basename, fuzzy_search, hop_distances_from_centers, katz_centrality,
    normalize_context_ref, SearchIdeasOptions,
};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::Path;

/// Cardinality order threshold after normalisation to the strongest rope candidate.
/// rq:["../../../reqlan rq/core_analysis/rope.rq".algorithm]
const CARDINALITY_THRESHOLD: f64 = 0.5;

/// Hard hop cap so exploratory runs stay bounded.
const MAX_EFFECTIVE_FRAY: u32 = 6;

/// Rope tuning modes.
/// rq:["../../../reqlan rq/core_analysis/rope.rq".rope-tuning]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RopeTuning {
    /// Dynamic base fray from graph topology.
    Default,
    /// Minimal adjacent ideas; the target and its immediate connections.
    Focused,
    /// Broader hop depth for incidental link discovery.
    Exploratory,
    /// Maximum hop depth.
    Deep,
}

/// Input options for the rope function.
/// rq:["../../../reqlan rq/core_analysis/rope.rq".rope]
pub struct RopeOptions<'a> {
    pub target: &'a str,
    pub session_key: Option<&'a str>,
    /// Explicit `--fray` override; `None` picks the dynamic base fray.
    pub fray: Option<u32>,
    pub tuning: RopeTuning,
}

/// Dynamic base fray from graph topology: base 2 plus an edge-density adjustment.
/// rq:["../../../reqlan rq/core_analysis/rope.rq".dynamic-rope-tuning]
fn dynamic_base_fray(store: &IndexStore) -> u32 {
    let idea_count = store.list_all_ideas().map(|ideas| ideas.len()).unwrap_or(0) as f64;
    let edge_count = store.get_all_edges().map(|edges| edges.len()).unwrap_or(0) as f64;
    let density = if idea_count > 1.0 { edge_count / idea_count } else { 0.0 };
    let adjustment = density.clamp(0.0, 4.0) as u32;
    2u32 + adjustment
}

/// Effective hop depth from the base fray and the tuning mode.
/// rq:["../../../reqlan rq/core_analysis/rope.rq".algorithm]
fn effective_fray(base: u32, tuning: RopeTuning) -> u32 {
    let depth = match tuning {
        RopeTuning::Default => base,
        RopeTuning::Focused => 1,
        RopeTuning::Exploratory => ((base as f64) * 1.5).ceil() as u32,
        RopeTuning::Deep if base == 0 => 1,
        RopeTuning::Deep => base.saturating_mul(2).max(2),
    };
    depth.clamp(1, MAX_EFFECTIVE_FRAY)
}

enum ResolvedTarget {
    Idea(IdeaSummary),
    File { uri: String },
}

fn resolve_target(
    store: &IndexStore,
    workspace_root: &Path,
    raw: &str,
) -> Result<Vec<ResolvedTarget>, AnalysisError> {
    let token = normalize_context_ref(raw);
    if token.is_empty() {
        return Ok(Vec::new());
    }

    if let Some((path, name)) = token.rsplit_once('#') {
        if !path.is_empty() && !name.is_empty() {
            let uri = reqlan_index::sync::to_indexed_uri(workspace_root, path);
            let id = reqlan_index::idea_id(&uri, name);
            if let Some(idea) = store.get_idea(&id)? {
                return Ok(vec![ResolvedTarget::Idea(from_index_summary(idea))]);
            }
            return Ok(Vec::new());
        }
    }

    let as_file = reqlan_index::sync::to_indexed_uri(workspace_root, &token);
    let documents = store.list_document_uris()?;
    if documents.iter().any(|uri| uri == &as_file) {
        return Ok(vec![ResolvedTarget::File { uri: as_file }]);
    }

    let mut matches = Vec::new();
    for idea in store.list_all_ideas()? {
        if idea.name == token && idea.kind != reqlan_index::IdeaKind::Ideaset {
            matches.push(ResolvedTarget::Idea(from_index_summary(idea)));
        }
    }
    if !matches.is_empty() {
        return Ok(matches);
    }

    for uri in documents {
        if file_basename(&uri) == token {
            matches.push(ResolvedTarget::File { uri });
        }
    }
    Ok(matches)
}

/// Breadth-first seed edges: idea targets spread through content edges.
fn idea_adjacent_ids(store: &IndexStore, idea_id: &str) -> Result<Vec<String>, AnalysisError> {
    let mut adjacent = Vec::new();
    for edge in store.get_edges_from(idea_id)? {
        if matches!(edge.kind, EdgeKind::IdeasetMember | EdgeKind::Import | EdgeKind::CommentLink) {
            continue;
        }
        if let Some(target_id) = edge.target_id {
            adjacent.push(target_id);
        }
    }
    for edge in store.get_edges_to(idea_id)? {
        if matches!(edge.kind, EdgeKind::IdeasetMember | EdgeKind::Import | EdgeKind::CommentLink) {
            continue;
        }
        adjacent.push(edge.source_id);
    }
    Ok(adjacent)
}

/// Breadth-first seed edges for a file centre: ideas that reference the file.
/// rq:["../../../reqlan rq/core_analysis/rope.rq".algorithm]
fn file_adjacent_ids(store: &IndexStore, uri: &str) -> Result<Vec<String>, AnalysisError> {
    let file_name = file_basename(uri);
    let mut adjacent = Vec::new();
    let mut seen = HashSet::new();
    for edge in store.get_all_edges()? {
        if edge.kind != EdgeKind::FileReference && edge.kind != EdgeKind::CommentLink {
            continue;
        }
        let Some(target_file) = edge.target_file else {
            continue;
        };
        if target_file == uri
            || target_file.ends_with(&format!("/{file_name}"))
            || uri.ends_with(&target_file)
            || target_file.contains(file_name)
        {
            let id = edge.source_id;
            if seen.insert(id.clone()) {
                adjacent.push(id);
            }
        }
    }
    Ok(adjacent)
}

/// Weighted rope-idea-cardinality signal for one idea.
/// rq:["../../../reqlan rq/core_analysis/rope.rq".rope-idea-cardinality]
fn cardinality_raw(
    store: &IndexStore,
    idea: &IdeaSummary,
    hops: u32,
    max_hops: u32,
    katz: &HashMap<String, f64>,
) -> f64 {
    const DEPTH_WEIGHT: f64 = 0.3;
    const BRANCH_FACTOR: f64 = 1.5;
    const POSITION_WEIGHT: f64 = 0.2;
    const REFERENCE_WEIGHT: f64 = 0.2;
    const KATZ_WEIGHT: f64 = 0.3;

    let direction_links = store
        .get_edges_from(&idea.id)
        .map(|edges| {
            edges
                .iter()
                .filter(|edge| {
                    !matches!(
                        edge.kind,
                        EdgeKind::IdeasetMember | EdgeKind::Import | EdgeKind::CommentLink
                    )
                })
                .count() as f64
        })
        .unwrap_or(0.0);
    let inbound_refs = store
        .get_edges_to(&idea.id)
        .map(|edges| {
            edges
                .iter()
                .filter(|edge| {
                    !matches!(
                        edge.kind,
                        EdgeKind::IdeasetMember | EdgeKind::Import | EdgeKind::CommentLink
                    )
                })
                .count() as f64
        })
        .unwrap_or(0.0);
    // Earlier position in the page scores higher.
    let page_position = 1.0 / (1.0 + idea.line_start as f64 / 10.0);
    let katz_score = katz.get(&idea.id).copied().unwrap_or(0.0).clamp(0.0, 1.0);
    // Closer to the rope target scores higher.
    let depth_gap = max_hops.saturating_sub(hops) as f64;

    DEPTH_WEIGHT * depth_gap
        + BRANCH_FACTOR * direction_links.min(4.0)
        + POSITION_WEIGHT * page_position
        + REFERENCE_WEIGHT * inbound_refs.min(4.0)
        + KATZ_WEIGHT * katz_score
}

/// Perform rope: BFS to fray hops, cardinality-ranked, session-deduplicated.
/// rq:["../../../reqlan rq/core_analysis/rope.rq".rope]
/// rq:["../../../reqlan rq/core_analysis/rope.rq".algorithm]
pub fn rope(
    store: &IndexStore,
    workspace_root: &Path,
    memory_path: &Path,
    options: RopeOptions<'_>,
) -> Result<ClickResult, AnalysisError> {
    let config = load_applying_rq_config(workspace_root, None);
    let mut sessions =
        ClickSessionStore::open(&click_sessions_path(memory_path), config.click_max_sessions)?;
    let session_key = sessions.ensure_session(options.session_key)?;

    let mut resolved = resolve_target(store, workspace_root, options.target)?;
    if resolved.is_empty() {
        return search_fallback(store, &mut sessions, &session_key, options.target);
    }
    if resolved.len() > 1 {
        return ambiguous_result(store, &mut sessions, &session_key, &mut resolved);
    }

    let target = resolved.remove(0);
    let (centre_id, centre_target) = match &target {
        ResolvedTarget::Idea(idea) => (
            idea.id.clone(),
            Some(ClickTarget {
                kind: "idea".into(),
                id: idea.id.clone(),
                name: idea.name.clone(),
                file_uri: idea.file_uri.clone(),
                line_start: idea.line_start,
                content: Some(idea.summary.clone()),
                status: idea.status.clone(),
            }),
        ),
        ResolvedTarget::File { uri } => (
            click_file_entry_id(uri),
            Some(ClickTarget {
                kind: "file".into(),
                id: click_file_entry_id(uri),
                name: file_basename(uri).to_string(),
                file_uri: uri.clone(),
                line_start: 0,
                content: None,
                status: None,
            }),
        ),
    };

    // Step 3: fray from mode, user input, and dynamic tuning.
    let base = options.fray.unwrap_or_else(|| dynamic_base_fray(store));
    let fray = effective_fray(base, options.tuning);

    // Steps 2 + 4: BFS from the target up to fray hops.
    let seeds = match &target {
        ResolvedTarget::Idea(idea) => vec![(idea.clone(), 0u32)],
        ResolvedTarget::File { uri } => {
            let mut items = Vec::new();
            for id in file_adjacent_ids(store, uri)? {
                if let Some(idea) = store.get_idea(&id)? {
                    items.push((from_index_summary(idea), 1u32));
                }
            }
            items
        }
    };
    let mut visited: HashSet<String> = HashSet::new();
    let mut queue: VecDeque<(IdeaSummary, u32)> = VecDeque::new();
    for (idea, hops) in seeds {
        if visited.insert(idea.id.clone()) {
            queue.push_back((idea, hops));
        }
    }

    let mut max_hops: u32 = 0;
    let mut frontier: Vec<(IdeaSummary, u32)> = Vec::new();
    while let Some((idea, hops)) = queue.pop_front() {
        if hops > 0 {
            max_hops = max_hops.max(hops);
            frontier.push((idea.clone(), hops));
        }
        if hops >= fray {
            continue;
        }
        for id in idea_adjacent_ids(store, &idea.id)? {
            if visited.contains(&id) {
                continue;
            }
            if let Some(next) = store.get_idea(&id)? {
                if next.kind == reqlan_index::IdeaKind::Ideaset {
                    continue;
                }
                visited.insert(id);
                queue.push_back((from_index_summary(next), hops + 1));
            }
        }
    }

    build_rope_result(
        store,
        &mut sessions,
        &session_key,
        &centre_id,
        centre_target,
        frontier,
        max_hops,
    )
}

/// Cardinality scoring, ordering, session dedup, and session recording.
/// rq:["../../../reqlan rq/core_analysis/rope.rq".rope-idea-cardinality]
/// rq:["../../../reqlan rq/core_analysis/rope.rq".click-store-context-optimisation]
fn build_rope_result(
    store: &IndexStore,
    sessions: &mut ClickSessionStore,
    session_key: &str,
    centre_id: &str,
    centre_target: Option<ClickTarget>,
    frontier: Vec<(IdeaSummary, u32)>,
    max_hops: u32,
) -> Result<ClickResult, AnalysisError> {
    // Katz centrality across the indexed graph, computed once per rope call.
    let ideas = store.list_all_ideas()?;
    let node_ids: Vec<String> = ideas.iter().map(|idea| idea.id.clone()).collect();
    let edges = store.get_all_edges()?;
    let pairs = citation_edge_pairs(&node_ids, &edges);
    let katz = katz_centrality(&node_ids, &pairs);

    let raw_scores: Vec<(f64, &(IdeaSummary, u32))> = frontier
        .iter()
        .map(|entry| (cardinality_raw(store, &entry.0, entry.1, max_hops, &katz), entry))
        .collect();
    let top = raw_scores.iter().map(|(score, _)| *score).fold(0.0_f64, f64::max);

    let mut ranked: Vec<(f64, IdeaSummary, u32)> = raw_scores
        .iter()
        .map(|(score, entry)| {
            let normalised = if top > 0.0 { score / top } else { 0.0 };
            (normalised, entry.0.clone(), entry.1)
        })
        .filter(|(normalised, _, _)| *normalised >= CARDINALITY_THRESHOLD)
        .collect();
    ranked.sort_by(|left, right| {
        right
            .0
            .partial_cmp(&left.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(left.2.cmp(&right.2))
            .then(left.1.name.cmp(&right.1.name))
    });

    // Step 6: session dedup — skip ideas this click session already surfaced.
    let already_clicked: HashSet<String> = sessions
        .hashes_for_role(session_key, ROLE_CLICKED)
        .map(|rows| rows.into_keys().collect())
        .unwrap_or_default();
    let already_listed: HashSet<String> =
        sessions.listed_ids(session_key).map(|ids| ids.into_iter().collect()).unwrap_or_default();

    let mut entries = Vec::new();
    let centre_idea = store.get_idea(centre_id)?.map(from_index_summary);
    entries.push((
        centre_id.to_string(),
        ROLE_CLICKED.to_string(),
        centre_idea.as_ref().map(idea_fingerprint).unwrap_or_default(),
    ));
    if centre_idea.is_some() {
        entries.push((
            centre_id.to_string(),
            ROLE_CONTENT.to_string(),
            centre_idea.as_ref().map(idea_fingerprint).unwrap_or_default(),
        ));
    }

    let mut candidates: Vec<ClickCandidate> = Vec::new();
    let cap = 24usize;
    for (normalised, idea, hops) in ranked {
        if already_clicked.contains(&idea.id)
            || already_listed.contains(&idea.id)
            || idea.id == centre_id
        {
            continue;
        }
        if candidates.len() >= cap {
            break;
        }
        entries.push((idea.id.clone(), ROLE_LISTED.to_string(), String::new()));
        candidates.push(ClickCandidate {
            name: idea.name.clone(),
            id: idea.id.clone(),
            kind: "idea".into(),
            file_uri: idea.file_uri.clone(),
            score: Some(normalised),
            hops: Some(hops),
        });
    }

    sessions.record_entries(session_key, &entries)?;

    Ok(ClickResult {
        session_key: session_key.to_string(),
        kind: "rope".into(),
        target: centre_target,
        outbound: None,
        backlinks: None,
        comment_refs: None,
        siblings: None,
        connected: None,
        candidates: Some(candidates),
    })
}

/// No exact target: fall through to ranked fuzzy search like click.
/// rq:["../../../reqlan rq/core_analysis/rope.rq".rope]
fn search_fallback(
    store: &IndexStore,
    sessions: &mut ClickSessionStore,
    session_key: &str,
    query: &str,
) -> Result<ClickResult, AnalysisError> {
    let search = fuzzy_search(
        store,
        query,
        SearchIdeasOptions { limit: Some(16), offset: 0, require_query: true },
    )?;
    let candidates: Vec<ClickCandidate> = search
        .hits
        .into_iter()
        .map(|hit| ClickCandidate {
            name: hit.name,
            id: hit.id,
            kind: if matches!(hit.kind, reqlan_search::FuzzyHitKind::File) {
                "file".into()
            } else {
                "idea".into()
            },
            file_uri: hit.file_uri,
            score: Some(hit.score),
            hops: None,
        })
        .collect();
    let kind = if candidates.is_empty() { "none" } else { "search" };
    sessions.record_entries(session_key, &[])?;
    Ok(ClickResult {
        session_key: session_key.to_string(),
        kind: kind.into(),
        target: None,
        outbound: None,
        backlinks: None,
        comment_refs: None,
        siblings: None,
        connected: None,
        candidates: Some(candidates),
    })
}

/// More than one name match: rank by session distance when the session has ideas.
/// rq:["../../../reqlan rq/core_analysis/rope.rq".click-store-context-optimisation]
fn ambiguous_result(
    store: &IndexStore,
    sessions: &mut ClickSessionStore,
    session_key: &str,
    targets: &mut Vec<ResolvedTarget>,
) -> Result<ClickResult, AnalysisError> {
    let session_ids = sessions.session_idea_ids(session_key)?;
    let distances = if session_ids.is_empty() {
        HashMap::new()
    } else {
        let hop_edges: Vec<(String, String)> = store
            .get_all_edges()?
            .into_iter()
            .filter_map(|edge| edge.target_id.map(|target| (edge.source_id, target)))
            .collect();
        hop_distances_from_centers(&session_ids, &hop_edges)
    };
    let ranked: Vec<ClickCandidate> = targets
        .drain(..)
        .map(|target| match target {
            ResolvedTarget::Idea(idea) => {
                let hops = distances.get(&idea.id).copied();
                (idea, "idea", hops)
            }
            ResolvedTarget::File { uri } => {
                let hops = distances.keys().next().map(|_| 1u32);
                (file_summary(&uri), "file", hops)
            }
        })
        .map(|(idea, kind, hops)| ClickCandidate {
            name: idea.name.clone(),
            id: idea.id.clone(),
            kind: kind.into(),
            file_uri: idea.file_uri.clone(),
            score: Some(1.0 / (1.0 + hops.unwrap_or(8) as f64)),
            hops,
        })
        .collect::<Vec<_>>();
    let mut ranked = ranked;
    ranked.sort_by(|left, right| {
        // Unknown hop distance sorts after a known one; names then ids break ties.
        let left_hops = left.hops.unwrap_or(u32::MAX);
        let right_hops = right.hops.unwrap_or(u32::MAX);
        left_hops
            .cmp(&right_hops)
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.id.cmp(&right.id))
    });
    sessions.record_entries(session_key, &[])?;
    Ok(ClickResult {
        session_key: session_key.to_string(),
        kind: "ambiguous".into(),
        target: None,
        outbound: None,
        backlinks: None,
        comment_refs: None,
        siblings: None,
        connected: None,
        candidates: Some(ranked),
    })
}

fn idea_fingerprint(idea: &IdeaSummary) -> String {
    let status = idea.status.clone().unwrap_or_default();
    let mut tags = idea.tags.clone();
    tags.sort();
    format!("{}|{}|{}|{}", idea.name, idea.summary, status, tags.join(","))
}

/// Build the `file:`-prefixed summary used for file centres and ambiguity rows.
fn file_summary(uri: &str) -> IdeaSummary {
    IdeaSummary {
        id: click_file_entry_id(uri),
        name: file_basename(uri).to_string(),
        kind: "file".into(),
        file_uri: uri.to_string(),
        line_start: 0,
        summary: String::new(),
        status: None,
        status_key: String::new(),
        tags: Vec::new(),
        tags_keys: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn effective_fray_follows_tuning_modes() {
        assert_eq!(effective_fray(2, RopeTuning::Default), 2);
        assert_eq!(effective_fray(2, RopeTuning::Focused), 1);
        assert_eq!(effective_fray(2, RopeTuning::Exploratory), 3);
        assert_eq!(effective_fray(2, RopeTuning::Deep), 4);
        assert_eq!(effective_fray(8, RopeTuning::Deep), MAX_EFFECTIVE_FRAY);
    }

    #[test]
    fn dynamic_base_fray_defaults_to_two() {
        let store = IndexStore::open_in_memory().unwrap();
        assert_eq!(dynamic_base_fray(&store), 2);
    }
}
