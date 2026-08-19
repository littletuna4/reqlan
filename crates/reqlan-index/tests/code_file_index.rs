//! rq:["../../../reqlan rq/indexer/indexer.rq".index_code_files]
//! rq:["../../../reqlan rq/extension/features-graph-analysers.rq".index_comment_reference_inclusion]
//! rq:["../../../reqlan rq/extension/features-graph-analysers.rq".file_related_requirements]
//! rq:["../../../reqlan rq/extension/module/index.rq".binary_ignore]

use reqlan_index::sync::{index_one_file, sync_workspace, SyncOptions};
use reqlan_index::{EdgeKind, IndexStore};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::time::{SystemTime, UNIX_EPOCH};

fn scratch(label: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("reqlan-code-index-{label}-{nanos}"));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn indexes_comment_references_from_non_rq_files() {
    let root = scratch("comments");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("demo.rq"), "alpha {\n    first\n}\n").unwrap();
    std::fs::write(
        root.join("src").join("app.ts"),
        "// rq:[\"../demo.rq\".alpha]\nexport const n = 1;\n",
    )
    .unwrap();
    let mut store = IndexStore::open_in_memory().unwrap();
    let cancel = AtomicBool::new(false);
    let options = SyncOptions { workspace_root: root.clone(), hard_rebuild: false };
    let result = sync_workspace(&mut store, &options, &cancel).unwrap();
    assert!(result.progress.indexed >= 2, "indexed={}", result.progress.indexed);

    let uris = store.list_code_document_uris().unwrap();
    assert_eq!(uris, vec!["src/app.ts".to_string()]);

    let edges = store.get_all_edges().unwrap();
    let comments: Vec<_> =
        edges.into_iter().filter(|edge| edge.kind == EdgeKind::CommentLink).collect();
    assert_eq!(comments.len(), 1);
    assert_eq!(comments[0].target_file.as_deref(), Some("src/app.ts"));
    assert_eq!(comments[0].source_id, "demo.rq#alpha");
    assert!(comments[0].target_id.is_none());

    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn unqualified_comment_ref_matches_catalog_idea_name() {
    let root = scratch("unqualified");
    std::fs::write(root.join("demo.rq"), "local_idea {\n    body\n}\n").unwrap();
    std::fs::write(root.join("lib.py"), "# rq:[local_idea]\nprint('ok')\n").unwrap();
    let mut store = IndexStore::open_in_memory().unwrap();
    let cancel = AtomicBool::new(false);
    sync_workspace(
        &mut store,
        &SyncOptions { workspace_root: root.clone(), hard_rebuild: false },
        &cancel,
    )
    .unwrap();
    let comments: Vec<_> = store
        .get_all_edges()
        .unwrap()
        .into_iter()
        .filter(|edge| edge.kind == EdgeKind::CommentLink)
        .collect();
    assert_eq!(comments.len(), 1);
    assert_eq!(comments[0].source_id, "demo.rq#local_idea");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn rq_reindex_restores_comment_links() {
    let root = scratch("refresh");
    std::fs::write(root.join("demo.rq"), "alpha {\n    first\n}\n").unwrap();
    std::fs::write(root.join("app.ts"), "// rq:[\"./demo.rq\".alpha]\n").unwrap();
    let mut store = IndexStore::open_in_memory().unwrap();
    let cancel = AtomicBool::new(false);
    let options = SyncOptions { workspace_root: root.clone(), hard_rebuild: false };
    sync_workspace(&mut store, &options, &cancel).unwrap();
    assert_eq!(
        store
            .get_all_edges()
            .unwrap()
            .iter()
            .filter(|edge| edge.kind == EdgeKind::CommentLink)
            .count(),
        1
    );

    index_one_file(&mut store, &root, root.join("demo.rq").to_str().unwrap()).unwrap();
    assert_eq!(
        store
            .get_all_edges()
            .unwrap()
            .iter()
            .filter(|edge| edge.kind == EdgeKind::CommentLink)
            .count(),
        1
    );
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn skips_nested_child_base_code_and_rq_files() {
    let root = scratch("nested");
    std::fs::write(root.join("parent.rq"), "parent_idea {\n    body\n}\n").unwrap();
    std::fs::create_dir_all(root.join("child").join(".reqlan")).unwrap();
    std::fs::write(root.join("child").join("child.rq"), "child_idea {\n    body\n}\n").unwrap();
    std::fs::write(root.join("child").join("nested.ts"), "// rq:[child_idea]\n").unwrap();
    let mut store = IndexStore::open_in_memory().unwrap();
    sync_workspace(
        &mut store,
        &SyncOptions { workspace_root: root.clone(), hard_rebuild: false },
        &AtomicBool::new(false),
    )
    .unwrap();
    let names: Vec<_> = store.list_all_ideas().unwrap().into_iter().map(|idea| idea.name).collect();
    assert!(names.contains(&"parent_idea".to_string()));
    assert!(!names.contains(&"child_idea".to_string()));
    assert!(store.list_code_document_uris().unwrap().is_empty());
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn skips_binary_comment_files_unless_rqignore_negation() {
    let root = scratch("binary-skip");
    std::fs::create_dir_all(root.join("assets")).unwrap();
    std::fs::write(root.join("demo.rq"), "alpha {\n    first\n}\n").unwrap();
    std::fs::write(root.join("assets").join("payload.bin"), "// rq:[\"./demo.rq\".alpha]\n")
        .unwrap();
    let mut store = IndexStore::open_in_memory().unwrap();
    let cancel = AtomicBool::new(false);
    let options = SyncOptions { workspace_root: root.clone(), hard_rebuild: false };
    sync_workspace(&mut store, &options, &cancel).unwrap();
    assert!(store.list_code_document_uris().unwrap().is_empty());

    std::fs::create_dir_all(root.join(".reqlan")).unwrap();
    std::fs::write(root.join(".reqlan").join(".rqignore"), "!*.bin\n").unwrap();
    sync_workspace(&mut store, &options, &cancel).unwrap();
    let uris = store.list_code_document_uris().unwrap();
    assert_eq!(uris, vec!["assets/payload.bin".to_string()]);
    std::fs::remove_dir_all(&root).ok();
}
