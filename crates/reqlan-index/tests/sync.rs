//! rq:["../../../reqlan rq/indexer/indexer.rq".nonblocking_index]
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]

use reqlan_index::ignore::RqIgnoreFilter;
use reqlan_index::{sync_workspace, IndexStore, SyncOptions};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::time::{SystemTime, UNIX_EPOCH};

fn scratch(label: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("reqlan-{label}-{nanos}"));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

// rq:["../../../reqlan rq/indexer/indexer.rq".nonblocking_index]
#[test]
fn soft_sync_skips_unchanged_mtime() {
    let root = scratch("mtime");
    std::fs::write(root.join("a.rq"), "alpha {\n    first\n}\n").unwrap();
    let mut store = IndexStore::open_in_memory().unwrap();
    let cancel = AtomicBool::new(false);
    let options = SyncOptions { workspace_root: root.clone(), hard_rebuild: false };
    let first = sync_workspace(&mut store, &options, &cancel).unwrap();
    assert_eq!(first.progress.indexed, 1);
    assert_eq!(first.progress.skipped_mtime, 0);
    assert_eq!(store.list_all_ideas().unwrap()[0].name, "alpha");

    let second = sync_workspace(&mut store, &options, &cancel).unwrap();
    assert_eq!(second.progress.skipped_mtime, 1);
    assert_eq!(second.progress.indexed, 0);

    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/indexer/indexer.rq".nonblocking_index]
#[test]
fn hard_rebuild_reindexes_despite_mtime() {
    let root = scratch("rebuild");
    std::fs::write(root.join("a.rq"), "alpha {\n    first\n}\n").unwrap();
    let mut store = IndexStore::open_in_memory().unwrap();
    let cancel = AtomicBool::new(false);
    let soft = SyncOptions { workspace_root: root.clone(), hard_rebuild: false };
    sync_workspace(&mut store, &soft, &cancel).unwrap();
    let hard = SyncOptions { workspace_root: root.clone(), hard_rebuild: true };
    let rebuilt = sync_workspace(&mut store, &hard, &cancel).unwrap();
    assert_eq!(rebuilt.progress.indexed, 1);
    assert_eq!(rebuilt.progress.skipped_mtime, 0);
    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/extension/module/index.rq".rqignore]
#[test]
fn default_rqignore_skips_node_modules() {
    let root = scratch("ignore");
    let filter = RqIgnoreFilter::load(&root);
    assert!(filter.ignores("node_modules/", true));
    assert!(filter.ignores("node_modules/pkg/foo.rq", false));
    assert!(filter.ignores("data/local.db3", false));
    assert!(!filter.ignores("src/foo.rq", false));
    std::fs::remove_dir_all(&root).ok();
}
