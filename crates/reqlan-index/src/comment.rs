//! Extract `rq:[idea]` / `rq:["path".idea]` comment references from non-`.rq` files.
//! rq:["../../../reqlan rq/indexer/indexer.rq".index_code_files]
//! rq:["../../../reqlan rq/language/syntax.rq".comment_reference]
//! rq:["../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq".references_in_functional_code_comments]

use crate::extract::hash_text;
use crate::ids::edge_id;
use crate::types::{EdgeKind, EdgeRecord, IdeaKind, IdeaSummary};
use std::collections::HashMap;
use std::path::Path;

const MAX_CODE_FILE_BYTES: u64 = 1_048_576;

const CODE_FILE_EXTENSIONS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "cts", "mts", "py", "pyi", "rs", "go", "java", "kt",
    "kts", "c", "h", "cpp", "cc", "cxx", "hpp", "cs", "rb", "php", "swift", "scala", "vue",
    "svelte", "md", "mdx", "json", "toml", "yml", "yaml", "sh", "bash", "zsh", "css", "scss",
    "less", "html", "xml", "graphql", "gql", "proto", "sql", "lua", "zig", "nim", "ex", "exs",
    "erl", "hs", "ml", "r", "jl", "dart", "pl", "pm",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommentReference {
    pub path: Option<String>,
    pub idea: String,
    pub line: u32,
    pub snippet: String,
}

pub fn is_comment_index_path(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(|ext| ext.to_str()) else {
        return false;
    };
    CODE_FILE_EXTENSIONS.iter().any(|allowed| ext.eq_ignore_ascii_case(allowed))
}

pub fn looks_like_comment_reference_source(source: &str) -> bool {
    source.contains("rq:")
}

pub fn too_large_for_comment_index(path: &Path) -> bool {
    std::fs::metadata(path).ok().map(|meta| meta.len() > MAX_CODE_FILE_BYTES).unwrap_or(false)
}

pub fn parse_comment_reference_target(target: &str) -> Option<(Option<String>, String)> {
    let trimmed = target.trim();
    if let Some((path, idea)) = parse_qualified_target(trimmed) {
        return Some((Some(path), idea));
    }
    if is_idea_name(trimmed) {
        return Some((None, trimmed.to_string()));
    }
    None
}

pub fn find_comment_references_in_text(text: &str) -> Vec<CommentReference> {
    let mut references = Vec::new();
    for (start, end) in find_comment_spans(text) {
        let comment = &text[start..end];
        let mut search = comment;
        let mut search_offset = 0usize;
        while let Some(rel) = search.find("rq:") {
            let after_token = &search[rel + 3..];
            let ws = after_token.len() - after_token.trim_start().len();
            let after_ws = &after_token[ws..];
            if !after_ws.starts_with('[') {
                search = &search[rel + 3..];
                search_offset += rel + 3;
                continue;
            }
            let after_bracket = &after_ws[1..];
            let Some(close) = after_bracket.find(']') else {
                break;
            };
            let inner = &after_bracket[..close];
            if let Some((path, idea)) = parse_comment_reference_target(inner) {
                let abs_start = start + search_offset + rel;
                let line = line_of_offset(text, abs_start);
                let snippet = snippet_for_line(text, abs_start);
                references.push(CommentReference { path, idea, line, snippet });
            }
            let consumed = rel + 3 + ws + 1 + close + 1;
            search = &search[consumed..];
            search_offset += consumed;
        }
    }
    references
}

pub fn comment_link_edges(
    code_file_uri: &str,
    source: &str,
    catalog: &[IdeaSummary],
) -> Vec<EdgeRecord> {
    let (by_file_name, by_name) = comment_catalog_maps(catalog);
    let mut edges = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for reference in find_comment_references_in_text(source) {
        for idea in comment_targets(&reference, code_file_uri, &by_file_name, &by_name) {
            let key = idea.id.clone();
            if !seen.insert(key.clone()) {
                continue;
            }
            edges.push(EdgeRecord {
                id: edge_id(&idea.id, EdgeKind::CommentLink.as_str(), code_file_uri),
                source_id: idea.id.clone(),
                target_id: None,
                target_file: Some(code_file_uri.to_string()),
                kind: EdgeKind::CommentLink,
                label: Some(idea.name.clone()),
                source_line: Some(reference.line),
                snippet: Some(reference.snippet.clone()),
                is_resolved: Some(true),
            });
        }
    }
    edges
}

