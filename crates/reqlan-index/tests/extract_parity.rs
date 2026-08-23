//! Extract behaviour matching Langium `extractIndexedDocument` on the same sources.
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]

use reqlan_index::{extract_indexed_document, idea_id, EdgeKind, ExtractOptions};
use serde_json::Value;

fn extract(source: &str) -> reqlan_index::IndexedDocument {
    extract_indexed_document("file:///workspace/demo.rq", source, &ExtractOptions::default())
}

fn attrs(source: &str) -> serde_json::Map<String, Value> {
    let indexed = extract(source);
    serde_json::from_str(&indexed.ideas[0].attributes_json).unwrap()
}

// rq:["../../../reqlan rq/language/syntax.rq".block_idea]
#[test]
fn block_idea_body_populates_summary_from_rich_text_parts() {
    let source = "myidea {\n            It should be a good thing.\n            per [simple_views]\n        }";
    let indexed = extract(source);
    assert_eq!(indexed.ideas[0].name, "myidea");
    assert_eq!(indexed.ideas[0].kind.as_str(), "block");
    assert!(
        indexed.ideas[0].summary.contains("It should be a good thing."),
        "{}",
        indexed.ideas[0].summary
    );
    assert!(indexed.ideas[0].summary.contains("[simple_views]"), "{}", indexed.ideas[0].summary);
    assert!(!indexed.ideas[0].summary.contains("[ref]"), "{}", indexed.ideas[0].summary);
}

// rq:["../../../reqlan rq/language/syntax.rq".simple_idea]
#[test]
fn one_liner_idea_body_populates_summary() {
    let indexed = extract("oneliner this is a simple idea body");
    assert_eq!(indexed.ideas[0].name, "oneliner");
    assert_eq!(indexed.ideas[0].kind.as_str(), "oneliner");
    assert_eq!(indexed.ideas[0].summary, "this is a simple idea body");
}

// rq:["../../../reqlan rq/language/syntax.rq".attribute_forms]
#[test]
fn indexes_scalar_list_block_and_flag_attribute_values() {
    let source = r#"demo {
            @status pending
            @tags (ui, export)
            @plan {
                do the thing
            }
            @flag
            @notes hello world value
            @tests (
                ["./foo.ts"]
                ["./bar.ts"]
            )
        }"#;
    let attrs = attrs(source);
    assert_eq!(attrs.get("status"), Some(&Value::String("pending".into())));
    assert_eq!(
        attrs.get("tags"),
        Some(&Value::Array(vec![Value::String("ui".into()), Value::String("export".into())]))
    );
    assert_eq!(attrs.get("flag"), Some(&Value::Bool(true)));
    assert_eq!(attrs.get("notes"), Some(&Value::String("hello world value".into())));
    assert_eq!(attrs.get("plan"), Some(&Value::String("do the thing".into())));
    assert_eq!(
        attrs.get("tests"),
        Some(&Value::Array(vec![
            Value::String(r#"["./foo.ts"]"#.into()),
            Value::String(r#"["./bar.ts"]"#.into()),
        ]))
    );
}

// rq:["../../../reqlan rq/language/syntax.rq".references_to_subidea]
#[test]
fn qualified_ideaset_member_reference_targets_leaf_idea_not_ideaset() {
    let source = r#"references_to_subidea {
    It should be acceptable to reference [example_ideaset.subidea1]
}
subidea1 hello
example_ideaset (
    subidea1
)
"#;
    let indexed = extract(source);
    let source_id = idea_id("file:///workspace/demo.rq", "references_to_subidea");
    let leaf_id = idea_id("file:///workspace/demo.rq", "subidea1");
    let ideaset_id = idea_id("file:///workspace/demo.rq", "example_ideaset");
    let refs: Vec<_> = indexed
        .edges
        .iter()
        .filter(|edge| edge.source_id == source_id && edge.kind == EdgeKind::References)
        .collect();
    assert_eq!(refs.len(), 1, "{refs:?}");
    assert_eq!(refs[0].target_id.as_deref(), Some(leaf_id.as_str()));
    assert_eq!(refs[0].label.as_deref(), Some("subidea1"));
    assert_eq!(refs[0].is_resolved, Some(true));
    assert!(
        refs.iter().all(|edge| edge.target_id.as_deref() != Some(ideaset_id.as_str())),
        "{refs:?}"
    );
}

// rq:["../../../reqlan rq/language/syntax.rq".references_to_subidea]
#[test]
fn qualified_namespace_import_reference_targets_leaf_in_imported_file() {
    let source = r#"import "./other.rq" as ns
host {
    see [ns.leaf]
}
"#;
    let indexed = extract(source);
    let source_id = idea_id("file:///workspace/demo.rq", "host");
    let refs: Vec<_> = indexed
        .edges
        .iter()
        .filter(|edge| edge.source_id == source_id && edge.kind == EdgeKind::References)
        .collect();
    assert_eq!(refs.len(), 1, "{refs:?}");
    assert_eq!(refs[0].target_id.as_deref(), Some(idea_id("./other.rq", "leaf").as_str()));
    assert_eq!(refs[0].label.as_deref(), Some("leaf"));
}

// rq:["../../../reqlan rq/language/syntax.rq".same_file_reference]
#[test]
fn same_file_forward_reference_is_resolved() {
    let source = r#"first {
    see [second]
}
second {
    later
}
"#;
    let indexed = extract(source);
    let refs: Vec<_> =
        indexed.edges.iter().filter(|edge| edge.kind == EdgeKind::References).collect();
    assert_eq!(refs.len(), 1, "{refs:?}");
    assert_eq!(refs[0].is_resolved, Some(true));
    assert_eq!(refs[0].label.as_deref(), Some("second"));
    assert_eq!(
        refs[0].target_id.as_deref(),
        Some(idea_id("file:///workspace/demo.rq", "second").as_str())
    );
}

// rq:["../../../reqlan rq/language/syntax.rq".same_file_reference]
// rq:["../../../reqlan rq/language/syntax.rq".reference_resolution_order]
#[test]
fn same_file_forward_ideaset_reference_is_resolved() {
    let source = r#"first {
    see [later_set]
}
later_set (
    first
)
"#;
    let indexed = extract(source);
    let refs: Vec<_> =
        indexed.edges.iter().filter(|edge| edge.kind == EdgeKind::References).collect();
    assert_eq!(refs.len(), 1, "{refs:?}");
    assert_eq!(refs[0].is_resolved, Some(true));
    assert_eq!(refs[0].label.as_deref(), Some("later_set"));
    assert_eq!(
        refs[0].target_id.as_deref(),
        Some(idea_id("file:///workspace/demo.rq", "later_set").as_str())
    );
}
