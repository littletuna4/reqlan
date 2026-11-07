//! Workspace filesystem surface: directory scan task and base seeding.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use reqlan_index::{scan_workspace as scan_workspace_paths, ScanLimits};
use std::path::PathBuf;

/// One workspace directory walk. Runs off the extension-host thread.
/// rq:["../../../reqlan rq/indexer/cache-reuse.rq".single_sync_walk]
/// rq:["../../../reqlan rq/indexer/sequencing.rq".scan_limits]
// `Task` behind napi's `AsyncTask` is not counted as a live root by the
// dead_code lint; the scan runs via scan_workspace_task below.
#[allow(dead_code)]
pub struct WorkspaceScanTask {
    roots: Vec<PathBuf>,
    limits: ScanLimits,
}

#[napi]
impl Task for WorkspaceScanTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> Result<Self::Output> {
        let scan = scan_workspace_paths(&self.roots, self.limits.clone());
        serde_json::to_string(&scan).map_err(|error| Error::from_reason(error.to_string()))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

// Exported via napi to `@reqlan/analytical` (load-native.ts); `#[no_mangle]`
// exports are not counted as live roots by the dead_code lint.
#[allow(dead_code)]
#[napi(js_name = "scanWorkspace")]
pub fn scan_workspace_task(
    roots: Vec<String>,
    max_depth: u32,
    max_entries: u32,
    stop_at_child_bases: bool,
) -> AsyncTask<WorkspaceScanTask> {
    AsyncTask::new(WorkspaceScanTask {
        roots: roots.into_iter().map(PathBuf::from).collect(),
        limits: ScanLimits { max_depth, max_entries, stop_at_child_bases, path_globs: Vec::new() },
    })
}
/// Seed a reqlan base marker (`.reqlan/` + `config.json` + `.rqignore`).
/// rq:["../../../reqlan rq/extension/index-host/index.rq".rqignore]
#[allow(dead_code)]
#[napi]
pub fn create_base(base_root: String) -> Result<serde_json::Value> {
    let result = reqlan_index::create_base(std::path::Path::new(&base_root))
        .map_err(|error| Error::from_reason(error.to_string()))?;
    Ok(serde_json::json!({
        "created": result.created,
        "memoryPath": result.memory_path.to_string_lossy(),
    }))
}
