use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::contextual::{hop_distances_from_centers, CONTEXT_UNREACHABLE_HOP};
use crate::fuzzy::{file_basename, file_stem, match_query_tokens, split_search_tokens};
use crate::katz::katz_centrality;
use reqlan_index::{EdgeRecord, IdeaKind, IdeaSummary, IndexStore, StoreError};

/// Unified hit type that can represent both ideas and files
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum UnifiedHitKind {
    Idea,
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UnifiedSearchHit {
    pub id: String,
    pub name: String,
    pub kind: UnifiedHitKind,
    pub file_uri: String,
    pub summary: String,
    pub line_start: u32,
    pub score: f64,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct UnifiedSearchOptions {
    pub limit: Option<usize>,
    pub offset: usize,
    pub require_query: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UnifiedSearchResult {
    pub hits: Vec<UnifiedSearchHit>,
    pub total: usize,
    pub truncated: bool,
}

pub fn unified_text_score(
    store: &IndexStore,
    idea: &IdeaSummary,
    file_uri: &str,
    query: &str,
) -> (f64, Vec<String>) {
    let raw_needle = query.trim().to_lowercase();
    if raw_needle.is_empty() {
        return (100.0, vec!["empty_query".into()]);
    }

    let query_tokens = split_search_tokens(&raw_needle);
    let mut score = 0.0;
    let mut reasons = Vec::new();

    let name_lower = idea.name.to_lowercase();
    if name_lower == raw_needle {
        score += 3.0;
        reasons.push("name_exact".into());
    } else if name_lower.contains(&raw_needle) {
        score += 1.0;
        reasons.push("name_contains".into());
    }

    let summary_lower = idea.summary.to_lowercase();
    if summary_lower == raw_needle {
        score += 2.0;
        reasons.push("summary_exact".into());
    } else if summary_lower.contains(&raw_needle) {
        score += 1.0;
        reasons.push("summary_contains".into());
    }

    let haystack = format!(
        "{} {} {}",
        idea.name.to_lowercase(),
        idea.summary.to_lowercase(),
        idea.tags.join(" ").to_lowercase()
    );
    for token in &query_tokens {
        if haystack.contains(token) {
            score += 1.0;
            reasons.push(format!("token:{}", token));
        }
    }

    for tag in &idea.tags {
        if tag.to_lowercase().contains(&raw_needle) {
            score += 1.0;
            reasons.push(format!("tag:{}", tag));
        }
    }

    if let Ok(edges) = store.get_edges_from(&idea.id) {
        for edge in edges {
            let label: Option<&str> = edge.label.as_deref();
            if let Some(label) = label {
                if label.to_lowercase().contains(&raw_needle) {
                    score += 1.0;
                    reasons.push("edge_label".into());
                }
            }
        }
    }

    let base = file_basename(file_uri);
    let stem = file_stem(base);
    let base_lower = base.to_lowercase();
    let stem_lower = stem.to_lowercase();
    let file_uri_lower = file_uri.to_lowercase();

    if base_lower == raw_needle {
        score += 100.0;
        reasons.push("file_basename_exact".into());
    } else if base_lower.contains(&raw_needle) {
        score += 80.0;
        reasons.push("file_basename_contains".into());
    }

    if base_lower.starts_with(&raw_needle) {
        score += 80.0;
        reasons.push("file_basename_prefix".into());
    }

    if stem_lower == raw_needle {
        score += 100.0;
        reasons.push("file_stem_exact".into());
    } else if stem_lower.contains(&raw_needle) {
        score += 50.0;
        reasons.push("file_stem_contains".into());
    }

    if file_uri_lower.contains(&raw_needle) {
        score += 50.0;
        reasons.push("file_uri_contains".into());
    }

    let name_tokens = split_search_tokens(&name_lower);
    let summary_tokens = split_search_tokens(&summary_lower);
    let uri_tokens = split_search_tokens(&file_uri_lower);

    let name_ordered = match_query_tokens(&name_tokens, &query_tokens);
    let summary_ordered = match_query_tokens(&summary_tokens, &query_tokens);
    let uri_ordered = match_query_tokens(&uri_tokens, &query_tokens);

    if name_ordered == Some("ordered")
        || summary_ordered == Some("ordered")
        || uri_ordered == Some("ordered")
    {
        score += 45.0;
        reasons.push("ordered_words".into());
    } else if name_ordered == Some("reordered")
        || summary_ordered == Some("reordered")
        || uri_ordered == Some("reordered")
    {
        score += 35.0;
        reasons.push("reordered_words".into());
    }

    (score, reasons)
}

pub fn unified_search(
    store: &IndexStore,
    query: &str,
    context_idea_ids: Option<&[String]>,
    katz: bool,
    options: UnifiedSearchOptions,
) -> Result<UnifiedSearchResult, StoreError> {
    let limit = options.limit.unwrap_or(8);
    let offset = options.offset.min(limit);
    let require_query = options.require_query;
    let context_idea_ids: &[String] = context_idea_ids.unwrap_or(&[]);

    let raw_needle = query.trim().to_lowercase();
    if raw_needle.is_empty() && require_query {
        return Ok(UnifiedSearchResult { hits: vec![], total: 0, truncated: false });
    }

    let candidate_cap =
        if raw_needle.is_empty() { 400 } else { ((limit as f64) * 8.0).max(16.0) as usize };

    let ideas = store.list_all_ideas()?;
    let files = store.list_document_uris()?;

    let mut candidates: Vec<UnifiedSearchHit> =
        Vec::with_capacity(ideas.len().min(candidate_cap) + files.len().min(candidate_cap / 4));

    for idea in ideas {
        let (score, reasons) = unified_text_score(store, &idea, &idea.file_uri, query);
        if score > 0.0 {
            candidates.push(UnifiedSearchHit {
                id: idea.id,
                name: idea.name,
                kind: UnifiedHitKind::Idea,
                file_uri: idea.file_uri,
                summary: idea.summary,
                line_start: idea.line_start,
                score,
                reasons,
            });
        }
    }

    for file_uri in files {
        let (score, reasons) = unified_text_score(
            store,
            &IdeaSummary {
                id: "file".to_string(),
                name: file_basename(&file_uri).to_string(),
                kind: IdeaKind::Oneliner,
                file_uri: file_uri.clone(),
                line_start: 0,
                summary: String::new(),
                status: None,
                status_key: "file".to_string(),
                tags: vec![],
                tags_keys: vec![],
                git_created_at: None,
                git_modified_at: None,
                git_change_count: None,
            },
            &file_uri,
            query,
        );
        if score > 0.0 {
            candidates.push(UnifiedSearchHit {
                id: file_uri.clone(),
                name: file_basename(&file_uri).to_string(),
                kind: UnifiedHitKind::File,
                file_uri,
                summary: String::new(),
                line_start: 0,
                score,
                reasons,
            });
        }
    }

    candidates.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.file_uri.cmp(&b.file_uri))
    });

    if candidates.len() > candidate_cap {
        candidates.truncate(candidate_cap);
    }

    let mut ranked = candidates;
    if !context_idea_ids.is_empty() {
        ranked = rerank_unified_with_context(store, ranked, context_idea_ids)?;
    }

    if katz {
        ranked = apply_katz_to_unified(ranked, store)?;
    }

    let total = ranked.len();
    let hits = if offset < total {
        let end = (offset + limit).min(total);
        ranked[offset..end].to_vec()
    } else {
        Vec::new()
    };
    let truncated = offset + hits.len() < total;

    Ok(UnifiedSearchResult { hits, total, truncated })
}

