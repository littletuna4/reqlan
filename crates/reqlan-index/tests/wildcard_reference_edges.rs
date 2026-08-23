//! Native fan-out for path+idea wildcards.
//! rq:["../../../reqlan rq/indexer/indexer.rq".wildcard_reference_edges]
//! rq:["../../../reqlan rq/indexer/indexer.rq".index]
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
//! rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
//! rq:["../../../reqlan rq/language/imports.rq".wildcard_references_webview]
//! rq:["../../../reqlan rq/extension/module/ideas_summary/graphical_graph.rq".wildcard_refs_toggle]
//! rq:["../../../reqlan rq/reference_types.rq".wildcard_reference]

use reqlan_index::sync::{sync_workspace, SyncOptions};
use reqlan_index::{
    extract_indexed_document, idea_id, EdgeKind, ExtractOptions, IndexStore, WildcardIdeaCandidate,
};
use serde_json::Value;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::{SystemTime, UNIX_EPOCH};

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn scratch(label: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("reqlan-wildcard-{label}-{nanos}"));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn candidate(file_uri: &str, idea_name: &str) -> WildcardIdeaCandidate {
    WildcardIdeaCandidate {
        file_uri: file_uri.to_string(),
        file_path: file_uri.to_string(),
        idea_name: idea_name.to_string(),
    }
}

fn extract_host(
    source: &str,
    candidates: Vec<WildcardIdeaCandidate>,
) -> reqlan_index::IndexedDocument {
    extract_indexed_document(
        "host.rq",
        source,
        &ExtractOptions { idea_candidates: candidates, ..Default::default() },
    )
}

fn host_wildcard_edges(indexed: &reqlan_index::IndexedDocument) -> Vec<&reqlan_index::EdgeRecord> {
    let host_id = idea_id("host.rq", "host");
    indexed.edges.iter().filter(|edge| edge.source_id == host_id).collect()
}

fn extract_repo_file(rel: &str) -> reqlan_index::IndexedDocument {
    let path = repo_root().join(rel);
    let source = std::fs::read_to_string(&path).unwrap_or_else(|error| {
        panic!("read {}: {error}", path.display());
    });
    extract_indexed_document(rel, &source, &ExtractOptions::default())
}

fn idea_named<'a>(
    indexed: &'a reqlan_index::IndexedDocument,
    name: &str,
) -> &'a reqlan_index::IdeaRecord {
    indexed
        .ideas
        .iter()
        .find(|idea| idea.name == name)
        .unwrap_or_else(|| panic!("missing idea {name}"))
}

fn status_of(idea: &reqlan_index::IdeaRecord) -> String {
    let attrs: Value = serde_json::from_str(&idea.attributes_json).unwrap();
    attrs.get("status").and_then(Value::as_str).unwrap_or("").to_string()
}

fn sync_root(root: &Path) -> IndexStore {
    let mut store = IndexStore::open_in_memory().unwrap();
    sync_workspace(
        &mut store,
        &SyncOptions { workspace_root: root.to_path_buf(), hard_rebuild: false },
        &AtomicBool::new(false),
    )
    .unwrap();
    store
}

// rq:["../../../reqlan rq/indexer/indexer.rq".wildcard_reference_edges]
#[test]
fn expands_wildcard_refs_to_one_edge_per_matching_idea() {
    let indexed = extract_host(
        "host {\n    Related [\"./mods/*.rq\".widget_*].\n}\n",
        vec![
            candidate("mods/alpha.rq", "widget_a"),
            candidate("mods/alpha.rq", "other"),
            candidate("mods/beta.rq", "widget_b"),
        ],
    );
    let host_id = idea_id("host.rq", "host");
    let targets: BTreeSet<_> = indexed
        .edges
        .iter()
        .filter(|edge| {
            edge.source_id == host_id
                && edge.kind == EdgeKind::WildcardReference
                && edge.is_resolved == Some(true)
        })
        .filter_map(|edge| edge.target_id.clone())
        .collect();
    assert_eq!(
        targets,
        BTreeSet::from(
            [idea_id("mods/alpha.rq", "widget_a"), idea_id("mods/beta.rq", "widget_b"),]
        )
    );
}

