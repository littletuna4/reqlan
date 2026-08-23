//! Extract ideas, attributes, and edges from a parsed document.
//! rq:["../../../reqlan rq/ontology.rq".idea]
//! rq:["../../../reqlan rq/ontology.rq".attribute]
//! rq:["../../../reqlan rq/ontology.rq".reference]
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
//! rq:["../../../reqlan rq/indexer/indexer.rq".wildcard_reference_edges]
//! rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
//! rq:["../../../reqlan rq/language/syntax.rq".same_file_reference]
//! rq:["../../../reqlan rq/language/syntax.rq".reference_resolution_order]
//! rq:["../../../reqlan rq/language/syntax.rq".block_idea]
//! rq:["../../../reqlan rq/language/syntax.rq".attribute_forms]
//! rq:["../../../reqlan rq/language/syntax.rq".simple_idea]
//! rq:["../../../reqlan rq/language/syntax.rq".references_to_subidea]
//! rq:["../../../reqlan rq/language/syntax.rq".inline_code]
//! rq:["../../../reqlan rq/language/syntax.rq".code_snippets]
//! rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]

use crate::ids::{edge_id, idea_id};
use crate::types::{
    AttributeValue, EdgeKind, EdgeRecord, IdeaAttributeMap, IdeaKind, IdeaRecord, IndexedDocument,
};
use reqlan_parse::{
    parse_document, resolve_rq_path, unquote_path, Attribute, AttributeValue as AstAttrValue,
    BodyElement, Import, ImportRootMapping, ListItem, ParseResult, ReferenceTarget, RichPart,
    TopLevelElement,
};
use sha2::{Digest, Sha256};

/// Bump when extract rules change so mtime skip does not keep stale edges.
/// rq:["../../../reqlan rq/language/syntax.rq".inline_code]
/// rq:["../../../reqlan rq/indexer/indexer.rq".index]
pub const EXTRACT_VERSION: i64 = 1;

#[derive(Debug, Clone)]
pub struct WildcardIdeaCandidate {
    pub file_uri: String,
    pub file_path: String,
    pub idea_name: String,
}

#[derive(Debug, Clone)]
pub struct ExtractOptions {
    pub idea_candidates: Vec<WildcardIdeaCandidate>,
    pub import_roots: Vec<ImportRootMapping>,
}

impl Default for ExtractOptions {
    fn default() -> Self {
        Self { idea_candidates: Vec::new(), import_roots: reqlan_parse::default_import_roots() }
    }
}

pub fn extract_indexed_document(
    file_uri: &str,
    source: &str,
    options: &ExtractOptions,
) -> IndexedDocument {
    let parsed = parse_document(source);
    extract_from_parse(file_uri, source, &parsed, options)
}

pub fn extract_from_parse(
    file_uri: &str,
    source: &str,
    parsed: &ParseResult,
    options: &ExtractOptions,
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
                    &options.idea_candidates,
                    &options.import_roots,
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
                    &options.idea_candidates,
                    &options.import_roots,
                    &mut edges,
                );
            }
            TopLevelElement::IdeaSet(_) | TopLevelElement::Anonymous(_) => {}
        }
    }

    collect_file_reference_edges(source, file_uri, &ideas, &mut edges);

    IndexedDocument { file_uri: file_uri.to_string(), content_hash, ideas, edges }
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

fn collect_attributes(source: &str, elements: &[BodyElement]) -> IdeaAttributeMap {
    let mut attributes = IdeaAttributeMap::new();
    for element in elements {
        if let BodyElement::Attribute(attribute) = element {
            attributes.insert(attribute.name.clone(), attribute_value(source, attribute));
        }
    }
    attributes
}

fn attribute_value(source: &str, attribute: &Attribute) -> AttributeValue {
    if attribute.negated {
        return AttributeValue::Flag(false);
    }
    match &attribute.value {
        None => AttributeValue::Flag(true),
        Some(AstAttrValue::Scalar(scalar)) => {
            AttributeValue::Text(normalize_attribute_text(&scalar.text))
        }
        Some(AstAttrValue::List(list)) => {
            let items = list
                .items
                .iter()
                .map(|item| normalize_attribute_text(&item.source_text(source)))
                .filter(|item| !item.is_empty())
                .collect();
            AttributeValue::List(items)
        }
        Some(AstAttrValue::Block(block)) => AttributeValue::Text(block.inner_text.clone()),
    }
}

fn summarize_block(source: &str, elements: &[BodyElement]) -> String {
    let mut lines = Vec::new();
    for element in elements {
        if let BodyElement::BodyLine(line) = element {
            let text = summarize_parts(source, &line.parts);
            if !text.is_empty() {
                lines.push(text);
            }
        }
    }
    lines.join("\n")
}

