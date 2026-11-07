//! rq:["../../../reqlan rq/core_analysis/search.rq".unified_search]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".search_rust]

use reqlan_index::{
    EdgeKind, EdgeRecord, IdeaKind, IdeaRecord, IdeaSummary, IndexStore, FILTER_NOT_PRESENT,
};
use reqlan_search::{unified_search, UnifiedHitKind, UnifiedSearchOptions};

fn summary(name: &str, file_uri: &str, text: &str, tags: &[&str]) -> IdeaSummary {
    IdeaSummary {
        id: format!("{file_uri}#{name}"),
        name: name.to_string(),
        kind: IdeaKind::Block,
        file_uri: file_uri.to_string(),
        line_start: 0,
        summary: text.to_string(),
        status: None,
        status_key: FILTER_NOT_PRESENT.to_string(),
        tags: tags.iter().map(|tag| (*tag).to_string()).collect(),
        tags_keys: vec![FILTER_NOT_PRESENT.to_string()],
        git_created_at: None,
        git_modified_at: None,
        git_change_count: None,
    }
}

fn to_record(idea: &IdeaSummary) -> IdeaRecord {
    IdeaRecord {
        id: idea.id.clone(),
        name: idea.name.clone(),
        kind: idea.kind,
        file_uri: idea.file_uri.clone(),
        line_start: idea.line_start,
        line_end: idea.line_start,
        summary: idea.summary.clone(),
        attributes_json: "{}".into(),
        content_hash: "x".into(),
        git_created_at: None,
        git_modified_at: None,
        git_change_count: None,
    }
}

fn persist(store: &mut IndexStore, ideas: &[IdeaSummary], edges: &[EdgeRecord]) {
    for idea in ideas {
        let sourced: Vec<_> =
            edges.iter().filter(|edge| edge.source_id == idea.id).cloned().collect();
        store.upsert_document(&idea.file_uri, "x", &[to_record(idea)], &sourced, None).unwrap();
    }
}

// rq:["../../../reqlan rq/core_analysis/search.rq".unified_search]
#[test]
fn unified_search_ranks_ideas_and_files_together() {
    let named = summary("auth_config", "auth.rq", "authentication configuration", &[]);
    let summarised = summary("other", "user.rq", "mentions auth in the body", &[]);
    let tagged = summary("tagged", "config.rq", "has auth tag", &["auth"]);

    let mut store = IndexStore::open_in_memory().unwrap();
    persist(&mut store, &[named, summarised, tagged], &[]);

    // Add files to the index
    store.upsert_document("src/auth.rq", "x", &[], &[], None).unwrap();
    store.upsert_document("src/user.rq", "x", &[], &[], None).unwrap();
    store.upsert_document("src/config.rq", "x", &[], &[], None).unwrap();

    let ranked =
        unified_search(&store, "auth", None, false, UnifiedSearchOptions::default()).unwrap();

    // Should have hits for ideas and files
    assert!(!ranked.hits.is_empty());

    // Check that we have both Idea and File hits
    let idea_hits: Vec<_> = ranked.hits.iter().filter(|h| h.kind == UnifiedHitKind::Idea).collect();
    let file_hits: Vec<_> = ranked.hits.iter().filter(|h| h.kind == UnifiedHitKind::File).collect();

    assert!(!idea_hits.is_empty(), "Should have idea hits");
    assert!(!file_hits.is_empty(), "Should have file hits");

    // The auth_config idea should rank high (name match)
    let auth_config = ranked.hits.iter().find(|h| h.name == "auth_config");
    assert!(auth_config.is_some(), "auth_config should be in results");
}

