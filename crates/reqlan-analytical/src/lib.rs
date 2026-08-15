//! Headless AnalysisApi facade.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".analytical_rust_port]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
//! rq:["../../../reqlan rq/core_analysis/core.rq".runtime]

mod api;
mod types;
mod workspace_index;

pub use api::{AnalysisError, AnalysisRuntime};
pub use types::*;
pub use workspace_index::{
    FileIssueDto, SyncResultDto, WorkspaceIndexError, WorkspaceIndexRuntime,
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
    types
}