fn rerank_unified_with_context(
    store: &IndexStore,
    matches: Vec<UnifiedSearchHit>,
    context_idea_ids: &[String],
) -> Result<Vec<UnifiedSearchHit>, StoreError> {
    if matches.is_empty() {
        return Ok(matches);
    }

    let hop_edges: Vec<(String, String)> = store
        .get_all_edges()?
        .into_iter()
        .filter_map(|edge: EdgeRecord| edge.target_id.map(|target| (edge.source_id, target)))
        .collect();

    let distances = hop_distances_from_centers(context_idea_ids, &hop_edges);

    let mut file_to_ideas: HashMap<String, Vec<String>> = HashMap::new();
    let all_ideas = store.list_all_ideas()?;
    for idea in all_ideas {
        file_to_ideas.entry(idea.file_uri).or_default().push(idea.id);
    }

    let mut ranked = Vec::with_capacity(matches.len());
    for mut hit in matches {
        let hop = match hit.kind {
            UnifiedHitKind::Idea => distances.get(&hit.id).copied(),
            UnifiedHitKind::File => {
                if let Some(child_ids) = file_to_ideas.get(&hit.file_uri) {
                    child_ids.iter().filter_map(|id| distances.get(id)).min().copied()
                } else {
                    None
                }
            }
        };
        let effective = hop.unwrap_or(CONTEXT_UNREACHABLE_HOP);
        let reason = hop
            .map(|h| format!("context:{} hops", h))
            .unwrap_or_else(|| "context:unreachable".into());
        hit.score *= 0.5_f64.powi(effective as i32);
        hit.reasons.push(reason);
        ranked.push(hit);
    }

    ranked.sort_by(|left, right| {
        right.score.partial_cmp(&left.score).unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(ranked)
}

fn apply_katz_to_unified(
    matches: Vec<UnifiedSearchHit>,
    store: &IndexStore,
) -> Result<Vec<UnifiedSearchHit>, StoreError> {
    let node_ids: Vec<String> = matches
        .iter()
        .filter(|hit| hit.kind == UnifiedHitKind::Idea)
        .map(|hit| hit.id.clone())
        .collect();

    if node_ids.is_empty() {
        return Ok(matches);
    }

    let edges: Vec<(String, String)> = store
        .get_all_edges()?
        .into_iter()
        .filter_map(|edge: EdgeRecord| edge.target_id.map(|target| (edge.source_id, target)))
        .filter(|(s, t)| node_ids.iter().any(|id| id == s) && node_ids.iter().any(|id| id == t))
        .collect();

    let katz_scores: HashMap<String, f64> = katz_centrality(&node_ids, &edges);

    let mut ranked = Vec::with_capacity(matches.len());
    for mut hit in matches {
        if hit.kind == UnifiedHitKind::Idea {
            if let Some(katz) = katz_scores.get(&hit.id) {
                hit.score *= 1.0 + katz;
                hit.reasons.push(format!("katz:{:.3}", katz));
            }
        }
        ranked.push(hit);
    }

    ranked.sort_by(|left, right| {
        right.score.partial_cmp(&left.score).unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(ranked)
}
