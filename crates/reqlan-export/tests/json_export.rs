//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".export_rust]
//! rq:["../../../reqlan rq/core_analysis/export.rq".export_pipeline]

use reqlan_export::{build_export_snapshot, write_json_export, ExportFormat, ExportRequest};
use reqlan_index::{extract_indexed_document, ExtractOptions, IndexStore};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

// rq:["../../../reqlan rq/core_analysis/export.rq".export_pipeline]
#[test]
fn json_export_lists_persisted_ideas() {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let output_dir = std::env::temp_dir().join(format!("reqlan-export-{nanos}"));
    let mut store = IndexStore::open_in_memory().unwrap();
    let document = extract_indexed_document(
        "demo.rq",
        "demo {\n    exported body\n    @status pending\n    @tags (ui)\n}\n",
        &ExtractOptions::default(),
    );
    store.persist_extracted(document, None).unwrap();
    let request = ExportRequest {
        format: ExportFormat::Json,
        output_dir: output_dir.clone(),
        export_name: "out".into(),
        workspace_root: PathBuf::from("/workspace"),
        ..ExportRequest::default()
    };
    let snapshot = build_export_snapshot(&store, &request).unwrap();
    assert_eq!(snapshot.counts.ideas, 1);
    assert_eq!(snapshot.ideas[0].name, "demo");
    assert_eq!(snapshot.ideas[0].status.as_deref(), Some("pending"));
    let result = write_json_export(&snapshot, &request).unwrap();
    let written = std::fs::read_to_string(&result.index_file_path).unwrap();
    assert!(written.contains("\"demo\""));
    std::fs::remove_dir_all(&output_dir).ok();
}
