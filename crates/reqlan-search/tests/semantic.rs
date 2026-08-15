//! rq:["../../../reqlan rq/core_analysis/search.rq".semantic_search]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".search_rust]

use reqlan_index::{
    EdgeKind, EdgeRecord, IdeaKind, IdeaRecord, IdeaSummary, IndexStore, FILTER_NOT_PRESENT,
};
use reqlan_search::semantic_search;

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

// rq:["../../../reqlan rq/core_analysis/search.rq".semantic_search]
#[test]
fn ranks_name_hits_ahead_of_summary_and_tag_hits() {
    let named = summary("cli_package", "a.rq", "unrelated", &[]);
    let summarised = summary("other", "b.rq", "mentions cli_package in the body", &[]);
    let tagged = summary("tagged", "c.rq", "cli_package tag holder", &["cli_package"]);
    let mut store = IndexStore::open_in_memory().unwrap();
    persist(&mut store, &[named, summarised, tagged], &[]);
    let ranked = semantic_search(&store, "cli_package", None, 8).unwrap();
    assert_eq!(ranked[0].idea.name, "cli_package");
    assert!(ranked[0].score >= ranked[1].score);
    assert!(ranked.iter().any(|entry| entry.idea.name == "other"));
    assert!(ranked.iter().any(|entry| entry.idea.name == "tagged"));
    assert!(ranked[0].reasons.iter().any(|reason| reason == "name match"));
}

// rq:["../../../reqlan rq/core_analysis/search.rq".semantic_search]
#[test]
fn scores_reference_labels_and_query_tokens() {
    let source = summary("exporter", "a.rq", "html template writer", &[]);
    let target = summary("html_export", "b.rq", "", &[]);
    let edge = EdgeRecord {
        id: "e1".into(),
        source_id: source.id.clone(),
        target_id: Some(target.id.clone()),
        target_file: None,
        kind: EdgeKind::References,
        label: Some("html template".into()),
        source_line: None,
        snippet: None,
        is_resolved: Some(true),
    };
    let mut store = IndexStore::open_in_memory().unwrap();
    persist(&mut store, &[source, target], &[edge]);
    let ranked = semantic_search(&store, "html template", None, 8).unwrap();
    assert!(ranked.iter().any(|entry| {
        entry.idea.name == "exporter"
            && entry.reasons.iter().any(|reason| reason == "reference label")
    }));
    assert!(ranked
        .iter()
        .any(|entry| entry.reasons.iter().any(|reason| reason.starts_with("token:"))));
}
