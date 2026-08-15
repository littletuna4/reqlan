//! Extract behaviour matching Langium `extractIndexedDocument` on the same sources.
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]

use reqlan_index::{extract_indexed_document, ExtractOptions};
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
