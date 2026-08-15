use reqlan_index::{
    idea_id, EdgeKind, EdgeRecord, IdeaKind, IdeaRecord, IdeaSummary, IndexStore, SemanticMatch,
    FILTER_NOT_PRESENT,
};
use reqlan_search::{
    apply_context_distance_scoring, normalize_context_ref, rerank_matches_with_context,
    resolve_search_context_refs, CONTEXT_UNREACHABLE_HOP,
};
use std::collections::HashMap;
use std::path::Path;

fn idea(name: &str, file_uri: &str) -> IdeaSummary {
    IdeaSummary {
        id: format!("{file_uri}#{name}"),
        name: name.to_string(),
        kind: IdeaKind::Block,
        file_uri: file_uri.to_string(),
        line_start: 0,
        summary: String::new(),
        status: None,
        status_key: FILTER_NOT_PRESENT.to_string(),
        tags: Vec::new(),
        tags_keys: vec![FILTER_NOT_PRESENT.to_string()],
        git_created_at: None,
        git_modified_at: None,
        git_change_count: None,
    }
}

fn match_hit(summary: IdeaSummary, score: f64) -> SemanticMatch {
    SemanticMatch { idea: summary, score, reasons: vec!["name match".into()] }
}

fn to_record(summary: &IdeaSummary) -> IdeaRecord {
    IdeaRecord {
        id: summary.id.clone(),
        name: summary.name.clone(),
        kind: summary.kind,
        file_uri: summary.file_uri.clone(),
        line_start: summary.line_start,
        line_end: summary.line_start,
        summary: summary.summary.clone(),
        attributes_json: "{}".into(),
        content_hash: "x".into(),
        git_created_at: None,
        git_modified_at: None,
        git_change_count: None,
    }
}

fn persist_idea(store: &mut IndexStore, summary: &IdeaSummary) {
    store.upsert_document(&summary.file_uri, "x", &[to_record(summary)], &[], None).unwrap();
}

fn persist_with_edges(store: &mut IndexStore, ideas: &[IdeaSummary], edges: &[EdgeRecord]) {
    for summary in ideas {
        let sourced: Vec<_> =
            edges.iter().filter(|edge| edge.source_id == summary.id).cloned().collect();
        store
            .upsert_document(&summary.file_uri, "x", &[to_record(summary)], &sourced, None)
            .unwrap();
    }
}

// rq:["../../../reqlan rq/core_analysis/search.rq".contextual_search]
#[test]
fn strips_bracket_wrappers() {
    assert_eq!(normalize_context_ref("  [fuzzy_search] "), "fuzzy_search");
    assert_eq!(normalize_context_ref("plain"), "plain");
}

// rq:["../../../reqlan rq/core_analysis/search.rq".contextual_search]
#[test]
fn nearer_ideas_rank_above_farther_with_equal_text_scores() {
    let near = idea("near", "a.rq");
    let mid = idea("mid", "b.rq");
    let far = idea("far", "c.rq");
    let distances =
        HashMap::from([(near.id.clone(), 0u32), (mid.id.clone(), 1u32), (far.id.clone(), 2u32)]);
    let mut ranked = apply_context_distance_scoring(
        vec![
            match_hit(far.clone(), 4.0),
            match_hit(mid.clone(), 4.0),
            match_hit(near.clone(), 4.0),
        ],
        &distances,
    );
    ranked.sort_by(|left, right| right.score.partial_cmp(&left.score).unwrap());
    assert_eq!(
        ranked.iter().map(|entry| entry.idea.name.as_str()).collect::<Vec<_>>(),
        vec!["near", "mid", "far"]
    );
    assert_eq!(ranked[0].score, 4.0);
    assert_eq!(ranked[1].score, 2.0);
    assert_eq!(ranked[2].score, 1.0);
    assert!(ranked[0].reasons.iter().any(|reason| reason == "context:0 hops"));
    assert!(ranked[2].reasons.iter().any(|reason| reason == "context:2 hops"));
}

// rq:["../../../reqlan rq/core_analysis/search.rq".contextual_search]
#[test]
fn unreachable_ideas_use_the_floor_hop() {
    let orphan = idea("orphan", "x.rq");
    let scored = apply_context_distance_scoring(vec![match_hit(orphan, 8.0)], &HashMap::new());
    assert_eq!(scored[0].score, 8.0 * 0.5_f64.powi(CONTEXT_UNREACHABLE_HOP as i32));
    assert!(scored[0].reasons.iter().any(|reason| reason == "context:unreachable"));
}

