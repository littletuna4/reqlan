//! Webview table + graph query semantics (WHERE / ORDER / pagination / filter specials).
//! Ported from packages/analytical/src/index-store/{webview-table-queries,webview-graph-queries}.ts
//! and the page/count query bodies of sqlite-store.ts. Presentation mapping of the returned
//! raw rows (attribute formatting, reference-chip path resolution) stays in TS.
//! Idea links live in the implementing submodules.

// Names the inline `tests` module consumes through `use super::*`.
#[allow(unused_imports)]
use crate::types::{FILTER_EMPTY, FILTER_NOT_PRESENT};
#[allow(unused_imports)]
use serde_json::json;

mod common;
mod filters;
mod graph_queries;
mod page_queries;
mod store_ops;
mod table_queries;

pub use filters::{
    ColumnFilter, GraphViewQuery, IdeasTableQuery, IdeasetsTableQuery, ReferenceFilter,
    ReferencesTableQuery,
};
pub use graph_queries::{
    build_graph_filter_where, build_graph_truncation_order, GRAPH_MAX_NODES, GRAPH_NODES_HARD_CAP,
};
pub use page_queries::{
    count_ideas, count_ideasets, count_references, list_attribute_idea_rows,
    list_idea_ids_missing_git_dates, list_ideas_for_graph_query_rows, list_ideas_page_rows,
    list_ideaset_member_rows, list_ideasets_page_rows, list_recent_git_idea_rows,
    list_reference_chip_rows, list_references_page_rows, list_todo_idea_rows,
    ACTIVITY_BAR_TODO_LIMIT,
};
pub use store_ops::{
    all_idea_raw_rows, clear_all, count_edges_from_file, count_unresolved_for_idea, counts,
    get_all_edge_rows, get_document_hash, get_document_mtime_ms, get_edges_for_nodes_rows,
    get_edges_from_rows, get_edges_referencing_file_rows, get_edges_to_rows, get_idea_at_line_row,
    get_idea_row, get_ideas_by_ids_rows, get_ideas_in_file_rows, get_ideaset_at_line_row,
    get_inbound_for_file_rows, list_all_idea_rows, list_document_mtime_rows, list_document_uris,
    list_file_reference_target_rows, list_ideas_in_file_with_range_rows,
    list_ideasets_in_file_with_range_rows, list_references_for_idea, remove_documents,
    search_idea_rows, update_document_mtime, update_git_dates, upsert_document, upsert_documents,
    DocumentUpsert,
};
pub use table_queries::{
    build_ideas_order, build_ideas_where, build_ideasets_order, build_ideasets_where,
    build_reference_filter_clause, build_references_order, build_references_where,
    edge_kinds_for_reference_view_types,
};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::IndexStore;
    use crate::types::{EdgeKind, EdgeRecord, IdeaKind, IdeaRecord};

    fn idea(id: &str, name: &str, file: &str, line: u32, attributes: &str) -> IdeaRecord {
        IdeaRecord {
            id: id.to_string(),
            name: name.to_string(),
            kind: IdeaKind::Block,
            file_uri: file.to_string(),
            line_start: line,
            line_end: line,
            summary: String::new(),
            attributes_json: attributes.to_string(),
            content_hash: "h".to_string(),
            git_created_at: None,
            git_modified_at: None,
            git_change_count: None,
        }
    }

    fn edge(id: &str, source: &str, target: Option<&str>, kind: EdgeKind) -> EdgeRecord {
        EdgeRecord {
            id: id.to_string(),
            source_id: source.to_string(),
            target_id: target.map(str::to_string),
            target_file: None,
            kind,
            label: None,
            source_line: None,
            snippet: None,
            is_resolved: Some(true),
            source_offset_start: None,
            source_offset_end: None,
        }
    }

    fn seeded() -> IndexStore {
        let mut store = IndexStore::open_in_memory().unwrap();
        let ideas = vec![
            idea("f.rq#alpha", "alpha", "f.rq", 1, r#"{"status":"done","tags":["core"]}"#),
            idea("f.rq#beta", "beta", "f.rq", 2, r#"{"status":"pending","todo":"finish me"}"#),
            idea("g.rq#gamma", "gamma", "g.rq", 1, r#"{"tags":[]}"#),
            idea("g.rq#delta", "delta", "g.rq", 2, r#"{}"#),
        ];
        let edges = vec![edge("e1", "f.rq#alpha", Some("g.rq#gamma"), EdgeKind::References)];
        store.upsert_document("f.rq", "h1", &ideas[..2], &edges, None).unwrap();
        store.upsert_document("g.rq", "h2", &ideas[2..], &[], None).unwrap();
        store
    }

    #[test]
    fn inbound_for_file_returns_edges_targeting_ideas_in_file() {
        let store = seeded();
        let rows = get_inbound_for_file_rows(store.connection(), "g.rq").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["source_id"], json!("f.rq#alpha"));
        assert_eq!(rows[0]["target_id"], json!("g.rq#gamma"));
        assert_eq!(rows[0]["source_name"], json!("alpha"));
        assert_eq!(rows[0]["target_name"], json!("gamma"));
        assert_eq!(rows[0]["kind"], json!("references"));
    }

    #[test]
    fn inbound_for_file_returns_file_reference_targeting_file() {
        let mut store = IndexStore::open_in_memory().unwrap();
        let ideas = vec![
            idea("src.rq#alpha", "alpha", "src.rq", 1, "{}"),
            idea("g.rq#gamma", "gamma", "g.rq", 1, "{}"),
        ];
        let mut file_edge = edge("e-file", "src.rq#alpha", None, EdgeKind::FileReference);
        file_edge.target_file = Some("g.rq".into());
        file_edge.label = Some("g.rq".into());
        store.upsert_document("src.rq", "h1", &ideas[..1], &[file_edge], None).unwrap();
        store.upsert_document("g.rq", "h2", &ideas[1..], &[], None).unwrap();
        let rows = get_inbound_for_file_rows(store.connection(), "g.rq").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["kind"], json!("file_reference"));
        assert_eq!(rows[0]["source_name"], json!("alpha"));
        assert_eq!(rows[0]["target_file"], json!("g.rq"));
    }

    #[test]
    fn inbound_for_file_returns_file_reference_targeting_code_file() {
        let mut store = IndexStore::open_in_memory().unwrap();
        let ideas = vec![idea("src.rq#owner", "owner", "src.rq", 1, "{}")];
        let edges = vec![EdgeRecord {
            id: "e-file".to_string(),
            source_id: "src.rq#owner".to_string(),
            target_id: None,
            target_file: Some("lib.ts".to_string()),
            kind: EdgeKind::FileReference,
            label: Some("lib.ts".to_string()),
            source_line: Some(2),
            snippet: None,
            is_resolved: Some(true),
            source_offset_start: None,
            source_offset_end: None,
        }];
        store.upsert_document("src.rq", "h1", &ideas, &edges, None).unwrap();
        let rows = get_inbound_for_file_rows(store.connection(), "lib.ts").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["kind"], json!("file_reference"));
        assert_eq!(rows[0]["source_name"], json!("owner"));
        assert_eq!(rows[0]["target_file"], json!("lib.ts"));
    }

    #[test]
    fn ideas_pagination_respects_page_size() {
        let store = seeded();
        let mut q = IdeasTableQuery { page_size: 2, ..Default::default() };
        let total = count_ideas(store.connection(), &q).unwrap();
        assert_eq!(total, 4);
        let page0 = list_ideas_page_rows(store.connection(), &q).unwrap();
        assert_eq!(page0.len(), 2);
        q.page = 1;
        let page1 = list_ideas_page_rows(store.connection(), &q).unwrap();
        assert_eq!(page1.len(), 2);
        // Default order is by file_uri, line_start: f.rq#alpha, f.rq#beta then g.rq...
        assert_eq!(page0[0]["id"], json!("f.rq#alpha"));
        assert_eq!(page1[0]["id"], json!("g.rq#gamma"));
    }

    #[test]
    fn graph_filter_status_not_present() {
        let store = seeded();
        // Not present: ideas without a status key => gamma, delta.
        let not_present = GraphViewQuery {
            status_filter: Some(vec![FILTER_NOT_PRESENT.to_string()]),
            ..Default::default()
        };
        let (rows, total) =
            list_ideas_for_graph_query_rows(store.connection(), &not_present, 100).unwrap();
        assert_eq!(total, 2);
        let names: Vec<&str> = rows.iter().map(|r| r["name"].as_str().unwrap()).collect();
        assert!(names.contains(&"gamma"));
        assert!(names.contains(&"delta"));
    }

    #[test]
    fn graph_filter_where_emits_special_clauses() {
        // FILTER_EMPTY / FILTER_NOT_PRESENT semantics are generated into the WHERE clause.
        let q = GraphViewQuery {
            status_filter: Some(vec![
                FILTER_NOT_PRESENT.to_string(),
                FILTER_EMPTY.to_string(),
                "done".to_string(),
            ]),
            ..Default::default()
        };
        let (sql, params) = build_graph_filter_where(&q);
        assert!(sql.contains("json_extract(i.attributes_json, ?) IS NULL"));
        assert!(sql.contains("TRIM(CAST(json_extract(i.attributes_json, ?) AS TEXT)) = ''"));
        assert!(sql.contains("json_extract(i.attributes_json, ?) IN (?)"));
        // path (missing) + 5 empty paths + path + concrete value.
        assert_eq!(params.len(), 8);
    }

    #[test]
    fn graph_filter_concrete_status() {
        let store = seeded();
        let q =
            GraphViewQuery { status_filter: Some(vec!["done".to_string()]), ..Default::default() };
        let (rows, total) = list_ideas_for_graph_query_rows(store.connection(), &q, 100).unwrap();
        assert_eq!(total, 1);
        assert_eq!(rows[0]["name"], json!("alpha"));
    }

    #[test]
    fn todo_prefilter_matches_todo_key() {
        let store = seeded();
        let rows = list_todo_idea_rows(store.connection()).unwrap();
        let names: Vec<&str> = rows.iter().map(|r| r["name"].as_str().unwrap()).collect();
        assert_eq!(names, vec!["beta"]);
    }

    #[test]
    fn reference_chips_cover_both_directions() {
        let store = seeded();
        let rows = list_reference_chip_rows(
            store.connection(),
            &["f.rq#alpha".to_string(), "g.rq#gamma".to_string()],
        )
        .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["source_id"], json!("f.rq#alpha"));
        assert_eq!(rows[0]["target_id"], json!("g.rq#gamma"));
    }

    #[test]
    fn ideasets_include_file_and_explicit() {
        let store = seeded();
        let q = IdeasetsTableQuery { page_size: 50, ..Default::default() };
        let total = count_ideasets(store.connection(), &q).unwrap();
        // Two documents (file ideasets); no explicit ideaset ideas seeded.
        assert_eq!(total, 2);
        let rows = list_ideasets_page_rows(store.connection(), &q).unwrap();
        assert_eq!(rows.len(), 2);
    }

    #[test]
    fn references_page_lists_edges() {
        let store = seeded();
        let q = ReferencesTableQuery { page_size: 50, ..Default::default() };
        assert_eq!(count_references(store.connection(), &q).unwrap(), 1);
        let rows = list_references_page_rows(store.connection(), &q).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["source_name"], json!("alpha"));
    }

    #[test]
    fn missing_git_dates_lists_all_ideas_initially() {
        let store = seeded();
        let ids = list_idea_ids_missing_git_dates(store.connection(), 40, None, None).unwrap();
        assert_eq!(ids.len(), 4);
    }

    #[test]
    fn document_hash_and_mtime_roundtrip() {
        let store = seeded();
        let conn = store.connection();
        assert_eq!(get_document_hash(conn, "f.rq").unwrap().as_deref(), Some("h1"));
        assert_eq!(get_document_hash(conn, "missing.rq").unwrap(), None);
        assert_eq!(get_document_mtime_ms(conn, "f.rq").unwrap(), None);
        update_document_mtime(conn, "f.rq", 1234.0).unwrap();
        assert_eq!(get_document_mtime_ms(conn, "f.rq").unwrap(), Some(1234.0));
        let uris = list_document_uris(conn).unwrap();
        assert_eq!(uris, vec!["f.rq".to_string(), "g.rq".to_string()]);
    }

    #[test]
    fn idea_lookups_by_id_and_line() {
        let store = seeded();
        let conn = store.connection();
        let alpha = get_idea_row(conn, "f.rq#alpha").unwrap().unwrap();
        assert_eq!(alpha["name"], json!("alpha"));
        assert!(get_idea_row(conn, "nope").unwrap().is_none());
        let at_line = get_idea_at_line_row(conn, "f.rq", 2).unwrap().unwrap();
        assert_eq!(at_line["name"], json!("beta"));
        assert!(get_ideaset_at_line_row(conn, "f.rq", 2).unwrap().is_none());
        let by_ids =
            get_ideas_by_ids_rows(conn, &["f.rq#alpha".to_string(), "g.rq#delta".to_string()])
                .unwrap();
        assert_eq!(by_ids.len(), 2);
        assert!(get_ideas_by_ids_rows(conn, &[]).unwrap().is_empty());
    }

    #[test]
    fn references_for_idea_covers_both_directions() {
        let store = seeded();
        let conn = store.connection();
        let alpha = list_references_for_idea(conn, "f.rq#alpha").unwrap();
        assert_eq!(alpha["outbound"].as_array().unwrap().len(), 1);
        assert_eq!(alpha["inbound"].as_array().unwrap().len(), 0);
        assert_eq!(alpha["outbound"][0]["target_name"], json!("gamma"));
        let gamma = list_references_for_idea(conn, "g.rq#gamma").unwrap();
        assert_eq!(gamma["inbound"].as_array().unwrap().len(), 1);
        assert_eq!(gamma["inbound"][0]["source_name"], json!("alpha"));
    }

    #[test]
    fn edges_counts_and_node_batch() {
        let store = seeded();
        let conn = store.connection();
        assert_eq!(get_all_edge_rows(conn).unwrap().len(), 1);
        assert_eq!(
            get_edges_for_nodes_rows(conn, &["f.rq#alpha".to_string(), "g.rq#gamma".to_string()])
                .unwrap()
                .len(),
            1
        );
        assert!(get_edges_for_nodes_rows(conn, &[]).unwrap().is_empty());
        assert_eq!(count_edges_from_file(conn, "f.rq").unwrap(), 1);
        let totals = counts(conn).unwrap();
        assert_eq!(totals["ideas"], json!(4));
        assert_eq!(totals["edges"], json!(1));
    }

    #[test]
    fn remove_documents_deletes_ideas_and_edges() {
        let store = seeded();
        let conn = store.connection();
        remove_documents(conn, &["f.rq".to_string()]).unwrap();
        let totals = counts(conn).unwrap();
        assert_eq!(totals["ideas"], json!(2));
        assert_eq!(totals["edges"], json!(0));
        clear_all(conn).unwrap();
        let totals = counts(conn).unwrap();
        assert_eq!(totals["ideas"], json!(0));
    }
}
