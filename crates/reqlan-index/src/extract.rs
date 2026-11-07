//! Extract ideas, attributes, and edges from a parsed document.
//! This barrel declares one module per concern and re-exports their surface.
//! rq:["../../../reqlan rq/ontology.rq".idea]
//! rq:["../../../reqlan rq/ontology.rq".attribute]
//! rq:["../../../reqlan rq/ontology.rq".reference]
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
//! rq:["../../../reqlan rq/indexer/indexer.rq".wildcard_reference_edges]
//! rq:["../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
//! rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
//! rq:["../../../reqlan rq/language/syntax.rq".same_file_reference]
//! rq:["../../../reqlan rq/language/syntax.rq".reference_resolution_order]
//! rq:["../../../reqlan rq/language/syntax.rq".open_file_reference_sequencing]
//! rq:["../../../reqlan rq/language/syntax.rq".block_idea]
//! rq:["../../../reqlan rq/language/syntax.rq".attribute_forms]
//! rq:["../../../reqlan rq/language/syntax.rq".simple_idea]
//! rq:["../../../reqlan rq/language/syntax.rq".references_to_subidea]
//! rq:["../../../reqlan rq/language/syntax.rq".attribute_namespacing]
//! rq:["../../../reqlan rq/language/syntax.rq".inline_code]
//! rq:["../../../reqlan rq/language/syntax.rq".code_snippets]
//! rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
//! rq:["../../../reqlan rq/reference_types.rq".reference_edgecase]
//! rq:["../../../reqlan rq/reference_types.rq".url_reference]

mod document;
mod glob;
mod refs;
mod text;
mod walk;
mod wildcard;

pub use document::{
    analyze_local_symbolic, analyze_local_symbolic_from_parse, extract_from_parse,
    extract_indexed_document, hash_text, ExtractOptions, EXTRACT_VERSION,
};
pub use glob::{
    extra_file_matches, glob_list_matches, path_glob_matches, path_glob_may_match_under,
};
pub use refs::{local_name_binding, LocalNameBinding};
pub use wildcard::{count_wildcard_matches, split_wildcard_label, WildcardIdeaCandidate};

#[cfg(test)]
mod tests {
    use super::{extract_indexed_document, ExtractOptions};
    use crate::types::EdgeKind;

    #[test]
    fn extract_skips_backticked_file_only_ref() {
        // rq:["../../../reqlan rq/language/syntax.rq".inline_code]
        let source = concat!("host {\n", "    `[\"", "./plc/interlock.stL#41-58", "\"]`\n", "}\n");
        let doc = extract_indexed_document("host.rq", source, &ExtractOptions::default());
        let files: Vec<String> = doc
            .edges
            .iter()
            .filter(|edge| edge.kind == EdgeKind::FileReference)
            .filter_map(|edge| edge.label.clone())
            .collect();
        assert!(files.iter().all(|label| !label.contains("interlock.st")), "{files:?}");
    }

    #[test]
    fn site_rq_does_not_index_backticked_interlock_path() {
        // rq:["../../../reqlan rq/language/syntax.rq".inline_code]
        // rq:["../../../reqlan rq/language/syntax.rq".code_snippets]
        let source = include_str!("../../../reqlan rq/site/site.rq");
        let doc =
            extract_indexed_document("reqlan rq/site/site.rq", source, &ExtractOptions::default());
        let files: Vec<String> = doc
            .edges
            .iter()
            .filter(|edge| edge.kind == EdgeKind::FileReference)
            .filter_map(|edge| edge.label.clone())
            .filter(|label| label.contains("interlock.st"))
            .collect();
        assert!(files.is_empty(), "{files:?}");
    }

    // rq:["../../../reqlan rq/reference_types.rq".reference_edgecase]
    #[test]
    fn unbracketed_quoted_path_is_not_a_file_reference() {
        let source = concat!(
            "host {\n",
            "    see \"this is not a reference.rq\"\n",
            "    and './also-not-a-reference.ts'\n",
            "    but this is: [\"./live.ts\"]\n",
            "}\n",
        );
        let doc = extract_indexed_document("host.rq", source, &ExtractOptions::default());
        let files: Vec<String> = doc
            .edges
            .iter()
            .filter(|edge| edge.kind == EdgeKind::FileReference)
            .filter_map(|edge| edge.label.clone())
            .collect();
        assert!(
            files.iter().all(|label| {
                !label.contains("this is not a reference.rq")
                    && !label.contains("also-not-a-reference.ts")
            }),
            "{files:?}"
        );
        assert!(
            files.iter().any(|label| label.contains("live.ts")),
            "bracketed file ref missing, got {files:?}"
        );
    }

    // rq:["../../../reqlan rq/reference_types.rq".reference_edgecase]
    #[test]
    fn import_quoted_path_is_not_an_embedded_file_reference() {
        let source = "from \"./imports.rq\" import seed\nhost {\n    body\n}\n";
        let doc = extract_indexed_document("host.rq", source, &ExtractOptions::default());
        let files: Vec<&str> = doc
            .edges
            .iter()
            .filter(|edge| edge.kind == EdgeKind::FileReference)
            .filter_map(|edge| edge.label.as_deref())
            .collect();
        assert!(files.is_empty(), "{files:?}");
    }

    // rq:["../../../reqlan rq/reference_types.rq".file_reference]
    #[test]
    fn embedded_refs_index_from_the_owning_idea() {
        let source = concat!(
            "first {\n",
            "    body\n",
            "}\n",
            "second {\n",
            "    see [\"./missing.ts\"]\n",
            "}\n"
        );
        let doc = extract_indexed_document("host.rq", source, &ExtractOptions::default());
        let sources: Vec<(String, String)> = doc
            .edges
            .iter()
            .filter(|edge| edge.kind == EdgeKind::FileReference)
            .map(|edge| {
                (
                    edge.source_id.clone(),
                    edge.label.clone().unwrap_or_default().trim_matches('"').to_string(),
                )
            })
            .collect();
        assert_eq!(
            sources,
            vec![("host.rq#second".to_string(), "./missing.ts".to_string())],
            "{:?}",
            doc.edges
        );
    }

    // rq:["../../../reqlan rq/reference_types.rq".url_reference]
    #[test]
    fn indexes_bracketed_url_as_url_reference() {
        let source = "host {\n    this is a valid url reference [https://reqlan.com/].\n}\n";
        let doc = extract_indexed_document("host.rq", source, &ExtractOptions::default());
        let urls: Vec<_> =
            doc.edges.iter().filter(|edge| edge.kind == EdgeKind::UrlReference).collect();
        assert_eq!(urls.len(), 1, "{:?}", doc.edges);
        assert_eq!(urls[0].label.as_deref(), Some("https://reqlan.com/"));
        assert_eq!(urls[0].target_file.as_deref(), Some("https://reqlan.com/"));
        assert_eq!(urls[0].is_resolved, Some(true));
        assert!(
            doc.edges.iter().all(|edge| {
                edge.kind != EdgeKind::References || edge.label.as_deref() != Some("https")
            }),
            "{:?}",
            doc.edges
        );
    }

    // rq:["../../../reqlan rq/reference_types.rq".url_reference]
    #[test]
    fn unbracketed_url_is_not_a_url_reference() {
        let source = "host {\n    see https://reqlan.com/ for details\n}\n";
        let doc = extract_indexed_document("host.rq", source, &ExtractOptions::default());
        assert!(
            doc.edges.iter().all(|edge| edge.kind != EdgeKind::UrlReference),
            "{:?}",
            doc.edges
        );
    }
}
