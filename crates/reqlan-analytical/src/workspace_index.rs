//! Workspace index lifecycle + SQL bridge for the extension IndexService facade.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]

use reqlan_index::ignore::{application_memory_path, ideas_index_path, index_diagnostics_path};
use reqlan_index::queries::{
    GraphViewQuery, IdeasTableQuery, IdeasetsTableQuery, ReferencesTableQuery,
};
use reqlan_index::sync::{
    index_one_file, sync_workspace, FileIssue, IndexOneFileResult, SyncOptions, SyncProgress,
    SyncResult,
};
use reqlan_index::{now_ms, FileIssueDraft, IndexDiagnosticsStore, IndexStore, StoreError};
use reqlan_search::{fuzzy_search, FuzzySearchResult, SearchIdeasOptions};
use serde::Serialize;
use serde_json::{json, Value as JsonValue};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use thiserror::Error;

/// Index lifecycle FSM states (ported from the former Zustand analytical store).
/// rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IndexState {
    Uninitialized,
    Opening,
    Idle,
    Syncing,
    Ready,
    Error,
    Closing,
}

impl IndexState {
    pub fn as_str(self) -> &'static str {
        match self {
            IndexState::Uninitialized => "uninitialized",
            IndexState::Opening => "opening",
            IndexState::Idle => "idle",
            IndexState::Syncing => "syncing",
            IndexState::Ready => "ready",
            IndexState::Error => "error",
            IndexState::Closing => "closing",
        }
    }

    /// Resolve the next state for `event`, matching the former TS transition table.
    fn next(self, event: &str) -> Option<IndexState> {
        use IndexState::*;
        Some(match (self, event) {
            (Uninitialized, "activate") => Opening,
            (Opening, "opened") => Idle,
            (Opening, "fail") => Error,
            (Opening, "deactivate") => Closing,
            (Idle, "sync") => Syncing,
            (Idle, "deactivate") => Closing,
            (Ready, "sync") => Syncing,
            (Ready, "deactivate") => Closing,
            (Syncing, "synced") => Ready,
            (Syncing, "fail") => Error,
            (Syncing, "deactivate") => Closing,
            // Recoverable: reopen after open failure, or soft-sync if already open.
            (Error, "activate") => Opening,
            (Error, "sync") => Syncing,
            (Error, "deactivate") => Closing,
            (Closing, "closed") => Uninitialized,
            _ => return None,
        })
    }
}

/// In-memory last-error detail (persisted state lives in the diagnostics DB).
#[derive(Debug, Clone, Default)]
struct IndexErrorState {
    message: String,
    file_uri: Option<String>,
    idea_names: Option<Vec<String>>,
    phase: Option<String>,
    cause: Option<String>,
}

/// In-memory soft-sync progress (mirrors the TS `IndexSyncProgress`).
#[derive(Debug, Clone)]
pub struct SyncProgressState {
    pub processed: usize,
    pub total: usize,
    pub current_file: Option<String>,
}