/// Comment `rq:[…]` sites in `source` that do not resolve against the idea catalog.
pub fn unresolved_comment_references(
    code_file_uri: &str,
    source: &str,
    catalog: &[IdeaSummary],
) -> Vec<CommentReference> {
    let (by_file_name, by_name) = comment_catalog_maps(catalog);
    find_comment_references_in_text(source)
        .into_iter()
        .filter(|reference| {
            comment_targets(reference, code_file_uri, &by_file_name, &by_name).is_empty()
        })
        .collect()
}

fn comment_catalog_maps(
    catalog: &[IdeaSummary],
) -> (HashMap<(String, String), &IdeaSummary>, HashMap<String, Vec<&IdeaSummary>>) {
    let by_file_name: HashMap<(String, String), &IdeaSummary> = catalog
        .iter()
        .filter(|idea| idea.kind != IdeaKind::Ideaset)
        .map(|idea| ((idea.file_uri.clone(), idea.name.clone()), idea))
        .collect();
    let mut by_name: HashMap<String, Vec<&IdeaSummary>> = HashMap::new();
    for idea in catalog.iter().filter(|idea| idea.kind != IdeaKind::Ideaset) {
        by_name.entry(idea.name.clone()).or_default().push(idea);
    }
    (by_file_name, by_name)
}

fn comment_targets<'a>(
    reference: &CommentReference,
    code_file_uri: &str,
    by_file_name: &HashMap<(String, String), &'a IdeaSummary>,
    by_name: &HashMap<String, Vec<&'a IdeaSummary>>,
) -> Vec<&'a IdeaSummary> {
    if let Some(path) = &reference.path {
        let resolved = resolve_comment_path(code_file_uri, path);
        return by_file_name
            .get(&(resolved, reference.idea.clone()))
            .copied()
            .into_iter()
            .collect();
    }
    by_name.get(&reference.idea).cloned().unwrap_or_default()
}

impl CommentReference {
    pub fn display_label(&self) -> String {
        match &self.path {
            Some(path) => format!("{path}.{}", self.idea),
            None => self.idea.clone(),
        }
    }
}

pub fn code_file_content_hash(source: &str) -> String {
    hash_text(source)
}

fn parse_qualified_target(target: &str) -> Option<(String, String)> {
    let quote = target.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let mut escaped = false;
    let mut path = String::new();
    let mut end = None;
    for (index, ch) in target.char_indices().skip(1) {
        if escaped {
            path.push(ch);
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        if ch == quote {
            end = Some(index);
            break;
        }
        path.push(ch);
    }
    let end = end?;
    let rest = target[end + 1..].trim_start();
    if !rest.starts_with('.') {
        return None;
    }
    let names: Vec<&str> =
        rest[1..].split('.').map(str::trim).filter(|part| !part.is_empty()).collect();
    let idea = names.last()?.to_string();
    if !is_idea_name(&idea) {
        return None;
    }
    Some((path, idea))
}

fn is_idea_name(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    (first == '_' || first.is_ascii_alphabetic())
        && chars.all(|ch| ch == '-' || ch == '_' || ch.is_ascii_alphanumeric())
}

fn resolve_comment_path(from_file: &str, path: &str) -> String {
    let path = path.replace('\\', "/");
    if path.contains("://") || Path::new(&path).is_absolute() || is_windows_absolute(&path) {
        return path;
    }
    let from = from_file.replace('\\', "/");
    let dir = from.rsplit_once('/').map(|(prefix, _)| prefix).unwrap_or("");
    normalize_posix(&format!("{dir}/{path}"))
}

fn is_windows_absolute(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
}

fn normalize_posix(path: &str) -> String {
    let mut out: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                out.pop();
            }
            _ => out.push(part),
        }
    }
    out.join("/")
}

fn line_of_offset(text: &str, offset: usize) -> u32 {
    text[..offset.min(text.len())].bytes().filter(|byte| *byte == b'\n').count() as u32
}

fn snippet_for_line(text: &str, offset: usize) -> String {
    let start = text[..offset.min(text.len())].rfind('\n').map(|index| index + 1).unwrap_or(0);
    let rest = &text[start..];
    let end = rest.find('\n').unwrap_or(rest.len());
    let line = rest[..end].trim();
    if line.len() > 160 {
        format!("{}…", &line[..160])
    } else {
        line.to_string()
    }
}

