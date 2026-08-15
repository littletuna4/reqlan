//! Activity-bar search ranks in-process via reqlan-search (no JS catalog).
//! rq:["../../../reqlan rq/core_analysis/search.rq".fuzzy_search]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".search_rust]

use reqlan_analytical::WorkspaceIndexRuntime;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn scratch(label: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("reqlan-analytical-{label}-{nanos}"));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn workspace_index_fuzzy_search_ranks_without_exporting_catalog() {
    let root = scratch("fuzzy-search");
    std::fs::write(
        root.join("demo.rq"),
        "cli_package {\n    CLI package\n}\nsearch_code_actions {\n    code action search\n}\n",
    )
    .unwrap();
    let storage = root.join(".reqlan-index");
    std::fs::create_dir_all(&storage).unwrap();
    let mut runtime = WorkspaceIndexRuntime::open(&root, Some(&storage)).unwrap();
    runtime.ensure_ready().unwrap();

    let result = runtime.fuzzy_search("cli package", Some(8), true, None).unwrap();
    assert_eq!(result.hits[0].name, "cli_package");
    assert!(!result.truncated || result.hits.len() <= 8);

    let empty = runtime.fuzzy_search("   ", Some(8), true, None).unwrap();
    assert!(empty.hits.is_empty());

    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/core_analysis/search.rq".file_search]
#[test]
fn workspace_index_fuzzy_search_includes_file_name_hits() {
    let root = scratch("fuzzy-files");
    std::fs::create_dir_all(root.join("core_analysis")).unwrap();
    std::fs::write(root.join("core_analysis").join("search.rq"), "alpha {\n    body\n}\n").unwrap();
    std::fs::write(root.join("other.rq"), "beta {\n    body\n}\n").unwrap();
    let storage = root.join(".reqlan-index");
    std::fs::create_dir_all(&storage).unwrap();
    let mut runtime = WorkspaceIndexRuntime::open(&root, Some(&storage)).unwrap();
    runtime.ensure_ready().unwrap();

    let result = runtime.fuzzy_search("search", Some(8), true, None).unwrap();
    assert!(result
        .hits
        .iter()
        .any(|hit| hit.kind == reqlan_search::FuzzyHitKind::File && hit.name == "search.rq"));

    let page = runtime.fuzzy_search("a", Some(1), true, Some(0)).unwrap();
    assert_eq!(page.hits.len(), 1);
    if page.truncated {
        let next = runtime.fuzzy_search("a", Some(1), true, Some(1)).unwrap();
        assert!(!next.hits.is_empty());
        assert_ne!(page.hits[0].id, next.hits[0].id);
    }

    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/indexer/indexer.rq".index_code_files]
// rq:["../../../reqlan rq/core_analysis/search.rq".file_search]
#[test]
fn workspace_index_fuzzy_search_includes_comment_code_files() {
    let root = scratch("fuzzy-code");
    std::fs::write(root.join("demo.rq"), "alpha {\n    body\n}\n").unwrap();
    std::fs::write(root.join("app.ts"), "// rq:[\"./demo.rq\".alpha]\n").unwrap();
    let storage = root.join(".reqlan-index");
    std::fs::create_dir_all(&storage).unwrap();
    let mut runtime = WorkspaceIndexRuntime::open(&root, Some(&storage)).unwrap();
    runtime.ensure_ready().unwrap();

    let result = runtime.fuzzy_search("app", Some(8), true, None).unwrap();
    assert!(result
        .hits
        .iter()
        .any(|hit| hit.kind == reqlan_search::FuzzyHitKind::File && hit.name == "app.ts"));

    std::fs::remove_dir_all(&root).ok();
}
