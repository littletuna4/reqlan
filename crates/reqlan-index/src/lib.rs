//! Native ideas index: extract, rusqlite store, incremental sync.
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".rust_crate_layout]

pub mod check;
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
pub mod scan;
pub mod schema;
pub mod sql_bridge;
pub mod store;
pub mod sync;
pub mod text;
pub mod types;

pub use check::{
    check_references, list_broken_references, BrokenReference, CheckEdge, CheckIdea, CheckIndex,
    CheckReferencesOptions, ListBrokenReferencesOptions, SparseWildcardHandling,
};
pub use comment::{
    comment_link_edges, find_comment_references_in_text, is_comment_index_path,
    parse_comment_reference_target, unresolved_comment_references, CommentReference,
};
pub use diagnostics::{now_ms, DiagnosticsError, FileIssueDraft, IndexDiagnosticsStore};
pub use extract::{
    analyze_local_symbolic, analyze_local_symbolic_from_parse, count_wildcard_matches,
    extra_file_matches, extract_from_parse, extract_indexed_document, glob_list_matches,
    local_name_binding, path_glob_matches, path_glob_may_match_under, split_wildcard_label,
    ExtractOptions, LocalNameBinding, WildcardIdeaCandidate, EXTRACT_VERSION,
};
pub use git_dates::{fill_git_dates, parse_git_author_dates, CREATE_NO_WINDOW};
pub use ids::{edge_id, idea_id};
pub use ignore::{
    click_sessions_path, create_base, default_gitignore_file_contents,
    default_rqignore_file_contents, CreateBaseResult, WorkspaceGitignore, CLICK_SESSIONS_FILENAME,
    CONFIG_SCHEMA_PUBLIC_URL, DEFAULT_CLICK_LIST_LIMIT, DEFAULT_CLICK_MAX_SESSIONS,
    GITIGNORE_FILENAME, IDEAS_INDEX_FILENAME, INDEX_DIAGNOSTICS_FILENAME,
};
pub use overview::{compute_overview_coverage, OverviewCoverageScores};
pub use path_resolve::{
    absolute_rq_path, default_rq_config, file_reference_missing, find_applying_base_root,
    import_roots_for_source, is_remote_import_path, is_rq_uri, load_applying_rq_config,
    locate_authored_rq_path, locate_authored_rq_path_for_source, normalize_indexed_path,
    qualified_target_file_missing, resolve_existing_import_path, resolved_workspace_relative_path,
    rq_path_exists, same_indexed_path, RqConfig,
};
pub use queries::DocumentUpsert;
pub use reqlan_parse::{file_from_idea_id, resolve_rq_path};
pub use rq_ignore::{find_rq_ignore_error_target_lines, is_line_rq_ignored};
pub use scan::{
    clamp_scan_depth, clamp_scan_entries, scan_workspace, ScanLimits, WorkspaceScan,
    DEFAULT_SCAN_MAX_DEPTH, DEFAULT_SCAN_MAX_ENTRIES,
};
pub use sql_bridge::{SqlBridge, SqlBridgeError};
pub use store::{IndexStore, StoreError};
pub use sync::{
    index_one_file, index_one_file_with_catalog, index_paths, load_idea_catalog, sync_workspace,
    IndexOneFileResult, SyncFileAction, SyncFileEvent, SyncOptions, SyncProgress, SyncResult,
};
pub use text::{
    prefix_rejects, read_index_text, IndexText, MAX_INDEX_FILE_BYTES, TEXT_SNIFF_BYTES,
};
pub use types::*;
