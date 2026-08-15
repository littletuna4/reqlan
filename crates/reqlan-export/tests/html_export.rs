//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".export_rust]
//! rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export]
//! rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export_graph_page]
//! rq:["../../../reqlan rq/extension/module/ideas_summary/graphical_graph.rq".wildcard_refs_toggle]

use reqlan_export::{
    build_export_snapshot, write_html_export, ExportFormat, ExportHeaderLink, ExportRequest,
};
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

fn persist_pair(store: &mut IndexStore) -> (IdeaRecord, IdeaRecord) {
    let file_a = "reqs/a.rq";
    let file_b = "reqs/b.rq";
    let alpha = idea(
        file_a,
        "alpha",
        "alpha links to [beta] and keeps reading.",
        r#"{"status":"todo","tags":["ui","export"]}"#,
    );
    let beta = idea(file_b, "beta", "beta summary", r#"{"status":"done","tags":["export"]}"#);
    let edges = vec![
        EdgeRecord {
            id: "edge-1".into(),
            source_id: alpha.id.clone(),
            target_id: Some(beta.id.clone()),
            target_file: None,
            kind: EdgeKind::References,
            label: Some("beta".into()),
            source_line: None,
            snippet: Some("[beta]".into()),
            is_resolved: Some(true),
        },
        EdgeRecord {
            id: "edge-file".into(),
            source_id: alpha.id.clone(),
            target_id: None,
            target_file: Some("src/app.ts".into()),
            kind: EdgeKind::FileReference,
            label: Some("app.ts".into()),
            source_line: None,
            snippet: None,
            is_resolved: Some(true),
        },
    ];
    store.upsert_document(file_a, "hash-a", &[alpha.clone()], &edges, None).unwrap();
    store.upsert_document(file_b, "hash-b", &[beta.clone()], &[], None).unwrap();
    (alpha, beta)
}

fn html_request(output_dir: &std::path::Path, export_name: &str) -> ExportRequest {
    ExportRequest {
        format: ExportFormat::Html,
        output_dir: output_dir.to_path_buf(),
        export_name: export_name.into(),
        workspace_root: std::path::PathBuf::from("/workspace/reqlan"),
        include_requirements_page: true,
        include_graph_page: true,
        ..ExportRequest::default()
    }
}

fn temp_out(label: &str) -> std::path::PathBuf {
    let nanos =
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    std::env::temp_dir().join(format!("reqlan-html-{label}-{nanos}"))
}

fn read(path: &std::path::Path) -> String {
    std::fs::read_to_string(path).unwrap_or_else(|error| panic!("read {}: {error}", path.display()))
}

// rq:["../../../reqlan rq/core_analysis/rust_port.rq".export_rust]
#[test]
fn html_export_writes_ts_page_template_set_and_embeds_assets() {
    let mut store = IndexStore::open_in_memory().unwrap();
    let (alpha, beta) = persist_pair(&mut store);
    let output_dir = temp_out("parity");
    let request = html_request(&output_dir, "workspace-report");
    let snapshot = build_export_snapshot(&store, &request).unwrap();
    assert_eq!(snapshot.counts.ideas, 2);
    assert_eq!(snapshot.by_status.get("todo"), Some(&1));
    assert_eq!(snapshot.by_status.get("done"), Some(&1));
    assert_eq!(snapshot.by_tag.get("export"), Some(&2));
    assert!(snapshot.counts.clusters > 0);
    assert_eq!(snapshot.code_files.len(), 1);
    assert_eq!(snapshot.code_files[0].file_uri, "reqs/src/app.ts");
    assert!(snapshot.page_options.include_code_file_pages);
    assert!(snapshot.page_options.include_attribute_pages);

    let result = write_html_export(&snapshot, &request).unwrap();
    let index_html = read(&result.index_file_path);
    let ideas_index_html = read(result.ideas_index_file_path.as_ref().unwrap());
    let files_index_html = read(result.files_index_file_path.as_ref().unwrap());
    let code_files_index_html = read(result.code_files_index_file_path.as_ref().unwrap());
    let clusters_index_html = read(result.clusters_index_file_path.as_ref().unwrap());
    let attributes_index_html = read(result.attributes_index_file_path.as_ref().unwrap());
    let requirements_html = read(result.requirements_file_path.as_ref().unwrap());
    let graph_html = read(result.graph_file_path.as_ref().unwrap());
    let export_json = read(&result.data_file_path);
    let alpha_idea_html = read(&result.output_dir.join(&snapshot.ideas_by_id[&alpha.id].page.path));
    let alpha_print_html = read(
        &result
            .output_dir
            .join(snapshot.ideas_by_id[&alpha.id].page.printable_path.as_ref().unwrap()),
    );
    let print_home_html = read(&result.output_dir.join(&snapshot.manifest.print_home.path));
    let code_file_html = read(&result.output_dir.join(&snapshot.code_files[0].page.path));
    let status_attribute = snapshot.attributes_by_key.get("status").expect("status attribute");
    let status_attribute_html = read(&result.output_dir.join(&status_attribute.page.path));
    let first_cluster = &snapshot.clusters[0];
    let cluster_print_html =
        read(&result.output_dir.join(first_cluster.page.printable_path.as_ref().unwrap()));
    let styles_css = read(&result.output_dir.join("assets/styles.css"));
    let app_js = read(&result.output_dir.join("assets/app.js"));
    let search_index_js = read(&result.output_dir.join("assets/search-index.js"));

    let alpha_anchor_id = format!(
        "idea-{}",
        alpha
            .id
            .to_ascii_lowercase()
            .chars()
            .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
            .collect::<String>()
            .trim_matches('-')
            .to_string()
    );
    let beta_anchor_id = format!(
        "idea-{}",
        beta.id
            .to_ascii_lowercase()
            .chars()
            .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
            .collect::<String>()
            .trim_matches('-')
            .to_string()
    );

    assert!(index_html.contains("workspace-report"));
    assert!(index_html.contains("Highlighted Clusters"));
    assert!(index_html.contains("assets/search-index.js"));
    assert!(!index_html.contains(r#"type="module""#));
    assert!(index_html.contains("Code files"));
    assert!(index_html.contains("Status Rollup"));
    assert!(index_html.contains(r#"class="rollup-link""#));
    let todo_status_cluster = snapshot
        .clusters
        .iter()
        .find(|cluster| cluster.kind == "status" && cluster.id == "status:todo")
        .expect("todo status cluster");
    let export_tag_cluster = snapshot
        .clusters
        .iter()
        .find(|cluster| cluster.kind == "tag" && cluster.id == "tag:export")
        .expect("export tag cluster");
    assert!(index_html.contains(&todo_status_cluster.page.path));
    assert!(index_html.contains(&export_tag_cluster.page.path));
    assert!(index_html.contains(&snapshot.clusters[0].page.path));
    assert!(ideas_index_html.contains("Filter ideas"));
    assert!(ideas_index_html.contains(r#"data-filter-key="status""#));
    assert!(ideas_index_html.contains(r#"data-filter-key="tags""#));
    assert!(ideas_index_html.contains(&todo_status_cluster.page.path));
    assert!(ideas_index_html.contains(&export_tag_cluster.page.path));
    assert!(app_js.contains("dataset.filterKey"));
    assert!(app_js.contains("URLSearchParams"));
    assert!(styles_css.contains(".rollup-link"));
    assert!(files_index_html.contains("List view by source file"));
    assert!(code_files_index_html.contains("Code reference index"));
    assert!(code_files_index_html.contains("app.ts"));
    assert!(clusters_index_html.contains("Deterministic and computed groupings"));
    assert!(attributes_index_html.contains("Filter attributes"));
    assert!(attributes_index_html.contains("status"));
    assert!(attributes_index_html.contains("tags"));
    assert!(attributes_index_html.contains("attributes/status.html"));
    assert!(snapshot.attributes.iter().any(|attribute| attribute.key == "status"));
    assert_eq!(status_attribute.page.path, "attributes/status.html");
    assert!(status_attribute_html.contains("Attribute detail"));
    assert!(status_attribute_html.contains("Value distribution"));
    assert!(status_attribute_html.contains("distribution-fill"));
    assert!(status_attribute_html.contains("Ideas with this attribute"));
    assert!(status_attribute_html.contains("todo"));
    assert!(status_attribute_html.contains("done"));
    assert!(status_attribute_html.contains("50%"));
    assert!(status_attribute_html.contains("alpha"));
    assert!(status_attribute_html.contains("beta"));
    assert!(styles_css.contains(".distribution-fill"));
    assert!(requirements_html.contains("alpha links to [beta]"));
    assert!(graph_html.contains("graph-data"));
    assert!(graph_html.contains("data-graph-fit"));
    assert!(alpha_idea_html.contains("Outbound references"));
    assert!(alpha_idea_html.contains(r#"class="idea-ref idea-ref--idea""#));
    assert!(alpha_idea_html.contains(r#"title="reqs/b.rq · beta""#));
    assert!(alpha_idea_html.contains("Printable page"));
    assert!(alpha_idea_html.contains("../assets/search-index.js"));
    assert!(alpha_idea_html.contains("Browse all attributes"));
    assert!(alpha_idea_html.contains("../attributes/status.html"));
    assert!(
        alpha_idea_html.contains(r#""pageUrl": "./ideas/"#)
            || alpha_idea_html.contains(r#""pageUrl": "./ideas/"#)
    );
    assert!(alpha_idea_html.contains(r#""isSubject": true"#));
    assert!(alpha_idea_html.contains(r#""attributeKeys""#));
    assert!(alpha_idea_html.contains("code-files/"));
    assert!(code_file_html.contains("Code reference detail"));
    assert!(code_file_html.contains("alpha"));
    assert!(app_js.contains("wireTables"));
    assert!(app_js.contains("column-filter"));
    assert!(app_js.contains("ReqlanGraphPhysics"));
    assert!(app_js.contains("EXPORT_PHYSICS_SETTINGS"));
    assert!(app_js.contains("batchSettleAsync"));
    assert!(app_js.contains("scheduleBackground"));
    assert!(graph_html.contains("data-graph-toggle-physics"));
    assert!(graph_html.contains("data-graph-toggle-labels"));
    assert!(graph_html.contains("Labels: auto"));
    assert!(graph_html.contains(r#"data-label-mode="auto""#));
    assert!(graph_html.contains("data-graph-status-scd"));
    assert!(graph_html.contains("data-graph-tag-scd"));
    assert!(graph_html.contains("__not_present__"));
    assert!(graph_html.contains("__empty__"));
    assert!(graph_html.contains("Initialising graph"));
    assert!(graph_html.contains("is-booting"));
    assert!(alpha_idea_html.contains("data-graph-toggle-labels"));
    assert!(alpha_print_html.contains("Printable idea sheet"));
    assert!(alpha_print_html.contains(r#"class="print-attrs""#));
    assert!(alpha_print_html.contains("<dt>status</dt>"));
    assert!(alpha_print_html.contains(r#"onclick="window.print()""#));
    assert!(print_home_html.contains(&format!(r#"id="{alpha_anchor_id}""#)));
    assert!(print_home_html.contains(&format!(r#"id="{beta_anchor_id}""#)));
    assert!(print_home_html.contains(&format!(r##"href="#{alpha_anchor_id}""##)));
    assert!(print_home_html.contains(&format!(r##"href="#{beta_anchor_id}""##)));
    assert!(print_home_html.contains(r#"class="print-button hide-on-print""#));
    assert!(cluster_print_html.contains("Printable cluster sheet"));
    assert!(styles_css.contains("scroll-padding-top"));
    assert!(styles_css.contains(".print-button"));
    assert!(export_json.contains(r#""scope": "workspace""#));
    assert!(export_json.contains(r#""clustersById""#));
    assert!(export_json.contains(r#""pageOptions""#));
    assert!(export_json.contains(r#""codeFiles""#));
    assert!(index_html.contains(r#"data-runtime-mode="interactive""#));
    assert!(index_html.contains(r#"class="scroll-window""#));
    assert!(search_index_js.contains("__REQLAN_SEARCH_INDEX__"));
    assert!(search_index_js.contains("alpha"));
    assert!(search_index_js.contains("code-file"));
    assert!(search_index_js.contains("attributes/status.html"));
    std::fs::remove_dir_all(&output_dir).ok();
}

// rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export_overview_links]
#[test]
fn overview_status_and_tag_rollups_link_with_filters() {
    let mut store = IndexStore::open_in_memory().unwrap();
    let alpha =
        idea("reqs/a.rq", "alpha", "alpha summary", r#"{"status":"todo","tags":["export"]}"#);
    store.upsert_document("reqs/a.rq", "hash-a", &[alpha], &[], None).unwrap();
    let output_dir = temp_out("overview");
    let request = ExportRequest {
        format: ExportFormat::Html,
        output_dir: output_dir.clone(),
        export_name: "overview-links".into(),
        workspace_root: std::path::PathBuf::from("/workspace/reqlan"),
        include_cluster_pages: false,
        include_code_file_pages: false,
        include_print_pages: false,
        include_graph_page: false,
        cluster_strategy: "deterministic".into(),
        ..ExportRequest::default()
    };
    let snapshot = build_export_snapshot(&store, &request).unwrap();
    let result = write_html_export(&snapshot, &request).unwrap();
    let index_html = read(&result.index_file_path);
    let ideas_index_html = read(result.ideas_index_file_path.as_ref().unwrap());
    assert!(index_html.contains("ideas.html?status=todo"));
    assert!(index_html.contains("ideas.html?tags=export"));
    assert!(ideas_index_html.contains(r#"data-filter-key="status""#));
    std::fs::remove_dir_all(&output_dir).ok();
}

// rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export_url_base]
#[test]
fn url_base_and_header_link_produce_root_relative_hrefs() {
    let mut store = IndexStore::open_in_memory().unwrap();
    let alpha = idea("reqs/a.rq", "alpha", "alpha summary", "{}");
    store.upsert_document("reqs/a.rq", "hash-a", &[alpha], &[], None).unwrap();
    let output_dir = temp_out("urlbase");
    let request = ExportRequest {
        format: ExportFormat::Html,
        output_dir: output_dir.clone(),
        export_name: "mounted-report".into(),
        workspace_root: std::path::PathBuf::from("/workspace/reqlan"),
        include_requirements_page: true,
        include_graph_page: true,
        url_base: Some("/reqlan/spec".into()),
        header_link: Some(ExportHeaderLink { href: "/reqlan/".into(), label: "reqlan".into() }),
        ..ExportRequest::default()
    };
    let snapshot = build_export_snapshot(&store, &request).unwrap();
    let result = write_html_export(&snapshot, &request).unwrap();
    let index_html = read(&result.index_file_path);
    let idea_html = read(&result.output_dir.join(&snapshot.ideas[0].page.path));
    assert_eq!(snapshot.url_base.as_deref(), Some("/reqlan/spec"));
    assert!(index_html.contains(r#"class="brand-link" href="/reqlan/""#));
    assert!(index_html.contains("href=\"/reqlan/spec/assets/styles.css\""));
    assert!(index_html.contains("src=\"/reqlan/spec/assets/app.js\""));
    assert!(index_html.contains("src=\"/reqlan/spec/assets/search-index.js\""));
    assert!(index_html.contains(r#"data-search-index="/reqlan/spec/data/search.json""#));
    assert!(index_html.contains("href=\"/reqlan/spec/ideas.html\""));
    assert!(idea_html.contains("href=\"/reqlan/spec/assets/styles.css\""));
    assert!(idea_html.contains("href=\"/reqlan/spec/ideas.html\""));
    assert!(read(&result.output_dir.join("assets/styles.css")).contains(".brand-link"));
    std::fs::remove_dir_all(&output_dir).ok();
}

// rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export_graph_page]
#[test]
fn workspace_graph_includes_every_idea_when_max_graph_nodes_is_below_count() {
    let mut store = IndexStore::open_in_memory().unwrap();
    let file_uri = "reqs/many.rq";
    let idea_count = 20usize;
    let mut records: Vec<IdeaRecord> = (0..idea_count)
        .map(|index| IdeaRecord {
            id: idea_id(file_uri, &format!("idea_{index}")),
            name: format!("idea_{index}"),
            kind: IdeaKind::Block,
            file_uri: file_uri.into(),
            line_start: (index * 3) as u32,
            line_end: (index * 3 + 2) as u32,
            summary: format!("summary {index}"),
            attributes_json: "{}".into(),
            content_hash: format!("h{index}"),
            git_created_at: None,
            git_modified_at: None,
            git_change_count: None,
        })
        .collect();
    let ideaset = IdeaRecord {
        id: idea_id(file_uri, "group_set"),
        name: "group_set".into(),
        kind: IdeaKind::Ideaset,
        file_uri: file_uri.into(),
        line_start: (idea_count * 3) as u32,
        line_end: (idea_count * 3 + 4) as u32,
        summary: "contains members".into(),
        attributes_json: "{}".into(),
        content_hash: "ideaset".into(),
        git_created_at: None,
        git_modified_at: None,
        git_change_count: None,
    };
    let member_id = records[0].id.clone();
    records.push(ideaset.clone());
    store
        .upsert_document(
            file_uri,
            "hash-many",
            &records,
            &[EdgeRecord {
                id: "member-0".into(),
                source_id: ideaset.id.clone(),
                target_id: Some(member_id),
                target_file: None,
                kind: EdgeKind::IdeasetMember,
                label: None,
                source_line: None,
                snippet: None,
                is_resolved: Some(true),
            }],
            None,
        )
        .unwrap();
    let output_dir = temp_out("graphcap");
    let mut request = html_request(&output_dir, "large-graph-report");
    request.max_graph_nodes = Some(5);
    request.include_idea_pages = false;
    request.include_file_pages = false;
    request.include_code_file_pages = false;
    request.include_cluster_pages = false;
    request.include_attribute_pages = false;
    request.include_print_pages = false;
    request.cluster_strategy = "deterministic".into();
    let snapshot = build_export_snapshot(&store, &request).unwrap();
    let result = write_html_export(&snapshot, &request).unwrap();
    let graph_html = read(result.graph_file_path.as_ref().unwrap());
    let idea_nodes: Vec<_> = snapshot
        .graphs
        .workspace
        .nodes
        .iter()
        .filter(|node| node.is_external != Some(true))
        .collect();
    let ideaset_nodes: Vec<_> = idea_nodes.iter().filter(|node| node.kind == "ideaset").collect();
    assert_eq!(snapshot.counts.ideas, idea_count + 1);
    assert_eq!(idea_nodes.len(), idea_count + 1);
    assert_eq!(ideaset_nodes.len(), 1);
    assert_eq!(ideaset_nodes[0].name, "group_set");
    assert!(!snapshot.graphs.workspace.truncated);
    assert!(graph_html.contains("data-graph-toggle-ideasets"));
    assert!(graph_html.contains("Hide ideasets"));
    assert!(graph_html.contains("data-graph-file-treatment"));
    std::fs::remove_dir_all(&output_dir).ok();
}

// rq:["../../../reqlan rq/extension/module/ideas_summary/graphical_graph.rq".wildcard_refs_toggle]
// rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export_graph_page]
// rq:["../../../reqlan rq/indexer/indexer.rq".wildcard_reference_edges]
#[test]
fn html_export_workspace_graph_includes_wildcard_refs_chip_and_edges() {
    let mut store = IndexStore::open_in_memory().unwrap();
    let host = idea("reqs/host.rq", "host", "host cites a wildcard set.", r#"{"status":"done"}"#);
    let widget = idea("reqs/mods/alpha.rq", "widget_a", "matched pane", r#"{"status":"done"}"#);
    let friend = idea("reqs/host.rq", "exact_friend", "exact neighbour", r#"{"status":"done"}"#);
    let edges = vec![
        EdgeRecord {
            id: "edge-exact".into(),
            source_id: host.id.clone(),
            target_id: Some(friend.id.clone()),
            target_file: None,
            kind: EdgeKind::References,
            label: Some("exact_friend".into()),
            source_line: None,
            snippet: Some("[exact_friend]".into()),
            is_resolved: Some(true),
        },
        EdgeRecord {
            id: "edge-wild".into(),
            source_id: host.id.clone(),
            target_id: Some(widget.id.clone()),
            target_file: None,
            kind: EdgeKind::WildcardReference,
            label: Some("widget_a".into()),
            source_line: None,
            snippet: Some("[./mods/*.rq.widget_*]".into()),
            is_resolved: Some(true),
        },
    ];
    store
        .upsert_document("reqs/host.rq", "hash-host", &[host.clone(), friend], &edges, None)
        .unwrap();
    store
        .upsert_document("reqs/mods/alpha.rq", "hash-widget", &[widget.clone()], &[], None)
        .unwrap();

    let output_dir = temp_out("wildcard-graph");
    let snapshot =
        build_export_snapshot(&store, &html_request(&output_dir, "wildcard-report")).unwrap();
    let result =
        write_html_export(&snapshot, &html_request(&output_dir, "wildcard-report")).unwrap();
    let graph_html = read(result.graph_file_path.as_ref().unwrap());
    let app_js = read(&result.output_dir.join("assets/app.js"));

    assert!(snapshot.graphs.workspace.edges.iter().any(|edge| edge.kind == "wildcard_reference"));
    assert!(snapshot.graphs.workspace.edges.iter().any(|edge| edge.kind == "references"));
    assert!(graph_html.contains("data-graph-toggle-wildcard"));
    assert!(graph_html.contains("Wildcard refs"));
    assert!(app_js.contains("includeWildcardRefs"));
    assert!(app_js.contains("wildcard_reference"));
    std::fs::remove_dir_all(&output_dir).ok();
}
