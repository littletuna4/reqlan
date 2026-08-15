//! Native ideas index: extract, rusqlite store, incremental sync.
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".rust_crate_layout]

pub mod comment;
pub mod diagnostics;
pub mod extract;
pub mod ids;
pub mod ignore;
pub mod schema;
pub mod sql_bridge;
pub mod store;
pub mod sync;
pub mod types;

pub use comment::{
    comment_link_edges, find_comment_references_in_text, is_comment_index_path,
    parse_comment_reference_target, CommentReference,
};
pub use diagnostics::{DiagnosticsError, IndexDiagnosticsStore};
pub use extract::{extract_indexed_document, ExtractOptions, WildcardIdeaCandidate};
pub use ids::{edge_id, idea_id};
pub use ignore::{IDEAS_INDEX_FILENAME, INDEX_DIAGNOSTICS_FILENAME};
pub use sql_bridge::{SqlBridge, SqlBridgeError};
pub use store::{IndexStore, StoreError};
pub use sync::{
    index_one_file, sync_workspace, IndexOneFileResult, SyncOptions, SyncProgress, SyncResult,
};
pub use types::*;
