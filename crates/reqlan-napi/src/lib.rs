//! Node binding for the core AnalysisApi + workspace index.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use reqlan_analytical::{
    AnalysisRuntime, ExportRequestDto, FileIssueDraft, SearchRequirementsOptions,
    SyncProgressState, WorkspaceIndexRuntime,
};
use reqlan_index::queries::{
    self, GraphViewQuery, IdeasTableQuery, IdeasetsTableQuery, ReferencesTableQuery,
};
use reqlan_index::{EdgeRecord, IdeaRecord, SqlBridge};
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

    // ---- typed webview table/graph query surface (see reqlan-index queries.rs) --

    #[napi]
    pub fn count_ideas(&self, query: serde_json::Value) -> Result<i64> {
        let query: IdeasTableQuery = parse_query(query)?;
        self.with_bridge(|bridge| {
            queries::count_ideas(bridge.connection(), &query).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_ideas_page_rows(&self, query: serde_json::Value) -> Result<Vec<serde_json::Value>> {
        let query: IdeasTableQuery = parse_query(query)?;
        self.with_bridge(|bridge| {
            queries::list_ideas_page_rows(bridge.connection(), &query).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_reference_chip_rows(&self, idea_ids: Vec<String>) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|bridge| {
            queries::list_reference_chip_rows(bridge.connection(), &idea_ids)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn count_ideasets(&self, query: serde_json::Value) -> Result<i64> {
        let query: IdeasetsTableQuery = parse_query(query)?;
        self.with_bridge(|bridge| {
            queries::count_ideasets(bridge.connection(), &query).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_ideasets_page_rows(
        &self,
        query: serde_json::Value,
    ) -> Result<Vec<serde_json::Value>> {
        let query: IdeasetsTableQuery = parse_query(query)?;
        self.with_bridge(|bridge| {
            queries::list_ideasets_page_rows(bridge.connection(), &query)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_ideaset_member_rows(
        &self,
        ideaset_id: String,
        kind: String,
        file_uri: String,
    ) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|bridge| {
            queries::list_ideaset_member_rows(bridge.connection(), &ideaset_id, &kind, &file_uri)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn count_references(&self, query: serde_json::Value) -> Result<i64> {
        let query: ReferencesTableQuery = parse_query(query)?;
        self.with_bridge(|bridge| {
            queries::count_references(bridge.connection(), &query).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_references_page_rows(
        &self,
        query: serde_json::Value,
    ) -> Result<Vec<serde_json::Value>> {
        let query: ReferencesTableQuery = parse_query(query)?;
        self.with_bridge(|bridge| {
            queries::list_references_page_rows(bridge.connection(), &query)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_todo_idea_rows(&self) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|bridge| {
            queries::list_todo_idea_rows(bridge.connection()).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_ideas_for_graph_query(
        &self,
        query: serde_json::Value,
        limit: i64,
    ) -> Result<serde_json::Value> {
        let query: GraphViewQuery = parse_query(query)?;
        self.with_bridge(|bridge| {
            let (rows, total) = queries::list_ideas_for_graph_query_rows(
                bridge.connection(),
                &query,
                limit,
            )
            .map_err(map_sql_bridge_err)?;
            Ok(serde_json::json!({ "rows": rows, "totalMatching": total }))
        })
    }

    #[napi]
    pub fn list_recent_git_idea_rows(&self, limit: i64) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|bridge| {
            queries::list_recent_git_idea_rows(bridge.connection(), limit)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_idea_ids_missing_git_dates(
        &self,
        limit: i64,
        file_uri: Option<String>,
        prefer_file_uri: Option<String>,
    ) -> Result<Vec<String>> {
        self.with_bridge(|bridge| {
            queries::list_idea_ids_missing_git_dates(
                bridge.connection(),
                limit,
                file_uri.as_deref(),
                prefer_file_uri.as_deref(),
            )
            .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_attribute_idea_rows(&self) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|bridge| {
            queries::list_attribute_idea_rows(bridge.connection()).map_err(map_sql_bridge_err)
        })
    }

    // ---- typed domain read/write surface (see reqlan-index queries.rs) ----------

    #[napi]
    pub fn migrate_ideas_schema(&self) -> Result<()> {
        self.with_bridge(|b| reqlan_index::store::migrate(b.connection()).map_err(map_store_err))
    }

    #[napi]
    pub fn get_document_hash(&self, file_uri: String) -> Result<Option<String>> {
        self.with_bridge(|b| {
            queries::get_document_hash(b.connection(), &file_uri).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_document_mtime_ms(&self, file_uri: String) -> Result<Option<f64>> {
        self.with_bridge(|b| {
            queries::get_document_mtime_ms(b.connection(), &file_uri).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_document_mtime_rows(&self) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|b| {
            queries::list_document_mtime_rows(b.connection()).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_document_uris(&self) -> Result<Vec<String>> {
        self.with_bridge(|b| queries::list_document_uris(b.connection()).map_err(map_sql_bridge_err))
    }

    #[napi]
    pub fn list_all_idea_rows(&self) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|b| queries::list_all_idea_rows(b.connection()).map_err(map_sql_bridge_err))
    }

    #[napi]
    pub fn get_idea_row(&self, id: String) -> Result<Option<serde_json::Value>> {
        self.with_bridge(|b| queries::get_idea_row(b.connection(), &id).map_err(map_sql_bridge_err))
    }

    #[napi]
    pub fn get_ideas_in_file_rows(&self, file_uri: String) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|b| {
            queries::get_ideas_in_file_rows(b.connection(), &file_uri).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_idea_at_line_row(
        &self,
        file_uri: String,
        line: i64,
    ) -> Result<Option<serde_json::Value>> {
        self.with_bridge(|b| {
            queries::get_idea_at_line_row(b.connection(), &file_uri, line).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_ideaset_at_line_row(
        &self,
        file_uri: String,
        line: i64,
    ) -> Result<Option<serde_json::Value>> {
        self.with_bridge(|b| {
            queries::get_ideaset_at_line_row(b.connection(), &file_uri, line)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_ideas_in_file_with_range_rows(
        &self,
        file_uri: String,
    ) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|b| {
            queries::list_ideas_in_file_with_range_rows(b.connection(), &file_uri)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_ideasets_in_file_with_range_rows(
        &self,
        file_uri: String,
    ) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|b| {
            queries::list_ideasets_in_file_with_range_rows(b.connection(), &file_uri)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_ideas_by_ids_rows(&self, ids: Vec<String>) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|b| {
            queries::get_ideas_by_ids_rows(b.connection(), &ids).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn search_idea_rows(&self, search: String) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|b| {
            queries::search_idea_rows(b.connection(), &search).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_references_for_idea(&self, idea_id: String) -> Result<serde_json::Value> {
        self.with_bridge(|b| {
            queries::list_references_for_idea(b.connection(), &idea_id).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn count_unresolved_for_idea(&self, idea_id: String) -> Result<i64> {
        self.with_bridge(|b| {
            queries::count_unresolved_for_idea(b.connection(), &idea_id).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn count_edges_from_file(&self, file_uri: String) -> Result<i64> {
        self.with_bridge(|b| {
            queries::count_edges_from_file(b.connection(), &file_uri).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_edges_from_rows(&self, source_id: String) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|b| {
            queries::get_edges_from_rows(b.connection(), &source_id).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_edges_to_rows(&self, target_id: String) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|b| {
            queries::get_edges_to_rows(b.connection(), &target_id).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_edges_for_nodes_rows(&self, node_ids: Vec<String>) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|b| {
            queries::get_edges_for_nodes_rows(b.connection(), &node_ids).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_edges_referencing_file_rows(
        &self,
        file_path: String,
    ) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|b| {
            queries::get_edges_referencing_file_rows(b.connection(), &file_path)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_all_edge_rows(&self) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|b| queries::get_all_edge_rows(b.connection()).map_err(map_sql_bridge_err))
    }

    #[napi]
    pub fn list_file_reference_target_rows(&self) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|b| {
            queries::list_file_reference_target_rows(b.connection()).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn all_idea_raw_rows(&self) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|b| queries::all_idea_raw_rows(b.connection()).map_err(map_sql_bridge_err))
    }

    #[napi]
    pub fn counts(&self) -> Result<serde_json::Value> {
        self.with_bridge(|b| queries::counts(b.connection()).map_err(map_sql_bridge_err))
    }

    #[napi]
    pub fn update_document_mtime(&self, file_uri: String, mtime_ms: f64) -> Result<()> {
        self.with_bridge(|b| {
            queries::update_document_mtime(b.connection(), &file_uri, mtime_ms)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn update_git_dates(
        &self,
        id: String,
        created_at: Option<String>,
        modified_at: Option<String>,
        change_count: Option<i64>,
    ) -> Result<()> {
        self.with_bridge(|b| {
            queries::update_git_dates(
                b.connection(),
                &id,
                created_at.as_deref(),
                modified_at.as_deref(),
                change_count,
            )
            .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn clear_all(&self) -> Result<()> {
        self.with_bridge(|b| queries::clear_all(b.connection()).map_err(map_sql_bridge_err))
    }

    #[napi]
    pub fn remove_documents(&self, file_uris: Vec<String>) -> Result<()> {
        self.with_bridge(|b| {
            queries::remove_documents(b.connection(), &file_uris).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn upsert_document(
        &self,
        file_uri: String,
        content_hash: String,
        ideas: serde_json::Value,
        edges: serde_json::Value,
        mtime_ms: Option<f64>,
    ) -> Result<()> {
        let ideas: Vec<IdeaRecord> = parse_query(ideas)?;
        let edges: Vec<EdgeRecord> = parse_query(edges)?;
        self.with_bridge(|b| {
            queries::upsert_document(b.connection(), &file_uri, &content_hash, &ideas, &edges, mtime_ms)
                .map_err(map_sql_bridge_err)
        })
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

    // ---- index lifecycle FSM + status snapshot (formerly the Zustand store) ----

    #[napi]
    pub fn status_snapshot(&self) -> Result<serde_json::Value> {
        self.with_mut(|inner| inner.status_snapshot().map_err(map_workspace_err))
    }

    #[napi]
    pub fn index_state(&self) -> Result<String> {
        self.with_mut(|inner| Ok(inner.index_state().as_str().to_string()))
    }

    #[napi]
    pub fn can_dispatch_index(&self, event: String) -> Result<bool> {
        self.with_mut(|inner| Ok(inner.can_dispatch(&event)))
    }

    #[napi]
    pub fn dispatch_index(&self, event: String) -> Result<bool> {
        self.with_mut(|inner| Ok(inner.dispatch(&event)))
    }

    #[napi]
    pub fn set_index_ready(&self, idea_count: i64, edge_count: i64) -> Result<()> {
        self.with_mut(|inner| {
            inner.set_index_ready(idea_count.max(0) as usize, edge_count.max(0) as usize);
            Ok(())
        })
    }

    #[napi]
    pub fn record_index_error(
        &self,
        message: String,
        file_uri: Option<String>,
        idea_names: Option<Vec<String>>,
        phase: Option<String>,
        cause: Option<String>,
    ) -> Result<()> {
        self.with_mut(|inner| {
            inner.record_index_error(message, file_uri, idea_names, phase, cause);
            Ok(())
        })
    }

    #[napi]
    pub fn clear_last_error(&self) -> Result<()> {
        self.with_mut(|inner| {
            inner.clear_last_error();
            Ok(())
        })
    }

    #[napi]
    pub fn set_sync_progress(&self, progress: Option<serde_json::Value>) -> Result<()> {
        let parsed = match progress {
            Some(value) => Some(parse_sync_progress(value)?),
            None => None,
        };
        self.with_mut(|inner| {
            inner.set_sync_progress(parsed);
            Ok(())
        })
    }

    #[napi]
    pub fn record_file_issues(&self, file_uri: String, issues: serde_json::Value) -> Result<()> {
        let drafts: Vec<FileIssueDraft> = parse_query(issues)?;
        self.with_mut(|inner| {
            inner.record_file_issues(&file_uri, &drafts).map_err(map_workspace_err)
        })
    }

    #[napi]
    pub fn clear_file_issues(&self) -> Result<()> {
        self.with_mut(|inner| inner.clear_file_issues().map_err(map_workspace_err))
    }

    #[napi]
    pub fn clear_file_issues_for_file(&self, file_uri: String) -> Result<()> {
        self.with_mut(|inner| inner.clear_file_issues_for_file(&file_uri).map_err(map_workspace_err))
    }

    #[napi]
    pub fn record_document_update(
        &self,
        file_uri: String,
        idea_count: i64,
        ideas: serde_json::Value,
    ) -> Result<()> {
        self.with_mut(|inner| {
            inner.record_document_update(&file_uri, idea_count, &ideas).map_err(map_workspace_err)
        })
    }

    #[napi]
    pub fn record_workspace_change(&self, file_uri: String, change: String) -> Result<()> {
        self.with_mut(|inner| {
            inner.record_workspace_change(&file_uri, &change).map_err(map_workspace_err)
        })
    }

    #[napi]
    pub fn clear_activity(&self) -> Result<()> {
        self.with_mut(|inner| inner.clear_activity().map_err(map_workspace_err))
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

    // ---- typed webview table/graph query surface (see reqlan-index queries.rs) --

    #[napi]
    pub fn count_ideas(&self, query: serde_json::Value) -> Result<i64> {
        self.with_mut(|inner| inner.count_ideas(query).map_err(map_workspace_err))
    }

    #[napi]
    pub fn list_ideas_page_rows(
        &self,
        query: serde_json::Value,
    ) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| inner.list_ideas_page_rows(query).map_err(map_workspace_err))
    }

    #[napi]
    pub fn list_reference_chip_rows(
        &self,
        idea_ids: Vec<String>,
    ) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| inner.list_reference_chip_rows(idea_ids).map_err(map_workspace_err))
    }

    #[napi]
    pub fn count_ideasets(&self, query: serde_json::Value) -> Result<i64> {
        self.with_mut(|inner| inner.count_ideasets(query).map_err(map_workspace_err))
    }

    #[napi]
    pub fn list_ideasets_page_rows(
        &self,
        query: serde_json::Value,
    ) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| inner.list_ideasets_page_rows(query).map_err(map_workspace_err))
    }

    #[napi]
    pub fn list_ideaset_member_rows(
        &self,
        ideaset_id: String,
        kind: String,
        file_uri: String,
    ) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| {
            inner
                .list_ideaset_member_rows(&ideaset_id, &kind, &file_uri)
                .map_err(map_workspace_err)
        })
    }

    #[napi]
    pub fn count_references(&self, query: serde_json::Value) -> Result<i64> {
        self.with_mut(|inner| inner.count_references(query).map_err(map_workspace_err))
    }

    #[napi]
    pub fn list_references_page_rows(
        &self,
        query: serde_json::Value,
    ) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| inner.list_references_page_rows(query).map_err(map_workspace_err))
    }

    #[napi]
    pub fn list_todo_idea_rows(&self) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| inner.list_todo_idea_rows().map_err(map_workspace_err))
    }

    #[napi]
    pub fn list_ideas_for_graph_query(
        &self,
        query: serde_json::Value,
        limit: i64,
    ) -> Result<serde_json::Value> {
        self.with_mut(|inner| inner.list_ideas_for_graph_query(query, limit).map_err(map_workspace_err))
    }

    #[napi]
    pub fn list_recent_git_idea_rows(&self, limit: i64) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| inner.list_recent_git_idea_rows(limit).map_err(map_workspace_err))
    }

    #[napi]
    pub fn list_idea_ids_missing_git_dates(
        &self,
        limit: i64,
        file_uri: Option<String>,
        prefer_file_uri: Option<String>,
    ) -> Result<Vec<String>> {
        self.with_mut(|inner| {
            inner
                .list_idea_ids_missing_git_dates(limit, file_uri.as_deref(), prefer_file_uri.as_deref())
                .map_err(map_workspace_err)
        })
    }

    #[napi]
    pub fn list_attribute_idea_rows(&self) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| inner.list_attribute_idea_rows().map_err(map_workspace_err))
    }

    #[napi]
    pub fn update_git_dates(
        &self,
        id: String,
        created_at: Option<String>,
        modified_at: Option<String>,
        change_count: Option<i64>,
    ) -> Result<()> {
        self.with_mut(|inner| {
            inner
                .update_git_dates(&id, created_at.as_deref(), modified_at.as_deref(), change_count)
                .map_err(map_workspace_err)
        })
    }

    /// Fill git dates for the given idea ids (all non-ideaset ideas when omitted).
    /// Returns the number of ideas whose dates were persisted.
    /// rq:["../../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
    #[napi]
    pub fn fill_git_dates(&self, idea_ids: Option<Vec<String>>) -> Result<u32> {
        self.with_mut(|inner| {
            let updated = inner.fill_git_dates(idea_ids).map_err(map_workspace_err)?;
            Ok(updated as u32)
        })
    }

    /// Coverage metrics for the Ideas Summary Overview over the base root.
    /// rq:["../../../reqlan rq/extension/module/ideas_summary/webview.rq".overview_coverage_scores]
    #[napi]
    pub fn compute_overview_coverage(&self) -> Result<serde_json::Value> {
        self.with_mut(|inner| inner.compute_overview_coverage().map_err(map_workspace_err))
    }

    // ---- typed domain read/write surface over the ideas DB ----------------------

    #[napi]
    pub fn migrate_ideas_schema(&self) -> Result<()> {
        self.with_mut(|inner| {
            reqlan_index::store::migrate(inner.ideas_connection()).map_err(map_store_err)
        })
    }

    #[napi]
    pub fn get_document_hash(&self, file_uri: String) -> Result<Option<String>> {
        self.with_mut(|inner| {
            queries::get_document_hash(inner.ideas_connection(), &file_uri)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_document_mtime_ms(&self, file_uri: String) -> Result<Option<f64>> {
        self.with_mut(|inner| {
            queries::get_document_mtime_ms(inner.ideas_connection(), &file_uri)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_document_mtime_rows(&self) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| {
            queries::list_document_mtime_rows(inner.ideas_connection()).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_document_uris(&self) -> Result<Vec<String>> {
        self.with_mut(|inner| {
            queries::list_document_uris(inner.ideas_connection()).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_all_idea_rows(&self) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| {
            queries::list_all_idea_rows(inner.ideas_connection()).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_idea_row(&self, id: String) -> Result<Option<serde_json::Value>> {
        self.with_mut(|inner| {
            queries::get_idea_row(inner.ideas_connection(), &id).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_ideas_in_file_rows(&self, file_uri: String) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| {
            queries::get_ideas_in_file_rows(inner.ideas_connection(), &file_uri)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_idea_at_line_row(
        &self,
        file_uri: String,
        line: i64,
    ) -> Result<Option<serde_json::Value>> {
        self.with_mut(|inner| {
            queries::get_idea_at_line_row(inner.ideas_connection(), &file_uri, line)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_ideaset_at_line_row(
        &self,
        file_uri: String,
        line: i64,
    ) -> Result<Option<serde_json::Value>> {
        self.with_mut(|inner| {
            queries::get_ideaset_at_line_row(inner.ideas_connection(), &file_uri, line)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_ideas_in_file_with_range_rows(
        &self,
        file_uri: String,
    ) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| {
            queries::list_ideas_in_file_with_range_rows(inner.ideas_connection(), &file_uri)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_ideasets_in_file_with_range_rows(
        &self,
        file_uri: String,
    ) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| {
            queries::list_ideasets_in_file_with_range_rows(inner.ideas_connection(), &file_uri)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_ideas_by_ids_rows(&self, ids: Vec<String>) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| {
            queries::get_ideas_by_ids_rows(inner.ideas_connection(), &ids)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn search_idea_rows(&self, search: String) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| {
            queries::search_idea_rows(inner.ideas_connection(), &search)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_references_for_idea(&self, idea_id: String) -> Result<serde_json::Value> {
        self.with_mut(|inner| {
            queries::list_references_for_idea(inner.ideas_connection(), &idea_id)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn count_unresolved_for_idea(&self, idea_id: String) -> Result<i64> {
        self.with_mut(|inner| {
            queries::count_unresolved_for_idea(inner.ideas_connection(), &idea_id)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn count_edges_from_file(&self, file_uri: String) -> Result<i64> {
        self.with_mut(|inner| {
            queries::count_edges_from_file(inner.ideas_connection(), &file_uri)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_edges_from_rows(&self, source_id: String) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| {
            queries::get_edges_from_rows(inner.ideas_connection(), &source_id)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_edges_to_rows(&self, target_id: String) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| {
            queries::get_edges_to_rows(inner.ideas_connection(), &target_id)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_edges_for_nodes_rows(&self, node_ids: Vec<String>) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| {
            queries::get_edges_for_nodes_rows(inner.ideas_connection(), &node_ids)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_edges_referencing_file_rows(
        &self,
        file_path: String,
    ) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| {
            queries::get_edges_referencing_file_rows(inner.ideas_connection(), &file_path)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_all_edge_rows(&self) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| {
            queries::get_all_edge_rows(inner.ideas_connection()).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_file_reference_target_rows(&self) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| {
            queries::list_file_reference_target_rows(inner.ideas_connection())
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn all_idea_raw_rows(&self) -> Result<Vec<serde_json::Value>> {
        self.with_mut(|inner| {
            queries::all_idea_raw_rows(inner.ideas_connection()).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn counts(&self) -> Result<serde_json::Value> {
        self.with_mut(|inner| {
            queries::counts(inner.ideas_connection()).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn update_document_mtime(&self, file_uri: String, mtime_ms: f64) -> Result<()> {
        self.with_mut(|inner| {
            queries::update_document_mtime(inner.ideas_connection(), &file_uri, mtime_ms)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn clear_all(&self) -> Result<()> {
        self.with_mut(|inner| {
            queries::clear_all(inner.ideas_connection()).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn remove_documents(&self, file_uris: Vec<String>) -> Result<()> {
        self.with_mut(|inner| {
            queries::remove_documents(inner.ideas_connection(), &file_uris)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn upsert_document(
        &self,
        file_uri: String,
        content_hash: String,
        ideas: serde_json::Value,
        edges: serde_json::Value,
        mtime_ms: Option<f64>,
    ) -> Result<()> {
        let ideas: Vec<IdeaRecord> = parse_query(ideas)?;
        let edges: Vec<EdgeRecord> = parse_query(edges)?;
        self.with_mut(|inner| {
            queries::upsert_document(
                inner.ideas_connection(),
                &file_uri,
                &content_hash,
                &ideas,
                &edges,
                mtime_ms,
            )
            .map_err(map_sql_bridge_err)
        })
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

/// Top-level idea names in a document — used by git-context historical extract.
/// rq:["../../../reqlan rq/extension/features-graph-analysers.rq".git_dates]
#[napi]
pub fn extract_idea_names(source: String) -> Vec<String> {
    let parsed = parse_document(&source);
    parsed
        .model
        .elements
        .iter()
        .filter_map(|element| element.name())
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .collect()
}

/// Plan a barrel transform from source text (no filesystem writes).
/// The TS wrapper performs the writes; this keeps the plan engine native.
/// rq:["../../../reqlan rq/extension/features-commands.rq".barrel_page]
#[napi]
pub fn barrel_page_plan(
    source: String,
    container_name: Option<String>,
    source_file_name: String,
) -> Result<serde_json::Value> {
    let plan = reqlan_parse::plan_barrel_page(
        &source,
        container_name.as_deref(),
        &source_file_name,
    )
    .map_err(Error::from_reason)?;
    Ok(serde_json::json!({
        "containerName": plan.container_name,
        "containerContent": plan.container_content,
        "children": plan
            .children
            .iter()
            .map(|child| serde_json::json!({
                "ideaName": child.idea_name,
                "fileName": child.file_name,
                "content": child.content,
            }))
            .collect::<Vec<_>>(),
        "preservedIdeasets": plan.preserved_ideasets,
    }))
}

/// Seed a reqlan base marker (`.reqlan/` + `config.json` + `.rqignore`).
/// rq:["../../../reqlan rq/extension/module/index.rq".rqignore]
#[napi]
pub fn create_base(base_root: String) -> Result<serde_json::Value> {
    let result = reqlan_index::create_base(std::path::Path::new(&base_root))
        .map_err(|error| Error::from_reason(error.to_string()))?;
    Ok(serde_json::json!({
        "created": result.created,
        "memoryPath": result.memory_path.to_string_lossy(),
    }))
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

fn map_sql_bridge_err(error: reqlan_index::SqlBridgeError) -> Error {
    Error::from_reason(error.to_string())
}

fn map_store_err(error: reqlan_index::StoreError) -> Error {
    Error::from_reason(error.to_string())
}

fn parse_query<T: serde::de::DeserializeOwned>(value: serde_json::Value) -> Result<T> {
    serde_json::from_value(value).map_err(|error| Error::from_reason(error.to_string()))
}

fn parse_sync_progress(value: serde_json::Value) -> Result<SyncProgressState> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Wire {
        processed: usize,
        total: usize,
        #[serde(default)]
        current_file: Option<String>,
    }
    let wire: Wire = parse_query(value)?;
    Ok(SyncProgressState {
        processed: wire.processed,
        total: wire.total,
        current_file: wire.current_file,
    })
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
