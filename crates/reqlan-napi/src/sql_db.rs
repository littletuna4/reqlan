//! Raw SQL bridge for TS SqliteIndexStore / IndexDiagnosticsStore facades,
//! plus the typed webview table/graph and domain read/write surfaces.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use reqlan_index::queries::{
    self, GraphViewQuery, IdeasTableQuery, IdeasetsTableQuery, ReferencesTableQuery,
};
use reqlan_index::{EdgeRecord, IdeaRecord, SqlBridge};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::util::{map_sql_bridge_err, map_store_err, parse_query};

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
    pub fn list_reference_chip_rows(
        &self,
        idea_ids: Vec<String>,
    ) -> Result<Vec<serde_json::Value>> {
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
            let (rows, total) =
                queries::list_ideas_for_graph_query_rows(bridge.connection(), &query, limit)
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
        self.with_bridge(|b| {
            queries::list_document_uris(b.connection()).map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn list_all_idea_rows(&self) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|b| {
            queries::list_all_idea_rows(b.connection()).map_err(map_sql_bridge_err)
        })
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
    pub fn get_inbound_for_file_rows(&self, file_uri: String) -> Result<Vec<serde_json::Value>> {
        self.with_bridge(|b| {
            queries::get_inbound_for_file_rows(b.connection(), &file_uri)
                .map_err(map_sql_bridge_err)
        })
    }

    #[napi]
    pub fn get_idea_at_line_row(
        &self,
        file_uri: String,
        line: i64,
    ) -> Result<Option<serde_json::Value>> {
        self.with_bridge(|b| {
            queries::get_idea_at_line_row(b.connection(), &file_uri, line)
                .map_err(map_sql_bridge_err)
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
    pub fn get_edges_for_nodes_rows(
        &self,
        node_ids: Vec<String>,
    ) -> Result<Vec<serde_json::Value>> {
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
            queries::upsert_document(
                b.connection(),
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
