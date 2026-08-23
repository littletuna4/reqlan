//! Native ideas index: extract, rusqlite store, incremental sync.
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".rust_crate_layout]

pub mod broken;
pub mod comment;
pub mod diagnostics;
pub mod extract;
pub mod git_dates;
pub mod ids;
pub mod ignore;
pub mod overview;
pub mod path_resolve;
pub mod queries;
/// rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
pub mod rq_ignore;
pub mod schema;
pub mod sql_bridge;
pub mod store;
pub mod sync;
pub mod types;

pub use broken::{
    check_references, list_broken_references, BrokenReference, CheckReferencesOptions,
    ListBrokenReferencesOptions, SparseWildcardHandling,
};
pub use comment::{
    comment_link_edges, find_comment_references_in_text, is_comment_index_path,
    parse_comment_reference_target, unresolved_comment_references, CommentReference,
};
pub use diagnostics::{now_ms, DiagnosticsError, FileIssueDraft, IndexDiagnosticsStore};
pub use extract::{
    count_wildcard_matches, extract_indexed_document, path_glob_matches, split_wildcard_label,
    ExtractOptions, WildcardIdeaCandidate, EXTRACT_VERSION,
};
pub use git_dates::{fill_git_dates, parse_git_author_dates, CREATE_NO_WINDOW};
pub use ids::{edge_id, idea_id};
pub use ignore::{
    create_base, default_gitignore_file_contents, default_rqignore_file_contents, CreateBaseResult,
    GITIGNORE_FILENAME, IDEAS_INDEX_FILENAME, INDEX_DIAGNOSTICS_FILENAME,
};
pub use overview::{compute_overview_coverage, OverviewCoverageScores};
pub use path_resolve::{default_rq_config, load_applying_rq_config, RqConfig};
pub use reqlan_parse::{file_from_idea_id, resolve_rq_path};
pub use rq_ignore::find_rq_ignore_error_target_lines;
pub use sql_bridge::{SqlBridge, SqlBridgeError};
pub use store::{IndexStore, StoreError};
pub use sync::{
    index_one_file, sync_workspace, IndexOneFileResult, SyncOptions, SyncProgress, SyncResult,
};
pub use types::*;
