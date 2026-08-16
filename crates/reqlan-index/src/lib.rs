//! Native ideas index: extract, rusqlite store, incremental sync.
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".rust_crate_layout]

pub mod comment;
pub mod diagnostics;
pub mod extract;
pub mod git_dates;
pub mod ids;
pub mod ignore;
pub mod overview;
pub mod queries;
pub mod schema;
pub mod sql_bridge;
pub mod store;
pub mod sync;
pub mod types;

pub use comment::{
    comment_link_edges, find_comment_references_in_text, is_comment_index_path,
    parse_comment_reference_target, CommentReference,
};
pub use diagnostics::{now_ms, DiagnosticsError, FileIssueDraft, IndexDiagnosticsStore};
pub use extract::{extract_indexed_document, ExtractOptions, WildcardIdeaCandidate};
pub use git_dates::{fill_git_dates, parse_git_author_dates};
pub use ids::{edge_id, idea_id};
pub use ignore::{
    create_base, default_rqignore_file_contents, CreateBaseResult, IDEAS_INDEX_FILENAME,
    INDEX_DIAGNOSTICS_FILENAME,
};
pub use overview::{compute_overview_coverage, OverviewCoverageScores};
pub use sql_bridge::{SqlBridge, SqlBridgeError};
pub use store::{IndexStore, StoreError};
pub use sync::{
    index_one_file, sync_workspace, IndexOneFileResult, SyncOptions, SyncProgress, SyncResult,
};
pub use types::*;
