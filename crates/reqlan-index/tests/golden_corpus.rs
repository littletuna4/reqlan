//! Golden parse/extract: Rust idea names and kinds must match Langium dumps
//! of the frozen corpus in `testdata/golden-corpus/`, not live `reqlan rq/`.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".golden_corpus]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".rust_crate_layout]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
//! rq:["../../../reqlan rq/language/syntax.rq".inline_code]
//! rq:["../../../reqlan rq/language/syntax.rq".code_snippets]

use reqlan_index::{extract_indexed_document, ExtractOptions};
use reqlan_parse::{parse_align_snapshot, parse_document};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq, Clone)]
struct GoldenIdea {
    name: String,
    kind: String,
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn corpus_root() -> PathBuf {
    repo_root().join("testdata/golden-corpus")
}

fn rq_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                files.extend(rq_files(&path));
            } else if path.extension().and_then(|ext| ext.to_str()) == Some("rq") {
                files.push(path);
            }
        }
    }
    files.sort();
    files
}

fn rust_ideas(rel: &str, source: &str) -> Vec<GoldenIdea> {
    let parsed = parse_document(source);
    assert!(parsed.incomplete.is_none(), "incomplete parse for {rel}: {:?}", parsed.diagnostics);
    extract_indexed_document(rel, source, &ExtractOptions::default())
        .ideas
        .into_iter()
        .map(|idea| GoldenIdea { name: idea.name, kind: idea.kind.as_str().to_string() })
        .collect()
}

fn golden_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/golden/langium-corpus-names.json")
}

fn dump_corpus_ideas() -> BTreeMap<String, Vec<GoldenIdea>> {
    let mut dump = BTreeMap::new();
    for path in rq_files(&corpus_root()) {
        let source = std::fs::read_to_string(&path).unwrap();
        let rel = path.strip_prefix(repo_root()).unwrap_or(&path);
        let rel = rel.to_string_lossy().replace('\\', "/");
        dump.insert(rel.clone(), rust_ideas(&rel, &source));
    }
    dump
}

fn load_committed_golden() -> BTreeMap<String, Vec<GoldenIdea>> {
    let path = golden_path();
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("missing corpus golden at {}: {error}", path.display()));
    serde_json::from_str(&text).expect("langium-corpus-names.json")
}

// rq:["../../../reqlan rq/core_analysis/rust_port.rq".golden_corpus]
#[test]
fn corpus_parses_and_extracts_named_ideas() {
    let files = rq_files(&corpus_root());
    assert!(files.len() > 10, "expected the frozen golden corpus, found {}", files.len());
    let mut with_ideas = 0usize;
    for path in &files {
        let source = std::fs::read_to_string(path).unwrap();
        let rel = path.strip_prefix(repo_root()).unwrap_or(path);
        let rel = rel.to_string_lossy().replace('\\', "/");
        if !rust_ideas(&rel, &source).is_empty() {
            with_ideas += 1;
        }
    }
    assert!(with_ideas > 10, "corpus should yield ideas, got {with_ideas}");
}

// rq:["../../../reqlan rq/core_analysis/rust_port.rq".golden_corpus]
// rq:["../../../reqlan rq/core_analysis/rust_port.rq".rust_crate_layout]
#[test]
fn corpus_idea_names_match_langium_extract() {
    let rust = dump_corpus_ideas();
    let langium = load_committed_golden();
    assert!(langium.len() > 10, "golden dump should cover the corpus");
    let mut mismatches = Vec::new();
    for (rel, langium_ideas) in &langium {
        let rust_ideas = rust.get(rel);
        if rust_ideas != Some(langium_ideas) {
            mismatches
                .push(format!("{rel}\n  rust:    {rust_ideas:?}\n  langium: {langium_ideas:?}"));
        }
    }
    for rel in rust.keys() {
        if !langium.contains_key(rel) {
            mismatches
                .push(format!("{rel} present in Rust corpus dump but missing from Langium golden"));
        }
    }
    assert!(
        mismatches.is_empty(),
        "Rust extract diverged from Langium on {} files:\n{}",
        mismatches.len(),
        mismatches.join("\n\n")
    );
}

// rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]
// rq:["../../../reqlan rq/language/syntax.rq".lists]
#[test]
fn tutorials_rq_keeps_ideas_after_nested_slides_lists() {
    let rel = "testdata/golden-corpus/marketing_and_media/tutorials.rq";
    let source = std::fs::read_to_string(repo_root().join(rel)).unwrap();
    let ideas = rust_ideas(rel, &source);
    let adv_02 = ideas.iter().find(|idea| idea.name == "adv_02_attributes_status_plans");
    assert_eq!(
        adv_02.map(|idea| idea.kind.as_str()),
        Some("block"),
        "nested @slides lists must not swallow later ideas"
    );
    assert!(
        ideas.iter().any(|idea| idea.name == "tutorial_success_metrics"),
        "expected later ideas after adv_02, got {:?}",
        ideas.iter().map(|idea| idea.name.as_str()).collect::<Vec<_>>()
    );
}

// rq:["../../../reqlan rq/core_analysis/rust_port.rq".golden_corpus]
// rq:["../../../reqlan rq/language/syntax.rq".inline_code]
// rq:["../../../reqlan rq/language/syntax.rq".code_snippets]
#[test]
fn opaque_file_examples_do_not_extract_inline_or_fenced_paths() {
    let rel = "testdata/golden-corpus/language/opaque-file-examples.rq";
    let source = std::fs::read_to_string(repo_root().join(rel)).unwrap();
    let ideas = rust_ideas(rel, &source);
    let names: Vec<_> = ideas.iter().map(|idea| idea.name.as_str()).collect();
    assert_eq!(
        names,
        vec![
            "live_anchor",
            "inline_code_file_only",
            "inline_code_qualified",
            "fenced_file_example"
        ]
    );

    let doc = extract_indexed_document(rel, &source, &ExtractOptions::default());
    let file_labels: Vec<String> = doc
        .edges
        .iter()
        .filter(|edge| edge.kind.as_str() == "file_reference")
        .filter_map(|edge| edge.label.clone())
        .collect();
    assert!(
        file_labels.iter().any(|label| label == "./present.ts"),
        "live file ref missing, got {file_labels:?}"
    );
    assert!(
        file_labels.iter().all(|label| {
            label != "./plc/interlock.stL#41-58" && label != "./file.rq" && label != "./missing.rq"
        }),
        "opaque examples leaked as file refs: {file_labels:?}"
    );

    let snapshot = parse_align_snapshot(&source);
    assert!(snapshot.ok, "opaque-file-examples.rq must parse");
    assert!(
        snapshot.inline_code_count >= 2,
        "expected inline code spans, got {}",
        snapshot.inline_code_count
    );
    assert!(
        snapshot.code_snippet_count >= 1,
        "expected a fenced snippet, got {}",
        snapshot.code_snippet_count
    );
    assert!(
        snapshot.refs.iter().all(|reference| {
            reference.label != "./plc/interlock.stL#41-58"
                && reference.label != "./file.rq"
                && reference.label != "./missing.rq"
        }),
        "parser treated opaque examples as live refs: {:?}",
        snapshot.refs
    );
    assert!(
        snapshot
            .refs
            .iter()
            .any(|reference| reference.kind == "file" && reference.label == "./present.ts"),
        "live file ref missing from parse snapshot: {:?}",
        snapshot.refs
    );
}
