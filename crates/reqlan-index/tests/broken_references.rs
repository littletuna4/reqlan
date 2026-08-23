//! rq:["../../../reqlan rq/core_analysis/core.rq".test_references]
//! rq:["../../../reqlan rq/language/syntax.rq".comment_reference]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_order_by_target]
//! rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_sparse]
//! rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]

use reqlan_index::sync::{sync_workspace, SyncOptions};
use reqlan_index::{
    check_references, list_broken_references, path_glob_matches, CheckReferencesOptions,
    IndexStore, ListBrokenReferencesOptions, SparseWildcardHandling,
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
        &SyncOptions { workspace_root: root.clone(), hard_rebuild: true },
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
    check_references(store, root, CheckReferencesOptions { path_glob, ..Default::default() })
        .unwrap()
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
fn lists_broken_idea_references_and_filters_by_glob() {
    let root = scratch("idea");
    std::fs::create_dir_all(root.join("reqs")).unwrap();
    std::fs::create_dir_all(root.join("other")).unwrap();
    std::fs::write(root.join("reqs").join("host.rq"), "host {\n    [missing_idea]\n}\n").unwrap();
    std::fs::write(root.join("other").join("side.rq"), "side {\n    [also_missing]\n}\n").unwrap();
    let store = sync_root(&root);
    let all = list_broken_references(
        &store,
        &root,
        ListBrokenReferencesOptions {
            path_glob: None,
            include_comment_references: false,
            ..Default::default()
        },
    )
    .unwrap();
    assert!(all.iter().any(|row| row.label == "missing_idea" && row.file_uri == "reqs/host.rq"));
    assert!(all.iter().any(|row| row.label == "also_missing"));

    let scoped = list_broken_references(
        &store,
        &root,
        ListBrokenReferencesOptions {
            path_glob: Some("reqs/**"),
            include_comment_references: false,
            ..Default::default()
        },
    )
    .unwrap();
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
    let without_comments = list_broken_references(
        &store,
        &root,
        ListBrokenReferencesOptions {
            path_glob: None,
            include_comment_references: false,
            ..Default::default()
        },
    )
    .unwrap();
    assert!(without_comments.iter().all(|row| row.kind != "comment_link"));

    let with_comments = list_broken_references(
        &store,
        &root,
        ListBrokenReferencesOptions {
            path_glob: Some("src/**"),
            include_comment_references: true,
            ..Default::default()
        },
    )
    .unwrap();
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
    let root = scratch("ws-file");
    std::fs::create_dir_all(root.join(".reqlan")).unwrap();
    std::fs::write(root.join(".reqlan/config.json"), r#"{"$schema":"x"}"#).unwrap();
    std::fs::create_dir_all(root.join("reqlan rq/site")).unwrap();
    std::fs::create_dir_all(root.join("site/src/app/support")).unwrap();
    std::fs::write(root.join("site/src/app/support/page.tsx"), "export {}\n").unwrap();
    std::fs::write(
        root.join("reqlan rq/site/host.rq"),
        "host {\n    [\"@/site/src/app/support/page.tsx\"]\n    [\"@/site/src/app/support/gone.tsx\"]\n}\n",
    )
    .unwrap();
    let store = sync_root(&root);
    let rows = run_check(&store, &root, None);
    assert!(rows
        .iter()
        .any(|row| row.kind == "file_reference" && row.label == "@/site/src/app/support/gone.tsx"));
    assert!(rows.iter().all(|row| row.label != "@/site/src/app/support/page.tsx"));
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
        rows.iter().all(|row| row.label != "./example.rq" && row.label != "./fenced.rq"),
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
