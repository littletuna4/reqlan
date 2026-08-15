//! Node binding for the core AnalysisApi + workspace index.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use reqlan_analytical::{
    AnalysisRuntime, ExportRequestDto, SearchRequirementsOptions, WorkspaceIndexRuntime,
};
use reqlan_index::SqlBridge;
use reqlan_parse::{parse_document, Import, Severity, TopLevelElement};
use std::path::PathBuf;
use std::sync::Mutex;

#[napi]
pub struct NativeAnalysisRuntime {
    inner: Mutex<AnalysisRuntime>,
}

#[napi]
impl NativeAnalysisRuntime {
    #[napi(factory)]
    pub fn open(workspace_root: String, storage_path: Option<String>) -> Result<Self> {
        let runtime = AnalysisRuntime::open(
            workspace_root,
            storage_path.as_deref().map(std::path::Path::new),
        )
        .map_err(|error| Error::from_reason(error.to_string()))?;
        Ok(Self { inner: Mutex::new(runtime) })
    }

    #[napi]
    pub fn ensure_ready(&self) -> Result<()> {
        self.lock()?.ensure_ready().map_err(map_err)
    }

    #[napi]
    pub fn search_requirements(
        &self,
        query: String,
        limit: u32,
        context: Option<Vec<String>>,
    ) -> Result<serde_json::Value> {
        let options = context.map(|context| SearchRequirementsOptions { context });
        let matches = self
            .lock()?
            .search_requirements(&query, limit as usize, options.as_ref())
            .map_err(map_err)?;
        serde_json::to_value(matches).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn list_requirements(&self, limit: u32) -> Result<serde_json::Value> {
        let ideas = self.lock()?.list_requirements(limit as usize).map_err(map_err)?;
        serde_json::to_value(ideas).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn get_file_context(&self, file_path: String) -> Result<serde_json::Value> {
        let related = self.lock()?.get_file_context(&file_path).map_err(map_err)?;
        serde_json::to_value(related).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn get_local_graph(&self, file_path: String, depth: u32) -> Result<serde_json::Value> {
        let graph = self.lock()?.get_local_graph(&file_path, depth).map_err(map_err)?;
        serde_json::to_value(graph).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn summarize_subtree(
        &self,
        requirement_name: String,
        depth: u32,
    ) -> Result<serde_json::Value> {
        let graph = self.lock()?.summarize_subtree(&requirement_name, depth).map_err(map_err)?;
        serde_json::to_value(graph).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn get_completion_status(&self) -> Result<serde_json::Value> {
        let summary = self.lock()?.get_completion_status().map_err(map_err)?;
        serde_json::to_value(summary).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn get_deprecation_impact(&self) -> Result<serde_json::Value> {
        let impact = self.lock()?.get_deprecation_impact().map_err(map_err)?;
        serde_json::to_value(impact).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn export_graph(&self, request: serde_json::Value) -> Result<serde_json::Value> {
        let dto: ExportRequestDto = serde_json::from_value(request)
            .map_err(|error| Error::from_reason(error.to_string()))?;
        let result = self.lock()?.export(dto).map_err(map_err)?;
        serde_json::to_value(result).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn resolve_requirement_reference(&self, name: Option<String>) -> Result<serde_json::Value> {
        let ideas = self.lock()?.resolve_requirement_reference(name.as_deref()).map_err(map_err)?;
        serde_json::to_value(ideas).map_err(|error| Error::from_reason(error.to_string()))
    }

    #[napi]
    pub fn resolve_file_reference(&self, path_prefix: Option<String>) -> Result<serde_json::Value> {
        let files = self.lock()?.resolve_file_reference(path_prefix.as_deref()).map_err(map_err)?;
        serde_json::to_value(files).map_err(|error| Error::from_reason(error.to_string()))
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, AnalysisRuntime>> {
        self.inner.lock().map_err(|_| Error::from_reason("native runtime lock poisoned"))
    }
}

/// Raw SQL bridge used by TS SqliteIndexStore / IndexDiagnosticsStore facades.
#[napi]
pub struct NativeSqlDb {
    inner: Mutex<Option<SqlBridge>>,
}

#[napi]
impl NativeSqlDb {
    #[napi(factory)]
    pub fn open(path: String) -> Result<Self> {
        let bridge = SqlBridge::open(PathBuf::from(path).as_path())
            .map_err(|error| Error::from_reason(error.to_string()))?;
        Ok(Self { inner: Mutex::new(Some(bridge)) })
    }

    #[napi]
    pub fn query(
        &self,
        sql: String,
        params: Option<Vec<serde_json::Value>>,
    ) -> Result<Vec<serde_json::Value>> {
        let params = params.unwrap_or_default();
        self.with_bridge(|bridge| {
            bridge.query(&sql, &params).map_err(|error| Error::from_reason(error.to_string()))
        })
    }

    #[napi]
    pub fn execute(&self, sql: String, params: Option<Vec<serde_json::Value>>) -> Result<u32> {
        let params = params.unwrap_or_default();
        self.with_bridge(|bridge| {
            let changed = bridge
                .execute(&sql, &params)
                .map_err(|error| Error::from_reason(error.to_string()))?;
            Ok(changed as u32)
        })
    }

    #[napi]
    pub fn execute_batch(&self, sql: String) -> Result<()> {
        self.with_bridge(|bridge| {
            bridge.execute_batch(&sql).map_err(|error| Error::from_reason(error.to_string()))
        })
    }

    #[napi]
    pub fn last_insert_rowid(&self) -> Result<i64> {
        self.with_bridge(|bridge| Ok(bridge.last_insert_rowid()))
    }

    #[napi]
    pub fn close(&self) -> Result<()> {
        let mut guard = self.lock()?;
        if let Some(bridge) = guard.take() {
            let _ = bridge.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
            drop(bridge);
        }
        Ok(())
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Option<SqlBridge>>> {
        self.inner.lock().map_err(|_| Error::from_reason("native sql db lock poisoned"))
    }

    fn with_bridge<T>(&self, f: impl FnOnce(&SqlBridge) -> Result<T>) -> Result<T> {
        let guard = self.lock()?;
        let bridge = guard.as_ref().ok_or_else(|| Error::from_reason("native sql db is closed"))?;
        f(bridge)
    }
}

/// Workspace sync + dual-DB SQL surface for IndexService.
#[napi]
pub struct NativeWorkspaceIndex {
    inner: Mutex<Option<WorkspaceIndexRuntime>>,
}

#[napi]
impl NativeWorkspaceIndex {
    #[napi(factory)]
    pub fn open(workspace_root: String, storage_path: Option<String>) -> Result<Self> {
        let runtime = WorkspaceIndexRuntime::open(
            workspace_root,
            storage_path.as_deref().map(std::path::Path::new),
        )
        .map_err(|error| Error::from_reason(error.to_string()))?;
        Ok(Self { inner: Mutex::new(Some(runtime)) })
    }

    #[napi]
    pub fn ensure_ready(&self) -> Result<serde_json::Value> {
        self.with_mut(|inner| {
            let result = inner.ensure_ready().map_err(map_workspace_err)?;
            serde_json::to_value(result).map_err(|error| Error::from_reason(error.to_string()))
        })
    }

    #[napi]
    pub fn sync_workspace(&self, hard_rebuild: bool) -> Result<serde_json::Value> {
        self.with_mut(|inner| {
            let result = inner.sync(hard_rebuild).map_err(map_workspace_err)?;
            serde_json::to_value(result).map_err(|error| Error::from_reason(error.to_string()))
        })
    }

    #[napi]
    pub fn cancel_sync(&self) -> Result<()> {
        self.with_mut(|inner| {
            inner.cancel_sync();
            Ok(())
        })
    }

    #[napi]
    pub fn index_file(&self, file_path_or_uri: String) -> Result<serde_json::Value> {
        self.with_mut(|inner| {
            let result = inner.index_file(&file_path_or_uri).map_err(map_workspace_err)?;
            Ok(serde_json::json!({
                "fileUri": result.file_uri,
                "diagnostics": result.diagnostics,
            }))
        })
    }

    #[napi]
    pub fn delete_document(&self, file_uri: String) -> Result<()> {
        self.with_mut(|inner| inner.delete_document(&file_uri).map_err(map_workspace_err))
    }

    #[napi]
    pub fn clear_ideas(&self) -> Result<()> {
        self.with_mut(|inner| inner.clear_ideas().map_err(map_workspace_err))
    }

    #[napi]
    pub fn idea_counts(&self) -> Result<serde_json::Value> {
        self.with_mut(|inner| {
            let (ideas, edges) = inner.idea_counts().map_err(map_workspace_err)?;
            Ok(serde_json::json!({ "ideas": ideas, "edges": edges }))
        })
    }

    #[napi]
    pub fn fuzzy_search(
        &self,
        query: String,
        limit: Option<u32>,
        require_query: Option<bool>,
        offset: Option<u32>,
    ) -> Result<serde_json::Value> {
        self.with_mut(|inner| {
            let result = inner
                .fuzzy_search(
                    &query,
                    limit.map(|n| n as usize),
                    require_query.unwrap_or(false),
                    offset.map(|n| n as usize),
                )
                .map_err(map_workspace_err)?;
            serde_json::to_value(result).map_err(|error| Error::from_reason(error.to_string()))
        })
    }

    #[napi]
    pub fn ideas_query(
        &self,
        sql: String,
        params: Option<Vec<serde_json::Value>>,
    ) -> Result<Vec<serde_json::Value>> {
        let params = params.unwrap_or_default();
        self.with_mut(|inner| inner.ideas_query(&sql, &params).map_err(map_workspace_err))
    }

    #[napi]
    pub fn ideas_execute(
        &self,
        sql: String,
        params: Option<Vec<serde_json::Value>>,
    ) -> Result<u32> {
        let params = params.unwrap_or_default();
        self.with_mut(|inner| {
            let changed = inner.ideas_execute(&sql, &params).map_err(map_workspace_err)?;
            Ok(changed as u32)
        })
    }

    #[napi]
    pub fn ideas_execute_batch(&self, sql: String) -> Result<()> {
        self.with_mut(|inner| inner.ideas_execute_batch(&sql).map_err(map_workspace_err))
    }

    #[napi]
    pub fn ideas_last_insert_rowid(&self) -> Result<i64> {
        self.with_mut(|inner| Ok(inner.ideas_last_insert_rowid()))
    }

    #[napi]
    pub fn diagnostics_query(
        &self,
        sql: String,
        params: Option<Vec<serde_json::Value>>,
    ) -> Result<Vec<serde_json::Value>> {
        let params = params.unwrap_or_default();
        self.with_mut(|inner| inner.diagnostics_query(&sql, &params).map_err(map_workspace_err))
    }

    #[napi]
    pub fn diagnostics_execute(
        &self,
        sql: String,
        params: Option<Vec<serde_json::Value>>,
    ) -> Result<u32> {
        let params = params.unwrap_or_default();
        self.with_mut(|inner| {
            let changed = inner.diagnostics_execute(&sql, &params).map_err(map_workspace_err)?;
            Ok(changed as u32)
        })
    }

    #[napi]
    pub fn diagnostics_execute_batch(&self, sql: String) -> Result<()> {
        self.with_mut(|inner| inner.diagnostics_execute_batch(&sql).map_err(map_workspace_err))
    }

    #[napi]
    pub fn diagnostics_last_insert_rowid(&self) -> Result<i64> {
        self.with_mut(|inner| Ok(inner.diagnostics_last_insert_rowid()))
    }

    #[napi]
    pub fn shutdown(&self) -> Result<()> {
        let mut guard = self.lock()?;
        *guard = None;
        Ok(())
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Option<WorkspaceIndexRuntime>>> {
        self.inner.lock().map_err(|_| Error::from_reason("native workspace index lock poisoned"))
    }

    fn with_mut<T>(&self, f: impl FnOnce(&mut WorkspaceIndexRuntime) -> Result<T>) -> Result<T> {
        let mut guard = self.lock()?;
        let inner =
            guard.as_mut().ok_or_else(|| Error::from_reason("native workspace index is closed"))?;
        f(inner)
    }
}

/// Single-file parse for CLI `reqlan parse` — no workspace index, no Langium.
/// rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]
/// rq:["../../../reqlan rq/cli/cli_package.rq".commands]
#[napi]
pub fn parse_reqlan_source(source: String) -> Result<serde_json::Value> {
    Ok(parse_source_summary(&source))
}

fn parse_source_summary(source: &str) -> serde_json::Value {
    let parsed = parse_document(source);
    let elements: Vec<serde_json::Value> = parsed
        .model
        .imports
        .iter()
        .map(import_element)
        .chain(parsed.model.elements.iter().map(top_level_element))
        .collect();
    let diagnostics: Vec<serde_json::Value> = parsed
        .diagnostics
        .iter()
        .map(|diagnostic| {
            let severity = match diagnostic.severity {
                Severity::Error => 1,
                Severity::Warning => 2,
            };
            serde_json::json!({
                "severity": severity,
                "line": diagnostic.line + 1,
                "character": column_at(source, diagnostic.offset),
                "message": diagnostic.message,
                "text": line_text(source, diagnostic.offset),
            })
        })
        .collect();
    let error_count = diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.get("severity") == Some(&serde_json::json!(1)))
        .count();
    serde_json::json!({
        "ok": error_count == 0 && parsed.incomplete.is_none(),
        "errorCount": error_count,
        "diagnostics": diagnostics,
        "elements": elements,
    })
}

fn import_element(import: &Import) -> serde_json::Value {
    match import {
        Import::From(from) => serde_json::json!({ "type": "FromImport", "name": from.path }),
        Import::Namespace(namespace) => serde_json::json!({
            "type": "NamespaceImport",
            "name": namespace.alias.clone().unwrap_or_else(|| namespace.path.clone()),
        }),
        Import::Qualified(qualified) => {
            serde_json::json!({ "type": "QualifiedImport", "name": qualified.idea })
        }
        Import::InvalidFrom(_) => serde_json::json!({ "type": "InvalidFromImport" }),
    }
}

fn top_level_element(element: &TopLevelElement) -> serde_json::Value {
    match element {
        TopLevelElement::Idea(idea) => serde_json::json!({ "type": "Idea", "name": idea.name }),
        TopLevelElement::IdeaSet(set) => serde_json::json!({ "type": "IdeaSet", "name": set.name }),
        TopLevelElement::OneLiner(one) => {
            serde_json::json!({ "type": "OneLinerIdea", "name": one.name })
        }
        TopLevelElement::Anonymous(_) => serde_json::json!({ "type": "AnonymousBlock" }),
    }
}

fn column_at(source: &str, offset: usize) -> u32 {
    let clamped = offset.min(source.len());
    let start = source[..clamped].rfind('\n').map(|index| index + 1).unwrap_or(0);
    (clamped.saturating_sub(start) + 1) as u32
}

fn line_text(source: &str, offset: usize) -> String {
    let clamped = offset.min(source.len());
    let start = source[..clamped].rfind('\n').map(|index| index + 1).unwrap_or(0);
    let end = source[start..].find('\n').map(|index| start + index).unwrap_or(source.len());
    source.get(start..end).unwrap_or("").to_string()
}

fn map_err(error: reqlan_analytical::AnalysisError) -> Error {
    Error::from_reason(error.to_string())
}

fn map_workspace_err(error: reqlan_analytical::WorkspaceIndexError) -> Error {
    Error::from_reason(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::parse_source_summary;

    #[test]
    fn parse_source_summary_lists_oneliner_ideas() {
        let summary = parse_source_summary("hello this is a demo idea\n");
        assert_eq!(summary["ok"], serde_json::json!(true));
        assert_eq!(summary["errorCount"], serde_json::json!(0));
        assert_eq!(summary["elements"][0]["type"], "OneLinerIdea");
        assert_eq!(summary["elements"][0]["name"], "hello");
    }
}
