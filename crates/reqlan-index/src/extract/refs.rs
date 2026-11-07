//! Reference edge construction: bracket refs, wiki links, markdown links, imports.
//! rq:["../../../../reqlan rq/reference_types.rq.idea_reference]
//! rq:["../../../../reqlan rq/reference_types.rq.file_reference]
//! rq:["../../../../reqlan rq/reference_types.rq.link_reference]

use super::glob::unquote_if_needed;
use super::wildcard::wildcard_edges;
use super::WildcardIdeaCandidate;
use crate::ids::{edge_id, idea_id};
use crate::types::{parse_attributes, EdgeKind, EdgeRecord, IdeaKind, IdeaRecord};
use reqlan_parse::{
    resolve_rq_path, unquote_path, Import, ImportRootMapping, ReferenceTarget, RichPart,
};

pub(crate) fn collect_parts_edges(
    file_uri: &str,
    idea_name: &str,
    source: &str,
    parts: &[RichPart],
    imports: &[Import],
    ideas: &[IdeaRecord],
    candidates: &[WildcardIdeaCandidate],
    import_roots: &[ImportRootMapping],
    keep_authored_targets: bool,
    edges: &mut Vec<EdgeRecord>,
) {
    let source_id = idea_id(file_uri, idea_name);
    // Include ideasets so a bare `[ideaset_name]` resolves even when declared later in the file.
    let local_names: Vec<&str> = ideas.iter().map(|idea| idea.name.as_str()).collect();
    for part in parts {
        match part {
            RichPart::MarkdownLink { raw, span } => {
                if let Some(target) = parse_markdown_target(raw) {
                    edges.push(
                        file_edge(&source_id, &target, span.line_start + 1, raw)
                            .with_source_offsets(span.start as u32, span.end as u32),
                    );
                }
            }
            RichPart::BracketRef { target, span } | RichPart::WikiLink { target, span, .. } => {
                let snippet = source
                    .get(span.start..span.end)
                    .unwrap_or("")
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ");
                for edge in reference_to_edges(
                    &source_id,
                    file_uri,
                    target,
                    imports,
                    &local_names,
                    ideas,
                    candidates,
                    import_roots,
                    keep_authored_targets,
                    span.line_start + 1,
                    &snippet,
                ) {
                    edges.push(edge.with_source_offsets(span.start as u32, span.end as u32));
                }
            }
            _ => {}
        }
    }
}

fn parse_markdown_target(raw: &str) -> Option<String> {
    let start = raw.find("](")? + 2;
    let end = raw.rfind(')')?;
    if end <= start {
        return None;
    }
    Some(raw[start..end].to_string())
}

fn file_edge(source_id: &str, target: &str, source_line: u32, snippet: &str) -> EdgeRecord {
    EdgeRecord {
        id: edge_id(source_id, EdgeKind::FileReference.as_str(), target),
        source_id: source_id.to_string(),
        target_id: None,
        target_file: Some(target.to_string()),
        kind: EdgeKind::FileReference,
        label: Some(target.to_string()),
        source_line: Some(source_line),
        snippet: Some(
            snippet.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(120).collect(),
        ),
        is_resolved: Some(true),
        source_offset_start: None,
        source_offset_end: None,
    }
}

fn url_edge(source_id: &str, url: &str, source_line: u32, snippet: &str) -> EdgeRecord {
    // rq:["../../../../reqlan rq/reference_types.rq".url_reference]
    EdgeRecord {
        id: edge_id(source_id, EdgeKind::UrlReference.as_str(), url),
        source_id: source_id.to_string(),
        target_id: None,
        target_file: Some(url.to_string()),
        kind: EdgeKind::UrlReference,
        label: Some(url.to_string()),
        source_line: Some(source_line),
        snippet: Some(
            snippet.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(120).collect(),
        ),
        is_resolved: Some(true),
        source_offset_start: None,
        source_offset_end: None,
    }
}

/// Local symbolic extract keeps the authored path so the LSP layer resolves it once.
/// Index extract still canonicalises through `resolve_rq_path`.
/// rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".aliased_from_import_ctrl_click]
fn imported_idea_target_file(
    authored_path: &str,
    file_uri: &str,
    import_roots: &[ImportRootMapping],
    keep_authored: bool,
) -> String {
    if keep_authored {
        authored_path.to_string()
    } else {
        resolve_rq_path(authored_path, file_uri, import_roots)
    }
}

