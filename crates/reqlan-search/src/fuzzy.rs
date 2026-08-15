//! Separator-insensitive fuzzy ranking.
//! rq:["../../../reqlan rq/core_analysis/search.rq".fuzzy_search]
//! rq:["../../../reqlan rq/core_analysis/search.rq".fuzzy_search_whitespace]
//! rq:["../../../reqlan rq/core_analysis/search.rq".file_search]
//! rq:["../../../reqlan rq/core_analysis/search.rq".fuzzy_search_pages]

use reqlan_index::{IdeaKind, IdeaSummary, IndexStore, StoreError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FuzzyHitKind {
    Block,
    Oneliner,
    Ideaset,
    File,
}

impl From<IdeaKind> for FuzzyHitKind {
    fn from(kind: IdeaKind) -> Self {
        match kind {
            IdeaKind::Block => Self::Block,
            IdeaKind::Oneliner => Self::Oneliner,
            IdeaKind::Ideaset => Self::Ideaset,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FuzzySearchHit {
    pub id: String,
    pub name: String,
    pub kind: FuzzyHitKind,
    pub file_uri: String,
    pub summary: String,
    pub line_start: u32,
    pub score: f64,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct SearchIdeasOptions {
    pub limit: Option<usize>,
    pub offset: usize,
    pub require_query: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FuzzySearchResult {
    pub hits: Vec<FuzzySearchHit>,
    pub total: usize,
    pub truncated: bool,
}

/// Rank in-memory idea summaries; does not copy the catalog to a host language.
pub fn search_ideas(
    ideas: &[IdeaSummary],
    query: &str,
    options: SearchIdeasOptions,
) -> FuzzySearchResult {
    search_index(ideas, &[], query, options)
}

/// Rank ideas and indexed file names into one list, then page with offset/limit.
pub fn search_index(
    ideas: &[IdeaSummary],
    file_uris: &[String],
    query: &str,
    options: SearchIdeasOptions,
) -> FuzzySearchResult {
    let trimmed = query.trim();
    if options.require_query && trimmed.is_empty() {
        return FuzzySearchResult { hits: Vec::new(), total: 0, truncated: false };
    }
    let mut ranked = filter_and_score_ideas(ideas, trimmed);
    if !trimmed.is_empty() {
        ranked.extend(filter_and_score_files(file_uris, trimmed));
        rank_hits(&mut ranked);
    }
    paginate_hits(ranked, options)
}

fn paginate_hits(ranked: Vec<FuzzySearchHit>, options: SearchIdeasOptions) -> FuzzySearchResult {
    let total = ranked.len();
    let offset = options.offset.min(total);
    let hits: Vec<FuzzySearchHit> = match options.limit {
        Some(limit) => ranked.into_iter().skip(offset).take(limit).collect(),
        None => ranked.into_iter().skip(offset).collect(),
    };
    let truncated = offset + hits.len() < total;
    FuzzySearchResult { hits, total, truncated }
}

/// Read ideas and document URIs from rusqlite in-process, then rank.
pub fn fuzzy_search(
    store: &IndexStore,
    query: &str,
    options: SearchIdeasOptions,
) -> Result<FuzzySearchResult, StoreError> {
    let ideas = store.list_all_ideas()?;
    let files = store.list_document_uris()?;
    Ok(search_index(&ideas, &files, query, options))
}

pub fn normalize_search_separators(value: &str) -> String {
    let mut out = String::new();
    let mut prev_sep = false;
    for ch in value.chars() {
        if matches!(ch, '_' | '-' | ' ' | '.' | '…' | '\t' | '\n') {
            prev_sep = true;
            continue;
        }
        let _ = prev_sep;
        out.extend(ch.to_lowercase());
        prev_sep = false;
    }
    out
}

pub fn split_search_tokens(value: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    for ch in value.chars() {
        if matches!(ch, '_' | '-' | ' ' | '.' | '…' | '\t' | '\n') {
            if !current.is_empty() {
                tokens.push(current.to_lowercase());
                current.clear();
            }
        } else {
            current.push(ch);
        }
    }
    if !current.is_empty() {
        tokens.push(current.to_lowercase());
    }
    tokens
}

pub fn filter_and_score_ideas(ideas: &[IdeaSummary], query: &str) -> Vec<FuzzySearchHit> {
    let raw_needle = query.trim().to_lowercase();
    let needle = normalize_search_separators(&raw_needle);
    let query_tokens = split_search_tokens(&raw_needle);
    let mut scored: Vec<FuzzySearchHit> = ideas
        .iter()
        .filter(|idea| idea.kind != IdeaKind::Ideaset)
        .filter_map(|idea| {
            let score = if raw_needle.is_empty() {
                1.0
            } else {
                score_idea_match(idea, &raw_needle, &needle, &query_tokens)
            };
            (score > 0.0).then(|| FuzzySearchHit {
                id: idea.id.clone(),
                name: idea.name.clone(),
                kind: idea.kind.into(),
                file_uri: idea.file_uri.clone(),
                summary: idea.summary.clone(),
                line_start: idea.line_start,
                score,
            })
        })
        .collect();
    rank_hits(&mut scored);
    scored
}

/// Rank indexed file URIs by basename, stem, and path.
pub fn filter_and_score_files(file_uris: &[String], query: &str) -> Vec<FuzzySearchHit> {
    let raw_needle = query.trim().to_lowercase();
    if raw_needle.is_empty() {
        return Vec::new();
    }
    let needle = normalize_search_separators(&raw_needle);
    let query_tokens = split_search_tokens(&raw_needle);
    let mut scored: Vec<FuzzySearchHit> = file_uris
        .iter()
        .filter_map(|file_uri| {
            let name = file_basename(file_uri);
            let score = score_file_match(file_uri, name, &raw_needle, &needle, &query_tokens);
            (score > 0.0).then(|| FuzzySearchHit {
                id: file_uri.clone(),
                name: name.to_string(),
                kind: FuzzyHitKind::File,
                file_uri: file_uri.clone(),
                summary: String::new(),
                line_start: 0,
                score,
            })
        })
        .collect();
    rank_hits(&mut scored);
    scored
}

fn rank_hits(scored: &mut [FuzzySearchHit]) {
    scored.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.file_uri.cmp(&right.file_uri))
    });
}

pub fn file_basename(file_uri: &str) -> &str {
    file_uri
        .rsplit(['/', '\\'])
        .next()
        .filter(|part| !part.is_empty())
        .unwrap_or(file_uri)
}

fn file_stem(name: &str) -> &str {
    name.strip_suffix(".rq")
        .or_else(|| name.strip_suffix(".RQ"))
        .or_else(|| name.rsplit_once('.').map(|(stem, _)| stem))
        .unwrap_or(name)
}

fn score_file_match(
    file_uri: &str,
    basename: &str,
    raw_needle: &str,
    needle: &str,
    query_tokens: &[String],
) -> f64 {
    let stem = file_stem(basename);
    score_name_like(basename, raw_needle, needle, query_tokens)
        .max(score_name_like(stem, raw_needle, needle, query_tokens))
        .max(score_name_like(file_uri, raw_needle, needle, query_tokens))
}

fn score_name_like(hay: &str, raw_needle: &str, needle: &str, query_tokens: &[String]) -> f64 {
    let hay_raw = hay.to_lowercase();
    let hay_norm = normalize_search_separators(hay);
    let mut score: f64 = 0.0;
    if hay_raw == raw_needle || hay_norm == needle {
        score = 100.0;
    } else if hay_raw.starts_with(raw_needle) || hay_norm.starts_with(needle) {
        score = 80.0;
    } else if hay_raw.contains(raw_needle) || hay_norm.contains(needle) {
        score = 50.0;
    } else if fuzzy_subsequence(&hay_raw, raw_needle) || fuzzy_subsequence(&hay_norm, needle) {
        score = 30.0;
    }
    match match_query_tokens(&split_search_tokens(hay), query_tokens) {
        Some("ordered") => score = score.max(45.0),
        Some("reordered") => score = score.max(35.0),
        _ => {}
    }
    score
}

fn score_idea_match(
    idea: &IdeaSummary,
    raw_needle: &str,
    needle: &str,
    query_tokens: &[String],
) -> f64 {
    let summary_raw = idea.summary.to_lowercase();
    let summary = normalize_search_separators(&idea.summary);
    let mut score = score_name_like(&idea.name, raw_needle, needle, query_tokens);

    if summary_raw.contains(raw_needle) || (!needle.is_empty() && summary.contains(needle)) {
        score = score.max(20.0) + 5.0;
    } else {
        match match_query_tokens(&split_search_tokens(&idea.summary), query_tokens) {
            Some("ordered") => score = score.max(22.0),
            Some("reordered") => score = score.max(18.0),
            _ => {}
        }
    }
    for tag in &idea.tags {
        let tag_raw = tag.to_lowercase();
        let tag_norm = normalize_search_separators(tag);
        if tag_raw.contains(raw_needle) || (!needle.is_empty() && tag_norm.contains(needle)) {
            score = score.max(15.0) + 2.0;
        } else if match_query_tokens(&split_search_tokens(tag), query_tokens).is_some() {
            score = score.max(15.0) + 2.0;
        }
    }
    score
}

pub fn match_query_tokens(hay_tokens: &[String], query_tokens: &[String]) -> Option<&'static str> {
    if query_tokens.is_empty() || hay_tokens.is_empty() {
        return None;
    }
    let mut hay_index = 0usize;
    let mut ordered = true;
    for query in query_tokens {
        let mut found = None;
        for (index, hay) in hay_tokens.iter().enumerate().skip(hay_index) {
            if token_matches(hay, query) {
                found = Some(index);
                break;
            }
        }
        match found {
            Some(index) => hay_index = index + 1,
            None => {
                ordered = false;
                break;
            }
        }
    }
    if ordered {
        return Some("ordered");
    }
    let mut used = vec![false; hay_tokens.len()];
    for query in query_tokens {
        let mut found = None;
        for (index, hay) in hay_tokens.iter().enumerate() {
            if used[index] {
                continue;
            }
            if token_matches(hay, query) {
                found = Some(index);
                break;
            }
        }
        match found {
            Some(index) => used[index] = true,
            None => return None,
        }
    }
    Some("reordered")
}

fn token_matches(hay: &str, query: &str) -> bool {
    hay == query || hay.starts_with(query)
}

pub fn fuzzy_subsequence(hay: &str, needle: &str) -> bool {
    if needle.is_empty() {
        return true;
    }
    let mut needle_chars = needle.chars();
    let mut current = needle_chars.next();
    for ch in hay.chars() {
        if Some(ch) == current {
            current = needle_chars.next();
            if current.is_none() {
                return true;
            }
        }
    }
    false
}
