//! Workspace index lifecycle + SQL bridge for the extension IndexService facade.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]

use reqlan_index::ignore::{application_memory_path, ideas_index_path, index_diagnostics_path};
use reqlan_index::sync::{
    index_one_file, sync_workspace, FileIssue, IndexOneFileResult, SyncOptions, SyncProgress,
    SyncResult,
};
use reqlan_index::{IndexDiagnosticsStore, IndexStore, StoreError};
use reqlan_search::{fuzzy_search, FuzzySearchResult, SearchIdeasOptions};
use serde::Serialize;
use serde_json::Value as JsonValue;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use thiserror::Error;

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

/// Owns the ideas index + diagnostics DB and workspace sync lifecycle.
pub struct WorkspaceIndexRuntime {
    workspace_root: PathBuf,
    storage_path: PathBuf,
    store: IndexStore,
    diagnostics: IndexDiagnosticsStore,
    cancel: AtomicBool,
    ready: bool,
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
            ready: false,
        })
    }

    pub fn workspace_root(&self) -> &Path {
        &self.workspace_root
    }

    pub fn storage_path(&self) -> &Path {
        &self.storage_path
    }

    pub fn ensure_ready(&mut self) -> Result<SyncResultDto, WorkspaceIndexError> {
        if self.ready {
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
        self.ready = !result.progress.cancelled;
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
        self.ready = true;
        Ok(result)
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
}
