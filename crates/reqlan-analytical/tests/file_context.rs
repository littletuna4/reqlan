//! rq:["../../../reqlan rq/indexer/indexer.rq".index_code_files]
//! rq:["../../../reqlan rq/extension/features-graph-analysers.rq".file_related_requirements]

use reqlan_analytical::AnalysisRuntime;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn scratch(label: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("reqlan-file-context-{label}-{nanos}"));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn file_context_includes_indexed_comment_links() {
    let root = scratch("comment-context");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("demo.rq"), "alpha {\n    first\n}\n").unwrap();
    std::fs::write(
        root.join("src").join("app.ts"),
        "// rq:[\"../demo.rq\".alpha]\nexport const n = 1;\n",
    )
    .unwrap();
    let storage = root.join(".reqlan-index");
    std::fs::create_dir_all(&storage).unwrap();
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();
    let related = runtime.get_file_context("src/app.ts").unwrap();
    assert_eq!(related.comment_linked_ideas.len(), 1);
    assert_eq!(related.comment_linked_ideas[0].name, "alpha");
    std::fs::remove_dir_all(&root).ok();
}