#[derive(Debug, Error)]
pub enum WorkspaceIndexError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error(transparent)]
    Diagnostics(#[from] reqlan_index::DiagnosticsError),
    #[error("{0}")]
    Message(String),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResultDto {
    pub processed: usize,
    pub total: usize,
    pub current_file: Option<String>,
    pub skipped_mtime: usize,
    pub indexed: usize,
    pub errors: usize,
    pub cancelled: bool,
    pub file_issues: Vec<FileIssueDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileIssueDto {
    pub file_uri: String,
    pub message: String,
}

impl From<SyncResult> for SyncResultDto {
    fn from(result: SyncResult) -> Self {
        let SyncResult { progress, file_issues } = result;
        Self::from_parts(progress, file_issues)
    }
}

impl SyncResultDto {
    fn from_parts(progress: SyncProgress, file_issues: Vec<FileIssue>) -> Self {
        Self {
            processed: progress.processed,
            total: progress.total,
            current_file: progress.current_file,
            skipped_mtime: progress.skipped_mtime,
            indexed: progress.indexed,
            errors: progress.errors,
            cancelled: progress.cancelled,
            file_issues: file_issues
                .into_iter()
                .map(|issue| FileIssueDto { file_uri: issue.file_uri, message: issue.message })
                .collect(),
        }
    }
}

/// Owns the ideas index + diagnostics DB, the index lifecycle FSM, and the
/// workspace sync lifecycle. Status (`status_snapshot`) is the single source of
/// truth the TS `WorkspaceIndex` reads instead of the deleted Zustand store.
pub struct WorkspaceIndexRuntime {
    workspace_root: PathBuf,
    storage_path: PathBuf,
    store: IndexStore,
    diagnostics: IndexDiagnosticsStore,
    cancel: AtomicBool,
    /// True once a full sync/ensure_ready has completed (facade fast-path gate).
    synced_once: bool,
    state: IndexState,
    idea_count: usize,
    edge_count: usize,
    last_error: Option<IndexErrorState>,
    sync_progress: Option<SyncProgressState>,
}

impl WorkspaceIndexRuntime {
    pub fn open(
        workspace_root: impl Into<PathBuf>,
        storage_path: Option<&Path>,
    ) -> Result<Self, WorkspaceIndexError> {
        let workspace_root = workspace_root.into();
        let memory = application_memory_path(&workspace_root, storage_path);
        let store = IndexStore::open(&ideas_index_path(&memory))?;
        let diagnostics = IndexDiagnosticsStore::open(&index_diagnostics_path(&memory))?;
        Ok(Self {
            workspace_root,
            storage_path: memory,
            store,
            diagnostics,
            cancel: AtomicBool::new(false),
            synced_once: false,
            state: IndexState::Uninitialized,
            idea_count: 0,
            edge_count: 0,
            last_error: None,
            sync_progress: None,
        })
    }

    pub fn workspace_root(&self) -> &Path {
        &self.workspace_root
    }

    pub fn storage_path(&self) -> &Path {
        &self.storage_path
    }

    /// Ideas-DB connection for the typed SqliteIndexStore facade (napi query surface).
    pub fn ideas_connection(&self) -> &rusqlite::Connection {
        self.store.connection()
    }

    pub fn ensure_ready(&mut self) -> Result<SyncResultDto, WorkspaceIndexError> {
        if self.synced_once {
            return Ok(SyncResultDto::from_parts(SyncProgress::default(), Vec::new()));
        }
        self.sync(false)
    }

    pub fn sync(&mut self, hard_rebuild: bool) -> Result<SyncResultDto, WorkspaceIndexError> {
        self.cancel.store(false, Ordering::Relaxed);
        let result = sync_workspace(
            &mut self.store,
            &SyncOptions { workspace_root: self.workspace_root.clone(), hard_rebuild },
            &self.cancel,
        )?;
        self.synced_once = !result.progress.cancelled;
        Ok(result.into())
    }

    pub fn cancel_sync(&self) {
        self.cancel.store(true, Ordering::Relaxed);
    }

    pub fn index_file(
        &mut self,
        file_path_or_uri: &str,
    ) -> Result<IndexOneFileResult, WorkspaceIndexError> {
        let result = index_one_file(&mut self.store, &self.workspace_root, file_path_or_uri)?;
        self.synced_once = true;
        Ok(result)
    }

    // ---- index lifecycle FSM + status (formerly the Zustand analytical store) --

    pub fn index_state(&self) -> IndexState {
        self.state
    }

    pub fn can_dispatch(&self, event: &str) -> bool {
        self.state.next(event).is_some()
    }

    /// Apply an FSM transition; returns false (no-op) when the event is invalid.
    pub fn dispatch(&mut self, event: &str) -> bool {
        match self.state.next(event) {
            Some(next) => {
                self.state = next;
                true
            }
            None => false,
        }
    }

    pub fn set_index_ready(&mut self, idea_count: usize, edge_count: usize) {
        self.idea_count = idea_count;
        self.edge_count = edge_count;
    }

    pub fn record_index_error(
        &mut self,
        message: String,
        file_uri: Option<String>,
        idea_names: Option<Vec<String>>,
        phase: Option<String>,
        cause: Option<String>,
    ) {
        self.last_error = Some(IndexErrorState { message, file_uri, idea_names, phase, cause });
    }

    pub fn clear_last_error(&mut self) {
        self.last_error = None;
    }

    pub fn set_sync_progress(&mut self, progress: Option<SyncProgressState>) {
        self.sync_progress = progress;
    }

    // ---- persisted problem list + activity rings (diagnostics DB) -------------

    pub fn record_file_issues(
        &self,
        file_uri: &str,
        issues: &[FileIssueDraft],
    ) -> Result<(), WorkspaceIndexError> {
        self.diagnostics.record_file_issues(file_uri, issues, now_ms())?;
        Ok(())
    }

    pub fn clear_file_issues(&self) -> Result<(), WorkspaceIndexError> {
        self.diagnostics.clear_file_issues()?;
        Ok(())
    }

    pub fn clear_file_issues_for_file(&self, file_uri: &str) -> Result<(), WorkspaceIndexError> {
        self.diagnostics.clear_file_issues_for_file(file_uri)?;
        Ok(())
    }

    pub fn record_document_update(
        &self,
        file_uri: &str,
        idea_count: i64,
        ideas: &JsonValue,
    ) -> Result<(), WorkspaceIndexError> {
        self.diagnostics.record_document_update(file_uri, idea_count, ideas, now_ms())?;
        Ok(())
    }

    pub fn record_workspace_change(
        &self,
        file_uri: &str,
        change: &str,
    ) -> Result<(), WorkspaceIndexError> {
        self.diagnostics.record_workspace_change(file_uri, change, now_ms())?;
        Ok(())
    }

    /// Drop persisted activity rings (Clear & rebuild).
    pub fn clear_activity(&self) -> Result<(), WorkspaceIndexError> {
        self.diagnostics.clear_activity()?;
        Ok(())
    }

    /// Raw status snapshot the TS `WorkspaceIndex` wraps into `IndexStatusSnapshot`.
    /// `fileIssues` / `lastError` keep workspace-relative display mapping in TS.
    pub fn status_snapshot(&self) -> Result<JsonValue, WorkspaceIndexError> {
        let file_issues = self.diagnostics.list_file_issues()?;
        let file_issue_count = file_issues.len();
        let last_error = self.last_error.as_ref().map(|error| {
            let mut object = json!({ "message": error.message });
            if let Some(file_uri) = &error.file_uri {
                object["fileUri"] = JsonValue::String(file_uri.clone());
            }
            if let Some(idea_names) = &error.idea_names {
                object["ideaNames"] = json!(idea_names);
            }
            if let Some(phase) = &error.phase {
                object["phase"] = JsonValue::String(phase.clone());
            }
            if let Some(cause) = &error.cause {
                object["cause"] = JsonValue::String(cause.clone());
            }
            object
        });
        let sync_progress = self.sync_progress.as_ref().map(|progress| {
            let mut object = json!({ "processed": progress.processed, "total": progress.total });
            if let Some(current) = &progress.current_file {
                object["currentFile"] = JsonValue::String(current.clone());
            }
            object
        });
        Ok(json!({
            "state": self.state.as_str(),
            "ready": self.state == IndexState::Ready,
            "ideaCount": self.idea_count,
            "edgeCount": self.edge_count,
            "fileIssueCount": file_issue_count,
            "lastError": last_error,
            "fileIssues": file_issues,
            "syncProgress": sync_progress,
            "recentDocumentUpdates": self.diagnostics.recent_document_updates(10)?,
            "recentWorkspaceChanges": self.diagnostics.recent_workspace_changes(10)?,
        }))
    }

    pub fn delete_document(&self, file_uri: &str) -> Result<(), WorkspaceIndexError> {
        self.store.delete_document(file_uri)?;
        Ok(())
    }

    pub fn clear_ideas(&self) -> Result<(), WorkspaceIndexError> {
        self.store.clear()?;
        Ok(())
    }

    pub fn idea_counts(&self) -> Result<(usize, usize), WorkspaceIndexError> {
        Ok((self.store.list_all_ideas()?.len(), self.store.get_all_edges()?.len()))
    }

    /// Rank ideas in-process; return only the capped hit list (no JS catalog).
    pub fn fuzzy_search(
        &self,
        query: &str,
        limit: Option<usize>,
        require_query: bool,
        offset: Option<usize>,
    ) -> Result<FuzzySearchResult, WorkspaceIndexError> {
        Ok(fuzzy_search(
            &self.store,
            query,
            SearchIdeasOptions { limit, offset: offset.unwrap_or(0), require_query },
        )?)
    }

    pub fn ideas_query(
        &self,
        sql: &str,
        params: &[JsonValue],
    ) -> Result<Vec<JsonValue>, WorkspaceIndexError> {
        Ok(self.store.sql_query(sql, params)?)
    }

    pub fn ideas_execute(
        &self,
        sql: &str,
        params: &[JsonValue],
    ) -> Result<usize, WorkspaceIndexError> {
        Ok(self.store.sql_execute(sql, params)?)
    }

    pub fn ideas_execute_batch(&self, sql: &str) -> Result<(), WorkspaceIndexError> {
        Ok(self.store.sql_execute_batch(sql)?)
    }

    pub fn ideas_last_insert_rowid(&self) -> i64 {
        self.store.last_insert_rowid()
    }

    pub fn diagnostics_query(
        &self,
        sql: &str,
        params: &[JsonValue],
    ) -> Result<Vec<JsonValue>, WorkspaceIndexError> {
        Ok(self.diagnostics.sql_query(sql, params)?)
    }

    pub fn diagnostics_execute(
        &self,
        sql: &str,
        params: &[JsonValue],
    ) -> Result<usize, WorkspaceIndexError> {
        Ok(self.diagnostics.sql_execute(sql, params)?)
    }

    pub fn diagnostics_execute_batch(&self, sql: &str) -> Result<(), WorkspaceIndexError> {
        Ok(self.diagnostics.sql_execute_batch(sql)?)
    }

    pub fn diagnostics_last_insert_rowid(&self) -> i64 {
        self.diagnostics.last_insert_rowid()
    }

    // ---- typed webview table/graph query surface -------------------------------

    fn parse_query<T: serde::de::DeserializeOwned>(
        value: JsonValue,
    ) -> Result<T, WorkspaceIndexError> {
        serde_json::from_value(value)
            .map_err(|error| WorkspaceIndexError::Message(error.to_string()))
    }

    pub fn count_ideas(&self, query: JsonValue) -> Result<i64, WorkspaceIndexError> {
        let query: IdeasTableQuery = Self::parse_query(query)?;
        Ok(self.store.count_ideas(&query)?)
    }

    pub fn list_ideas_page_rows(
        &self,
        query: JsonValue,
    ) -> Result<Vec<JsonValue>, WorkspaceIndexError> {
        let query: IdeasTableQuery = Self::parse_query(query)?;
        Ok(self.store.list_ideas_page_rows(&query)?)
    }

    pub fn list_reference_chip_rows(
        &self,
        idea_ids: Vec<String>,
    ) -> Result<Vec<JsonValue>, WorkspaceIndexError> {
        Ok(self.store.list_reference_chip_rows(&idea_ids)?)
    }

    pub fn count_ideasets(&self, query: JsonValue) -> Result<i64, WorkspaceIndexError> {
        let query: IdeasetsTableQuery = Self::parse_query(query)?;
        Ok(self.store.count_ideasets(&query)?)
    }

    pub fn list_ideasets_page_rows(
        &self,
        query: JsonValue,
    ) -> Result<Vec<JsonValue>, WorkspaceIndexError> {
        let query: IdeasetsTableQuery = Self::parse_query(query)?;
        Ok(self.store.list_ideasets_page_rows(&query)?)
    }

    pub fn list_ideaset_member_rows(
        &self,
        ideaset_id: &str,
        kind: &str,
        file_uri: &str,
    ) -> Result<Vec<JsonValue>, WorkspaceIndexError> {
        Ok(self.store.list_ideaset_member_rows(ideaset_id, kind, file_uri)?)
    }

    pub fn count_references(&self, query: JsonValue) -> Result<i64, WorkspaceIndexError> {
        let query: ReferencesTableQuery = Self::parse_query(query)?;
        Ok(self.store.count_references(&query)?)
    }

    pub fn list_references_page_rows(
        &self,
        query: JsonValue,
    ) -> Result<Vec<JsonValue>, WorkspaceIndexError> {
        let query: ReferencesTableQuery = Self::parse_query(query)?;
        Ok(self.store.list_references_page_rows(&query)?)
    }

    pub fn list_todo_idea_rows(&self) -> Result<Vec<JsonValue>, WorkspaceIndexError> {
        Ok(self.store.list_todo_idea_rows()?)
    }

    pub fn list_ideas_for_graph_query(
        &self,
        query: JsonValue,
        limit: i64,
    ) -> Result<JsonValue, WorkspaceIndexError> {
        let query: GraphViewQuery = Self::parse_query(query)?;
        let (rows, total) = self.store.list_ideas_for_graph_query_rows(&query, limit)?;
        Ok(serde_json::json!({ "rows": rows, "totalMatching": total }))
    }

    pub fn list_recent_git_idea_rows(
        &self,
        limit: i64,
    ) -> Result<Vec<JsonValue>, WorkspaceIndexError> {
        Ok(self.store.list_recent_git_idea_rows(limit)?)
    }

    pub fn list_idea_ids_missing_git_dates(
        &self,
        limit: i64,
        file_uri: Option<&str>,
        prefer_file_uri: Option<&str>,
    ) -> Result<Vec<String>, WorkspaceIndexError> {
        Ok(self.store.list_idea_ids_missing_git_dates(limit, file_uri, prefer_file_uri)?)
    }

    pub fn list_attribute_idea_rows(&self) -> Result<Vec<JsonValue>, WorkspaceIndexError> {
        Ok(self.store.list_attribute_idea_rows()?)
    }

    pub fn update_git_dates(
        &self,
        id: &str,
        created_at: Option<&str>,
        modified_at: Option<&str>,
        change_count: Option<i64>,
    ) -> Result<(), WorkspaceIndexError> {
        self.store.update_git_dates(id, created_at, modified_at, change_count)?;
        Ok(())
    }

    /// Fill git dates for the given idea ids (all non-ideaset ideas when None) via
    /// git history, persisting each result. Returns the count of ideas updated.
    /// rq:["../../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
    pub fn fill_git_dates(
        &self,
        idea_ids: Option<Vec<String>>,
    ) -> Result<usize, WorkspaceIndexError> {
        Ok(reqlan_index::fill_git_dates(&self.store, &self.workspace_root, idea_ids.as_deref())?)
    }

    /// Coverage metrics for the Ideas Summary Overview over the base root.
    /// rq:["../../../reqlan rq/extension/module/ideas_summary/webview.rq".overview_coverage_scores]
    pub fn compute_overview_coverage(&self) -> Result<JsonValue, WorkspaceIndexError> {
        let scores =
            reqlan_index::compute_overview_coverage(self.store.connection(), &self.workspace_root)
                .map_err(|error| WorkspaceIndexError::Message(error.to_string()))?;
        serde_json::to_value(scores)
            .map_err(|error| WorkspaceIndexError::Message(error.to_string()))
    }
}
