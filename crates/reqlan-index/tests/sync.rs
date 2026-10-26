//! rq:["../../../reqlan rq/indexer/indexer.rq".nonblocking_index]
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
//! rq:["../../../reqlan rq/indexer/cache-reuse.rq".sync_pass_idea_catalog]

use reqlan_index::ignore::RqIgnoreFilter;
use reqlan_index::{
    index_one_file_with_catalog, index_paths, load_idea_catalog, sync_workspace, EdgeKind,
    IndexStore, SyncOptions,
};
use std::collections::BTreeSet;
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
    let options = SyncOptions {
        workspace_root: root.clone(),
        hard_rebuild: false,
        path_globs: Vec::new(),
        include_files: Vec::new(),
        record_file_events: false,
    };
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
    let soft = SyncOptions {
        workspace_root: root.clone(),
        hard_rebuild: false,
        path_globs: Vec::new(),
        include_files: Vec::new(),
        record_file_events: false,
    };
    sync_workspace(&mut store, &soft, &cancel).unwrap();
    let hard = SyncOptions {
        workspace_root: root.clone(),
        hard_rebuild: true,
        path_globs: Vec::new(),
        include_files: Vec::new(),
        record_file_events: false,
    };
    let rebuilt = sync_workspace(&mut store, &hard, &cancel).unwrap();
    assert_eq!(rebuilt.progress.indexed, 1);
    assert_eq!(rebuilt.progress.skipped_mtime, 0);
    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/extension/index-host/index.rq".rqignore]
#[test]
fn default_rqignore_skips_node_modules() {
    let root = scratch("ignore");
    let filter = RqIgnoreFilter::load(&root);
    assert!(filter.ignores("node_modules/", true));
    assert!(filter.ignores("node_modules/pkg/foo.rq", false));
    assert!(filter.ignores("target/", true));
    assert!(filter.ignores("target/debug/out.rs", false));
    assert!(filter.ignores("data/local.db3", false));
    assert!(!filter.ignores("src/foo.rq", false));
    assert!(filter.ignores("assets/payload.bin", false));
    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/indexer/cache-reuse.rq".sync_pass_idea_catalog]
#[test]
fn sync_pass_catalog_sees_earlier_file_ideas_for_wildcards() {
    let root = scratch("catalog-wildcard");
    std::fs::create_dir_all(root.join("mods")).unwrap();
    // `mods/` sorts before `surface.rq`, so alpha is indexed first in the same pass.
    std::fs::write(root.join("mods/alpha.rq"), "widget_a {\n    first\n}\n").unwrap();
    std::fs::write(root.join("surface.rq"), "host {\n    Related [\"./mods/*.rq\".widget_*].\n}\n")
        .unwrap();
    let mut store = IndexStore::open_in_memory().unwrap();
    sync_workspace(
        &mut store,
        &SyncOptions {
            workspace_root: root.clone(),
            hard_rebuild: true,
            path_globs: Vec::new(),
            include_files: Vec::new(),
            record_file_events: false,
        },
        &AtomicBool::new(false),
    )
    .unwrap();
    let host_id = "surface.rq#host";
    let targets: BTreeSet<_> = store
        .get_all_edges()
        .unwrap()
        .into_iter()
        .filter(|edge| {
            edge.source_id == host_id
                && edge.kind == EdgeKind::WildcardReference
                && edge.is_resolved == Some(true)
        })
        .filter_map(|edge| edge.target_id)
        .collect();
    assert!(
        targets.iter().any(|id| id.contains("widget_a")),
        "host wildcard must resolve against ideas indexed earlier in the same pass: {targets:?}"
    );
    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/indexer/cache-reuse.rq".sync_pass_idea_catalog]
#[test]
fn sync_pass_catalog_drops_renamed_idea_names() {
    let root = scratch("catalog-rename");
    std::fs::write(root.join("a.rq"), "old_name {\n    first\n}\n").unwrap();
    let mut store = IndexStore::open_in_memory().unwrap();
    let options = SyncOptions {
        workspace_root: root.clone(),
        hard_rebuild: false,
        path_globs: Vec::new(),
        include_files: Vec::new(),
        record_file_events: false,
    };
    sync_workspace(&mut store, &options, &AtomicBool::new(false)).unwrap();
    assert_eq!(store.list_all_ideas().unwrap()[0].name, "old_name");

    std::fs::write(root.join("a.rq"), "new_name {\n    first\n}\n").unwrap();
    // Bump mtime past the soft-sync equality window.
    let later = SystemTime::now() + std::time::Duration::from_secs(2);
    filetime_set(&root.join("a.rq"), later);

    let mut catalog = load_idea_catalog(&store).unwrap();
    assert!(catalog.iter().any(|c| c.idea_name == "old_name"));
    index_one_file_with_catalog(
        &mut store,
        &root,
        root.join("a.rq").to_str().unwrap(),
        &mut catalog,
    )
    .unwrap();
    assert!(
        catalog.iter().all(|c| c.idea_name != "old_name"),
        "rename must drop the prior catalog row: {catalog:?}"
    );
    assert!(catalog.iter().any(|c| c.idea_name == "new_name"));
    assert_eq!(store.list_all_ideas().unwrap()[0].name, "new_name");
    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/indexer/cache-reuse.rq".sync_pass_idea_catalog]
#[test]
fn index_paths_shares_one_catalog_across_files() {
    let root = scratch("index-paths");
    std::fs::create_dir_all(root.join("mods")).unwrap();
    let alpha = root.join("mods/alpha.rq");
    let surface = root.join("surface.rq");
    std::fs::write(&alpha, "widget_a {\n    first\n}\n").unwrap();
    std::fs::write(&surface, "host {\n    Related [\"./mods/*.rq\".widget_*].\n}\n").unwrap();
    let mut store = IndexStore::open_in_memory().unwrap();
    // index_paths sorts paths; mods/alpha.rq is indexed before surface.rq.
    let result =
        index_paths(&mut store, &root, &[surface, alpha], &AtomicBool::new(false)).unwrap();
    assert_eq!(result.progress.indexed, 2);
    let targets: BTreeSet<_> = store
        .get_all_edges()
        .unwrap()
        .into_iter()
        .filter(|edge| {
            edge.source_id == "surface.rq#host"
                && edge.kind == EdgeKind::WildcardReference
                && edge.is_resolved == Some(true)
        })
        .filter_map(|edge| edge.target_id)
        .collect();
    assert!(targets.iter().any(|id| id.contains("widget_a")), "{targets:?}");
    std::fs::remove_dir_all(&root).ok();
}

fn filetime_set(path: &std::path::Path, time: SystemTime) {
    let file = std::fs::File::options().write(true).open(path).unwrap();
    file.set_modified(time).unwrap();
}
