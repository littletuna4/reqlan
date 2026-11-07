//! Node binding for the core AnalysisApi + workspace index.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]

// Barrel: modules hold all napi items; the JS surface lives per module.
// rq:["../../../reqlan rq/development/core.rq".napi_module_barrel]

mod analysis;
mod planner;
mod scan;
mod source;
mod sql_db;
mod util;
mod workspace_index;
