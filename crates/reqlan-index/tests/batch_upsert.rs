//! rq:["../../../reqlan rq/indexer/cache-reuse.rq".batched_document_upsert]

use reqlan_index::{
    extract_indexed_document, DocumentUpsert, EdgeKind, EdgeRecord, ExtractOptions, IdeaKind,
    IdeaRecord, IndexStore, IndexedDocument,
};

fn doc(path: &str, name: &str) -> IndexedDocument {
    extract_indexed_document(
        path,
        &format!("{name} {{\n    body\n    @status pending\n}}\n"),
        &ExtractOptions::default(),
    )
}

fn idea(id: &str, name: &str, file: &str) -> IdeaRecord {
    IdeaRecord {
        id: id.to_string(),
        name: name.to_string(),
        kind: IdeaKind::Block,
        file_uri: file.to_string(),
        line_start: 1,
        line_end: 1,
        summary: String::new(),
        attributes_json: "{}".to_string(),
        content_hash: "h".to_string(),
        git_created_at: None,
        git_modified_at: None,
        git_change_count: None,
    }
}

fn edge(id: &str, source: &str, target: Option<&str>) -> EdgeRecord {
    EdgeRecord {
        id: id.to_string(),
        source_id: source.to_string(),
        target_id: target.map(str::to_string),
        target_file: None,
        kind: EdgeKind::References,
        label: None,
        source_line: None,
        snippet: None,
        is_resolved: Some(true),
        source_offset_start: None,
        source_offset_end: None,
    }
}

#[test]
fn persist_extracted_batch_commits_multiple_documents() {
    let mut store = IndexStore::open_in_memory().unwrap();
    store
        .persist_extracted_batch([
            (doc("a.rq", "alpha"), Some(1.0)),
            (doc("b.rq", "beta"), Some(2.0)),
        ])
        .unwrap();
    let ideas = store.list_all_ideas().unwrap();
    assert_eq!(ideas.len(), 2);
    assert_eq!(store.get_document_mtime_ms("a.rq").unwrap(), Some(1.0));
    assert_eq!(store.get_document_mtime_ms("b.rq").unwrap(), Some(2.0));
}

#[test]
fn persist_extracted_batch_empty_is_noop() {
    let mut store = IndexStore::open_in_memory().unwrap();
    store.persist_extracted_batch([]).unwrap();
    assert_eq!(store.counts().unwrap(), (0, 0));
}

#[test]
fn upsert_documents_rolls_back_entire_batch_on_error() {
    let mut store = IndexStore::open_in_memory().unwrap();
    let good_ideas = [idea("ok.rq#ok", "ok", "ok.rq")];
    let bad_ideas = [idea("bad.rq#bad", "bad", "bad.rq")];
    // Edge source is not an indexed idea → foreign key fails the batch.
    let bad_edges = [edge("e-bad", "missing.rq#ghost", Some("bad.rq#bad"))];
    let err = store
        .upsert_documents(&[
            DocumentUpsert {
                file_uri: "ok.rq",
                content_hash: "h1",
                ideas: &good_ideas,
                edges: &[],
                mtime_ms: Some(1.0),
            },
            DocumentUpsert {
                file_uri: "bad.rq",
                content_hash: "h2",
                ideas: &bad_ideas,
                edges: &bad_edges,
                mtime_ms: Some(2.0),
            },
        ])
        .unwrap_err();
    assert!(err.to_string().contains("FOREIGN KEY") || err.to_string().contains("constraint"));
    assert_eq!(store.get_document_hash("ok.rq").unwrap(), None);
    assert_eq!(store.get_document_hash("bad.rq").unwrap(), None);
    assert_eq!(store.counts().unwrap(), (0, 0));
}
