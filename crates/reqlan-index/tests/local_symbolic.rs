//! rq:["../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
//! rq:["../../../reqlan rq/language/syntax.rq".open_file_reference_sequencing]

use reqlan_index::{analyze_local_symbolic, EdgeKind, WildcardIdeaCandidate};
use reqlan_parse::ImportRootMapping;

#[test]
fn analyze_local_symbolic_returns_outbound_without_catalog() {
    let source = r#"
from "./lib.rq" import imported

host {
    See [local_idea] and ["./lib.rq".other_name] and ["./notes.md"].
    Wildcard ["./mods/*.rq".widget_*].
}
local_idea {
    body
}
"#;
    let doc = analyze_local_symbolic("demo/host.rq", source, &[]);
    assert!(doc.ideas.iter().any(|idea| idea.name == "host"));
    assert!(doc.ideas.iter().any(|idea| idea.name == "local_idea"));

    let kinds: Vec<_> = doc.edges.iter().map(|edge| edge.kind).collect();
    assert!(kinds.contains(&EdgeKind::References));
    assert!(kinds.contains(&EdgeKind::FileReference));
    assert!(kinds.contains(&EdgeKind::WildcardReference));

    let wildcards: Vec<_> =
        doc.edges.iter().filter(|edge| edge.kind == EdgeKind::WildcardReference).collect();
    assert_eq!(wildcards.len(), 1);
    assert_eq!(wildcards[0].is_resolved, Some(false));
    assert!(wildcards[0].target_id.is_none());

    let local = doc
        .edges
        .iter()
        .find(|edge| edge.label.as_deref() == Some("local_idea"))
        .expect("local idea edge");
    assert_eq!(local.target_id.as_deref(), Some("demo/host.rq#local_idea"));
    assert!(local.source_offset_start.is_some());
    assert!(local.source_offset_end.is_some());
    let start = local.source_offset_start.unwrap() as usize;
    let end = local.source_offset_end.unwrap() as usize;
    assert!(source.get(start..end).unwrap_or("").contains("local_idea"));
}

#[test]
fn analyze_local_symbolic_ignores_catalog_candidates() {
    let source = r#"
host {
    See ["./mods/*.rq".widget_*].
}
"#;
    let roots = vec![ImportRootMapping { alias: "@".into(), root: None }];
    let _unused_catalog = [WildcardIdeaCandidate {
        file_uri: "mods/a.rq".into(),
        file_path: "mods/a.rq".into(),
        idea_name: "widget_alpha".into(),
    }];
    let doc = analyze_local_symbolic("demo/host.rq", source, &roots);
    let wildcards: Vec<_> =
        doc.edges.iter().filter(|edge| edge.kind == EdgeKind::WildcardReference).collect();
    assert_eq!(wildcards.len(), 1, "local symbolic must not fan out against a catalog");
    assert_eq!(wildcards[0].is_resolved, Some(false));
}

#[test]
fn analyze_local_symbolic_includes_same_file_inbound_backlinks() {
    let source = r#"
host {
    See [local_idea] and [other].
}
local_idea {
    body
}
other {
    also [local_idea]
}
"#;
    let doc = analyze_local_symbolic("demo/host.rq", source, &[]);
    assert!(!doc.inbound.is_empty(), "same-file idea targets must appear as inbound backlinks");
    let (outbound, inbound) = doc.references_for_idea("demo/host.rq#local_idea");
    assert!(outbound.is_empty(), "local_idea has no outbound refs in this fixture");
    assert_eq!(inbound.len(), 2, "host and other both reference local_idea");
    let sources: Vec<&str> = inbound.iter().map(|edge| edge.source_id.as_str()).collect();
    assert!(sources.contains(&"demo/host.rq#host"));
    assert!(sources.contains(&"demo/host.rq#other"));

    let (host_out, host_in) = doc.references_for_idea("demo/host.rq#host");
    assert!(host_out.len() >= 2);
    assert!(host_in.is_empty());
}
