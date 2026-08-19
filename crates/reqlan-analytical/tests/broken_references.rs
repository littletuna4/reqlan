//! rq:["../../../reqlan rq/core_analysis/core.rq".test_references]

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
    std::fs::remove_dir_all(&root).ok();
}
