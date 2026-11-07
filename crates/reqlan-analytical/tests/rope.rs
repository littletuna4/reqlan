//! rq:["../../../reqlan rq/core_analysis/rope.rq".rope]
//! rq:["../../../reqlan rq/core_analysis/rope.rq".algorithm]
//! rq:["../../../reqlan rq/core_analysis/rope.rq".rope-idea-cardinality]
//! rq:["../../../reqlan rq/core_analysis/rope.rq".rope-tuning]
//! rq:["../../../reqlan rq/core_analysis/rope.rq".click-store-context-optimisation]

use reqlan_analytical::{AnalysisRuntime, RopeOptions, RopeTuning};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn scratch(label: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("reqlan-rope-{label}-{nanos}"));
    std::fs::create_dir_all(dir.join(".reqlan")).unwrap();
    dir
}

/// Chain alpha -> beta -> gamma -> delta so hop depth and cardinality are distinct.
fn write_graph(root: &PathBuf) {
    std::fs::write(
        root.join("graph.rq"),
        r#"alpha {
    root
    see [beta]
}

beta {
    neighbour of alpha
    see [gamma]
}

gamma {
    middle
    see [delta]
}

delta {
    farther
}
"#,
    )
    .unwrap();
}

fn rope<'a>(
    runtime: &mut AnalysisRuntime,
    target: &'a str,
    session: Option<&'a str>,
    fray: Option<u32>,
    tuning: RopeTuning,
) -> reqlan_analytical::ClickResult {
    runtime.rope(RopeOptions { target, session_key: session, fray, tuning }).unwrap()
}

fn candidate_names(result: &reqlan_analytical::ClickResult) -> Vec<&str> {
    result
        .candidates
        .as_ref()
        .expect("rope candidates")
        .iter()
        .map(|candidate| candidate.name.as_str())
        .collect()
}

#[test]
fn rope_returns_cardinality_ranked_hops() {
    let root = scratch("unique");
    write_graph(&root);
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let result = rope(&mut runtime, "alpha", None, Some(3), RopeTuning::Default);
    assert_eq!(result.kind, "rope");
    let target = result.target.clone().expect("rope centre target");
    assert_eq!(target.name, "alpha");
    let candidates = result.candidates.expect("rope candidates");
    let names: Vec<_> = candidates.iter().map(|candidate| candidate.name.as_str()).collect();
    assert_eq!(names, vec!["beta", "gamma"], "hop order first");
    let hops: Vec<_> = candidates.iter().map(|candidate| candidate.hops).collect();
    assert_eq!(hops, vec![Some(1), Some(2)], "{candidates:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn rope_session_dedup_skips_already_surfaced_ideas() {
    let root = scratch("dedup");
    write_graph(&root);
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let pre = rope(&mut runtime, "beta", None, Some(3), RopeTuning::Default);
    assert_eq!(pre.kind, "rope");
    let pre_names = candidate_names(&pre);
    assert!(pre_names.contains(&"alpha") && pre_names.contains(&"gamma"), "{pre_names:?}");
    rope(&mut runtime, "alpha", Some("sess"), Some(3), RopeTuning::Default);
    let post = rope(&mut runtime, "beta", Some("sess"), Some(3), RopeTuning::Default);
    assert_eq!(post.kind, "rope");
    let post_names = candidate_names(&post);
    assert!(
        !post_names.contains(&"gamma"),
        "ideas surfaced by the alpha rope must be dropped: {post_names:?}"
    );
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn rope_ambiguous_ranks_by_session_hop_distance() {
    let root = scratch("ambiguous");
    std::fs::write(
        root.join("graph.rq"),
        r#"far {
    away
    see [shared]
}

shared {
    linker
}
"#,
    )
    .unwrap();
    std::fs::write(
        root.join("other.rq"),
        r#"shared {
    other
}
"#,
    )
    .unwrap();
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let unranked = rope(&mut runtime, "shared", None, None, RopeTuning::Default);
    assert_eq!(unranked.kind, "ambiguous");
    assert!(unranked.target.is_none());
    assert_eq!(candidate_names(&unranked).len(), 2);
    // Surfacing `far` first must put far's `shared` (one hop away) before the other file's.
    rope(&mut runtime, "far", Some("sess"), Some(1), RopeTuning::Default);
    let ranked = rope(&mut runtime, "shared", Some("sess"), None, RopeTuning::Default);
    let candidates = ranked.candidates.expect("ambiguous candidates");
    assert!(
        candidates[0].id.ends_with("graph.rq#shared")
            && candidates[0].file_uri.ends_with("graph.rq"),
        "session-adjacent match first: {candidates:?}"
    );
    assert!(candidates[0].hops.is_some(), "{candidates:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn rope_focused_limits_to_adjacent_hops() {
    let root = scratch("focused");
    write_graph(&root);
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let focused = rope(&mut runtime, "alpha", None, Some(1), RopeTuning::Focused);
    assert_eq!(focused.kind, "rope");
    let names = candidate_names(&focused);
    assert_eq!(names, vec!["beta"], "fray 1 keeps adjacent hops only: {names:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn rope_search_fallback_without_exact_target() {
    let root = scratch("fallback");
    write_graph(&root);
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let result = rope(&mut runtime, "neighbour", None, None, RopeTuning::Default);
    assert_eq!(result.kind, "search");
    assert!(result.target.is_none());
    let names = candidate_names(&result);
    assert!(names.contains(&"beta"), "fuzzy fallback hit: {names:?}");
    std::fs::remove_dir_all(&root).ok();
}