// rq:["../../../reqlan rq/indexer/indexer.rq".wildcard_reference_edges]
#[test]
fn emits_unresolved_edge_when_catalog_has_no_matches() {
    let indexed = extract_host("host {\n    Related [\"./mods/*.rq\".missing_*].\n}\n", Vec::new());
    let unresolved: Vec<_> = host_wildcard_edges(&indexed)
        .into_iter()
        .filter(|edge| edge.is_resolved == Some(false))
        .collect();
    assert!(!unresolved.is_empty());
    assert!(unresolved.iter().all(|edge| edge.kind == EdgeKind::WildcardReference));
    assert!(unresolved.iter().any(|edge| {
        edge.target_id.is_none()
            && edge.label.as_deref().is_some_and(|label| label.contains("missing_*"))
    }));
}

// rq:["../../../reqlan rq/indexer/indexer.rq".wildcard_reference_edges]
#[test]
fn extract_indexed_document_fans_out_edges_for_matching_catalog_ideas() {
    let indexed = extract_host(
        "host {\n    Related [\"./mods/*.rq\".widget_*].\n}\n",
        vec![
            candidate("mods/alpha.rq", "widget_a"),
            candidate("mods/beta.rq", "widget_b"),
            candidate("mods/alpha.rq", "other"),
        ],
    );
    let host_id = idea_id("host.rq", "host");
    let resolved: BTreeSet<_> = indexed
        .edges
        .iter()
        .filter(|edge| {
            edge.source_id == host_id
                && edge.is_resolved == Some(true)
                && edge.target_id.is_some()
                && edge.kind == EdgeKind::WildcardReference
        })
        .filter_map(|edge| edge.target_id.clone())
        .collect();
    assert_eq!(
        resolved,
        BTreeSet::from(
            [idea_id("mods/alpha.rq", "widget_a"), idea_id("mods/beta.rq", "widget_b"),]
        )
    );
}

// rq:["../../../reqlan rq/indexer/indexer.rq".wildcard_reference_edges]
#[test]
fn stores_wildcard_fan_out_as_wildcard_reference_kind() {
    let indexed = extract_host(
        "host {\n    Related [\"./mods/*.rq\".widget_*].\n}\n",
        vec![candidate("mods/alpha.rq", "widget_a")],
    );
    let edges = host_wildcard_edges(&indexed);
    assert!(!edges.is_empty());
    assert!(edges.iter().all(|edge| edge.kind == EdgeKind::WildcardReference));
    assert!(edges.iter().all(|edge| edge.kind != EdgeKind::References));
}

// rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
#[test]
fn nested_path_glob_matches_catalog_ideas() {
    let indexed = extract_host(
        "host {\n    Related [\"./mods/**/*.rq\".widget_*].\n}\n",
        vec![
            candidate("mods/alpha.rq", "widget_a"),
            candidate("mods/nested/deep.rq", "widget_deep"),
            candidate("other/skip.rq", "widget_x"),
        ],
    );
    let targets: BTreeSet<_> = host_wildcard_edges(&indexed)
        .into_iter()
        .filter(|edge| edge.is_resolved == Some(true))
        .filter_map(|edge| edge.target_id.clone())
        .collect();
    assert_eq!(
        targets,
        BTreeSet::from([
            idea_id("mods/alpha.rq", "widget_a"),
            idea_id("mods/nested/deep.rq", "widget_deep"),
        ])
    );
}

// rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
// rq:["../../../reqlan rq/language/imports.rq".wildcard_references_webview]
#[test]
fn imports_rq_extract_includes_webview_and_path_filter_ideas() {
    let indexed = extract_repo_file("reqlan rq/language/imports.rq");
    let names: Vec<_> = indexed.ideas.iter().map(|idea| idea.name.as_str()).collect();
    assert!(names.contains(&"wildcard_references"));
    assert!(names.contains(&"wildcard_references_webview"));
    assert!(names.contains(&"idea_path_filter"));

    let wildcard = idea_named(&indexed, "wildcard_references");
    assert_eq!(wildcard.kind.as_str(), "block");
    assert!(wildcard.summary.len() > 40, "{}", wildcard.summary);
    assert_eq!(status_of(wildcard), "done");

    let webview = idea_named(&indexed, "wildcard_references_webview");
    assert_eq!(webview.kind.as_str(), "block");
    assert!(
        webview.summary.contains("wildcard matches")
            || webview.summary.contains("focusIdeaSearch")
            || webview.summary.contains("pathFilter")
            || webview.summary.contains("openWildcardReference"),
        "{}",
        webview.summary
    );

    let filter = idea_named(&indexed, "idea_path_filter");
    assert_eq!(filter.kind.as_str(), "block");
    assert!(filter.summary.len() > 20, "{}", filter.summary);
}

