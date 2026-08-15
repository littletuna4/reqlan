//! Fuzzy / contextual / semantic ranking.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".search_rust]
//! rq:["../../../reqlan rq/core_analysis/search.rq".fuzzy_search]

mod contextual;
mod fuzzy;
mod semantic;

pub use contextual::{
    apply_context_distance_scoring, hop_distances_from_centers, normalize_context_ref,
    rerank_matches_with_context, resolve_search_context_refs, CONTEXT_UNREACHABLE_HOP,
};
pub use fuzzy::{
    file_basename, filter_and_score_files, filter_and_score_ideas, fuzzy_search, fuzzy_subsequence,
    match_query_tokens, normalize_search_separators, search_ideas, search_index,
    split_search_tokens, FuzzyHitKind, FuzzySearchHit, FuzzySearchResult, SearchIdeasOptions,
};
pub use semantic::semantic_search;
