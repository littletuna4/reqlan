//! rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_objects]

use reqlan_index::{extract_indexed_document, ExtractOptions, IndexStore, IndexedDocument};

/// One file holding the ideaset `bundle` plus one idea per member.
fn set_document(path: &str, members: &[&str]) -> IndexedDocument {
    let list = members.iter().map(|member| format!("    {member}")).collect::<Vec<_>>().join(",\n");
    let blocks = members.iter().map(|member| format!("{member} {{\n}}\n")).collect::<String>();
    let source = format!("bundle (\n{list}\n)\n{blocks}");
    extract_indexed_document(path, &source, &ExtractOptions::default())
}

#[test]
fn set_member_names_unions_same_named_sets_across_files() {
    let mut store = IndexStore::open_in_memory().unwrap();
    store
        .persist_extracted_batch([
            (set_document("a.rq", &["first", "shared"]), None),
            (set_document("b.rq", &["second", "shared"]), None),
        ])
        .unwrap();
    let rows = store.set_member_names("bundle", 80).unwrap();
    let keys: Vec<(String, String)> =
        rows.iter().map(|row| (row.file_uri.clone(), row.name.clone())).collect();
    assert_eq!(
        keys,
        vec![
            ("a.rq".to_string(), "first".to_string()),
            ("b.rq".to_string(), "second".to_string()),
            ("a.rq".to_string(), "shared".to_string()),
            ("b.rq".to_string(), "shared".to_string()),
        ],
        "{rows:?}"
    );
}

#[test]
fn set_member_names_honours_the_limit_and_unknown_sets() {
    let mut store = IndexStore::open_in_memory().unwrap();
    store
        .persist_extracted_batch([
            (set_document("a.rq", &["first", "shared"]), None),
            (set_document("b.rq", &["second", "shared"]), None),
        ])
        .unwrap();
    assert_eq!(store.set_member_names("bundle", 2).unwrap().len(), 2);
    assert!(store.set_member_names("missing", 80).unwrap().is_empty());
}