// rq:["../../../reqlan rq/core_analysis/search.rq".contextual_search]
#[test]
fn reranks_using_graph_edges_from_context_seeds() {
    let seed = idea("seed", "a.rq");
    let near = idea("near_hit", "b.rq");
    let far = idea("far_hit", "c.rq");
    let edges = vec![
        EdgeRecord {
            id: "e1".into(),
            source_id: seed.id.clone(),
            target_id: Some(near.id.clone()),
            target_file: None,
            kind: EdgeKind::References,
            label: None,
            source_line: None,
            snippet: None,
            is_resolved: Some(true),
        },
        EdgeRecord {
            id: "e2".into(),
            source_id: near.id.clone(),
            target_id: Some(far.id.clone()),
            target_file: None,
            kind: EdgeKind::References,
            label: None,
            source_line: None,
            snippet: None,
            is_resolved: Some(true),
        },
    ];
    let mut store = IndexStore::open_in_memory().unwrap();
    persist_with_edges(&mut store, &[seed.clone(), near.clone(), far.clone()], &edges);
    let ranked = rerank_matches_with_context(
        &store,
        vec![match_hit(far.clone(), 4.0), match_hit(near.clone(), 4.0)],
        std::slice::from_ref(&seed.id),
    )
    .unwrap();
    assert_eq!(
        ranked.iter().map(|entry| entry.idea.name.as_str()).collect::<Vec<_>>(),
        vec!["near_hit", "far_hit"]
    );
}

// rq:["../../../reqlan rq/core_analysis/search.rq".contextual_search]
#[test]
fn leaves_matches_unchanged_when_context_is_empty() {
    let a = idea("a", "a.rq");
    let b = idea("b", "b.rq");
    let store = IndexStore::open_in_memory().unwrap();
    let input = vec![match_hit(a, 3.0), match_hit(b, 5.0)];
    let ranked = rerank_matches_with_context(&store, input.clone(), &[]).unwrap();
    assert_eq!(ranked[0].idea.name, "a");
    assert_eq!(ranked[1].idea.name, "b");
    assert_eq!(ranked[0].score, 3.0);
    assert_eq!(ranked[1].score, 5.0);
}

// rq:["../../../reqlan rq/core_analysis/search.rq".contextual_search]
#[test]
fn resolves_path_hash_name_to_a_single_idea() {
    let near = idea("near", "core/search.rq");
    let far = idea("far", "other/file.rq");
    let twin = idea("near", "dup/search.rq");
    let mut store = IndexStore::open_in_memory().unwrap();
    persist_idea(&mut store, &near);
    persist_idea(&mut store, &far);
    persist_idea(&mut store, &twin);
    let ids = resolve_search_context_refs(
        &store,
        Path::new("/workspace"),
        &["core/search.rq#near".into()],
    )
    .unwrap();
    assert_eq!(ids, vec![idea_id("core/search.rq", "near")]);
}

// rq:["../../../reqlan rq/core_analysis/search.rq".contextual_search]
#[test]
fn resolves_rq_path_to_all_ideas_in_that_file() {
    let near = idea("near", "core/search.rq");
    let mut store = IndexStore::open_in_memory().unwrap();
    persist_idea(&mut store, &near);
    let ids =
        resolve_search_context_refs(&store, Path::new("/workspace"), &["core/search.rq".into()])
            .unwrap();
    assert_eq!(ids, vec![near.id]);
}

// rq:["../../../reqlan rq/core_analysis/search.rq".contextual_search]
#[test]
fn resolves_bare_name_to_all_exact_name_matches() {
    let near = idea("near", "core/search.rq");
    let twin = idea("near", "dup/search.rq");
    let mut store = IndexStore::open_in_memory().unwrap();
    persist_idea(&mut store, &near);
    persist_idea(&mut store, &twin);
    let mut ids =
        resolve_search_context_refs(&store, Path::new("/workspace"), &["near".into()]).unwrap();
    ids.sort();
    let mut expected = vec![near.id, twin.id];
    expected.sort();
    assert_eq!(ids, expected);
}
