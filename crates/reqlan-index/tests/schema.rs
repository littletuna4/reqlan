//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
//! rq:["../../../reqlan rq/indexer/indexer.rq".index]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".cutover]

use reqlan_index::schema::SCHEMA_VERSION;
use reqlan_index::{extract_indexed_document, ExtractOptions, IndexStore};

fn demo_doc() -> reqlan_index::IndexedDocument {
    extract_indexed_document(
        "demo.rq",
        "demo {\n    body\n    @status pending\n}\n",
        &ExtractOptions::default(),
    )
}

// rq:["../../../reqlan rq/indexer/indexer.rq".index]
#[test]
fn opens_at_schema_version_4() {
    let store = IndexStore::open_in_memory().unwrap();
    assert_eq!(store.schema_version().unwrap(), SCHEMA_VERSION);
    assert_eq!(SCHEMA_VERSION, 4);
}

// rq:["../../../reqlan rq/indexer/indexer.rq".index]
#[test]
fn schema_v4_columns_round_trip_git_count_and_mtime() {
    let mut store = IndexStore::open_in_memory().unwrap();
    let mut document = demo_doc();
    document.ideas[0].git_change_count = Some(3);
    store.persist_extracted(document, Some(1_700_000_000_000.0)).unwrap();
    let ideas = store.all_idea_records().unwrap();
    assert_eq!(ideas[0].git_change_count, Some(3));
    assert_eq!(store.get_document_mtime_ms("demo.rq").unwrap(), Some(1_700_000_000_000.0));
}

// rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
#[test]
fn schema_v4_file_reopens_after_drop() {
    let dir = std::env::temp_dir().join(format!("reqlan-schema-v4-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("ideas-index.sqlite");
    {
        let mut store = IndexStore::open(&path).unwrap();
        let mut document = demo_doc();
        document.ideas[0].git_change_count = Some(3);
        store.persist_extracted(document, Some(1_700_000_000_000.0)).unwrap();
        assert_eq!(store.schema_version().unwrap(), 4);
    }
    let store = IndexStore::open(&path).unwrap();
    assert_eq!(store.schema_version().unwrap(), 4);
    let ideas = store.all_idea_records().unwrap();
    assert_eq!(ideas[0].git_change_count, Some(3));
    assert_eq!(store.get_document_mtime_ms("demo.rq").unwrap(), Some(1_700_000_000_000.0));
    let _ = std::fs::remove_dir_all(&dir);
}

// rq:["../../../reqlan rq/core_analysis/rust_port.rq".cutover]
#[test]
fn opens_sqljs_written_schema_v4_fixture() {
    let src = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/schema-v4-sqljs.sqlite");
    let dir = std::env::temp_dir().join(format!("reqlan-sqljs-fixture-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("ideas-index.sqlite");
    std::fs::copy(&src, &path).unwrap();
    let store = IndexStore::open(&path).unwrap();
    assert_eq!(store.schema_version().unwrap(), 4);
    let ideas = store.all_idea_records().unwrap();
    assert_eq!(ideas[0].name, "demo");
    assert_eq!(ideas[0].git_change_count, Some(3));
    assert_eq!(store.get_document_mtime_ms("demo.rq").unwrap(), Some(1_700_000_000_000.0));
    let _ = std::fs::remove_dir_all(&dir);
}

// rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
#[test]
fn persist_replaces_ideas_for_the_same_file() {
    let mut store = IndexStore::open_in_memory().unwrap();
    store.persist_extracted(demo_doc(), Some(1.0)).unwrap();
    let updated = extract_indexed_document(
        "demo.rq",
        "renamed {\n    new body\n}\n",
        &ExtractOptions::default(),
    );
    store.persist_extracted(updated, Some(2.0)).unwrap();
    let ideas = store.list_all_ideas().unwrap();
    assert_eq!(ideas.len(), 1);
    assert_eq!(ideas[0].name, "renamed");
}
