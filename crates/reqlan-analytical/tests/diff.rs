//! rq:["../../../reqlan rq/cli/diff.rq".diff]
//! rq:["../../../reqlan rq/cli/diff.rq".diff_verbosity]

use reqlan_analytical::{diff_ideas, AnalysisError, DiffChange, DiffVerbosity};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn scratch(label: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let dir = std::env::temp_dir().join(format!("reqlan-diff-{label}-{nanos}"));
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn git(dir: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .unwrap_or_else(|error| panic!("git {args:?}: {error}"));
    assert!(
        output.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn init_repo(dir: &Path) {
    git(dir, &["init", "-b", "main"]);
    git(dir, &["config", "user.email", "diff@example.com"]);
    git(dir, &["config", "user.name", "Diff Test"]);
    git(dir, &["config", "commit.gpgsign", "false"]);
}

fn write(dir: &Path, path: &str, body: &str) {
    let full = dir.join(path);
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(full, body).unwrap();
}

fn commit_all(dir: &Path, message: &str) -> String {
    git(dir, &["add", "-A"]);
    git(dir, &["commit", "-m", message]);
    git(dir, &["rev-parse", "HEAD"])
}

fn labels(
    dir: &Path,
    from: Option<&str>,
    to: Option<&str>,
    verbosity: DiffVerbosity,
) -> Vec<String> {
    diff_ideas(dir, from, to, verbosity)
        .unwrap()
        .rows
        .into_iter()
        .map(|row| match row.from_file {
            Some(from_file) => format!("{:?} {} {} -> {from_file}", row.change, row.name, row.file),
            None => format!("{:?} {} {}", row.change, row.name, row.file),
        })
        .collect()
}

#[test]
fn created_idea_is_listed_without_the_unchanged_idea() {
    let dir = scratch("created");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    let left = commit_all(&dir, "a");
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n\nbeta {\n    two\n}\n");
    let right = commit_all(&dir, "b");
    let rows = labels(&dir, Some(&left), Some(&right), DiffVerbosity::Summary);
    assert_eq!(rows, vec!["Created beta reqs.rq".to_string()]);
}

#[test]
fn modified_body_is_modified() {
    let dir = scratch("modified");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    let left = commit_all(&dir, "a");
    write(&dir, "reqs.rq", "alpha {\n    two\n}\n");
    let right = commit_all(&dir, "b");
    let rows = labels(&dir, Some(&left), Some(&right), DiffVerbosity::Summary);
    assert_eq!(rows, vec!["Modified alpha reqs.rq".to_string()]);
}

#[test]
fn attribute_change_is_modified() {
    let dir = scratch("attribute");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    let left = commit_all(&dir, "a");
    write(&dir, "reqs.rq", "alpha {\n    one\n    @status draft\n}\n");
    let right = commit_all(&dir, "b");
    let rows = labels(&dir, Some(&left), Some(&right), DiffVerbosity::Summary);
    assert_eq!(rows, vec!["Modified alpha reqs.rq".to_string()]);
}

#[test]
fn deleted_idea_is_deleted() {
    let dir = scratch("deleted");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    let left = commit_all(&dir, "a");
    write(&dir, "reqs.rq", "\n");
    let right = commit_all(&dir, "b");
    let rows = labels(&dir, Some(&left), Some(&right), DiffVerbosity::Summary);
    assert_eq!(rows, vec!["Deleted alpha reqs.rq".to_string()]);
}

#[test]
fn line_shift_is_not_a_change() {
    let dir = scratch("shift");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    let left = commit_all(&dir, "a");
    write(&dir, "reqs.rq", "\nalpha {\n    one\n}\n");
    let right = commit_all(&dir, "b");
    let rows = labels(&dir, Some(&left), Some(&right), DiffVerbosity::Summary);
    assert!(rows.is_empty());
}

#[test]
fn one_argument_compares_with_head() {
    let dir = scratch("one-arg");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    commit_all(&dir, "a");
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n\nbeta {\n    two\n}\n");
    commit_all(&dir, "b");
    let via_default = labels(&dir, Some("HEAD~1"), None, DiffVerbosity::Summary);
    let via_head = labels(&dir, Some("HEAD~1"), Some("HEAD"), DiffVerbosity::Summary);
    assert_eq!(via_default, via_head);
    assert_eq!(via_default, vec!["Created beta reqs.rq".to_string()]);
}

#[test]
fn tilde_count_matches_head_tilde() {
    let dir = scratch("tilde");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    commit_all(&dir, "a");
    write(&dir, "reqs.rq", "alpha {\n    one\n}\nbeta {\n    mid\n}\n");
    commit_all(&dir, "b");
    write(&dir, "reqs.rq", "alpha {\n    one\n}\nbeta {\n    mid\n}\ngamma {\n    new\n}\n");
    commit_all(&dir, "c");
    let relative = labels(&dir, Some("~2"), Some("HEAD"), DiffVerbosity::Summary);
    let explicit = labels(&dir, Some("HEAD~2"), Some("HEAD"), DiffVerbosity::Summary);
    assert_eq!(relative, explicit);
    assert!(relative.iter().any(|row| row == "Created beta reqs.rq"));
    assert!(relative.iter().any(|row| row == "Created gamma reqs.rq"));
}

#[test]
fn branch_against_head_and_two_branches() {
    let dir = scratch("branch");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    commit_all(&dir, "base");
    git(&dir, &["checkout", "-b", "feature"]);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n\nbeta {\n    two\n}\n");
    commit_all(&dir, "feature-commit");
    let against_head = labels(&dir, Some("main"), None, DiffVerbosity::Summary);
    assert_eq!(against_head, vec!["Created beta reqs.rq".to_string()]);
    let forward = labels(&dir, Some("main"), Some("feature"), DiffVerbosity::Summary);
    let backward = labels(&dir, Some("feature"), Some("main"), DiffVerbosity::Summary);
    assert_eq!(forward, vec!["Created beta reqs.rq".to_string()]);
    assert_eq!(backward, vec!["Deleted beta reqs.rq".to_string()]);
}

#[test]
fn pending_unstaged_staged_and_layered_edits() {
    let dir = scratch("pending");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    commit_all(&dir, "base");

    write(&dir, "reqs.rq", "alpha {\n    one\n}\n\nbeta {\n    two\n}\n");
    let unstaged = labels(&dir, None, None, DiffVerbosity::Summary);
    assert_eq!(unstaged, vec!["Created beta reqs.rq".to_string()]);

    git(&dir, &["add", "reqs.rq"]);
    let staged = labels(&dir, None, None, DiffVerbosity::Summary);
    assert_eq!(staged, vec!["Created beta reqs.rq".to_string()]);

    write(&dir, "reqs.rq", "alpha {\n    one\n}\n\ngamma {\n    three\n}\n");
    let layered = labels(&dir, None, None, DiffVerbosity::Summary);
    assert_eq!(layered, vec!["Created gamma reqs.rq".to_string()]);
}

#[test]
fn clean_tree_compares_head_with_parent_and_ignores_non_rq() {
    let dir = scratch("clean");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    commit_all(&dir, "a");
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n\nbeta {\n    two\n}\n");
    commit_all(&dir, "b");
    let clean = labels(&dir, None, None, DiffVerbosity::Summary);
    let explicit = labels(&dir, Some("HEAD~1"), Some("HEAD"), DiffVerbosity::Summary);
    assert_eq!(clean, explicit);
    assert_eq!(clean, vec!["Created beta reqs.rq".to_string()]);

    write(&dir, "notes.txt", "dirty\n");
    let dirty_other = labels(&dir, None, None, DiffVerbosity::Summary);
    assert_eq!(dirty_other, clean);
}

#[test]
fn head_without_parent_lists_current_ideas_as_created() {
    let dir = scratch("root");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    commit_all(&dir, "only");
    let rows = labels(&dir, None, None, DiffVerbosity::Summary);
    assert_eq!(rows, vec!["Created alpha reqs.rq".to_string()]);
}

#[test]
fn moved_idea_reports_both_paths() {
    let dir = scratch("moved");
    init_repo(&dir);
    write(&dir, "a.rq", "alpha {\n    one\n}\n");
    let left = commit_all(&dir, "a");
    git(&dir, &["mv", "a.rq", "b.rq"]);
    let right = commit_all(&dir, "b");
    let rows = labels(&dir, Some(&left), Some(&right), DiffVerbosity::Summary);
    assert_eq!(rows, vec!["Moved alpha b.rq -> a.rq".to_string()]);
}

#[test]
fn ambiguous_name_does_not_move() {
    let dir = scratch("ambiguous");
    init_repo(&dir);
    write(&dir, "a.rq", "alpha {\n    one\n}\n");
    write(&dir, "b.rq", "alpha {\n    one\n}\n");
    let left = commit_all(&dir, "a");
    fs::remove_file(dir.join("a.rq")).unwrap();
    fs::remove_file(dir.join("b.rq")).unwrap();
    write(&dir, "c.rq", "alpha {\n    one\n}\n");
    let right = commit_all(&dir, "b");
    let rows = labels(&dir, Some(&left), Some(&right), DiffVerbosity::Summary);
    assert_eq!(
        rows,
        vec![
            "Deleted alpha a.rq".to_string(),
            "Deleted alpha b.rq".to_string(),
            "Created alpha c.rq".to_string(),
        ]
    );
}

#[test]
fn renamed_idea_is_deleted_and_created() {
    let dir = scratch("rename");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    let left = commit_all(&dir, "a");
    write(&dir, "reqs.rq", "beta {\n    one\n}\n");
    let right = commit_all(&dir, "b");
    let rows = labels(&dir, Some(&left), Some(&right), DiffVerbosity::Summary);
    assert_eq!(rows, vec!["Deleted alpha reqs.rq".to_string(), "Created beta reqs.rq".to_string()]);
}

#[test]
fn same_revision_is_empty() {
    let dir = scratch("empty");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    commit_all(&dir, "a");
    let rows = labels(&dir, Some("HEAD"), Some("HEAD"), DiffVerbosity::Summary);
    assert!(rows.is_empty());
}

#[test]
fn missing_repository_and_revision_are_errors() {
    let dir = scratch("errors");
    let missing = diff_ideas(&dir, None, None, DiffVerbosity::Summary).unwrap_err();
    assert!(matches!(missing, AnalysisError::NotARepository));

    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    commit_all(&dir, "a");
    let bad = diff_ideas(&dir, Some("not-a-rev"), None, DiffVerbosity::Summary).unwrap_err();
    assert!(matches!(bad, AnalysisError::BadRevision));
}

#[test]
fn summary_json_omits_references_and_text() {
    let dir = scratch("json");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    let left = commit_all(&dir, "a");
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n\nbeta {\n    two\n}\n");
    let right = commit_all(&dir, "b");
    let result = diff_ideas(&dir, Some(&left), Some(&right), DiffVerbosity::Summary).unwrap();
    assert!(!result.implicit);
    assert_eq!(result.rows.len(), 1);
    assert_eq!(result.rows[0].change, DiffChange::Created);
    assert_eq!(result.rows[0].name, "beta");
    assert_eq!(result.rows[0].file, "reqs.rq");
    assert!(result.rows[0].from_file.is_none());
    let value = serde_json::to_value(&result.rows[0]).unwrap();
    assert!(value.get("references").is_none());
    assert!(value.get("text").is_none());
    assert!(value.get("fromFile").is_none());
}

#[test]
fn reference_verbosity_lists_added_and_removed_names() {
    let dir = scratch("refs");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    see [beta]\n}\n");
    let left = commit_all(&dir, "a");
    write(&dir, "reqs.rq", "alpha {\n    see [gamma]\n}\n");
    let right = commit_all(&dir, "b");
    let summary = diff_ideas(&dir, Some(&left), Some(&right), DiffVerbosity::Summary).unwrap();
    assert_eq!(summary.rows.len(), 1);
    assert_eq!(summary.rows[0].change, DiffChange::Modified);
    assert!(summary.rows[0].references.is_none());
    assert!(summary.rows[0].text.is_none());

    let refs = diff_ideas(&dir, Some(&left), Some(&right), DiffVerbosity::References).unwrap();
    let delta = refs.rows[0].references.as_ref().unwrap();
    assert_eq!(delta.added, vec!["gamma".to_string()]);
    assert_eq!(delta.removed, vec!["beta".to_string()]);
    assert!(refs.rows[0].text.is_none());
}

#[test]
fn text_verbosity_returns_before_and_after_body() {
    let dir = scratch("text");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    let left = commit_all(&dir, "a");
    write(&dir, "reqs.rq", "alpha {\n    two\n}\n");
    let right = commit_all(&dir, "b");
    let rows = diff_ideas(&dir, Some(&left), Some(&right), DiffVerbosity::Text).unwrap();
    let text = rows.rows[0].text.as_ref().unwrap();
    assert_eq!(text.before, "one");
    assert_eq!(text.after, "two");
    assert!(rows.rows[0].references.is_none());
}

#[test]
fn text_verbosity_includes_attributes() {
    let dir = scratch("text-attr");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    let left = commit_all(&dir, "a");
    write(&dir, "reqs.rq", "alpha {\n    one\n    @status draft\n}\n");
    let right = commit_all(&dir, "b");
    let rows = diff_ideas(&dir, Some(&left), Some(&right), DiffVerbosity::Text).unwrap();
    let text = rows.rows[0].text.as_ref().unwrap();
    assert_eq!(text.before, "one");
    assert_eq!(text.after, "one\n@status draft");
    assert!(rows.rows[0].references.is_none());
}

#[test]
fn implicit_targets_report_resolved_labels() {
    let dir = scratch("implicit");
    init_repo(&dir);
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n");
    commit_all(&dir, "a");
    write(&dir, "reqs.rq", "alpha {\n    one\n}\n\nbeta {\n    two\n}\n");
    commit_all(&dir, "b");
    let clean = diff_ideas(&dir, None, None, DiffVerbosity::Summary).unwrap();
    assert!(clean.implicit);
    assert_eq!(clean.from, "HEAD~1");
    assert_eq!(clean.to, "HEAD");

    write(&dir, "reqs.rq", "alpha {\n    one\n}\n\nbeta {\n    two\n}\ngamma {\n    three\n}\n");
    let pending = diff_ideas(&dir, None, None, DiffVerbosity::Summary).unwrap();
    assert!(pending.implicit);
    assert_eq!(pending.from, "HEAD");
    assert_eq!(pending.to, "pending");

    let one = diff_ideas(&dir, Some("~1"), None, DiffVerbosity::Summary).unwrap();
    assert!(one.implicit);
    assert_eq!(one.from, "HEAD~1");
    assert_eq!(one.to, "HEAD");

    let both = diff_ideas(&dir, Some("HEAD~1"), Some("HEAD"), DiffVerbosity::Summary).unwrap();
    assert!(!both.implicit);
}
