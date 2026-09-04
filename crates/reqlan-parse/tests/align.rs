//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_align]
//! rq:["../../../reqlan rq/language/syntax.rq".inline_code]

use reqlan_parse::{parse_align_snapshot, AlignRef};

#[test]
fn inline_code_file_example_is_not_a_live_ref() {
    let source =
        "demo {\n    Exact `[\"./file.rq\".idea]` stays [real_idea]\n}\nreal_idea { body }\n";
    let snapshot = parse_align_snapshot(source);
    assert!(snapshot.ok);
    assert_eq!(snapshot.inline_code_count, 1);
    assert_eq!(
        snapshot.refs,
        vec![AlignRef {
            form: "bracket".to_string(),
            kind: "local".to_string(),
            label: "real_idea".to_string(),
        }]
    );
    let names: Vec<_> =
        snapshot.elements.iter().filter_map(|element| element.name.clone()).collect();
    assert_eq!(names, vec!["demo", "real_idea"]);
}

#[test]
fn inline_code_file_only_line_range_is_not_a_live_ref() {
    // Same form as reqlan rq/site/site.rq interlock_showcase and the golden corpus.
    let source = "showcase {\n    `[\"./plc/interlock.stL#41-58\"]`\n}\n";
    let snapshot = parse_align_snapshot(source);
    assert!(snapshot.ok);
    assert_eq!(snapshot.inline_code_count, 1);
    assert!(
        snapshot.refs.is_empty(),
        "backticked file-only span must not be a live ref: {:?}",
        snapshot.refs
    );
}

#[test]
fn fence_body_is_one_code_snippet_not_inner_refs() {
    let source = "demo {\n```\n[\"./missing.rq\"]\n```\n    then [live]\n}\nlive { body }\n";
    let snapshot = parse_align_snapshot(source);
    assert!(snapshot.ok);
    assert_eq!(snapshot.code_snippet_count, 1);
    assert_eq!(
        snapshot.refs.iter().map(|reference| reference.label.as_str()).collect::<Vec<_>>(),
        vec!["live"]
    );
}

// rq:["../../../reqlan rq/language/syntax.rq".code_snippets]
// rq:["../../../reqlan rq/core_analysis/rust_port.rq".comment_span_align]
#[test]
fn mid_line_triple_backticks_are_not_a_code_snippet() {
    let source = "first {\n    fenced ``` bodies must not open comments\n}\nlater { ok }\n";
    let snapshot = parse_align_snapshot(source);
    assert!(snapshot.ok);
    assert_eq!(snapshot.code_snippet_count, 0);
    let names: Vec<_> =
        snapshot.elements.iter().filter_map(|element| element.name.clone()).collect();
    assert_eq!(names, vec!["first", "later"]);
}