pub(crate) fn reference_to_edges(
    source_id: &str,
    file_uri: &str,
    target: &ReferenceTarget,
    imports: &[Import],
    local_names: &[&str],
    ideas: &[IdeaRecord],
    candidates: &[WildcardIdeaCandidate],
    import_roots: &[ImportRootMapping],
    keep_authored_targets: bool,
    source_line: u32,
    snippet: &str,
) -> Vec<EdgeRecord> {
    let meta_snippet =
        Some(snippet.chars().take(120).collect::<String>()).filter(|s| !s.is_empty());
    match target {
        ReferenceTarget::Wildcard { path_pattern, idea_pattern, .. } => wildcard_edges(
            source_id,
            path_pattern,
            idea_pattern,
            file_uri,
            candidates,
            import_roots,
            source_line,
            meta_snippet.clone(),
        ),
        ReferenceTarget::File { file, .. } => {
            let unquoted = unquote_if_needed(file);
            if local_names.iter().any(|name| *name == unquoted) {
                let target_id = idea_id(file_uri, &unquoted);
                vec![ref_edge(
                    source_id,
                    Some(target_id),
                    &unquoted,
                    true,
                    source_line,
                    meta_snippet,
                )]
            } else {
                vec![file_edge(source_id, file, source_line, snippet)]
            }
        }
        ReferenceTarget::Url { url, .. } => {
            vec![url_edge(source_id, url, source_line, snippet)]
        }
        ReferenceTarget::FileSymbol { file, .. } => {
            vec![file_edge(source_id, file, source_line, snippet)]
        }
        ReferenceTarget::Local { idea, .. } => {
            if local_names.iter().any(|name| *name == idea) {
                let target_id = idea_id(file_uri, idea);
                vec![ref_edge(source_id, Some(target_id), idea, true, source_line, meta_snippet)]
            } else if let Some(import) = namespace_import(imports, idea) {
                if let Some(path) = import.path() {
                    vec![file_edge(source_id, &unquote_if_needed(path), source_line, snippet)]
                } else {
                    Vec::new()
                }
            } else if let Some((path, imported)) = from_import_binding(imports, idea) {
                let target_id = idea_id(
                    &imported_idea_target_file(
                        &path,
                        file_uri,
                        import_roots,
                        keep_authored_targets,
                    ),
                    &imported,
                );
                // Label is the written binding (`ontology-simulation`), not the imported name
                // (`simulation`). A suffix label would underline only part of the alias token.
                vec![ref_edge(source_id, Some(target_id), idea, true, source_line, meta_snippet)]
            } else {
                vec![ref_edge(source_id, None, idea, false, source_line, meta_snippet)]
            }
        }
        ReferenceTarget::Qualified { path, qualifier, ideaset, idea, .. } => {
            // `[idea.attribute]` targets that attribute. Do not retarget a same-named idea.
            // rq:["../../../../reqlan rq/language/syntax.rq".attribute_namespacing]
            if path.is_none() && ideaset.is_none() {
                if let Some(qualifier) = qualifier {
                    if let Some(edge) = attribute_reference_edge(
                        source_id,
                        ideas,
                        qualifier,
                        idea,
                        source_line,
                        meta_snippet.clone(),
                    ) {
                        return vec![edge];
                    }
                }
            }
            // Namespace leaf is the last segment (`idea`), not the ideaset/alias head.
            if let Some(path) = path {
                let file = imported_idea_target_file(
                    &unquote_path(path),
                    file_uri,
                    import_roots,
                    keep_authored_targets,
                );
                let target_id = idea_id(&file, idea);
                vec![ref_edge(source_id, Some(target_id), idea, true, source_line, meta_snippet)]
            } else if let Some(qualifier) = qualifier {
                if let Some(import) = namespace_import(imports, qualifier) {
                    if let Some(path) = import.path() {
                        let target_id = idea_id(
                            &imported_idea_target_file(
                                &unquote_path(path),
                                file_uri,
                                import_roots,
                                keep_authored_targets,
                            ),
                            idea,
                        );
                        vec![ref_edge(
                            source_id,
                            Some(target_id),
                            idea,
                            true,
                            source_line,
                            meta_snippet,
                        )]
                    } else {
                        Vec::new()
                    }
                } else if local_names.iter().any(|name| *name == idea.as_str()) {
                    let target_id = idea_id(file_uri, idea);
                    vec![ref_edge(
                        source_id,
                        Some(target_id),
                        idea,
                        true,
                        source_line,
                        meta_snippet,
                    )]
                } else if let Some((path, imported)) = from_import_binding(imports, idea) {
                    let target_id = idea_id(
                        &imported_idea_target_file(
                            &path,
                            file_uri,
                            import_roots,
                            keep_authored_targets,
                        ),
                        &imported,
                    );
                    vec![ref_edge(
                        source_id,
                        Some(target_id),
                        idea,
                        true,
                        source_line,
                        meta_snippet,
                    )]
                } else {
                    vec![ref_edge(source_id, None, idea, false, source_line, meta_snippet)]
                }
            } else {
                vec![ref_edge(source_id, None, idea, false, source_line, meta_snippet)]
            }
        }
    }
}

