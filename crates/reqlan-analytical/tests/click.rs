//! rq:["../../../reqlan rq/cli/click.rq".click]
//! rq:["../../../reqlan rq/cli/click.rq".click_input]
//! rq:["../../../reqlan rq/cli/click.rq".click_ambiguity]
//! rq:["../../../reqlan rq/cli/click.rq".click_max_detail]
//! rq:["../../../reqlan rq/cli/click.rq".click_output]
//! rq:["../../../reqlan rq/cli/click.rq".click_session]
//! rq:["../../../reqlan rq/cli/click.rq".click_session_limit]
//! rq:["../../../reqlan rq/cli/click.rq".click_code_file]

use reqlan_analytical::{AnalysisRuntime, ClickOptions};
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

fn click<'a>(
    runtime: &mut AnalysisRuntime,
    target: &'a str,
    session: Option<&'a str>,
) -> reqlan_analytical::ClickResult {
    let mut options = ClickOptions::new(target);
    if let Some(session) = session {
        options = options.with_session(session);
    }
    runtime.click(options).unwrap()
}

#[test]
fn click_returns_unique_idea_without_edges() {
    let root = scratch("idea");
    write_graph(&root);
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let result = click(&mut runtime, "alpha", None);
    assert!(!result.session_key.is_empty());
    assert_eq!(result.kind, "unique");
    let target = result.target.expect("unique target");
    assert_eq!(target.name, "alpha");
    assert!(target.content.as_deref().is_some_and(|content| content.contains("root")));
    let outbound = result.outbound.expect("outbound");
    let names: Vec<_> = outbound.items.iter().map(|item| item.name.as_str()).collect();
    assert!(names.contains(&"beta"));
    assert!(names.contains(&"gamma"));
    assert!(!names.contains(&"delta"));
    assert!(result.candidates.is_none());
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn click_outbound_lists_content_refs_only() {
    let root = scratch("outbound-scope");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(
        root.join("graph.rq"),
        r#"hub {
    centre
    see [spoke]
    impl ["./src/app.ts"]
    @tests (
        ["./src/hub.test.ts:covers hub"]
    )
}

spoke {
    leaf
}

other {
    later
    ["./src/other.ts"]
}
"#,
    )
    .unwrap();
    std::fs::write(root.join("src").join("app.ts"), "// rq:[hub]\nexport const n = 1;\n").unwrap();
    std::fs::write(root.join("src").join("hub.test.ts"), "export const t = 1;\n").unwrap();
    std::fs::write(root.join("src").join("other.ts"), "export const o = 1;\n").unwrap();
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let result = click(&mut runtime, "hub", None);
    assert_eq!(result.kind, "unique");
    let outbound = result.outbound.expect("outbound");
    let names: Vec<_> = outbound.items.iter().map(|item| item.name.as_str()).collect();
    assert!(names.contains(&"spoke"), "content idea ref missing: {names:?}");
    assert!(names.contains(&"app.ts"), "content file ref missing: {names:?}");
    assert!(!names.contains(&"hub.test.ts"), "tests must not be outbound: {names:?}");
    assert!(!names.iter().any(|name| name.contains("covers hub")), "{names:?}");
    assert!(!names.contains(&"other.ts"), "sibling-file refs must not be outbound: {names:?}");
    assert!(!names.contains(&"other"), "{names:?}");
    assert!(names.iter().all(|name| !name.contains('"')), "quoted names: {names:?}");
    assert_eq!(outbound.total, 2, "outbound {names:?}");
    let siblings = result.siblings.expect("siblings");
    let sibling_names: Vec<_> = siblings.items.iter().map(|item| item.name.as_str()).collect();
    assert!(sibling_names.contains(&"spoke"));
    assert!(sibling_names.contains(&"other"));
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn click_accepts_file_path_as_one_file_node() {
    let root = scratch("path");
    write_graph(&root);
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let by_file = click(&mut runtime, "graph.rq", None);
    assert_eq!(by_file.kind, "unique");
    assert_eq!(by_file.target.as_ref().map(|target| target.kind.as_str()), Some("file"));
    let siblings = by_file.siblings.expect("rq file siblings");
    assert!(siblings.items.iter().any(|item| item.name == "alpha"));
    let by_hash = click(&mut runtime, "graph.rq#beta", Some(&by_file.session_key));
    assert_eq!(by_hash.kind, "unique");
    assert_eq!(by_hash.target.as_ref().map(|target| target.name.as_str()), Some("beta"));
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn click_revisit_returns_connected_content() {
    let root = scratch("revisit");
    write_graph(&root);
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let first = click(&mut runtime, "alpha", None);
    assert_eq!(first.kind, "unique");
    let second = click(&mut runtime, "alpha", Some(&first.session_key));
    assert_eq!(second.session_key, first.session_key);
    assert_eq!(second.kind, "revisit");
    assert!(second.target.as_ref().and_then(|target| target.content.as_ref()).is_none());
    let connected = second.connected.expect("connected");
    let names: Vec<_> = connected.iter().map(|item| item.name.as_str()).collect();
    assert!(names.contains(&"beta"));
    assert!(names.contains(&"gamma"));
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn content_hash_change_allows_resurface() {
    let root = scratch("hash");
    write_graph(&root);
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let first = click(&mut runtime, "alpha", None);
    let _revisit = click(&mut runtime, "alpha", Some(&first.session_key));
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
    let third = click(&mut runtime, "alpha", Some(&first.session_key));
    assert_eq!(third.kind, "revisit");
    let connected = third.connected.expect("connected");
    assert!(
        connected.iter().any(|item| item.name == "beta"),
        "changed beta should resurface; got {:?}",
        connected.iter().map(|item| &item.name).collect::<Vec<_>>()
    );
    assert!(
        !connected.iter().any(|item| item.name == "gamma"),
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
    let a = click(&mut runtime, "alpha", None);
    thread::sleep(Duration::from_millis(5));
    let b = click(&mut runtime, "beta", None);
    thread::sleep(Duration::from_millis(5));
    let c = click(&mut runtime, "gamma", None);
    let again_a = click(&mut runtime, "alpha", Some(&a.session_key));
    assert_eq!(again_a.session_key, a.session_key);
    assert_eq!(again_a.kind, "unique");
    let outbound = again_a.outbound.expect("outbound");
    assert!(
        outbound.items.iter().any(|item| item.name == "beta"),
        "evicted session should not keep old suppressions"
    );
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
    let first = click(&mut runtime, "alpha", None);
    thread::sleep(Duration::from_millis(5));
    let second = click(&mut runtime, "beta", None);
    assert_ne!(first.session_key, second.session_key);
    let resurrected = click(&mut runtime, "alpha", Some(&first.session_key));
    assert_eq!(resurrected.kind, "unique");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn click_falls_through_to_search_when_nothing_matches() {
    let root = scratch("search");
    write_graph(&root);
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let result = click(&mut runtime, "neighbour", None);
    assert_eq!(result.kind, "search");
    let candidates = result.candidates.expect("search hits");
    assert!(candidates.iter().any(|item| item.name == "beta"));
    assert!(candidates.iter().all(|item| item.hops.is_none()));
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn click_ranks_ambiguous_names_by_session_distance() {
    let root = scratch("ambiguous");
    std::fs::write(
        root.join("near.rq"),
        "near {\n    seed\n    see [shared]\n}\n\nshared {\n    near copy\n}\n",
    )
    .unwrap();
    std::fs::write(root.join("far.rq"), "shared {\n    far copy\n}\n").unwrap();
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let seed = click(&mut runtime, "near", None);
    let result = click(&mut runtime, "shared", Some(&seed.session_key));
    assert_eq!(result.kind, "ambiguous");
    let candidates = result.candidates.expect("candidates");
    assert!(candidates.len() >= 2);
    assert!(
        candidates[0].file_uri.contains("near.rq"),
        "nearer shared should rank first: {:?}",
        candidates
    );
    assert!(
        candidates.iter().all(|item| item.hops.is_some()),
        "session ideas must supply hop counts: {:?}",
        candidates
    );
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn click_omits_hops_when_session_has_no_ideas() {
    let root = scratch("no-hops");
    std::fs::write(
        root.join("near.rq"),
        "near {\n    seed\n    see [shared]\n}\n\nshared {\n    near copy\n}\n",
    )
    .unwrap();
    std::fs::write(root.join("far.rq"), "shared {\n    far copy\n}\n").unwrap();
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let result = click(&mut runtime, "shared", None);
    assert_eq!(result.kind, "ambiguous");
    let candidates = result.candidates.expect("candidates");
    assert!(candidates.len() >= 2);
    assert!(
        candidates.iter().all(|item| item.hops.is_none()),
        "empty session must not print hops: {:?}",
        candidates
    );
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn click_caps_lists_and_reports_omitted() {
    let root = scratch("caps");
    std::fs::write(
        root.join("many.rq"),
        r#"hub {
    centre
    see [a]
    see [b]
    see [c]
}
a { one }
b { two }
c { three }
"#,
    )
    .unwrap();
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let result = runtime
        .click(ClickOptions {
            target: "hub",
            session_key: None,
            max_detail: None,
            max_backlinks: None,
            max_siblings: Some(1),
            max_outbound: Some(1),
            max_candidates: None,
        })
        .unwrap();
    let outbound = result.outbound.expect("outbound");
    assert_eq!(outbound.total, 3);
    assert_eq!(outbound.items.len(), 1);
    assert_eq!(outbound.omitted, 2);
    let siblings = result.siblings.expect("siblings");
    assert!(siblings.total >= 3);
    assert_eq!(siblings.items.len(), 1);
    assert!(siblings.omitted >= 2);
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn click_prints_file_when_name_is_ambiguous() {
    let root = scratch("disambig");
    std::fs::write(
        root.join("a.rq"),
        "host {\n    here\n    see [twin]\n}\n\ntwin {\n    in a\n}\n",
    )
    .unwrap();
    std::fs::write(root.join("b.rq"), "twin {\n    in b\n}\n").unwrap();
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let result = click(&mut runtime, "a.rq#host", None);
    let outbound = result.outbound.expect("outbound");
    let twin = outbound.items.iter().find(|item| item.name == "twin").expect("twin");
    assert!(twin.file_uri.as_ref().is_some_and(|uri| uri.contains("a.rq")));
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_name_ambiguity_classifies_none_unique_and_ambiguous() {
    let root = scratch("amb-fn");
    write_graph(&root);
    std::fs::write(root.join("other.rq"), "alpha {\n    other file\n}\n").unwrap();
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let none = runtime.check_name_ambiguity("no-such-idea").unwrap();
    assert_eq!(none.kind, "none");
    let unique = runtime.check_name_ambiguity("graph.rq#beta").unwrap();
    assert_eq!(unique.kind, "unique");
    let ambiguous = runtime.check_name_ambiguity("alpha").unwrap();
    assert_eq!(ambiguous.kind, "ambiguous");
    assert!(ambiguous.matches.len() >= 2);
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn click_code_file_returns_backlinks_and_comment_refs() {
    let root = scratch("code");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("demo.rq"), "alpha {\n    first\n    [\"./src/app.ts\"]\n}\n")
        .unwrap();
    std::fs::write(root.join("src").join("app.ts"), "// rq:[alpha]\nexport const n = 1;\n")
        .unwrap();
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let result = click(&mut runtime, "src/app.ts", None);
    assert_eq!(result.kind, "unique");
    assert_eq!(result.target.as_ref().map(|target| target.kind.as_str()), Some("file"));
    let backlinks = result.backlinks.expect("backlinks");
    assert!(backlinks.items.iter().any(|item| item.name == "alpha"));
    let comments = result.comment_refs.expect("comment refs");
    assert!(comments.items.iter().any(|item| item.name == "alpha"));
    assert!(result.siblings.is_none());
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn click_ambiguous_code_file_basename() {
    let root = scratch("code-amb");
    std::fs::create_dir_all(root.join("one")).unwrap();
    std::fs::create_dir_all(root.join("two")).unwrap();
    std::fs::write(root.join("demo.rq"), "alpha {\n    first\n}\n").unwrap();
    std::fs::write(root.join("one").join("util.ts"), "// rq:[alpha]\n").unwrap();
    std::fs::write(root.join("two").join("util.ts"), "// rq:[alpha]\n").unwrap();
    let storage = root.join(".reqlan");
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let result = click(&mut runtime, "util.ts", None);
    assert_eq!(result.kind, "ambiguous");
    let candidates = result.candidates.expect("candidates");
    assert_eq!(candidates.len(), 2);
    assert!(candidates.iter().all(|item| item.hops.is_none()));
    std::fs::remove_dir_all(&root).ok();
}
