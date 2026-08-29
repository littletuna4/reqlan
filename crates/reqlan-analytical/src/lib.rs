//! Headless AnalysisApi facade.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".analytical_rust_port]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
//! rq:["../../../reqlan rq/core_analysis/core.rq".runtime]

mod api;
mod click;
mod click_sessions;
mod types;
mod workspace_index;

pub use api::{AnalysisError, AnalysisRuntime};
pub use click::{check_name_ambiguity, click_memory_path, ClickOptions};
pub use reqlan_index::FileIssueDraft;
pub use types::*;
pub use workspace_index::{
    FileIssueDto, IndexState, SyncProgressState, SyncResultDto, WorkspaceIndexError,
    WorkspaceIndexRuntime,
};

use specta::TypeCollection;

/// Collect specta types for the typed JS facade.
pub fn type_collection() -> TypeCollection {
    let mut types = TypeCollection::default();
    types.register::<IdeaSummary>();
    types.register::<RequirementMatch>();
    types.register::<SearchRequirementsOptions>();
    types.register::<FileRelatedRequirements>();
    types.register::<GraphSlice>();
    types.register::<CompletionSummary>();
    types.register::<DeprecationImpact>();
    types.register::<ExportHeaderLinkDto>();
    types.register::<ExportRequestDto>();
    types.register::<ExportResultDto>();
    types.register::<InteractionDescriptor>();
    types.register::<FileReferenceMatch>();
    types.register::<BrokenReferenceDto>();
    types.register::<ClickNameItem>();
    types.register::<ClickNameList>();
    types.register::<ClickTarget>();
    types.register::<ClickCandidate>();
    types.register::<NameAmbiguity>();
    types.register::<ClickResult>();
    types
}

/// Specta copies Rust doc comments into `generated.ts`. Those `rq:` paths are
/// relative to `crates/reqlan-analytical/src` (three hops). `generated.ts` lives
/// at `packages/analytical/src/native` (four hops).
pub fn rewrite_generated_ts_comment_paths(source: &str) -> String {
    source.replace("rq:[\"../../../reqlan rq/", "rq:[\"../../../../reqlan rq/")
}