/// `Some` when `qualifier` is a block idea or one-liner.
/// An ideaset qualifier returns `None` so `[ideaset.member]` keeps member resolution.
/// rq:["../../../../reqlan rq/language/syntax.rq".attribute_namespacing]
fn attribute_reference_edge(
    source_id: &str,
    ideas: &[IdeaRecord],
    qualifier: &str,
    attribute: &str,
    source_line: u32,
    snippet: Option<String>,
) -> Option<EdgeRecord> {
    let owner = ideas.iter().find(|idea| idea.name == qualifier)?;
    if owner.kind == IdeaKind::Ideaset {
        return None;
    }
    let resolved = parse_attributes(&owner.attributes_json).contains_key(attribute);
    Some(ref_edge(
        source_id,
        if resolved { Some(owner.id.clone()) } else { None },
        attribute,
        resolved,
        source_line,
        snippet,
    ))
}

fn ref_edge(
    source_id: &str,
    target_id: Option<String>,
    label: &str,
    resolved: bool,
    source_line: u32,
    snippet: Option<String>,
) -> EdgeRecord {
    let target_key = target_id.clone().unwrap_or_else(|| format!("unresolved:{label}"));
    EdgeRecord {
        id: edge_id(source_id, EdgeKind::References.as_str(), &target_key),
        source_id: source_id.to_string(),
        target_id,
        target_file: None,
        kind: EdgeKind::References,
        label: Some(label.to_string()),
        source_line: Some(source_line),
        snippet,
        is_resolved: Some(resolved),
        source_offset_start: None,
        source_offset_end: None,
    }
}

/// How a bare name in this file binds. Same rules as the edge linker.
pub enum LocalNameBinding {
    Namespace { path: String },
    Imported { path: String, idea: String },
}

pub fn local_name_binding(imports: &[Import], name: &str) -> Option<LocalNameBinding> {
    if let Some(import) = namespace_import(imports, name) {
        let path = import.path()?;
        return Some(LocalNameBinding::Namespace { path: unquote_path(path) });
    }
    from_import_binding(imports, name).map(|(path, idea)| LocalNameBinding::Imported { path, idea })
}

fn namespace_import<'a>(imports: &'a [Import], alias: &str) -> Option<&'a Import> {
    imports.iter().find(|import| import.namespace_alias() == Some(alias))
}

fn from_import_binding(imports: &[Import], name: &str) -> Option<(String, String)> {
    for import in imports {
        if let Import::From(from) = import {
            for spec in &from.specifiers {
                let binding = spec.alias.as_deref().unwrap_or(spec.idea.as_str());
                if binding == name {
                    return Some((unquote_if_needed(&from.path), spec.idea.clone()));
                }
            }
        }
        if let Import::Qualified(qualified) = import {
            let binding = qualified.alias.as_deref().unwrap_or(qualified.idea.as_str());
            if binding == name {
                return Some((unquote_if_needed(&qualified.path), qualified.idea.clone()));
            }
        }
    }
    None
}
