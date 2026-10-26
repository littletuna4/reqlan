//! rq:["../../../reqlan rq/core_analysis/core.rq".test_references]
//! rq:["../../../reqlan rq/language/syntax.rq".comment_reference]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_order_by_target]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_sparse]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_unresolved_imports]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_file]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_idea]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
//! rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
//! rq:["../../../reqlan rq/core_analysis/check.rq".code_comment_syntax_errors]

use reqlan_index::sync::{sync_workspace, SyncOptions};
use reqlan_index::{
    check_references, extract_indexed_document, list_broken_references, path_glob_matches,
    path_glob_may_match_under, BrokenReference, CheckReferencesOptions, EdgeKind, EdgeRecord,
    ExtractOptions, IndexStore, ListBrokenReferencesOptions, SparseWildcardHandling,
    EXTRACT_VERSION,
};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::time::{SystemTime, UNIX_EPOCH};

fn scratch(label: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("reqlan-broken-refs-{label}-{nanos}"));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn sync_root(root: &PathBuf) -> IndexStore {
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
    store
}

fn run_check(
    store: &IndexStore,
    root: &std::path::Path,
    path_glob: Option<&str>,
) -> Vec<reqlan_index::BrokenReference> {
    let one = path_glob.map(|glob| [glob]);
    let path_globs: &[&str] = match &one {
        Some(items) => items,
        None => &[],
    };
    check_references(store, root, CheckReferencesOptions { path_globs, ..Default::default() })
        .unwrap()
}

/// Lists broken references through the bounded check index.
fn list_refs(
    store: &IndexStore,
    root: &std::path::Path,
    options: ListBrokenReferencesOptions<'_>,
) -> Vec<BrokenReference> {
    list_broken_references(store, root, options).unwrap()
}

fn sparse_host(label: &str) -> (PathBuf, IndexStore) {
    let root = scratch(label);
    std::fs::create_dir_all(root.join("mods")).unwrap();
    std::fs::write(root.join("mods").join("alpha.rq"), "widget_a {\n    a\n}\n").unwrap();
    std::fs::write(root.join("mods").join("beta.rq"), "widget_b {\n    b\n}\n").unwrap();
    std::fs::write(
        root.join("host.rq"),
        "host {\n    [\"./mods/*.rq\".missing_*]\n    [\"./mods/*.rq\".widget_a*]\n    [\"./mods/*.rq\".widget_*]\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    (root, store)
}

#[test]
fn path_glob_matches_nested_rq_with_bare_pattern() {
    assert!(path_glob_matches("*.rq", "reqs/host.rq"));
    assert!(path_glob_matches("src/**", "src/app.ts"));
    assert!(!path_glob_matches("src/**", "reqs/host.rq"));
}

#[test]
fn path_glob_matches_cursor_skip_glob() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
    assert!(path_glob_matches("**/.cursor/**", "../../../.cursor/mcp.json"));
    assert!(path_glob_matches("**/.cursor/**", "../../../.cursor/skills"));
    assert!(path_glob_matches("**/.cursor/**", "./.cursor/mcp.json"));
    assert!(!path_glob_matches("**/.cursor/**", "./src/gone.ts"));
    assert!(!path_glob_matches("**/.cursor/**", "missing_idea"));
}

