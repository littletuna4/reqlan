//! rq:["../../../reqlan rq/core_analysis/export.rq".markdown_export]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".export_rust]

use reqlan_export::{build_export_snapshot, write_markdown_export, ExportFormat, ExportRequest};
use reqlan_index::{idea_id, EdgeKind, EdgeRecord, IdeaKind, IdeaRecord, IndexStore};

fn idea(file_uri: &str, name: &str, summary: &str, attributes_json: &str) -> IdeaRecord {
    IdeaRecord {
        id: idea_id(file_uri, name),
        name: name.into(),
        kind: IdeaKind::Block,
        file_uri: file_uri.into(),
        line_start: 0,
        line_end: 2,
        summary: summary.into(),
        attributes_json: attributes_json.into(),
        content_hash: "x".into(),
        git_created_at: None,
        git_modified_at: None,
        git_change_count: None,
    }
}

fn persist_pair(store: &mut IndexStore) {
    let alpha = idea(
        "reqs/a.rq",
        "alpha",
        "alpha links to [beta].",
        r#"{"status":"todo","tags":["export"],"priority":"high"}"#,
    );
    let beta = idea("reqs/b.rq", "beta", "beta summary", r#"{"status":"done","priority":"low"}"#);
    let edges = vec![EdgeRecord {
        id: "edge-1".into(),
        source_id: alpha.id.clone(),
        target_id: Some(beta.id.clone()),
        target_file: None,
        kind: EdgeKind::References,
        label: Some("beta".into()),
        source_line: None,
        snippet: Some("[beta]".into()),
        is_resolved: Some(true),
        source_offset_start: None,
        source_offset_end: None,
    }];
    store
        .upsert_document("reqs/a.rq", "hash-a", std::slice::from_ref(&alpha), &edges, None)
        .unwrap();
    store.upsert_document("reqs/b.rq", "hash-b", std::slice::from_ref(&beta), &[], None).unwrap();
}

fn temp_out(label: &str) -> std::path::PathBuf {
    let nanos =
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    std::env::temp_dir().join(format!("reqlan-md-{label}-{nanos}"))
}

fn read(path: &std::path::Path) -> String {
    std::fs::read_to_string(path).unwrap_or_else(|error| panic!("read {}: {error}", path.display()))
}

// rq:["../../../reqlan rq/core_analysis/export.rq".markdown_export]
#[test]
fn markdown_export_writes_rich_pages_with_links_and_backlinks() {
    let mut store = IndexStore::open_in_memory().unwrap();
    persist_pair(&mut store);
    let output_dir = temp_out("rich");
    let request = ExportRequest {
        format: ExportFormat::Markdown,
        output_dir: output_dir.clone(),
        export_name: "docs".into(),
        workspace_root: std::path::PathBuf::from("/workspace"),
        include_graph_page: false,
        include_requirements_page: false,
        include_print_pages: false,
        include_code_file_pages: false,
        include_cluster_pages: true,
        include_attribute_pages: true,
        ..ExportRequest::default()
    };
    let snapshot = build_export_snapshot(&store, &request).unwrap();
    let result = write_markdown_export(&snapshot, &request).unwrap();

    let readme = read(&result.index_file_path);
    assert!(readme.contains("## Status"));
    assert!(readme.contains("## Tags"));
    assert!(readme.contains("## Ideas"));
    assert!(readme.contains("## Files"));
    assert!(readme.contains("## Clusters"));
    assert!(readme.contains("(ideas/"), "README links idea pages");

    let alpha_path = output_dir.join("docs/ideas");
    let alpha_entry = std::fs::read_dir(&alpha_path)
        .unwrap()
        .find(|entry| entry.as_ref().unwrap().file_name().to_string_lossy().starts_with("alpha--"))
        .expect("alpha page written");
    let alpha_md = read(&alpha_entry.unwrap().path());
    assert!(alpha_md.contains("# alpha"));
    assert!(alpha_md.contains("## Outbound"));
    assert!(alpha_md.contains("](./beta--"), "alpha links beta: {alpha_md}");
    assert!(!alpha_md.contains("## Backlinks"), "alpha has no inbound refs");
    assert!(alpha_md.contains("## Attributes"));
    assert!(alpha_md.contains("**priority:** high"));

    let beta_entry = std::fs::read_dir(&alpha_path)
        .unwrap()
        .find(|entry| entry.as_ref().unwrap().file_name().to_string_lossy().starts_with("beta--"))
        .expect("beta page written");
    let beta_md = read(&beta_entry.unwrap().path());
    assert!(beta_md.contains("## Backlinks"));
    assert!(beta_md.contains("](./alpha--"), "beta backlinks alpha: {beta_md}");

    let file_page = read(&output_dir.join("docs/files/reqs-a-rq.md"));
    assert!(file_page.contains("## Ideas"));
    assert!(file_page.contains("](../ideas/alpha--"), "file page links alpha: {file_page}");

    let attribute_page = read(&output_dir.join("docs/attributes/priority.md"));
    assert!(attribute_page.contains("# `priority` attribute"));
    assert!(attribute_page.contains("## Ideas"));

    assert!(result.index_file_path.ends_with("README.md"));
    assert!(result.ideas_index_file_path.is_some());
    std::fs::remove_dir_all(&output_dir).ok();
}

// rq:["../../../reqlan rq/core_analysis/export.rq".markdown_export]
#[test]
fn markdown_export_inlines_ideas_when_idea_pages_disabled() {
    let mut store = IndexStore::open_in_memory().unwrap();
    persist_pair(&mut store);
    let output_dir = temp_out("inline");
    let request = ExportRequest {
        format: ExportFormat::Markdown,
        output_dir: output_dir.clone(),
        export_name: "docs".into(),
        workspace_root: std::path::PathBuf::from("/workspace"),
        include_idea_pages: false,
        include_file_pages: false,
        include_cluster_pages: false,
        include_attribute_pages: false,
        include_graph_page: false,
        include_print_pages: false,
        ..ExportRequest::default()
    };
    let snapshot = build_export_snapshot(&store, &request).unwrap();
    let result = write_markdown_export(&snapshot, &request).unwrap();

    let readme = read(&result.index_file_path);
    assert!(readme.contains("### alpha"));
    assert!(readme.contains("### beta"));
    assert!(!output_dir.join("docs/ideas").exists());
    std::fs::remove_dir_all(&output_dir).ok();
}