// rq:["../../../reqlan rq/core_analysis/search.rq".unified_search]
#[test]
fn unified_search_file_basename_exact_match() {
    let mut store = IndexStore::open_in_memory().unwrap();
    // Add a file with exact basename match
    store.upsert_document("src/auth.rq", "x", &[], &[], None).unwrap();
    store.upsert_document("src/auth_config.rq", "x", &[], &[], None).unwrap();

    let ranked =
        unified_search(&store, "auth", None, false, UnifiedSearchOptions::default()).unwrap();

    // The file "src/auth.rq" should rank very high due to basename exact match
    let auth_file =
        ranked.hits.iter().find(|h| h.kind == UnifiedHitKind::File && h.name == "auth.rq");
    assert!(auth_file.is_some(), "auth.rq file should be in results");

    // The file score should be very high (100 + for exact match)
    let auth_file = auth_file.unwrap();
    assert!(auth_file.score >= 100.0, "exact basename match should score >= 100");
}

// rq:["../../../reqlan rq/core_analysis/search.rq".unified_search]
#[test]
fn unified_search_separator_insensitive() {
    let mut store = IndexStore::open_in_memory().unwrap();
    store.upsert_document("src/auth_config.rq", "x", &[], &[], None).unwrap();
    store.upsert_document("src/auth-config.rq", "x", &[], &[], None).unwrap();
    store.upsert_document("src/auth.config.rq", "x", &[], &[], None).unwrap();

    // These should all match "auth config" query
    let ranked =
        unified_search(&store, "auth config", None, false, UnifiedSearchOptions::default())
            .unwrap();

    let hits: Vec<_> = ranked.hits.iter().filter(|h| h.kind == UnifiedHitKind::File).collect();
    assert_eq!(hits.len(), 3, "Should match all three files with different separators");
}

// rq:["../../../reqlan rq/core_analysis/search.rq".unified_search]
#[test]
fn unified_search_empty_query_returns_all() {
    let mut store = IndexStore::open_in_memory().unwrap();
    store.upsert_document("src/auth.rq", "x", &[], &[], None).unwrap();
    store.upsert_document("src/user.rq", "x", &[], &[], None).unwrap();

    let ranked = unified_search(
        &store,
        "",
        None,
        false,
        UnifiedSearchOptions { require_query: false, ..Default::default() },
    )
    .unwrap();

    // Should return all files when query is empty and require_query is false
    assert_eq!(ranked.hits.len(), 2);
    assert_eq!(ranked.total, 2);
}

// rq:["../../../reqlan rq/core_analysis/search.rq".unified_search]
#[test]
fn unified_search_pagination() {
    let mut store = IndexStore::open_in_memory().unwrap();
    for i in 0..15 {
        store.upsert_document(&format!("src/file{i}.rq"), "x", &[], &[], None).unwrap();
    }

    let ranked = unified_search(
        &store,
        "file",
        None,
        false,
        UnifiedSearchOptions { limit: Some(5), offset: 0, require_query: false },
    )
    .unwrap();

    assert_eq!(ranked.hits.len(), 5);
    assert_eq!(ranked.total, 15);
    assert!(ranked.truncated);

    let ranked_page2 = unified_search(
        &store,
        "file",
        None,
        false,
        UnifiedSearchOptions { limit: Some(5), offset: 5, require_query: false },
    )
    .unwrap();

    assert_eq!(ranked_page2.hits.len(), 5);
    assert_eq!(ranked_page2.total, 15);
    assert!(ranked_page2.truncated);
}

// rq:["../../../reqlan rq/core_analysis/search.rq".unified_search]
#[test]
fn unified_search_word_order_boost() {
    let named = summary("auth_config", "auth.rq", "authentication configuration", &[]);
    let mut store = IndexStore::open_in_memory().unwrap();
    persist(&mut store, &[named], &[]);
    store.upsert_document("src/auth.rq", "x", &[], &[], None).unwrap();

    // "auth config" should boost ordered word matches
    let ranked =
        unified_search(&store, "auth config", None, false, UnifiedSearchOptions::default())
            .unwrap();

    // auth_config idea should get ordered_words boost
    let auth_config = ranked.hits.iter().find(|h| h.name == "auth_config");
    assert!(auth_config.is_some());

    let auth_config = auth_config.unwrap();
    assert!(auth_config.reasons.iter().any(|r| r == "ordered_words"));
}
