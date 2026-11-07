//! Fuzzy / contextual / semantic / file / unified ranking.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".search_rust]
//! rq:["../../../reqlan rq/core_analysis/search.rq".fuzzy_search]
//! rq:["../../../reqlan rq/core_analysis/search.rq".file_search]
//! rq:["../../../reqlan rq/core_analysis/search.rq".contextual_search]
//! rq:["../../../reqlan rq/core_analysis/search.rq".katz_search]
//! rq:["../../../reqlan rq/core_analysis/search.rq".unified_search]

mod contextual;
mod fuzzy;
mod katz;
mod semantic;
mod unified;

pub use contextual::{
    apply_context_distance_scoring, hop_distances_from_centers, normalize_context_ref,
    rerank_matches_with_context, resolve_search_context_refs, CONTEXT_UNREACHABLE_HOP,
};
pub use fuzzy::{
    file_basename, filter_and_score_files, filter_and_score_ideas, fuzzy_search, fuzzy_subsequence,
    match_query_tokens, normalize_search_separators, search_ideas, search_index,
    split_search_tokens, FuzzyHitKind, FuzzySearchHit, FuzzySearchResult, SearchIdeasOptions,
};
pub use katz::{apply_katz_search_bias, citation_edge_pairs, katz_centrality, MissingKatzScore};
pub use semantic::semantic_search;
pub use unified::{
    unified_search, unified_text_score, UnifiedHitKind, UnifiedSearchHit, UnifiedSearchOptions,
    UnifiedSearchResult,
};
