//! rq:["../../../reqlan rq/cli/click.rq".click]
//! rq:["../../../reqlan rq/cli/click.rq".click_session]
//! rq:["../../../reqlan rq/cli/click.rq".click_session_limit]

use reqlan_analytical::AnalysisRuntime;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

fn scratch(label: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("reqlan-click-{label}-{nanos}"));
    std::fs::create_dir_all(dir.join(".reqlan")).unwrap();
    dir
}

fn write_graph(root: &PathBuf) {
    std::fs::write(
        root.join("graph.rq"),
        r#"alpha {
    root
    see [beta]
    see [gamma]
}

beta {
    neighbour of alpha
    see [delta]
}

gamma {
    other neighbour
}

delta {
    farther
}
"#,
    )
    .unwrap();
}

#[test]
fn click_returns_local_neighbours_for_idea_target() {
    let root = scratch("idea");
    write_graph(&root);
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let result = runtime.click("alpha", None, Some(1)).unwrap();
    assert!(!result.session_key.is_empty());
    assert_eq!(result.centers.len(), 1);
    assert_eq!(result.centers[0].name, "alpha");
    let names: Vec<_> = result.nodes.iter().map(|idea| idea.name.as_str()).collect();
    assert!(names.contains(&"beta"));
    assert!(names.contains(&"gamma"));
    assert!(!names.contains(&"delta"));
    assert_eq!(result.depth, 1);
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn click_accepts_file_path_and_path_hash_idea() {
    let root = scratch("path");
    write_graph(&root);
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let by_file = runtime.click("graph.rq", None, Some(1)).unwrap();
    assert!(!by_file.centers.is_empty());
    let by_hash = runtime.click("graph.rq#beta", Some(&by_file.session_key), Some(1)).unwrap();
    assert_eq!(by_hash.centers[0].name, "beta");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn same_session_suppresses_already_surfaced_ideas() {
    let root = scratch("suppress");
    write_graph(&root);
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let first = runtime.click("alpha", None, Some(1)).unwrap();
    assert!(first.nodes.iter().any(|idea| idea.name == "beta"));
    let second = runtime.click("alpha", Some(&first.session_key), Some(1)).unwrap();
    assert_eq!(second.session_key, first.session_key);
    assert!(second.nodes.is_empty());
    assert!(second.suppressed_count >= 2);
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn content_hash_change_allows_resurface() {
    let root = scratch("hash");
    write_graph(&root);
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let first = runtime.click("alpha", None, Some(1)).unwrap();
    assert!(first.nodes.iter().any(|idea| idea.name == "beta"));
    assert!(first.nodes.iter().any(|idea| idea.name == "gamma"));
    // Rewrite beta body only and reindex so beta fingerprint changes.
    std::fs::write(
        root.join("graph.rq"),
        r#"alpha {
    root
    see [beta]
    see [gamma]
}

beta {
    neighbour of alpha — changed body
    see [delta]
}

gamma {
    other neighbour
}

delta {
    farther
}
"#,
    )
    .unwrap();
    runtime.sync(false).unwrap();
    let second = runtime.click("alpha", Some(&first.session_key), Some(1)).unwrap();
    assert!(
        second.nodes.iter().any(|idea| idea.name == "beta"),
        "changed beta should resurface; got {:?}",
        second.nodes.iter().map(|idea| &idea.name).collect::<Vec<_>>()
    );
    assert!(
        !second.nodes.iter().any(|idea| idea.name == "gamma"),
        "unchanged gamma must stay suppressed"
    );
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn session_cache_evicts_by_count_and_last_touched() {
    let root = scratch("evict");
    write_graph(&root);
    std::fs::write(root.join(".reqlan/config.json"), r#"{"click":{"maxSessions":2}}"#).unwrap();
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let a = runtime.click("alpha", None, Some(1)).unwrap();
    thread::sleep(Duration::from_millis(5));
    let b = runtime.click("beta", None, Some(1)).unwrap();
    thread::sleep(Duration::from_millis(5));
    let c = runtime.click("gamma", None, Some(1)).unwrap();
    // Re-open sessions store indirectly: clicking with old A key should recreate
    // because A was evicted (least recently touched).
    let again_a = runtime.click("alpha", Some(&a.session_key), Some(1)).unwrap();
    assert_eq!(again_a.session_key, a.session_key);
    // Fresh session for A means prior suppressions are gone → neighbours return again.
    assert!(
        !again_a.nodes.is_empty() || again_a.suppressed_count == 0,
        "evicted session should not keep old suppressions"
    );
    // B should still exist if it was newer than A; C is newest.
    let _ = (b, c);
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn max_sessions_reads_base_config() {
    let root = scratch("config");
    write_graph(&root);
    std::fs::write(root.join(".reqlan/config.json"), r#"{"click":{"maxSessions":1}}"#).unwrap();
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let first = runtime.click("alpha", None, Some(1)).unwrap();
    thread::sleep(Duration::from_millis(5));
    let second = runtime.click("beta", None, Some(1)).unwrap();
    assert_ne!(first.session_key, second.session_key);
    // With maxSessions=1, the first session should be gone.
    let resurrected = runtime.click("alpha", Some(&first.session_key), Some(1)).unwrap();
    assert!(
        resurrected.nodes.iter().any(|idea| idea.name == "beta")
            || resurrected.suppressed_count == 0,
        "first session must have been evicted"
    );
    std::fs::remove_dir_all(&root).ok();
}