fn find_comment_spans(text: &str) -> Vec<(usize, usize)> {
    let bytes = text.as_bytes();
    let mut spans = Vec::new();
    let mut index = 0;
    let mut in_double = false;
    let mut in_single = false;
    let mut in_line = false;
    let mut line_start = 0;
    let mut block: Option<BlockKind> = None;

    while index < bytes.len() {
        let char = bytes[index];
        let next = bytes.get(index + 1).copied();
        let next2 = bytes.get(index + 2).copied();

        if in_line {
            if char == b'\n' {
                spans.push((line_start, index));
                in_line = false;
            }
            index += 1;
            continue;
        }

        if let Some(kind) = block {
            let closed = match kind {
                BlockKind::Slash => char == b'*' && next == Some(b'/'),
                BlockKind::TripleSingle => {
                    char == b'\'' && next == Some(b'\'') && next2 == Some(b'\'')
                }
                BlockKind::TripleDouble => {
                    char == b'"' && next == Some(b'"') && next2 == Some(b'"')
                }
            };
            if closed {
                let end = match kind {
                    BlockKind::Slash => index + 2,
                    BlockKind::TripleSingle | BlockKind::TripleDouble => index + 3,
                };
                spans.push((line_start, end));
                block = None;
                index = end;
                continue;
            }
            index += 1;
            continue;
        }

        if in_double || in_single {
            if char == b'\\' {
                index += 2;
                continue;
            }
            if in_double && char == b'"' {
                in_double = false;
            } else if in_single && char == b'\'' {
                in_single = false;
            }
            index += 1;
            continue;
        }

        if char == b'"' {
            if next == Some(b'"') && next2 == Some(b'"') {
                block = Some(BlockKind::TripleDouble);
                line_start = index;
                index += 3;
                continue;
            }
            in_double = true;
            index += 1;
            continue;
        }
        if char == b'\'' {
            if next == Some(b'\'') && next2 == Some(b'\'') {
                block = Some(BlockKind::TripleSingle);
                line_start = index;
                index += 3;
                continue;
            }
            in_single = true;
            index += 1;
            continue;
        }
        if char == b'/' && next == Some(b'*') {
            if bytes.get(index + 2) == Some(&b'*') && bytes.get(index + 3) == Some(&b'/') {
                index += 4;
                continue;
            }
            block = Some(BlockKind::Slash);
            line_start = index;
            index += 2;
            continue;
        }
        if char == b'/' && next == Some(b'/') {
            if !preceded_by_colon_or_slash(bytes, index) {
                in_line = true;
                line_start = index;
                index += 2;
                continue;
            }
            index += 2;
            continue;
        }
        if char == b'#' {
            in_line = true;
            line_start = index;
            index += 1;
            continue;
        }
        index += 1;
    }

    if in_line {
        spans.push((line_start, bytes.len()));
    }
    spans
}

fn preceded_by_colon_or_slash(bytes: &[u8], index: usize) -> bool {
    let mut previous = index;
    while previous > 0 {
        previous -= 1;
        let ch = bytes[previous];
        if ch == b' ' || ch == b'\t' {
            continue;
        }
        return ch == b':' || ch == b'/';
    }
    false
}

#[derive(Clone, Copy)]
enum BlockKind {
    Slash,
    TripleSingle,
    TripleDouble,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_line_and_hash_comment_refs() {
        let refs = find_comment_references_in_text(
            "// see rq:[\"../main.rq\".myidea] for details\n# rq:[local_idea]\n",
        );
        assert_eq!(refs.len(), 2);
        assert_eq!(refs[0].path.as_deref(), Some("../main.rq"));
        assert_eq!(refs[0].idea, "myidea");
        assert_eq!(refs[1].path, None);
        assert_eq!(refs[1].idea, "local_idea");
    }

    #[test]
    fn ignores_rq_inside_strings() {
        let refs = find_comment_references_in_text("const x = \"rq:[missing]\";\n");
        assert!(refs.is_empty());
    }

    #[test]
    fn parses_single_quoted_qualified_target() {
        assert_eq!(
            parse_comment_reference_target("'./main.rq'.myidea"),
            Some((Some("./main.rq".into()), "myidea".into()))
        );
    }

    #[test]
    fn lists_unresolved_comment_refs_and_skips_resolved() {
        let catalog = vec![IdeaSummary {
            id: "demo.rq#alpha".into(),
            name: "alpha".into(),
            kind: IdeaKind::Block,
            file_uri: "demo.rq".into(),
            line_start: 0,
            summary: String::new(),
            status: None,
            status_key: String::new(),
            tags: Vec::new(),
            tags_keys: Vec::new(),
            git_created_at: None,
            git_modified_at: None,
            git_change_count: None,
        }];
        let source = "// rq:[alpha]\n// rq:[missing_idea]\n";
        let unresolved = unresolved_comment_references("src/app.ts", source, &catalog);
        assert_eq!(unresolved.len(), 1);
        assert_eq!(unresolved[0].idea, "missing_idea");
    }
}
