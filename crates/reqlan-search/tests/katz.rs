//! rq:["../../../reqlan rq/modelling/advanced_analysis.rq".katz_centrality]
//! rq:["../../../reqlan rq/core_analysis/search.rq".katz_search]

use reqlan_index::{
    EdgeKind, EdgeRecord, IdeaKind, IdeaSummary, SemanticMatch, FILTER_NOT_PRESENT,
};
use reqlan_search::{apply_katz_search_bias, citation_edge_pairs, katz_centrality};
use std::collections::HashMap;

fn idea(name: &str) -> IdeaSummary {
    IdeaSummary {
        id: format!("graph.rq#{name}"),
        name: name.to_string(),
        kind: IdeaKind::Block,
        file_uri: "graph.rq".into(),
        line_start: 0,
        summary: name.to_string(),
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

fn edge(source: &str, target: &str, kind: EdgeKind, resolved: Option<bool>) -> EdgeRecord {
    EdgeRecord {
        id: format!("{source}-{target}-{}", kind.as_str()),
        source_id: source.into(),
        target_id: Some(target.into()),
        target_file: None,
        kind,
        label: None,
        source_line: None,
        snippet: None,
        is_resolved: resolved,
        source_offset_start: None,
        source_offset_end: None,
    }
}

// rq:["../../../reqlan rq/modelling/advanced_analysis.rq".katz_centrality]
#[test]
fn chain_ranks_the_cited_end_highest() {
    let nodes = vec!["a".into(), "b".into(), "c".into()];
    let edges = vec![("a".into(), "b".into()), ("b".into(), "c".into())];
    let scores = katz_centrality(&nodes, &edges);
    let score_a = scores["a"];
    let score_b = scores["b"];
    let score_c = scores["c"];
    assert!(score_c > score_b);
    assert!(score_b > score_a);
    assert!((score_c - 1.0).abs() < 1e-9);
}

// rq:["../../../reqlan rq/modelling/advanced_analysis.rq".katz_centrality]
#[test]
fn graph_with_no_citation_edges_scores_every_idea_at_one() {
    let nodes = vec!["a".into(), "b".into()];
    let scores = katz_centrality(&nodes, &[]);
    assert!((scores["a"] - 1.0).abs() < 1e-9);
    assert!((scores["b"] - 1.0).abs() < 1e-9);
}

// rq:["../../../reqlan rq/modelling/advanced_analysis.rq".katz_centrality]
#[test]
fn citation_edges_skip_unresolved_and_non_reference_kinds() {
    let nodes = vec!["a".into(), "b".into(), "c".into()];
    let edges = vec![
        edge("a", "b", EdgeKind::References, Some(false)),
        edge("a", "b", EdgeKind::FileReference, Some(true)),
        edge("a", "b", EdgeKind::IdeasetMember, Some(true)),
        edge("a", "c", EdgeKind::WildcardReference, Some(true)),
        edge("a", "outside", EdgeKind::References, Some(true)),
    ];
    let pairs = citation_edge_pairs(&nodes, &edges);
    assert_eq!(pairs, vec![("a".to_string(), "c".to_string())]);
}

// rq:["../../../reqlan rq/core_analysis/search.rq".katz_search]
#[test]
fn katz_bias_is_off_by_default_and_lifts_the_higher_score_when_on() {
    let low = idea("low_hit");
    let high = idea("high_hit");
    let nodes = vec![low.id.clone(), high.id.clone()];
    let edges = vec![(low.id.clone(), high.id.clone())];
    let scores = katz_centrality(&nodes, &edges);
    assert!(scores[&high.id] > scores[&low.id]);

    let input = vec![match_hit(low.clone(), 4.0), match_hit(high.clone(), 4.0)];
    let unchanged = apply_katz_search_bias(false, input.clone(), &HashMap::new()).unwrap();
    assert_eq!(unchanged[0].idea.name, "low_hit");
    assert_eq!(unchanged[1].idea.name, "high_hit");
    assert_eq!(unchanged[0].score, 4.0);
    assert!(unchanged
        .iter()
        .all(|entry| entry.reasons.iter().all(|reason| !reason.starts_with("katz:"))));

    let ranked = apply_katz_search_bias(true, input, &scores).unwrap();
    assert_eq!(ranked[0].idea.name, "high_hit");
    assert_eq!(ranked[1].idea.name, "low_hit");
    assert!(ranked[0].score > ranked[1].score);
    assert!(ranked[0]
        .reasons
        .iter()
        .any(|reason| reason == &format!("katz:{:.3}", scores[&high.id])));
    assert!(ranked[1]
        .reasons
        .iter()
        .any(|reason| reason == &format!("katz:{:.3}", scores[&low.id])));
}

// rq:["../../../reqlan rq/core_analysis/search.rq".katz_search]
#[test]
fn katz_bias_reports_a_missing_score() {
    let hit = idea("orphan");
    let error =
        apply_katz_search_bias(true, vec![match_hit(hit, 2.0)], &HashMap::new()).unwrap_err();
    assert_eq!(error.idea_id, "graph.rq#orphan");
}
