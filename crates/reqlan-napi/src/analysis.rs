//! NativeAnalysisRuntime binding over the core AnalysisApi.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use reqlan_analytical::{
    AnalysisRuntime, CheckReport, ExportRequestDto, SearchRequirementsOptions,
};
use reqlan_index::{SparseWildcardHandling, SyncFileAction, SyncFileEvent, SyncProgress};
use std::sync::Mutex;

use crate::util::map_err;

#[napi]
pub struct NativeAnalysisRuntime {
    inner: Mutex<Option<AnalysisRuntime>>,
}

#[napi]
impl NativeAnalysisRuntime {
    /// When `no_cache` is true, use an in-memory ideas index and do not open
    /// `<base>/.reqlan/ideas-index.sqlite` (CLI `check --no-cache`).
    /// rq:["../../../reqlan rq/core_analysis/check.rq".check_no_cache]
    #[napi(factory)]
    pub fn open(
        workspace_root: String,
        storage_path: Option<String>,
        no_cache: Option<bool>,
    ) -> Result<Self> {
        let storage = storage_path.as_deref().map(std::path::Path::new);
        let runtime = if no_cache.unwrap_or(false) {
            AnalysisRuntime::open_uncached(workspace_root, storage)
        } else {
            AnalysisRuntime::open(workspace_root, storage)
        }
        .map_err(|error| Error::from_reason(error.to_string()))?;
        Ok(Self { inner: Mutex::new(Some(runtime)) })
    }

    /// Drop the runtime and release SQLite file locks (ideas index + click sessions).
    /// rq:["../../../reqlan rq/extension/index-host/sqlite-artifact-lifecycle.rq".analysis_api_dispose]
    #[napi]
    pub fn close(&self) -> Result<()> {
        let mut guard = self.lock_slot()?;
        *guard = None;
        Ok(())
    }

    /// rq:["../../../reqlan rq/core_analysis/check.rq".check_verbose]
    #[napi]
    pub fn ensure_ready(&self, record_file_events: Option<bool>) -> Result<()> {
        self.with_mut(|runtime| {
            runtime.ensure_ready_for_check(record_file_events.unwrap_or(false)).map_err(map_err)
        })
    }

    #[napi]
    pub fn search_requirements(
        &self,
        query: String,
        limit: u32,
        context: Option<Vec<String>>,
        katz: Option<bool>,
    ) -> Result<serde_json::Value> {
        let options = SearchRequirementsOptions {
            context: context.unwrap_or_default(),
            katz: katz.unwrap_or(false),
        };
        let matches = self.with_mut(|runtime| {
            runtime.search_requirements(&query, limit as usize, Some(&options)).map_err(map_err)
        })?;
        serde_json::to_value(matches).map_err(|error| Error::from_reason(error.to_string()))
    }