// rq:["../../../reqlan rq/indexer/indexer.rq".wildcard_reference_edges]
// rq:["../../../reqlan rq/extension/module/ideas_summary/graphical_graph.rq".wildcard_refs_toggle]
#[test]
fn indexer_and_graphical_graph_rq_capture_wildcard_edge_and_toggle_ideas() {
    let indexer = extract_repo_file("reqlan rq/indexer/indexer.rq");
    let graph = extract_repo_file("reqlan rq/extension/module/ideas_summary/graphical_graph.rq");

    let edge_idea = idea_named(&indexer, "wildcard_reference_edges");
    assert_eq!(edge_idea.kind.as_str(), "block");
    assert_eq!(status_of(edge_idea), "done");
    assert!(edge_idea.summary.contains("wildcard_reference"), "{}", edge_idea.summary);
    assert!(
        edge_idea.summary.contains("wildcard_refs_toggle")
            || edge_idea.summary.contains("extract.rs")
            || edge_idea.summary.contains("idea-extractor"),
        "{}",
        edge_idea.summary
    );

    let toggle = idea_named(&graph, "wildcard_refs_toggle");
    assert_eq!(toggle.kind.as_str(), "block");
    assert_eq!(status_of(toggle), "done");
    assert!(toggle.summary.contains("includeWildcardRefs"), "{}", toggle.summary);
    assert!(
        toggle.summary.contains("wildcard_reference_edges")
            || toggle.summary.contains("wildcard_reference"),
        "{}",
        toggle.summary
    );

    let parity = idea_named(&graph, "webview_export_graph_parity");
    assert_eq!(parity.kind.as_str(), "block");
    assert_eq!(status_of(parity), "done");
    let parity_l = parity.summary.to_ascii_lowercase();
    assert!(
        parity_l.contains("html_export")
            || parity_l.contains("wildcard refs")
            || parity_l.contains("export"),
        "{}",
        parity.summary
    );
}

// rq:["../../../reqlan rq/indexer/indexer.rq".wildcard_reference_edges]
#[test]
fn sync_persists_wildcard_reference_edges() {
    let root = scratch("sync-match");
    std::fs::create_dir_all(root.join("mods")).unwrap();
    std::fs::write(root.join("mods").join("alpha.rq"), "widget_a {\n    matched a\n}\n").unwrap();
    std::fs::write(
        root.join("mods").join("beta.rq"),
        "widget_b {\n    matched b\n}\nother {\n    skip\n}\n",
    )
    .unwrap();
    std::fs::write(root.join("surface.rq"), "host {\n    Related [\"./mods/*.rq\".widget_*].\n}\n")
        .unwrap();
    let store = sync_root(&root);
    let host_id = idea_id("surface.rq", "host");
    let wild: Vec<_> = store
        .get_all_edges()
        .unwrap()
        .into_iter()
        .filter(|edge| edge.source_id == host_id && edge.kind == EdgeKind::WildcardReference)
        .collect();
    let targets: BTreeSet<_> = wild.iter().filter_map(|edge| edge.target_id.clone()).collect();
    assert!(wild.iter().all(|edge| edge.is_resolved == Some(true)));
    assert_eq!(
        targets,
        BTreeSet::from(
            [idea_id("mods/alpha.rq", "widget_a"), idea_id("mods/beta.rq", "widget_b"),]
        )
    );
    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/indexer/indexer.rq".wildcard_reference_edges]
#[test]
fn sync_persists_unresolved_wildcard_edge_when_catalog_has_no_matches() {
    let root = scratch("sync-miss");
    std::fs::write(
        root.join("surface.rq"),
        "host {\n    Related [\"./mods/*.rq\".missing_*].\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let host_id = idea_id("surface.rq", "host");
    let wild: Vec<_> = store
        .get_all_edges()
        .unwrap()
        .into_iter()
        .filter(|edge| edge.source_id == host_id)
        .collect();
    assert_eq!(wild.len(), 1);
    assert_eq!(wild[0].kind, EdgeKind::WildcardReference);
    assert_eq!(wild[0].is_resolved, Some(false));
    assert!(wild[0].target_id.is_none());
    assert!(wild[0].label.as_deref().is_some_and(|label| label.contains("missing_*")));
    std::fs::remove_dir_all(&root).ok();
}
