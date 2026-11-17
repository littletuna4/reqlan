//! Native AnalysisApi export must honour host page options.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
//! rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export_graph_page]
//! rq:["../../../reqlan rq/core_analysis/export.rq".markdown_export]
//! rq:["../../../reqlan rq/site/site.rq".spec_html_export]

use reqlan_analytical::{AnalysisRuntime, ExportHeaderLinkDto, ExportRequestDto};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn scratch(label: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("reqlan-analytical-{label}-{nanos}"));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

// rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
#[test]
fn html_export_honours_graph_page_url_base_and_header_link() {
    let root = scratch("workspace");
    std::fs::write(root.join("demo.rq"), "demo {\n    body\n    @status pending\n}\n").unwrap();
    let storage = root.join(".reqlan-index");
    std::fs::create_dir_all(&storage).unwrap();
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();

    let output_dir = scratch("out");
    let result = runtime
        .export(ExportRequestDto {
            format: "html".into(),
            output_dir: output_dir.to_string_lossy().into_owned(),
            export_name: "spec".into(),
            workspace_root: Some(root.to_string_lossy().into_owned()),
            include_requirements_page: true,
            include_graph_page: true,
            url_base: Some("/spec".into()),
            header_link: Some(ExportHeaderLinkDto { href: "/".into(), label: "reqlan".into() }),
            ..ExportRequestDto::default()
        })
        .unwrap();

    let graph_path = output_dir.join("spec/graph.html");
    assert!(graph_path.is_file(), "missing {}", graph_path.display());
    let index_html = std::fs::read_to_string(&result.index_file_path).unwrap();
    assert!(index_html.contains(r#"class="brand-link" href="/""#));
    assert!(index_html.contains(r#"href="/spec/assets/styles.css""#));

    std::fs::remove_dir_all(&root).ok();
    std::fs::remove_dir_all(&output_dir).ok();
}

// rq:["../../../reqlan rq/core_analysis/export.rq".markdown_export]
#[test]
fn markdown_export_honours_cluster_and_attribute_page_flags() {
    let root = scratch("md-workspace");
    std::fs::write(root.join("demo.rq"), "demo {\n    body\n    @status pending\n}\n").unwrap();
    let storage = root.join(".reqlan-index");
    std::fs::create_dir_all(&storage).unwrap();
    let mut runtime = AnalysisRuntime::open(&root, Some(&storage)).unwrap();

    let output_dir = scratch("md-out");
    let result = runtime
        .export(ExportRequestDto {
            format: "markdown".into(),
            output_dir: output_dir.to_string_lossy().into_owned(),
            export_name: "spec".into(),
            workspace_root: Some(root.to_string_lossy().into_owned()),
            include_file_pages: true,
            include_cluster_pages: true,
            include_attribute_pages: true,
            ..ExportRequestDto::default()
        })
        .unwrap();
    assert!(result.index_file_path.ends_with("README.md"));
    assert!(output_dir.join("spec/README.md").is_file());
    assert!(output_dir.join("spec/attributes/status.md").is_file());
    assert!(output_dir.join("spec/files/demo-rq.md").is_file());

    let opt_out_dir = scratch("md-out-lean");
    runtime
        .export(ExportRequestDto {
            format: "markdown".into(),
            output_dir: opt_out_dir.to_string_lossy().into_owned(),
            export_name: "spec".into(),
            workspace_root: Some(root.to_string_lossy().into_owned()),
            include_cluster_pages: false,
            include_attribute_pages: false,
            include_file_pages: false,
            include_idea_pages: false,
            ..ExportRequestDto::default()
        })
        .unwrap();
    assert!(!opt_out_dir.join("spec/clusters").exists());
    assert!(!opt_out_dir.join("spec/attributes").exists());

    std::fs::remove_dir_all(&root).ok();
    std::fs::remove_dir_all(&output_dir).ok();
    std::fs::remove_dir_all(&opt_out_dir).ok();
}
