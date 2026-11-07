//! Document extract orchestration: parse to `IndexedDocument`, local symbolic extract, and content hashing.

use sha2::{Digest, Sha256};

use reqlan_parse::{parse_document, ImportRootMapping, ParseResult, TopLevelElement};

use crate::ids::{edge_id, idea_id};
use crate::types::{EdgeKind, EdgeRecord, IdeaAttributeMap, IdeaKind, IdeaRecord, IndexedDocument};

use super::refs::collect_parts_edges;
use super::text::{collect_attributes, summarize_block, summarize_parts};
use super::walk::walk_idea_parts;
use super::wildcard::WildcardIdeaCandidate;

/// Bump when extract rules change so mtime skip does not keep stale edges.
/// rq:["../../../../reqlan rq/language/syntax.rq".inline_code]
/// rq:["../../../../reqlan rq/indexer/indexer.rq".index]
pub const EXTRACT_VERSION: i64 = 7;

#[derive(Debug, Clone)]
pub struct ExtractOptions<'a> {
    pub idea_candidates: &'a [WildcardIdeaCandidate],
    pub import_roots: Vec<ImportRootMapping>,
    /// When true, ignore `idea_candidates` so outbound extract stays file-local
    /// (wildcards stay one unresolved pattern edge).
    /// rq:["../../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
    pub local_symbolic: bool,
}

impl Default for ExtractOptions<'static> {
    fn default() -> Self {
        Self {
            idea_candidates: &[],
            import_roots: reqlan_parse::default_import_roots(),
            local_symbolic: false,
        }
    }
}

/// File-local symbolic extract: outbound edges plus same-file inbound backlinks.
/// No catalog, no SQLite, no other documents.
/// The LSP layer may parse one neighbor file to confirm outbound idea names.
/// rq:["../../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
/// rq:["../../../../reqlan rq/language/syntax.rq".open_file_reference_sequencing]
/// rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq".outbound_one_hop]
pub fn analyze_local_symbolic(
    file_uri: &str,
    source: &str,
    import_roots: &[ImportRootMapping],
) -> crate::types::LocalSymbolicDocument {
    let parsed = parse_document(source);
    analyze_local_symbolic_from_parse(file_uri, source, &parsed, import_roots)
}

/// File-local symbolic extract from an existing parse (no second `parse_document`).
/// rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq".ast_lifecycle]
pub fn analyze_local_symbolic_from_parse(
    file_uri: &str,
    source: &str,
    parsed: &ParseResult,
    import_roots: &[ImportRootMapping],
) -> crate::types::LocalSymbolicDocument {
    let roots = if import_roots.is_empty() {
        reqlan_parse::default_import_roots()
    } else {
        import_roots.to_vec()
    };
    let import_bindings = parsed
        .model
        .import_bindings()
        .into_iter()
        .map(|(name, line_start)| crate::types::ImportBindingRecord { name, line_start })
        .collect();
    let doc = extract_from_parse(
        file_uri,
        source,
        parsed,
        &ExtractOptions { idea_candidates: &[], import_roots: roots, local_symbolic: true },
    );
    let mut symbolic = crate::types::LocalSymbolicDocument::from_indexed(doc);
    symbolic.import_bindings = import_bindings;
    symbolic
}

pub fn extract_indexed_document(
    file_uri: &str,
    source: &str,
    options: &ExtractOptions<'_>,
) -> IndexedDocument {
    let parsed = parse_document(source);
    extract_from_parse(file_uri, source, &parsed, options)
}

pub fn extract_from_parse(
    file_uri: &str,
    source: &str,
    parsed: &ParseResult,
    options: &ExtractOptions<'_>,
) -> IndexedDocument {
    let content_hash = hash_text(source);
    let mut ideas = Vec::new();
    let mut edges = Vec::new();
    let model = &parsed.model;

    for element in &model.elements {
        match element {
            TopLevelElement::Idea(idea) => {
                ideas.push(to_idea_record(
                    file_uri,
                    &idea.name,
                    IdeaKind::Block,
                    idea.span.line_start,
                    idea.span.line_end,
                    &summarize_block(source, &idea.elements),
                    collect_attributes(source, &idea.elements),
                ));
            }
            TopLevelElement::OneLiner(idea) => {
                ideas.push(to_idea_record(
                    file_uri,
                    &idea.name,
                    IdeaKind::Oneliner,
                    idea.span.line_start,
                    idea.span.line_end,
                    &summarize_parts(source, &idea.body),
                    IdeaAttributeMap::new(),
                ));
            }
            TopLevelElement::IdeaSet(set) => {
                ideas.push(to_idea_record(
                    file_uri,
                    &set.name,
                    IdeaKind::Ideaset,
                    set.span.line_start,
                    set.span.line_end,
                    &format!("Ideaset ({})", set.name),
                    IdeaAttributeMap::new(),
                ));
                let source_id = idea_id(file_uri, &set.name);
                for member in &set.members {
                    let target_id = idea_id(file_uri, member);
                    edges.push(EdgeRecord {
                        id: edge_id(&source_id, EdgeKind::IdeasetMember.as_str(), &target_id),
                        source_id: source_id.clone(),
                        target_id: Some(target_id),
                        target_file: None,
                        kind: EdgeKind::IdeasetMember,
                        label: None,
                        source_line: None,
                        snippet: None,
                        is_resolved: Some(true),
                        source_offset_start: None,
                        source_offset_end: None,
                    });
                }
            }
            TopLevelElement::Anonymous(_) => {}
        }
    }

    for element in &model.elements {
        match element {
            TopLevelElement::Idea(idea) => {
                collect_parts_edges(
                    file_uri,
                    &idea.name,
                    source,
                    &walk_idea_parts(&idea.elements),
                    &model.imports,
                    &ideas,
                    candidates(options),
                    &options.import_roots,
                    options.local_symbolic,
                    &mut edges,
                );
            }
            TopLevelElement::OneLiner(idea) => {
                collect_parts_edges(
                    file_uri,
                    &idea.name,
                    source,
                    &idea.body,
                    &model.imports,
                    &ideas,
                    candidates(options),
                    &options.import_roots,
                    options.local_symbolic,
                    &mut edges,
                );
            }
            TopLevelElement::IdeaSet(_) | TopLevelElement::Anonymous(_) => {}
        }
    }

    IndexedDocument { file_uri: file_uri.to_string(), content_hash, ideas, edges }
}

fn candidates<'a>(options: &ExtractOptions<'a>) -> &'a [WildcardIdeaCandidate] {
    if options.local_symbolic {
        &[]
    } else {
        options.idea_candidates
    }
}

fn to_idea_record(
    file_uri: &str,
    name: &str,
    kind: IdeaKind,
    line_start: u32,
    line_end: u32,
    summary: &str,
    attributes: IdeaAttributeMap,
) -> IdeaRecord {
    IdeaRecord {
        id: idea_id(file_uri, name),
        name: name.to_string(),
        kind,
        file_uri: file_uri.to_string(),
        line_start,
        line_end,
        summary: summary.to_string(),
        attributes_json: serde_json::to_string(&attributes).unwrap_or_else(|_| "{}".into()),
        content_hash: String::new(),
        git_created_at: None,
        git_modified_at: None,
        git_change_count: None,
    }
}

pub fn hash_text(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    let digest = hasher.finalize();
    digest.iter().take(8).map(|byte| format!("{byte:02x}")).collect()
}
