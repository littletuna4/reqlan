//! rq:["../../../reqlan rq/core_analysis/core.rq".test_references]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]

use reqlan_analytical::AnalysisRuntime;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn scratch(label: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("reqlan-broken-api-{label}-{nanos}"));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn analysis_api_lists_broken_refs_with_glob_and_comments() {
    let root = scratch("api");
    std::fs::create_dir_all(root.join("reqs")).unwrap();
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("reqs").join("host.rq"), "host {\n    [missing_idea]\n}\n").unwrap();
    std::fs::write(root.join("src").join("app.ts"), "// rq:[gone]\n").unwrap();
    let storage = root.join(".reqlan-index");
    std::fs::create_dir_all(&storage).unwrap();
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();

    let idea_only = runtime.list_broken_references(Some("reqs/**"), false).unwrap();
    assert_eq!(idea_only.len(), 1);
    assert_eq!(idea_only[0].label, "missing_idea");

    let comments = runtime.list_broken_references(Some("src/**"), true).unwrap();
    assert_eq!(comments.len(), 1);
    assert_eq!(comments[0].kind, "comment_link");
    assert_eq!(comments[0].label, "gone");

    let checked =
        runtime.check(&[], &[], Default::default(), Default::default(), &[], false, None).unwrap();
    assert!(checked.iter().any(|row| row.label == "missing_idea"));
    assert!(checked.iter().any(|row| row.kind == "comment_link" && row.label == "gone"));
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn analysis_api_check_honours_skip_targets() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
    let root = scratch("api-skip");
    std::fs::write(
        root.join("host.rq"),
        "host {\n    [missing_idea]\n    [\"../../../.cursor/mcp.json\"]\n}\n",
    )
    .unwrap();
    let storage = root.join(".reqlan-index");
    std::fs::create_dir_all(&storage).unwrap();
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();

    let all =
        runtime.check(&[], &[], Default::default(), Default::default(), &[], false, None).unwrap();
    assert!(all.iter().any(|row| row.label == "missing_idea"), "{all:?}");
    assert!(all.iter().any(|row| row.label.contains(".cursor")), "{all:?}");

    let skipped = runtime
        .check(&[], &[], Default::default(), Default::default(), &["**/.cursor/**"], false, None)
        .unwrap();
    assert!(skipped.iter().any(|row| row.label == "missing_idea"), "{skipped:?}");
    assert!(skipped.iter().all(|row| !row.label.contains(".cursor")), "{skipped:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn analysis_api_check_honours_skip_gitignored_targets() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
    let root = scratch("api-skip-gi");
    std::fs::write(root.join(".gitignore"), "build/\n").unwrap();
    std::fs::write(
        root.join("host.rq"),
        "host {\n    [missing_idea]\n    [\"./build/out.js\"]\n}\n",
    )
    .unwrap();
    let storage = root.join(".reqlan-index");
    std::fs::create_dir_all(&storage).unwrap();
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();

    let all =
        runtime.check(&[], &[], Default::default(), Default::default(), &[], false, None).unwrap();
    assert!(all.iter().any(|row| row.label == "missing_idea"), "{all:?}");
    assert!(all.iter().any(|row| row.label.contains("build/out.js")), "{all:?}");

    let skipped =
        runtime.check(&[], &[], Default::default(), Default::default(), &[], true, None).unwrap();
    assert!(skipped.iter().any(|row| row.label == "missing_idea"), "{skipped:?}");
    assert!(skipped.iter().all(|row| !row.label.contains("build/")), "{skipped:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn analysis_api_check_honours_multiple_globs_and_extra_paths() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
    let root = scratch("api-globs");
    std::fs::create_dir_all(root.join("a")).unwrap();
    std::fs::create_dir_all(root.join("b")).unwrap();
    std::fs::create_dir_all(root.join("c").join("nested")).unwrap();
    std::fs::write(root.join("c").join("present.ts"), "export {}\n").unwrap();
    std::fs::write(
        root.join("a").join("host.rq"),
        "host {\n    [missing_a]\n    [\"../c/present.ts\"]\n    [\"../c/missing.ts\"]\n}\n",
    )
    .unwrap();
    std::fs::write(root.join("b").join("side.rq"), "side {\n    [missing_b]\n}\n").unwrap();
    std::fs::write(root.join("c").join("leaf.rq"), "leaf {\n    [leaf_missing]\n}\n").unwrap();
    std::fs::write(
        root.join("c").join("nested").join("decoy.rq"),
        "decoy {\n    [decoy_missing]\n}\n",
    )
    .unwrap();
    let storage = root.join(".reqlan-index");
    std::fs::create_dir_all(&storage).unwrap();
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();

    let rows = runtime
        .check(
            &["a/**", "b/**"],
            &["c/leaf.rq"],
            Default::default(),
            Default::default(),
            &[],
            false,
            None,
        )
        .unwrap();
    assert!(rows.iter().any(|row| row.label == "missing_a"), "{rows:?}");
    assert!(rows.iter().any(|row| row.label == "missing_b"), "{rows:?}");
    assert!(rows.iter().any(|row| row.label == "leaf_missing"), "{rows:?}");
    assert!(
        rows.iter().any(|row| row.kind == "file_reference" && row.label.contains("missing.ts")),
        "{rows:?}"
    );
    assert!(rows.iter().all(|row| !row.label.contains("present.ts")), "{rows:?}");
    assert!(rows.iter().all(|row| row.label != "decoy_missing"), "{rows:?}");

    let mut scoped = AnalysisRuntime::open(&root, Some(&root.join(".reqlan-index-dir"))).unwrap();
    let dir_rows = scoped
        .check(&["a/**"], &["c"], Default::default(), Default::default(), &[], false, None)
        .unwrap();
    assert!(dir_rows.iter().any(|row| row.label == "missing_a"), "{dir_rows:?}");
    assert!(dir_rows.iter().all(|row| row.label != "leaf_missing"), "{dir_rows:?}");
    assert!(dir_rows.iter().all(|row| row.label != "decoy_missing"), "{dir_rows:?}");

    let empty = runtime.check(&[""], &[], Default::default(), Default::default(), &[], false, None);
    assert!(empty.is_err(), "{empty:?}");
    let missing = runtime.check(
        &["a/**"],
        &["no-such.rq"],
        Default::default(),
        Default::default(),
        &[],
        false,
        None,
    );
    assert!(missing.is_err(), "{missing:?}");
    std::fs::remove_dir_all(&root).ok();
}