    /// rq:["../../../reqlan rq/modelling/advanced_analysis.rq".katz_centrality]
    #[napi]
    pub fn katz_centrality(&self) -> Result<serde_json::Value> {
        let scores = self.with_mut(|runtime| runtime.katz_centrality().map_err(map_err))?;
        serde_json::to_value(scores).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn list_requirements(&self, limit: u32) -> Result<serde_json::Value> {
        let ideas =
            self.with_mut(|runtime| runtime.list_requirements(limit as usize).map_err(map_err))?;
        serde_json::to_value(ideas).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn get_file_context(&self, file_path: String) -> Result<serde_json::Value> {
        let related =
            self.with_mut(|runtime| runtime.get_file_context(&file_path).map_err(map_err))?;
        serde_json::to_value(related).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn get_local_graph(&self, file_path: String, depth: u32) -> Result<serde_json::Value> {
        let graph =
            self.with_mut(|runtime| runtime.get_local_graph(&file_path, depth).map_err(map_err))?;
        serde_json::to_value(graph).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn summarize_subtree(
        &self,
        requirement_name: String,
        depth: u32,
    ) -> Result<serde_json::Value> {
        let graph = self.with_mut(|runtime| {
            runtime.summarize_subtree(&requirement_name, depth).map_err(map_err)
        })?;
        serde_json::to_value(graph).map_err(|error| Error::from_reason(error.to_string()))
    }

    /// rq:["../../../reqlan rq/cli/click.rq".click]
    #[napi]
    pub fn click(
        &self,
        target: String,
        session_key: Option<String>,
        max_detail: Option<u32>,
        max_backlinks: Option<u32>,
        max_siblings: Option<u32>,
        max_outbound: Option<u32>,
        max_candidates: Option<u32>,
    ) -> Result<serde_json::Value> {
        let result = self.with_mut(|runtime| {
            runtime
                .click(reqlan_analytical::ClickOptions {
                    target: &target,
                    session_key: session_key.as_deref(),
                    max_detail,
                    max_backlinks,
                    max_siblings,
                    max_outbound,
                    max_candidates,
                })
                .map_err(map_err)
        })?;
        serde_json::to_value(result).map_err(|error| Error::from_reason(error.to_string()))
    }

    /// rq:["../../../reqlan rq/core_analysis/rope.rq".rope]
    #[napi]
    pub fn rope(
        &self,
        target: String,
        session_key: Option<String>,
        fray: Option<u32>,
        tuning: Option<String>,
    ) -> Result<serde_json::Value> {
        let result = self.with_mut(|runtime| {
            runtime
                .rope(reqlan_analytical::RopeOptions {
                    target: &target,
                    session_key: session_key.as_deref(),
                    fray,
                    tuning: match tuning.as_deref() {
                        None | Some("default") => reqlan_analytical::RopeTuning::Default,
                        Some("focused") => reqlan_analytical::RopeTuning::Focused,
                        Some("exploratory") => reqlan_analytical::RopeTuning::Exploratory,
                        Some("deep") => reqlan_analytical::RopeTuning::Deep,
                        Some(other) => {
                            return Err(Error::from_reason(format!(
                                "invalid --tuning: {other} (expected default, focused, exploratory, or deep)"
                            )));
                        }
                    },
                })
                .map_err(map_err)
        })?;
        serde_json::to_value(result).map_err(|error| Error::from_reason(error.to_string()))
    }

    /// rq:["../../../reqlan rq/cli/click.rq".click_ambiguity]
    #[napi]
    pub fn check_name_ambiguity(&self, name: String) -> Result<serde_json::Value> {
        let result =
            self.with_mut(|runtime| runtime.check_name_ambiguity(&name).map_err(map_err))?;
        serde_json::to_value(result).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn get_completion_status(&self) -> Result<serde_json::Value> {
        let summary = self.with_mut(|runtime| runtime.get_completion_status().map_err(map_err))?;
        serde_json::to_value(summary).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn get_deprecation_impact(&self) -> Result<serde_json::Value> {
        let impact = self.with_mut(|runtime| runtime.get_deprecation_impact().map_err(map_err))?;
        serde_json::to_value(impact).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn list_broken_references(
        &self,
        path_glob: Option<String>,
        include_comment_references: Option<bool>,
    ) -> Result<serde_json::Value> {
        let rows = self.with_mut(|runtime| {
            runtime
                .list_broken_references(
                    path_glob.as_deref(),
                    include_comment_references.unwrap_or(false),
                )
                .map_err(map_err)
        })?;
        serde_json::to_value(rows).map_err(|error| Error::from_reason(error.to_string()))
    }

    /// rq:["../../../reqlan rq/core_analysis/check.rq".check]
    /// rq:["../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
    /// rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
    /// rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
    /// rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
    /// rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
    /// rq:["../../../reqlan rq/core_analysis/check.rq".check_verbose]
    #[napi]
    pub fn check_references(
        &self,
        path_globs: Option<Vec<String>>,
        paths: Option<Vec<String>>,
        wildcard_zero: Option<String>,
        wildcard_one: Option<String>,
        skip_targets: Option<Vec<String>>,
        skip_gitignored_targets: Option<bool>,
        unused_imports: Option<String>,
        record_file_events: Option<bool>,
    ) -> Result<serde_json::Value> {
        let wildcard_zero = parse_sparse_wildcard_handling("wildcardZero", wildcard_zero)?;
        let wildcard_one = parse_sparse_wildcard_handling("wildcardOne", wildcard_one)?;
        let unused_imports = parse_sparse_wildcard_handling("unusedImports", unused_imports)?;
        let skip_owned = skip_targets.unwrap_or_default();
        let skip_refs: Vec<&str> = skip_owned.iter().map(String::as_str).collect();
        let globs_owned = path_globs.unwrap_or_default();
        let paths_owned = paths.unwrap_or_default();
        let glob_refs: Vec<&str> = globs_owned.iter().map(String::as_str).collect();
        let path_refs: Vec<&str> = paths_owned.iter().map(String::as_str).collect();
        let report = self.with_mut(|runtime| {
            runtime
                .check_report(
                    &glob_refs,
                    &path_refs,
                    wildcard_zero,
                    wildcard_one,
                    &skip_refs,
                    skip_gitignored_targets.unwrap_or(false),
                    Some(unused_imports),
                    record_file_events.unwrap_or(false),
                )
                .map_err(map_err)
        })?;
        Ok(check_report_json(report))
    }

    /// rq:["../../../reqlan rq/cli/diff.rq".diff]
    /// rq:["../../../reqlan rq/cli/diff.rq".diff_verbosity]
    #[napi]
    pub fn diff_ideas(
        &self,
        from: Option<String>,
        to: Option<String>,
        verbosity: Option<String>,
    ) -> Result<serde_json::Value> {
        let verbosity =
            reqlan_analytical::DiffVerbosity::parse(verbosity.as_deref().unwrap_or("summary"))
                .ok_or_else(|| {
                    Error::from_reason("verbosity must be summary, references, or text")
                })?;
        let rows = self.with_mut(|runtime| {
            runtime.diff_ideas(from.as_deref(), to.as_deref(), verbosity).map_err(map_err)
        })?;
        serde_json::to_value(rows).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn export_graph(&self, request: serde_json::Value) -> Result<serde_json::Value> {
        let dto: ExportRequestDto = serde_json::from_value(request)
            .map_err(|error| Error::from_reason(error.to_string()))?;
        let result = self.with_mut(|runtime| runtime.export(dto).map_err(map_err))?;
        serde_json::to_value(result).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn resolve_requirement_reference(&self, name: Option<String>) -> Result<serde_json::Value> {
        let ideas = self.with_mut(|runtime| {
            runtime.resolve_requirement_reference(name.as_deref()).map_err(map_err)
        })?;
        serde_json::to_value(ideas).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn resolve_file_reference(&self, path_prefix: Option<String>) -> Result<serde_json::Value> {
        let files = self.with_mut(|runtime| {
            runtime.resolve_file_reference(path_prefix.as_deref()).map_err(map_err)
        })?;
        serde_json::to_value(files).map_err(|error| Error::from_reason(error.to_string()))
    }

    fn lock_slot(&self) -> Result<std::sync::MutexGuard<'_, Option<AnalysisRuntime>>> {
        self.inner.lock().map_err(|_| Error::from_reason("native runtime lock poisoned"))
    }

    fn with_mut<T>(&self, f: impl FnOnce(&mut AnalysisRuntime) -> Result<T>) -> Result<T> {
        let mut guard = self.lock_slot()?;
        let runtime = guard
            .as_mut()
            .ok_or_else(|| Error::from_reason("native analysis runtime is closed"))?;
        f(runtime)
    }
}
fn parse_sparse_wildcard_handling(
    label: &str,
    value: Option<String>,
) -> Result<SparseWildcardHandling> {
    let raw = value.unwrap_or_else(|| SparseWildcardHandling::Warn.as_str().to_string());
    SparseWildcardHandling::parse(&raw)
        .ok_or_else(|| Error::from_reason(format!("{label} must be warn, error, or off")))
}
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_verbose]
fn check_report_json(report: CheckReport) -> serde_json::Value {
    serde_json::json!({
        "issues": report.issues,
        "indexMode": report.index_mode.as_str(),
        "sync": sync_progress_json(&report.sync),
        "files": report.file_events.iter().map(sync_file_event_json).collect::<Vec<_>>(),
    })
}

fn sync_progress_json(progress: &SyncProgress) -> serde_json::Value {
    serde_json::json!({
        "processed": progress.processed,
        "total": progress.total,
        "skippedMtime": progress.skipped_mtime,
        "indexed": progress.indexed,
        "errors": progress.errors,
        "cancelled": progress.cancelled,
    })
}

fn sync_file_event_json(event: &SyncFileEvent) -> serde_json::Value {
    let action = match event.action {
        SyncFileAction::Indexed => "indexed",
        SyncFileAction::SkippedMtime => "skipped_mtime",
        SyncFileAction::Error => "error",
        SyncFileAction::Skipped => "skipped",
    };
    serde_json::json!({
        "file": event.file_uri,
        "action": action,
        "detail": event.detail,
    })
}