fn summarize_parts(source: &str, parts: &[RichPart]) -> String {
    let mut pieces = Vec::new();
    for part in parts {
        match part {
            RichPart::Text { text, .. } => pieces.push(text.clone()),
            RichPart::InlineCode { text, .. } => pieces.push(text.clone()),
            RichPart::MarkdownLink { raw, .. } => {
                pieces.push(parse_markdown_label(raw).unwrap_or_else(|| raw.clone()));
            }
            RichPart::BracketRef { span, .. } | RichPart::WikiLink { span, .. } => {
                pieces.push(normalize_attribute_text(span_text(source, *span)));
            }
        }
    }
    let joined = pieces.join(" ");
    collapse_punct(&joined)
}

fn span_text(source: &str, span: reqlan_parse::Span) -> &str {
    source.get(span.start..span.end).unwrap_or("")
}

fn normalize_attribute_text(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn collapse_punct(text: &str) -> String {
    let mut out = text.split_whitespace().collect::<Vec<_>>().join(" ");
    for punct in [",", ".", "!", "?", ";", ":"] {
        out = out.replace(&format!(" {punct}"), punct);
    }
    out
}

fn parse_markdown_label(raw: &str) -> Option<String> {
    let inner = raw.strip_prefix('[')?;
    let end = inner.find("](")?;
    Some(inner[..end].to_string())
}

fn walk_idea_parts(elements: &[BodyElement]) -> Vec<RichPart> {
    let mut parts = Vec::new();
    for element in elements {
        match element {
            BodyElement::BodyLine(line) => parts.extend(line.parts.clone()),
            BodyElement::Attribute(attribute) => {
                if let Some(value) = &attribute.value {
                    collect_value_parts(value, &mut parts);
                }
            }
            BodyElement::NamedList(list) => {
                for item in &list.items {
                    collect_item_parts(item, &mut parts);
                }
            }
            BodyElement::NestedList(list) => {
                for item in &list.items {
                    collect_item_parts(item, &mut parts);
                }
            }
            BodyElement::CodeSnippet(_) => {}
        }
    }
    parts
}

fn collect_value_parts(value: &AstAttrValue, parts: &mut Vec<RichPart>) {
    match value {
        AstAttrValue::Scalar(scalar) => parts.extend(scalar.parts.clone()),
        AstAttrValue::List(list) => {
            for item in &list.items {
                collect_item_parts(item, parts);
            }
        }
        AstAttrValue::Block(block) => parts.extend(walk_idea_parts(&block.elements)),
    }
}

fn collect_item_parts(item: &ListItem, parts: &mut Vec<RichPart>) {
    match item {
        ListItem::OneLiner(body) => parts.extend(body.clone()),
        ListItem::Anonymous(block) => parts.extend(walk_idea_parts(&block.elements)),
        ListItem::NamedBlock(block) => parts.extend(walk_idea_parts(&block.elements)),
        ListItem::Nested(list) => {
            for nested in &list.items {
                collect_item_parts(nested, parts);
            }
        }
    }
}

fn collect_parts_edges(
    file_uri: &str,
    idea_name: &str,
    source: &str,
    parts: &[RichPart],
    imports: &[Import],
    ideas: &[IdeaRecord],
    candidates: &[WildcardIdeaCandidate],
    import_roots: &[ImportRootMapping],
    edges: &mut Vec<EdgeRecord>,
) {
    let source_id = idea_id(file_uri, idea_name);
    // Include ideasets so a bare `[ideaset_name]` resolves even when declared later in the file.
    let local_names: Vec<&str> = ideas.iter().map(|idea| idea.name.as_str()).collect();
    for part in parts {
        match part {
            RichPart::MarkdownLink { raw, span } => {
                if let Some(target) = parse_markdown_target(raw) {
                    edges.push(file_edge(&source_id, &target, span.line_start + 1, raw));
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
                    candidates,
                    import_roots,
                    span.line_start + 1,
                    &snippet,
                ) {
                    edges.push(edge);
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
    }
}

fn reference_to_edges(
    source_id: &str,
    file_uri: &str,
    target: &ReferenceTarget,
    imports: &[Import],
    local_names: &[&str],
    candidates: &[WildcardIdeaCandidate],
    import_roots: &[ImportRootMapping],
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
            vec![file_edge(source_id, file, source_line, snippet)]
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
                let target_id = idea_id(&resolve_rq_path(&path, file_uri, import_roots), &imported);
                vec![ref_edge(
                    source_id,
                    Some(target_id),
                    &imported,
                    true,
                    source_line,
                    meta_snippet,
                )]
            } else {
                vec![ref_edge(source_id, None, idea, false, source_line, meta_snippet)]
            }
        }
        ReferenceTarget::Qualified { path, qualifier, ideaset: _, idea, .. } => {
            // Namespace leaf is the last segment (`idea`), not the ideaset/alias head.
            if let Some(path) = path {
                let file = resolve_rq_path(&unquote_path(path), file_uri, import_roots);
                let target_id = idea_id(&file, idea);
                vec![ref_edge(source_id, Some(target_id), idea, true, source_line, meta_snippet)]
            } else if let Some(qualifier) = qualifier {
                if let Some(import) = namespace_import(imports, qualifier) {
                    if let Some(path) = import.path() {
                        let target_id = idea_id(
                            &resolve_rq_path(&unquote_path(path), file_uri, import_roots),
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
                    let target_id =
                        idea_id(&resolve_rq_path(&path, file_uri, import_roots), &imported);
                    vec![ref_edge(
                        source_id,
                        Some(target_id),
                        &imported,
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
    }
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

fn unquote_if_needed(value: &str) -> String {
    unquote_path(value)
}

fn wildcard_edges(
    source_id: &str,
    path_pattern_quoted: &str,
    idea_pattern: &str,
    from_file: &str,
    candidates: &[WildcardIdeaCandidate],
    import_roots: &[ImportRootMapping],
    source_line: u32,
    snippet: Option<String>,
) -> Vec<EdgeRecord> {
    let path = resolve_rq_path(&unquote_if_needed(path_pattern_quoted), from_file, import_roots);
    let label = format!("{path}.{idea_pattern}");
    let matches = match_wildcard(&path, idea_pattern, from_file, candidates);
    if matches.is_empty() {
        return vec![EdgeRecord {
            id: edge_id(
                source_id,
                EdgeKind::WildcardReference.as_str(),
                &format!("unresolved:{label}"),
            ),
            source_id: source_id.to_string(),
            target_id: None,
            target_file: None,
            kind: EdgeKind::WildcardReference,
            label: Some(label),
            source_line: Some(source_line),
            snippet,
            is_resolved: Some(false),
        }];
    }
    matches
        .into_iter()
        .map(|matched| {
            let target_id = idea_id(&matched.file_uri, &matched.idea_name);
            EdgeRecord {
                id: edge_id(source_id, EdgeKind::WildcardReference.as_str(), &target_id),
                source_id: source_id.to_string(),
                target_id: Some(target_id),
                target_file: None,
                kind: EdgeKind::WildcardReference,
                label: Some(label.clone()),
                source_line: Some(source_line),
                snippet: snippet.clone(),
                is_resolved: Some(true),
            }
        })
        .collect()
}

/// Split a stored wildcard edge label `{resolved_path}.{idea_pattern}`.
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_sparse]
pub fn split_wildcard_label(label: &str) -> Option<(&str, &str)> {
    let (path, idea) = label.rsplit_once('.')?;
    if path.is_empty() || idea.is_empty() {
        return None;
    }
    Some((path, idea))
}

/// Count catalog ideas that match a workspace-relative path glob and idea glob.
pub fn count_wildcard_matches(
    path_pattern: &str,
    idea_pattern: &str,
    candidates: &[WildcardIdeaCandidate],
) -> usize {
    match_wildcard(path_pattern, idea_pattern, "", candidates).len()
}

fn match_wildcard(
    path_pattern: &str,
    idea_pattern: &str,
    from_file: &str,
    candidates: &[WildcardIdeaCandidate],
) -> Vec<WildcardIdeaCandidate> {
    let idea_re = glob_to_regex(idea_pattern, false);
    let dir = parent_posix(from_file);
    let absolute = if path_pattern.starts_with('/') || looks_absolute(path_pattern) {
        normalize_posix(path_pattern)
    } else {
        join_posix(&dir, path_pattern)
    };
    let path_re = glob_to_regex(&absolute, true);
    let mut matches: Vec<_> = candidates
        .iter()
        .filter(|candidate| {
            path_re.is_match(&normalize_posix(&candidate.file_path))
                && idea_re.is_match(&candidate.idea_name)
        })
        .cloned()
        .collect();
    matches.sort_by(|left, right| {
        left.file_uri.cmp(&right.file_uri).then(left.idea_name.cmp(&right.idea_name))
    });
    matches
}

fn looks_absolute(path: &str) -> bool {
    path.len() >= 3 && path.as_bytes()[0].is_ascii_alphabetic() && path.as_bytes()[1] == b':'
}

fn parent_posix(path: &str) -> String {
    let normalized = normalize_posix(path);
    match normalized.rsplit_once('/') {
        Some((parent, _)) => parent.to_string(),
        None => String::new(),
    }
}

fn join_posix(base: &str, relative: &str) -> String {
    let left = normalize_posix(base).trim_end_matches('/').to_string();
    let right = normalize_posix(relative).trim_start_matches('/').to_string();
    if left.is_empty() {
        return normalize_glob_path(&right);
    }
    normalize_glob_path(&format!("{left}/{right}"))
}

/// Match a POSIX-style path glob against a workspace-relative file URI.
/// A glob with no `/` (for example `*.rq`) also matches nested paths.
pub fn path_glob_matches(glob: &str, path: &str) -> bool {
    let glob = glob.replace('\\', "/");
    let glob = glob.trim();
    if glob.is_empty() {
        return true;
    }
    let path = path.replace('\\', "/");
    let normalized = if glob.contains('/') || glob.starts_with("**") {
        glob.to_string()
    } else {
        format!("**/{glob}")
    };
    glob_to_regex(&normalized, true).is_match(&path)
}

fn normalize_posix(path: &str) -> String {
    path.replace('\\', "/")
}

fn normalize_glob_path(path: &str) -> String {
    let absolute = path.starts_with('/');
    let mut out: Vec<String> = Vec::new();
    for part in path.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            if let Some(last) = out.last() {
                if last != ".." && !last.contains('*') && !last.contains('?') {
                    out.pop();
                    continue;
                }
            }
            if !absolute {
                out.push(part.to_string());
            }
            continue;
        }
        out.push(part.to_string());
    }
    let joined = out.join("/");
    if absolute {
        format!("/{joined}")
    } else {
        joined
    }
}

struct GlobRegex {
    inner: String,
}

impl GlobRegex {
    fn is_match(&self, hay: &str) -> bool {
        simple_glob_match(&self.inner, hay)
    }
}

fn glob_to_regex(glob: &str, path_mode: bool) -> GlobRegex {
    let mut pattern = String::from("^");
    let bytes = glob.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'*' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            if i + 2 < bytes.len() && bytes[i + 2] == b'/' {
                pattern.push_str("(?:.*/)?");
                i += 3;
                continue;
            }
            pattern.push_str(".*");
            i += 2;
            continue;
        }
        if bytes[i] == b'*' {
            pattern.push_str(if path_mode { "[^/]*" } else { ".*" });
            i += 1;
            continue;
        }
        if bytes[i] == b'?' {
            pattern.push_str(if path_mode { "[^/]" } else { "." });
            i += 1;
            continue;
        }
        let ch = bytes[i] as char;
        if "\\^$+{}[]()|/.".contains(ch) {
            pattern.push('\\');
        }
        pattern.push(ch);
        i += 1;
    }
    pattern.push('$');
    GlobRegex { inner: pattern }
}

fn simple_glob_match(regex_like: &str, hay: &str) -> bool {
    glob_match_from(regex_like.as_bytes(), 0, hay.as_bytes(), 0)
}

fn glob_match_from(pat: &[u8], pi: usize, hay: &[u8], hi: usize) -> bool {
    if pi == pat.len() {
        return hi == hay.len();
    }
    if pat[pi] == b'^' {
        return glob_match_from(pat, pi + 1, hay, hi);
    }
    if pi + 1 == pat.len() && pat[pi] == b'$' {
        return hi == hay.len();
    }
    if pi + 1 < pat.len() && pat[pi] == b'.' && pat[pi + 1] == b'*' {
        for skip in 0..=hay.len().saturating_sub(hi) {
            if glob_match_from(pat, pi + 2, hay, hi + skip) {
                return true;
            }
        }
        return false;
    }
    if pi + 4 < pat.len() && pat[pi..].starts_with(b"(?:.*/)?") {
        if glob_match_from(pat, pi + 8, hay, hi) {
            return true;
        }
        for skip in 0..=hay.len().saturating_sub(hi) {
            if hi + skip < hay.len()
                && hay[hi + skip] == b'/'
                && glob_match_from(pat, pi + 8, hay, hi + skip + 1)
            {
                return true;
            }
        }
        return false;
    }
    if pi + 4 < pat.len() && pat[pi..].starts_with(b"[^/]*") {
        let mut end = hi;
        while end < hay.len() && hay[end] != b'/' {
            end += 1;
        }
        for skip in hi..=end {
            if glob_match_from(pat, pi + 5, hay, skip) {
                return true;
            }
        }
        return false;
    }
    if pi + 3 < pat.len() && pat[pi..].starts_with(b"[^/]") {
        if hi < hay.len() && hay[hi] != b'/' {
            return glob_match_from(pat, pi + 4, hay, hi + 1);
        }
        return false;
    }
    if pat[pi] == b'\\' && pi + 1 < pat.len() {
        if hi < hay.len() && hay[hi] == pat[pi + 1] {
            return glob_match_from(pat, pi + 2, hay, hi + 1);
        }
        return false;
    }
    if pat[pi] == b'.' {
        if hi < hay.len() {
            return glob_match_from(pat, pi + 1, hay, hi + 1);
        }
        return false;
    }
    if hi < hay.len() && hay[hi] == pat[pi] {
        return glob_match_from(pat, pi + 1, hay, hi + 1);
    }
    false
}

fn collect_file_reference_edges(
    source: &str,
    file_uri: &str,
    ideas: &[IdeaRecord],
    edges: &mut Vec<EdgeRecord>,
) {
    let source_id =
        ideas.first().map(|idea| idea.id.clone()).unwrap_or_else(|| format!("{file_uri}#__file__"));
    for (file, line) in find_embedded_file_references(source) {
        edges.push(EdgeRecord {
            id: edge_id(&source_id, EdgeKind::FileReference.as_str(), &file),
            source_id: source_id.clone(),
            target_id: None,
            target_file: Some(file.clone()),
            kind: EdgeKind::FileReference,
            label: Some(file),
            source_line: Some(line),
            snippet: None,
            is_resolved: Some(true),
        });
    }
}

fn find_embedded_file_references(source: &str) -> Vec<(String, u32)> {
    let mut files = Vec::new();
    let mut in_fence = false;
    for (line_index, line) in source.lines().enumerate() {
        if is_code_fence_line(line) {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        let opaque = inline_code_spans(line);
        let bytes = line.as_bytes();
        let mut index = 0;
        while index < bytes.len() {
            let quote = bytes[index];
            if quote != b'"' && quote != b'\'' {
                index += 1;
                continue;
            }
            let after = index + 1;
            let Some(rel) = bytes[after..].iter().position(|&b| b == quote) else {
                break;
            };
            let end = after + rel;
            let inner = &line[after..end];
            // Glob paths belong to wildcard_reference fan-out, not concrete file edges.
            if !range_overlaps(index, end + 1, &opaque)
                && !inner.contains('*')
                && !inner.contains('?')
                && (inner.contains('/')
                    || inner.contains('\\')
                    || inner.contains('.') && inner.contains('/')
                    || looks_file_ref(inner))
            {
                files.push((inner.to_string(), line_index as u32 + 1));
            }
            index = end + 1;
        }
    }
    files
}

fn is_code_fence_line(line: &str) -> bool {
    line.trim_start().starts_with("```")
}

fn inline_code_spans(line: &str) -> Vec<(usize, usize)> {
    let bytes = line.as_bytes();
    let mut spans = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'`' {
            index += 1;
            continue;
        }
        if index + 2 < bytes.len() && bytes[index + 1] == b'`' && bytes[index + 2] == b'`' {
            index += 3;
            continue;
        }
        let Some(rel) = bytes[index + 1..].iter().position(|&b| b == b'`') else {
            break;
        };
        let close = index + 1 + rel;
        if close > index + 1 {
            spans.push((index, close + 1));
        }
        index = close + 1;
    }
    spans
}

fn range_overlaps(start: usize, end: usize, spans: &[(usize, usize)]) -> bool {
    spans.iter().any(|&(left, right)| start < right && end > left)
}

fn looks_file_ref(value: &str) -> bool {
    value.contains('/') || value.contains('\\') || value.contains('.')
}

pub fn hash_text(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    let digest = hasher.finalize();
    digest.iter().take(8).map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::{extract_indexed_document, find_embedded_file_references, ExtractOptions};
    use crate::types::EdgeKind;

    #[test]
    fn embedded_scan_skips_backticked_file_ref_with_line_range() {
        // rq:["../../../reqlan rq/language/syntax.rq".inline_code]
        let source = concat!("host {\n", "    `[\"", "./plc/interlock.stL#41-58", "\"]`\n", "}\n");
        let found = find_embedded_file_references(source);
        assert!(found.iter().all(|(path, _)| !path.contains("interlock.st")), "{found:?}");
    }

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
        let found = find_embedded_file_references(source);
        let leaked: Vec<_> =
            found.iter().filter(|(path, _)| path.contains("interlock.st")).collect();
        assert!(leaked.is_empty(), "{leaked:?}");
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
}