#[test]
fn lists_broken_idea_references_and_filters_by_glob() {
    let root = scratch("idea");
    std::fs::create_dir_all(root.join("reqs")).unwrap();
    std::fs::create_dir_all(root.join("other")).unwrap();
    std::fs::write(root.join("reqs").join("host.rq"), "host {\n    [missing_idea]\n}\n").unwrap();
    std::fs::write(root.join("other").join("side.rq"), "side {\n    [also_missing]\n}\n").unwrap();
    let store = sync_root(&root);
    let all = list_refs(
        &store,
        &root,
        ListBrokenReferencesOptions {
            path_glob: None,
            include_comment_references: false,
            ..Default::default()
        },
    );
    assert!(all.iter().any(|row| row.label == "missing_idea" && row.file_uri == "reqs/host.rq"));
    assert!(all.iter().any(|row| row.label == "also_missing"));

    let scoped = list_refs(
        &store,
        &root,
        ListBrokenReferencesOptions {
            path_glob: Some("reqs/**"),
            include_comment_references: false,
            ..Default::default()
        },
    );
    assert_eq!(scoped.len(), 1);
    assert_eq!(scoped[0].label, "missing_idea");
    assert!(scoped.iter().all(|row| row.kind != "comment_link"));
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn optionally_includes_broken_comment_references() {
    let root = scratch("comments");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("demo.rq"), "alpha {\n    first\n}\n").unwrap();
    std::fs::write(
        root.join("src").join("app.ts"),
        "// rq:[alpha]\n// rq:[missing_from_comments]\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let without_comments = list_refs(
        &store,
        &root,
        ListBrokenReferencesOptions {
            path_glob: None,
            include_comment_references: false,
            ..Default::default()
        },
    );
    assert!(without_comments.iter().all(|row| row.kind != "comment_link"));

    let with_comments = list_refs(
        &store,
        &root,
        ListBrokenReferencesOptions {
            path_glob: Some("src/**"),
            include_comment_references: true,
            ..Default::default()
        },
    );
    assert_eq!(with_comments.len(), 1);
    assert_eq!(with_comments[0].kind, "comment_link");
    assert_eq!(with_comments[0].label, "missing_from_comments");
    assert_eq!(with_comments[0].file_uri, "src/app.ts");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn skips_idea_and_comment_refs_on_rq_ignore_error_lines() {
    let root = scratch("ignore");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(
        root.join("host.rq"),
        "host {\n    //rq-ignore-error\n    [missing_ignored]\n    [missing_reported]\n}\n",
    )
    .unwrap();
    std::fs::write(
        root.join("src").join("app.ts"),
        "//rq-ignore-error\n// rq:[gone_ignored]\n// rq:[gone_reported]\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.iter().any(|row| row.label == "missing_reported"));
    assert!(rows.iter().any(|row| row.kind == "comment_link" && row.label == "gone_reported"));
    assert!(rows.iter().all(|row| row.label != "missing_ignored"));
    assert!(rows.iter().all(|row| row.label != "gone_ignored"));
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_reports_qualified_reference_to_a_missing_file() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_file]
    let root = scratch("qual-missing");
    std::fs::write(
        root.join("host.rq"),
        "host {\n    [\"../../../../my/non-existentfile.ts\".term]\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(
        rows.iter().any(|row| {
            row.kind == "file_reference" && row.label.ends_with("my/non-existentfile.ts")
        }),
        "{rows:?}"
    );
    assert!(rows.iter().all(|row| row.kind != "references"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_reports_qualified_reference_to_a_missing_rq_file() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_file]
    let root = scratch("qual-missing-rq");
    std::fs::write(root.join("host.rq"), "host {\n    [\"non-existant-file.rq\".idea]\n}\n")
        .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(
        rows.iter()
            .any(|row| { row.kind == "file_reference" && row.label == "non-existant-file.rq" }),
        "{rows:?}"
    );
    assert!(rows.iter().all(|row| row.kind != "references"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_accepts_qualified_reference_when_the_file_exists() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_file]
    let root = scratch("qual-exists");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("src").join("app.ts"), "export const term = 1;\n").unwrap();
    std::fs::write(root.join("host.rq"), "host {\n    [\"./src/app.ts\".term]\n}\n").unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.is_empty(), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/core_analysis/check_oom.rq".qualified_idea_targets_are_rq_only]
#[test]
fn check_accepts_code_symbol_targets_without_parsing_them_as_requirements() {
    let root = scratch("qualified-code-symbol");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(
        root.join("src/component.tsx"),
        "function render() {\n    return (\n        <For each={nodes}>\n            {(node) => {\n                return (\n                    <Show when={node.visible} keyed>\n                        {(anchor) => (\n                            <div\n                                style={{ left: anchor.x, top: anchor.y }}\n                                active={node.active && anchor.ready}\n                            />\n                        )}\n                    </Show>\n                );\n            }}\n        </For>\n    );\n}\n",
    )
    .unwrap();
    std::fs::write(root.join("host.rq"), "host {\n    [\"./src/component.tsx\".render]\n}\n")
        .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.is_empty(), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_reports_qualified_reference_to_a_missing_idea() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_idea]
    let root = scratch("qual-missing-idea");
    std::fs::write(root.join("lib.rq"), "seed {\n    ok\n}\n").unwrap();
    std::fs::write(
        root.join("host.rq"),
        "host {\n    [\"./lib.rq\".seed]\n    [\"./lib\".seed]\n    [\"./lib.rq\".index_ideas]\n    [\"./lib\".also_missing]\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    let missing: Vec<_> = rows.iter().filter(|row| row.kind == "references").collect();
    assert_eq!(missing.len(), 2, "{rows:?}");
    assert!(missing.iter().any(|row| row.label == "index_ideas" && row.severity == "error"));
    assert!(missing.iter().any(|row| row.label == "also_missing"));
    assert!(missing.iter().all(|row| row.label != "seed"), "{rows:?}");
    assert!(rows.iter().all(|row| row.kind != "file_reference"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_reports_namespace_qualified_reference_to_a_missing_idea() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_idea]
    let root = scratch("qual-alias-missing-idea");
    std::fs::write(root.join("lib.rq"), "seed {\n    ok\n}\n").unwrap();
    std::fs::write(
        root.join("host.rq"),
        "import \"./lib.rq\" as lib\nhost {\n    [lib.seed]\n    [lib.index_ideas]\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(
        rows.iter().any(|row| row.kind == "references" && row.label == "index_ideas"),
        "{rows:?}"
    );
    assert!(rows.iter().all(|row| row.label != "seed"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_skips_qualified_missing_idea_on_rq_ignore_error() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_idea]
    let root = scratch("qual-idea-ignore");
    std::fs::write(root.join("lib.rq"), "seed {\n    ok\n}\n").unwrap();
    std::fs::write(
        root.join("host.rq"),
        "host {\n    //rq-ignore-error\n    [\"./lib.rq\".ignored_idea]\n    [\"./lib.rq\".reported_idea]\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.iter().any(|row| row.kind == "references" && row.label == "reported_idea"));
    assert!(rows.iter().all(|row| row.label != "ignored_idea"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_reports_missing_file_refs_and_skips_existing() {
    let root = scratch("files");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("src").join("app.ts"), "export {}\n").unwrap();
    std::fs::write(
        root.join("host.rq"),
        "host {\n    [\"./src/app.ts\"]\n    [\"./src/missing.ts\"]\n    [\"https://example.com/remote.rq\"]\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.iter().any(|row| row.kind == "file_reference" && row.label == "./src/missing.ts"));
    assert!(rows.iter().all(|row| row.label != "./src/app.ts"));
    assert!(rows.iter().all(|row| !row.label.contains("example.com")));
    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/reference_types.rq".url_reference]
#[test]
fn check_accepts_url_references() {
    let root = scratch("url-ref");
    std::fs::write(root.join("host.rq"), "host {\n    [https://reqlan.com/]\n}\n").unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.is_empty(), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_strips_test_name_and_line_suffix_before_file_exists() {
    let root = scratch("suffix");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("src").join("app.test.ts"), "test('lists items', () => {})\n")
        .unwrap();
    std::fs::write(
        root.join("host.rq"),
        "host {\n    [\"src/app.test.ts:lists items\"]\n    [\"src/app.test.ts:e2e: lists items\"]\n    [\"src/app.test.tsL#1\"]\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.iter().all(|row| row.kind != "file_reference"));
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_accepts_test_names_that_contain_colons_from_nested_rq() {
    let root = scratch("colon-title");
    std::fs::create_dir_all(root.join("reqlan rq/language")).unwrap();
    std::fs::create_dir_all(root.join("packages/language/test")).unwrap();
    std::fs::write(root.join("packages/language/test/comment-in-string.test.ts"), "export {}\n")
        .unwrap();
    std::fs::write(
        root.join("reqlan rq/language/host.rq"),
        "host {\n    [\"../../packages/language/test/comment-in-string.test.ts:e2e: real block comments still hide body text\"]\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.iter().all(|row| row.kind != "file_reference"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_skips_same_file_idea_refs_and_reports_true_missing() {
    let root = scratch("same-file");
    std::fs::write(
        root.join("host.rq"),
        "first {\n    [second]\n    [missing_idea]\n}\nsecond {\n    later\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.iter().any(|row| row.label == "missing_idea"));
    assert!(rows.iter().all(|row| row.label != "second"));
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_accepts_import_root_alias_file_refs() {
    // Shared with LSP: locate_authored_rq_path / crates/reqlan-lsp/tests/parity.rs:import_root_alias_file_refs_match_check
    // rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
    let root = scratch("ws-file");
    std::fs::create_dir_all(root.join(".reqlan")).unwrap();
    std::fs::write(root.join(".reqlan/config.json"), r#"{"$schema":"x"}"#).unwrap();
    std::fs::create_dir_all(root.join("reqlan rq/site")).unwrap();
    std::fs::create_dir_all(root.join("site/src/app/support")).unwrap();
    std::fs::create_dir_all(root.join("docs")).unwrap();
    std::fs::write(root.join("site/src/app/support/page.tsx"), "export {}\n").unwrap();
    std::fs::write(root.join("docs/my file.ts"), "export {}\n").unwrap();
    std::fs::write(
        root.join("reqlan rq/site/host.rq"),
        "host {\n    [\"@/site/src/app/support/page.tsx\"]\n    [\"@/docs/my file.ts\"]\n    [\"@/site/src/app/support/gone.tsx\"]\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows
        .iter()
        .any(|row| row.kind == "file_reference" && row.label == "@/site/src/app/support/gone.tsx"));
    assert!(rows.iter().all(|row| row.label != "@/site/src/app/support/page.tsx"));
    assert!(rows.iter().all(|row| row.label != "@/docs/my file.ts"));
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_honours_import_roots_from_applying_config() {
    // rq:["../../../reqlan rq/extension/host/configuration.rq".configuration_import_roots]
    // rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
    // Shared with LSP: crates/reqlan-lsp/tests/parity.rs:import_root_config_file_refs_match_check
    let root = scratch("ws-config-root");
    std::fs::create_dir_all(root.join(".reqlan")).unwrap();
    std::fs::write(
        root.join(".reqlan/config.json"),
        r#"{"importRoots":[{"alias":"@","root":"./lib"}]}"#,
    )
    .unwrap();
    std::fs::create_dir_all(root.join("lib")).unwrap();
    std::fs::write(root.join("lib/my file.ts"), "export {}\n").unwrap();
    std::fs::create_dir_all(root.join("reqlan rq")).unwrap();
    std::fs::write(
        root.join("reqlan rq/host.rq"),
        "host {\n    [\"@/my file.ts\"]\n    [\"@/gone.ts\"]\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.iter().any(|row| row.kind == "file_reference" && row.label == "@/gone.ts"));
    assert!(rows.iter().all(|row| row.label != "@/my file.ts"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_skips_file_refs_inside_inline_code_and_fences() {
    // rq:["../../../reqlan rq/language/syntax.rq".inline_code]
    // rq:["../../../reqlan rq/language/syntax.rq".code_snippets]
    let root = scratch("ticks");
    std::fs::write(
        root.join("host.rq"),
        r#"host {
    Exact `["./example.rq".idea]` stays
    `["./plc/interlock.stL#41-58"]`
    ```
    ["./fenced.rq"]
    ```
    ["./src/missing.ts"]
}
"#,
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(
        rows.iter().any(|row| row.kind == "file_reference" && row.label == "./src/missing.ts"),
        "{rows:?}"
    );
    assert!(
        rows.iter().all(|row| {
            row.label != "./example.rq"
                && row.label != "./fenced.rq"
                && row.label != "./plc/interlock.stL#41-58"
        }),
        "{rows:?}"
    );
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_resolves_comment_refs_into_a_nested_base_with_spaced_folder() {
    // rq:["../../../reqlan rq/language/syntax.rq".comment_reference]
    // rq:["../../../reqlan rq/bases/base.rq".base_nesting]
    let root = scratch("nested-space");
    std::fs::create_dir_all(root.join("reqlan rq/marketing_and_media")).unwrap();
    std::fs::create_dir_all(root.join("reqlan rq/marketing_and_media/.reqlan")).unwrap();
    std::fs::create_dir_all(root.join("site/src/content")).unwrap();
    std::fs::write(
        root.join("reqlan rq/marketing_and_media/tutorials.rq"),
        "tutorials {\n    body\n}\nget_started_series (\n    gs_01_why_reqlan\n)\ngs_01_why_reqlan {\n    body\n}\n",
    )
    .unwrap();
    std::fs::write(root.join("root.rq"), "host {\n    local\n}\n").unwrap();
    std::fs::write(
        root.join("site/src/content/quickstart.ts"),
        "//rq:[\"../../../reqlan rq/marketing_and_media/tutorials.rq\".tutorials]\n//rq:[\"../../../reqlan rq/marketing_and_media/tutorials.rq\".get_started_series]\n//rq:[\"../../../reqlan rq/marketing_and_media/tutorials.rq\".gs_01_why_reqlan]\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, Some("site/**"));
    assert!(rows.iter().all(|row| row.kind != "comment_link"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_orders_issues_by_missing_target() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_order_by_target]
    let root = scratch("order");
    std::fs::create_dir_all(root.join("a")).unwrap();
    std::fs::create_dir_all(root.join("b")).unwrap();
    std::fs::write(
        root.join("a").join("one.rq"),
        "one {\n    [shared_missing]\n    [zebra_missing]\n}\n",
    )
    .unwrap();
    std::fs::write(
        root.join("b").join("two.rq"),
        "two {\n    [shared_missing]\n    [alpha_missing]\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    let labels: Vec<&str> = rows.iter().map(|row| row.label.as_str()).collect();
    assert_eq!(labels, vec!["alpha_missing", "shared_missing", "shared_missing", "zebra_missing"]);
    let shared: Vec<&str> = rows
        .iter()
        .filter(|row| row.label == "shared_missing")
        .map(|row| row.file_uri.as_str())
        .collect();
    assert_eq!(shared, vec!["a/one.rq", "b/two.rq"]);
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_warns_when_a_wildcard_matches_zero_or_one_idea() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_sparse]
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
    let (root, store) = sparse_host("wild-sparse");
    let rows = run_check(&store, &root, None);
    let zero = rows
        .iter()
        .find(|row| row.kind == "wildcard_reference" && row.match_count == Some(0))
        .expect("0-match warning");
    assert_eq!(zero.severity, "warning");
    assert!(zero.label.contains("missing_*"), "{zero:?}");
    let one = rows
        .iter()
        .find(|row| row.kind == "wildcard_reference" && row.match_count == Some(1))
        .expect("1-match warning");
    assert_eq!(one.severity, "warning");
    assert!(one.label.contains("widget_a"), "{one:?}");
    assert!(rows
        .iter()
        .all(|row| { row.kind != "wildcard_reference" || row.match_count != Some(2) }));
    assert!(!rows.iter().any(|row| {
        row.kind == "wildcard_reference"
            && row.label.contains("widget_*")
            && !row.label.contains("widget_a")
    }));
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_wildcard_zero_flag_off_omits_empty_match() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
    let (root, store) = sparse_host("wild-zero-off");
    let rows = check_references(
        &store,
        &root,
        CheckReferencesOptions { wildcard_zero: SparseWildcardHandling::Off, ..Default::default() },
    )
    .unwrap();
    assert!(rows.iter().all(|row| row.match_count != Some(0)), "{rows:?}");
    assert!(rows.iter().any(|row| row.match_count == Some(1)));
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_wildcard_zero_flag_error_sets_severity() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
    let (root, store) = sparse_host("wild-zero-err");
    let rows = check_references(
        &store,
        &root,
        CheckReferencesOptions {
            wildcard_zero: SparseWildcardHandling::Error,
            ..Default::default()
        },
    )
    .unwrap();
    let zero = rows.iter().find(|row| row.match_count == Some(0)).expect("0-match");
    assert_eq!(zero.severity, "error");
    let one = rows.iter().find(|row| row.match_count == Some(1)).expect("1-match");
    assert_eq!(one.severity, "warning");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_wildcard_one_flag_off_omits_singleton_match() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
    let (root, store) = sparse_host("wild-one-off");
    let rows = check_references(
        &store,
        &root,
        CheckReferencesOptions { wildcard_one: SparseWildcardHandling::Off, ..Default::default() },
    )
    .unwrap();
    assert!(rows.iter().all(|row| row.match_count != Some(1)), "{rows:?}");
    assert!(rows.iter().any(|row| row.match_count == Some(0)));
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_wildcard_one_flag_error_sets_severity() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
    let (root, store) = sparse_host("wild-one-err");
    let rows = check_references(
        &store,
        &root,
        CheckReferencesOptions {
            wildcard_one: SparseWildcardHandling::Error,
            ..Default::default()
        },
    )
    .unwrap();
    let one = rows.iter().find(|row| row.match_count == Some(1)).expect("1-match");
    assert_eq!(one.severity, "error");
    let zero = rows.iter().find(|row| row.match_count == Some(0)).expect("0-match");
    assert_eq!(zero.severity, "warning");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_skips_sparse_wildcard_warning_on_rq_ignore_error() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_sparse]
    // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
    let root = scratch("wild-ignore");
    std::fs::create_dir_all(root.join("mods")).unwrap();
    std::fs::write(root.join("mods").join("alpha.rq"), "widget_a {\n    a\n}\n").unwrap();
    std::fs::write(
        root.join("host.rq"),
        "host {\n    //rq-ignore-error\n    [\"./mods/*.rq\".missing_*]\n    //rq-ignore-error\n    [\"./mods/*.rq\".widget_a*]\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.iter().all(|row| row.kind != "wildcard_reference"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_skips_targets_that_match_skip_globs() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
    let root = scratch("skip-targets");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(
        root.join("host.rq"),
        "host {\n    [missing_idea]\n    [\"./src/gone.ts\"]\n    [\"../../../.cursor/mcp.json\"]\n    [\"../../../.cursor/skills\"]\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);

    let all = run_check(&store, &root, None);
    assert!(all.iter().any(|row| row.label == "missing_idea"), "{all:?}");
    assert!(all.iter().any(|row| row.label == "./src/gone.ts"), "{all:?}");
    assert!(all.iter().any(|row| row.label == "../../../.cursor/mcp.json"), "{all:?}");
    assert!(all.iter().any(|row| row.label == "../../../.cursor/skills"), "{all:?}");

    let skipped = check_references(
        &store,
        &root,
        CheckReferencesOptions { skip_targets: &["**/.cursor/**"], ..Default::default() },
    )
    .unwrap();
    assert!(skipped.iter().any(|row| row.label == "missing_idea"), "{skipped:?}");
    assert!(skipped.iter().any(|row| row.label == "./src/gone.ts"), "{skipped:?}");
    assert!(skipped.iter().all(|row| !row.label.contains(".cursor")), "{skipped:?}");

    let exact = check_references(
        &store,
        &root,
        CheckReferencesOptions {
            skip_targets: &["missing_idea", "./src/gone.ts"],
            ..Default::default()
        },
    )
    .unwrap();
    assert!(exact.iter().all(|row| row.label != "missing_idea"), "{exact:?}");
    assert!(exact.iter().all(|row| row.label != "./src/gone.ts"), "{exact:?}");
    assert!(exact.iter().any(|row| row.label.contains(".cursor")), "{exact:?}");

    let empty_pattern = check_references(
        &store,
        &root,
        CheckReferencesOptions { skip_targets: &[""], ..Default::default() },
    )
    .unwrap();
    assert_eq!(empty_pattern.len(), all.len(), "{empty_pattern:?}");

    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_skips_gitignored_file_targets() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
    let root = scratch("skip-gitignored");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::create_dir_all(root.join("reqlan rq").join("extension").join("onboarding")).unwrap();
    std::fs::write(
        root.join(".gitignore"),
        ".cursor/\npackages/extension/media/webviews/\nbuild/\n",
    )
    .unwrap();
    std::fs::write(
        root.join("host.rq"),
        "host {\n    [missing_idea]\n    [\"./src/gone.ts\"]\n    [\"./.cursor/mcp.json\"]\n    [\"./build/out.js\"]\n}\n",
    )
    .unwrap();
    std::fs::write(
        root.join("reqlan rq").join("extension").join("onboarding").join("page.rq"),
        "installation_event {\n    [\"../../../packages/extension/media/webviews/onboarding\"]\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);

    let all = run_check(&store, &root, None);
    assert!(all.iter().any(|row| row.label == "missing_idea"), "{all:?}");
    assert!(all.iter().any(|row| row.label == "./src/gone.ts"), "{all:?}");
    assert!(all.iter().any(|row| row.label.contains(".cursor")), "{all:?}");
    assert!(all.iter().any(|row| row.label.contains("build/out.js")), "{all:?}");
    assert!(all.iter().any(|row| row.label.contains("media/webviews")), "{all:?}");

    let skipped = check_references(
        &store,
        &root,
        CheckReferencesOptions { skip_gitignored_targets: true, ..Default::default() },
    )
    .unwrap();
    assert!(skipped.iter().any(|row| row.label == "missing_idea"), "{skipped:?}");
    assert!(skipped.iter().any(|row| row.label == "./src/gone.ts"), "{skipped:?}");
    assert!(skipped.iter().all(|row| !row.label.contains(".cursor")), "{skipped:?}");
    assert!(skipped.iter().all(|row| !row.label.contains("build/")), "{skipped:?}");
    assert!(skipped.iter().all(|row| !row.label.contains("media/webviews")), "{skipped:?}");

    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn sync_drops_stale_inline_code_file_refs_when_extract_version_changes() {
    // rq:["../../../reqlan rq/language/syntax.rq".inline_code]
    // rq:["../../../reqlan rq/indexer/indexer.rq".index]
    let root = scratch("stale-extract");
    let source = concat!("host {\n", "    `[\"", "./gone.ts", "\"]`\n", "}\n");
    std::fs::write(root.join("host.rq"), source).unwrap();
    let mut store = IndexStore::open_in_memory().unwrap();
    let mut document = extract_indexed_document("host.rq", source, &ExtractOptions::default());
    document.edges.push(EdgeRecord {
        id: "host.rq#host->file_reference:./gone.ts".into(),
        source_id: "host.rq#host".into(),
        target_id: None,
        target_file: Some("./gone.ts".into()),
        kind: EdgeKind::FileReference,
        label: Some("./gone.ts".into()),
        source_line: None,
        snippet: None,
        is_resolved: Some(true),
        source_offset_start: None,
        source_offset_end: None,
    });
    let mtime_ms = std::fs::metadata(root.join("host.rq"))
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64);
    store.persist_extracted(document, mtime_ms).unwrap();
    store.set_extract_version(0).unwrap();

    sync_workspace(
        &mut store,
        &SyncOptions {
            workspace_root: root.clone(),
            hard_rebuild: false,
            path_globs: Vec::new(),
            include_files: Vec::new(),
            record_file_events: false,
        },
        &AtomicBool::new(false),
    )
    .unwrap();
    assert_eq!(store.extract_version().unwrap(), EXTRACT_VERSION);
    let rows = run_check(&store, &root, None);
    assert!(rows.iter().all(|row| row.label != "./gone.ts"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/core_analysis/check.rq".check_unresolved_imports]
#[test]
fn check_reports_missing_import_path() {
    let root = scratch("import-path");
    std::fs::write(root.join("host.rq"), "from \"./gone.rq\" import ghost\nhost {\n    body\n}\n")
        .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.iter().any(|row| row.kind == "import" && row.label == "./gone.rq"), "{rows:?}");
    assert!(rows.iter().all(|row| row.label != "ghost"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/core_analysis/check.rq".check_unresolved_imports]
#[test]
fn check_reports_missing_imported_idea() {
    let root = scratch("import-idea");
    std::fs::write(root.join("lib.rq"), "seed {\n    ok\n}\n").unwrap();
    std::fs::write(
        root.join("host.rq"),
        "from \"./lib.rq\" import missing_idea\nhost {\n    body\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.iter().any(|row| row.kind == "import" && row.label == "missing_idea"), "{rows:?}");
    assert!(rows.iter().all(|row| row.label != "./lib.rq"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/core_analysis/check.rq".check_unresolved_imports]
#[test]
fn check_accepts_resolved_imports() {
    let root = scratch("import-ok");
    std::fs::write(root.join("lib.rq"), "seed {\n    ok\n}\n").unwrap();
    std::fs::write(
        root.join("host.rq"),
        "from \"./lib.rq\" import seed\nimport \"./lib.rq\" as lib\nhost {\n    [seed]\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.iter().all(|row| row.kind != "import"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/core_analysis/check.rq".check_unresolved_imports]
#[test]
fn check_skips_import_on_rq_ignore_error() {
    let root = scratch("import-ignore");
    std::fs::write(
        root.join("host.rq"),
        "//rq-ignore-error\nfrom \"./gone.rq\" import ghost\nfrom \"./also-gone.rq\" import other\nhost {\n    body\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.iter().all(|row| row.label != "./gone.rq"), "{rows:?}");
    assert!(
        rows.iter().any(|row| row.kind == "import" && row.label == "./also-gone.rq"),
        "{rows:?}"
    );
    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/core_analysis/check.rq".check_unresolved_imports]
#[test]
fn check_accepts_folder_and_implicit_extension_imports() {
    let root = scratch("import-folder");
    std::fs::create_dir_all(root.join("mods")).unwrap();
    std::fs::write(root.join("lib.rq"), "seed {\n    ok\n}\n").unwrap();
    std::fs::write(
        root.join("host.rq"),
        "import \"./mods\" as mods\nfrom \"./lib\" import seed\nhost {\n    body\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.iter().all(|row| row.kind != "import"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/core_analysis/check.rq".check_unresolved_imports]
#[test]
fn check_skips_remote_import_urls() {
    let root = scratch("import-remote");
    std::fs::write(
        root.join("host.rq"),
        "from \"https://example.com/reqs/style.rq\" import style\nimport \"https://company.com/reqs/style.rq\" as styleguide\nhost {\n    body\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.iter().all(|row| row.kind != "import"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/core_analysis/check.rq".check_unresolved_imports]
// rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
#[test]
fn check_skips_gitignored_import_paths() {
    let root = scratch("import-gi");
    std::fs::write(root.join(".gitignore"), "build/\n").unwrap();
    std::fs::write(
        root.join("host.rq"),
        "from \"./build/out.rq\" import ghost\nfrom \"./gone.rq\" import other\nhost {\n    body\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let all = run_check(&store, &root, None);
    assert!(all.iter().any(|row| row.kind == "import" && row.label == "./build/out.rq"), "{all:?}");
    assert!(all.iter().any(|row| row.kind == "import" && row.label == "./gone.rq"), "{all:?}");

    let skipped = check_references(
        &store,
        &root,
        CheckReferencesOptions { skip_gitignored_targets: true, ..Default::default() },
    )
    .unwrap();
    assert!(skipped.iter().all(|row| row.label != "./build/out.rq"), "{skipped:?}");
    assert!(
        skipped.iter().any(|row| row.kind == "import" && row.label == "./gone.rq"),
        "{skipped:?}"
    );
    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/core_analysis/check.rq".code_comment_syntax_errors]
#[test]
fn check_reports_a_malformed_comment_reference() {
    let root = scratch("comment-syntax");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("demo.rq"), "alpha {\n    body\n}\n").unwrap();
    std::fs::write(
        root.join("src").join("app.ts"),
        "// rq:[alpha]\n// rq:[123bad]\n# rq:[\"../demo.rq\"]\n// rq:[missing_idea]\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    let syntax: Vec<_> = rows.iter().filter(|row| row.kind == "comment_syntax").collect();
    assert_eq!(syntax.len(), 2, "{rows:?}");
    assert!(
        syntax.iter().any(|row| {
            row.label == "invalid idea name in comment reference: rq:[123bad]"
                && row.file_uri == "src/app.ts"
                && row.severity == "error"
                && row.source_line == Some(1)
        }),
        "{rows:?}"
    );
    assert!(
        syntax
            .iter()
            .any(|row| row.label == "comment reference has no idea name: rq:[\"../demo.rq\"]"),
        "{rows:?}"
    );
    assert!(rows.iter().any(|row| row.kind == "comment_link" && row.label == "missing_idea"));
    assert!(rows.iter().all(|row| row.kind != "comment_link" || row.label != "alpha"));
    std::fs::remove_dir_all(&root).ok();
}

// rq:["../../../reqlan rq/core_analysis/check.rq".code_comment_syntax_errors]
// rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
#[test]
fn check_skips_comment_syntax_on_rq_ignore_error() {
    let root = scratch("comment-syntax-ignore");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(
        root.join("src").join("app.ts"),
        "//rq-ignore-error\n// rq:[123bad]\n// rq:[]\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows.iter().all(|row| !row.label.contains("123bad")), "{rows:?}");
    assert!(
        rows.iter().any(|row| {
            row.kind == "comment_syntax" && row.label == "empty comment reference: rq:[]"
        }),
        "{rows:?}"
    );
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn path_glob_may_match_under_prunes_unrelated_directories() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
    assert!(path_glob_may_match_under("src/**", "src"));
    assert!(path_glob_may_match_under("src/**", "src/nested"));
    assert!(!path_glob_may_match_under("src/**", "other"));
    assert!(!path_glob_may_match_under("", "src"));
    assert!(path_glob_may_match_under("*.rq", "other"));
    assert!(path_glob_may_match_under("a/**", ""));
}

#[test]
fn check_two_globs_report_an_outside_target_and_skip_outside_directories() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
    let root = scratch("multi-glob");
    std::fs::create_dir_all(root.join("a")).unwrap();
    std::fs::create_dir_all(root.join("b")).unwrap();
    std::fs::create_dir_all(root.join("c").join("nested")).unwrap();
    std::fs::write(root.join("c").join("present.ts"), "export {}\n").unwrap();
    std::fs::write(
        root.join("a").join("host.rq"),
        "host {\n    [missing_a]\n    [\"../c/present.ts\"]\n    [\"../c/missing.ts\"]\n}\n",
    )
    .unwrap();
    std::fs::write(root.join("b").join("side.rq"), "side {\n    [missing_b]\n}\n").unwrap();
    std::fs::write(
        root.join("c").join("nested").join("decoy.rq"),
        "decoy {\n    [decoy_missing]\n}\n",
    )
    .unwrap();

    let mut store = IndexStore::open_in_memory().unwrap();
    sync_workspace(
        &mut store,
        &SyncOptions {
            workspace_root: root.clone(),
            hard_rebuild: true,
            path_globs: vec!["a/**".into(), "b/**".into()],
            include_files: Vec::new(),
            record_file_events: false,
        },
        &AtomicBool::new(false),
    )
    .unwrap();
    let uris = store.list_document_uris().unwrap();
    assert!(uris.iter().any(|uri| uri.ends_with("a/host.rq")), "{uris:?}");
    assert!(uris.iter().any(|uri| uri.ends_with("b/side.rq")), "{uris:?}");
    assert!(uris.iter().all(|uri| !uri.contains("decoy")), "{uris:?}");
    assert!(uris.iter().all(|uri| !uri.contains("c/")), "{uris:?}");

    let rows = check_references(
        &store,
        &root,
        CheckReferencesOptions { path_globs: &["a/**", "b/**"], ..Default::default() },
    )
    .unwrap();
    assert!(rows.iter().any(|row| row.label == "missing_a"), "{rows:?}");
    assert!(rows.iter().any(|row| row.label == "missing_b"), "{rows:?}");
    assert!(
        rows.iter().any(|row| row.kind == "file_reference" && row.label.contains("missing.ts")),
        "{rows:?}"
    );
    assert!(rows.iter().all(|row| !row.label.contains("present.ts")), "{rows:?}");
    assert!(rows.iter().all(|row| row.label != "decoy_missing"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_includes_an_explicit_file_outside_the_globs() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
    let root = scratch("extra-file");
    std::fs::create_dir_all(root.join("a")).unwrap();
    std::fs::create_dir_all(root.join("c").join("nested")).unwrap();
    std::fs::write(root.join("a").join("host.rq"), "host {\n    local\n}\n").unwrap();
    std::fs::write(root.join("c").join("leaf.rq"), "leaf {\n    [leaf_missing]\n}\n").unwrap();
    std::fs::write(
        root.join("c").join("nested").join("decoy.rq"),
        "decoy {\n    [decoy_missing]\n}\n",
    )
    .unwrap();

    let mut store = IndexStore::open_in_memory().unwrap();
    sync_workspace(
        &mut store,
        &SyncOptions {
            workspace_root: root.clone(),
            hard_rebuild: true,
            path_globs: vec!["a/**".into()],
            include_files: vec![root.join("c"), root.join("c").join("leaf.rq")],
            record_file_events: false,
        },
        &AtomicBool::new(false),
    )
    .unwrap();
    let uris = store.list_document_uris().unwrap();
    assert!(uris.iter().any(|uri| uri.ends_with("c/leaf.rq")), "{uris:?}");
    assert!(uris.iter().all(|uri| !uri.contains("decoy")), "{uris:?}");

    let rows = check_references(
        &store,
        &root,
        CheckReferencesOptions {
            path_globs: &["a/**"],
            extra_files: &["c/leaf.rq"],
            ..Default::default()
        },
    )
    .unwrap();
    assert!(rows.iter().any(|row| row.label == "leaf_missing"), "{rows:?}");
    assert!(rows.iter().all(|row| row.label != "decoy_missing"), "{rows:?}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn check_rejects_an_empty_path_glob() {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
    let root = scratch("empty-glob");
    std::fs::write(root.join("host.rq"), "host {\n    local\n}\n").unwrap();
    let store = sync_root(&root);
    let error = check_references(
        &store,
        &root,
        CheckReferencesOptions { path_globs: &[""], ..Default::default() },
    );
    assert!(error.is_err(), "{error:?}");
    std::fs::remove_dir_all(&root).ok();
}
