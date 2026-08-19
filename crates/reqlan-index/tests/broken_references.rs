//! rq:["../../../reqlan rq/core_analysis/core.rq".test_references]
//! rq:["../../../reqlan rq/language/syntax.rq".comment_reference]

use reqlan_index::sync::{sync_workspace, SyncOptions};
use reqlan_index::{
    list_broken_references, path_glob_matches, IndexStore, ListBrokenReferencesOptions,
};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::time::{SystemTime, UNIX_EPOCH};

fn scratch(label: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("reqlan-broken-refs-{label}-{nanos}"));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn sync_root(root: &PathBuf) -> IndexStore {
    let mut store = IndexStore::open_in_memory().unwrap();
    sync_workspace(
        &mut store,
        &SyncOptions { workspace_root: root.clone(), hard_rebuild: true },
        &AtomicBool::new(false),
    )
    .unwrap();
    store
}

#[test]
fn path_glob_matches_nested_rq_with_bare_pattern() {
    assert!(path_glob_matches("*.rq", "reqs/host.rq"));
    assert!(path_glob_matches("src/**", "src/app.ts"));
    assert!(!path_glob_matches("src/**", "reqs/host.rq"));
}

#[test]
fn lists_broken_idea_references_and_filters_by_glob() {
    let root = scratch("idea");
    std::fs::create_dir_all(root.join("reqs")).unwrap();
    std::fs::create_dir_all(root.join("other")).unwrap();
    std::fs::write(root.join("reqs").join("host.rq"), "host {\n    [missing_idea]\n}\n").unwrap();
    std::fs::write(root.join("other").join("side.rq"), "side {\n    [also_missing]\n}\n").unwrap();
    let store = sync_root(&root);
    let all = list_broken_references(
        &store,
        &root,
        ListBrokenReferencesOptions { path_glob: None, include_comment_references: false },
    )
    .unwrap();
    assert!(all.iter().any(|row| row.label == "missing_idea" && row.file_uri == "reqs/host.rq"));
    assert!(all.iter().any(|row| row.label == "also_missing"));

    let scoped = list_broken_references(
        &store,
        &root,
        ListBrokenReferencesOptions {
            path_glob: Some("reqs/**"),
            include_comment_references: false,
        },
    )
    .unwrap();
    assert_eq!(scoped.len(), 1);
    assert_eq!(scoped[0].label, "missing_idea");
    assert!(scoped.iter().all(|row| row.kind != "comment_link"));
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn optionally_includes_broken_comment_references() {
    let root = scratch("comments");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("demo.rq"), "alpha {\n    first\n}\n").unwrap();
    std::fs::write(
        root.join("src").join("app.ts"),
        "// rq:[alpha]\n// rq:[missing_from_comments]\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let without_comments = list_broken_references(
        &store,
        &root,
        ListBrokenReferencesOptions { path_glob: None, include_comment_references: false },
    )
    .unwrap();
    assert!(without_comments.iter().all(|row| row.kind != "comment_link"));

    let with_comments = list_broken_references(
        &store,
        &root,
        ListBrokenReferencesOptions { path_glob: Some("src/**"), include_comment_references: true },
    )
    .unwrap();
    assert_eq!(with_comments.len(), 1);
    assert_eq!(with_comments[0].kind, "comment_link");
    assert_eq!(with_comments[0].label, "missing_from_comments");
    assert_eq!(with_comments[0].file_uri, "src/app.ts");
    std::fs::remove_dir_all(&root).ok();
}
