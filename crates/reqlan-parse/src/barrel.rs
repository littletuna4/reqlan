//! Barrel a large `.rq` page into a container that imports one file per top-level idea.
//! Ported from the former Langium-backed `barrel-page.ts`; the plan is pure text so
//! CLI `barrel`, the extension code action, and other headless tools share one engine.
//! rq:["../../../reqlan rq/extension/features-commands.rq".barrel_page]
//! rq:["../../../reqlan rq/extension/features-commands.rq".file_based_code_actions]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]

use crate::ast::{Import, Model, TopLevelElement};
use crate::parser::parse_document;
use std::collections::BTreeSet;

#[derive(Debug, Clone)]
pub struct BarrelChildPlan {
    pub idea_name: String,
    /// Relative file name written next to the source (e.g. `alpha.rq`).
    pub file_name: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct BarrelPagePlan {
    pub container_name: String,
    pub container_content: String,
    pub children: Vec<BarrelChildPlan>,
    /// Top-level ideaset declarations preserved verbatim in the container file.
    pub preserved_ideasets: Vec<String>,
}

/// Plan a barrel transform from source text (no filesystem writes).
/// `container_name` defaults to the sanitized source file basename when empty.
pub fn plan_barrel_page(
    source: &str,
    container_name: Option<&str>,
    source_file_name: &str,
) -> Result<BarrelPagePlan, String> {
    let parsed = parse_document(source);
    let model = &parsed.model;

    let mut idea_names: Vec<String> = Vec::new();
    let mut idea_declarations: Vec<String> = Vec::new();
    let mut ideaset_texts: Vec<String> = Vec::new();
    for element in &model.elements {
        match element {
            TopLevelElement::Idea(idea) => {
                idea_names.push(idea.name.clone());
                idea_declarations.push(span_text(source, idea.span.start, idea.span.end));
            }
            TopLevelElement::OneLiner(idea) => {
                idea_names.push(idea.name.clone());
                idea_declarations.push(span_text(source, idea.span.start, idea.span.end));
            }
            TopLevelElement::IdeaSet(set) => {
                let text = span_text(source, set.span.start, set.span.end);
                let trimmed = text.trim_end();
                if !trimmed.is_empty() {
                    ideaset_texts.push(trimmed.to_string());
                }
            }
            TopLevelElement::Anonymous(_) => {}
        }
    }

    if idea_names.is_empty() {
        return Err("Barrel page requires at least one top-level idea.".to_string());
    }

    let container_name = match container_name.map(str::trim).filter(|name| !name.is_empty()) {
        Some(name) => name.to_string(),
        None => file_basename_alias(source_file_name),
    };
    if container_name.is_empty() {
        return Err("Container idea name must not be empty.".to_string());
    }
    if idea_names.iter().any(|name| name == &container_name) {
        return Err(format!(
            "Container name \"{container_name}\" conflicts with an idea being barreled; choose a different --name."
        ));
    }

    let sibling_names: BTreeSet<String> = idea_names.iter().cloned().collect();
    let import_preamble = extract_import_preamble(source, model);

    let mut children = Vec::with_capacity(idea_names.len());
    for (name, declaration) in idea_names.iter().zip(idea_declarations.iter()) {
        let (rewritten, needed_siblings) =
            rewrite_sibling_refs(declaration.trim_end(), name, &sibling_names);
        let sibling_imports = needed_siblings
            .iter()
            .map(|sibling| format!("import \"./{sibling}.rq\" as {sibling}"))
            .collect::<Vec<_>>()
            .join("\n");
        let parts: Vec<&str> = [import_preamble.trim_end(), sibling_imports.as_str(), rewritten.as_str()]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect();
        children.push(BarrelChildPlan {
            idea_name: name.clone(),
            file_name: format!("{name}.rq"),
            content: format!("{}\n", parts.join("\n\n")),
        });
    }

    let import_lines = children
        .iter()
        .map(|child| format!("import \"./{}\" as {}", child.file_name, child.idea_name))
        .collect::<Vec<_>>()
        .join("\n");
    let member_refs = children
        .iter()
        .map(|child| format!("    [{}.{}]", child.idea_name, child.idea_name))
        .collect::<Vec<_>>()
        .join("\n");
    let preserved_block = if ideaset_texts.is_empty() {
        String::new()
    } else {
        format!("\n\n{}", ideaset_texts.join("\n\n"))
    };
    let container_content =
        format!("{import_lines}\n\n{container_name} {{\n{member_refs}\n}}{preserved_block}\n");

    Ok(BarrelPagePlan {
        container_name,
        container_content,
        children,
        preserved_ideasets: ideaset_texts,
    })
}

/// Full text of the leading import block: from the start of the first import's
/// line through the end of the last import. Empty when the page has no imports.
fn extract_import_preamble(source: &str, model: &Model) -> String {
    let Some(first) = model.imports.first() else {
        return String::new();
    };
    let last = model.imports.last().unwrap_or(first);
    let start = import_span(first).0;
    let end = import_span(last).1;
    let line_start = source[..start.min(source.len())].rfind('\n').map(|i| i + 1).unwrap_or(0);
    span_text(source, line_start, end)
}

fn import_span(import: &Import) -> (usize, usize) {
    let span = match import {
        Import::From(value) => value.span,
        Import::Namespace(value) => value.span,
        Import::Qualified(value) => value.span,
        Import::InvalidFrom(value) => value.span,
    };
    (span.start, span.end)
}

fn span_text(source: &str, start: usize, end: usize) -> String {
    let end = end.min(source.len());
    let start = start.min(end);
    source.get(start..end).unwrap_or("").to_string()
}

/// Sanitize a file name into a valid idea identifier (matches `fileBasenameAlias`).
pub fn file_basename_alias(file_name: &str) -> String {
    let base = file_name.rsplit('/').next().unwrap_or(file_name);
    let without_ext = if base.to_ascii_lowercase().ends_with(".rq") {
        &base[..base.len() - 3]
    } else {
        base
    };

    let mut cleaned = String::new();
    let mut in_gap = false;
    for ch in without_ext.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' {
            cleaned.push(ch);
            in_gap = false;
        } else if !in_gap {
            cleaned.push('_');
            in_gap = true;
        }
    }

    if cleaned.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        cleaned.insert(0, '_');
    }
    if cleaned.is_empty() {
        return "imported".to_string();
    }
    cleaned
}

/// Rewrite same-file sibling idea refs `[other]` to `[other.other]` and record needed
/// imports. Leaves wiki links `[[...]]`, self refs, and non-siblings untouched.
/// Mirrors the `rewriteSiblingRefs` regex `\[\[([^\]]*)\]\]|\[([A-Za-z_][\w-]*)\]`.
pub fn rewrite_sibling_refs(
    text: &str,
    self_name: &str,
    sibling_names: &BTreeSet<String>,
) -> (String, Vec<String>) {
    let chars: Vec<char> = text.chars().collect();
    let n = chars.len();
    let mut out = String::with_capacity(text.len());
    let mut needed: BTreeSet<String> = BTreeSet::new();
    let mut i = 0;
    while i < n {
        // Wiki link: `[[` ... `]]` with no `]` inside — always copied verbatim.
        if chars[i] == '[' && i + 1 < n && chars[i + 1] == '[' {
            let mut j = i + 2;
            while j < n && chars[j] != ']' {
                j += 1;
            }
            if j + 1 < n && chars[j] == ']' && chars[j + 1] == ']' {
                out.extend(&chars[i..=j + 1]);
                i = j + 2;
                continue;
            }
        }
        // Local ref: `[ident]` where ident is `[A-Za-z_][A-Za-z0-9_-]*`.
        if chars[i] == '[' && i + 1 < n && is_ident_start(chars[i + 1]) {
            let mut e = i + 2;
            while e < n && is_ident_continue(chars[e]) {
                e += 1;
            }
            if e < n && chars[e] == ']' {
                let local: String = chars[i + 1..e].iter().collect();
                if local == self_name || !sibling_names.contains(&local) {
                    out.extend(&chars[i..=e]);
                } else {
                    needed.insert(local.clone());
                    out.push('[');
                    out.push_str(&format!("{local}.{local}"));
                    out.push(']');
                }
                i = e + 1;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    (out, needed.into_iter().collect())
}

fn is_ident_start(ch: char) -> bool {
    ch.is_ascii_alphabetic() || ch == '_'
}

fn is_ident_continue(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '_' || ch == '-'
}

#[cfg(test)]
mod tests {
    use super::*;

    fn siblings(names: &[&str]) -> BTreeSet<String> {
        names.iter().map(|name| name.to_string()).collect()
    }

    #[test]
    fn rewrites_local_sibling_refs_and_skips_self_wiki_and_non_siblings() {
        let (text, needed) = rewrite_sibling_refs(
            "alpha {\n    see [beta] and [alpha] and [[beta]] and [gamma]\n}",
            "alpha",
            &siblings(&["alpha", "beta"]),
        );
        assert!(text.contains("[beta.beta]"));
        assert!(text.contains("[alpha]"));
        assert!(text.contains("[[beta]]"));
        assert!(text.contains("[gamma]"));
        assert_eq!(needed, vec!["beta".to_string()]);
    }

    #[test]
    fn defaults_container_name_to_sanitized_basename() {
        let plan = plan_barrel_page(
            "alpha {\n    body a\n}\nbeta {\n    body b\n}\n",
            None,
            "features-page.rq",
        )
        .unwrap();
        assert_eq!(plan.container_name, "features_page");
        assert_eq!(
            plan.children.iter().map(|c| c.idea_name.clone()).collect::<Vec<_>>(),
            vec!["alpha".to_string(), "beta".to_string()]
        );
        assert!(plan.container_content.contains("import \"./alpha.rq\" as alpha"));
        assert!(plan.container_content.contains("features_page {"));
        assert!(plan.container_content.contains("[alpha.alpha]"));
        assert!(plan.children[0].content.contains("alpha {"));
    }

    #[test]
    fn copies_import_preamble_into_children() {
        let plan = plan_barrel_page(
            "import \"./shared.rq\" as shared\n\nalpha {\n    uses [shared.helper]\n}\nbeta {\n    other\n}\n",
            Some("page"),
            "page.rq",
        )
        .unwrap();
        assert!(plan.children[0].content.contains("import \"./shared.rq\" as shared"));
        assert!(plan.children[1].content.contains("import \"./shared.rq\" as shared"));
        assert!(!plan.container_content.contains("shared.rq"));
    }

    #[test]
    fn preserves_top_level_ideasets_in_container() {
        let plan = plan_barrel_page(
            "alpha {\n    a\n}\n\nbundle_set (\n    alpha\n)\n",
            Some("page"),
            "page.rq",
        )
        .unwrap();
        assert_eq!(plan.preserved_ideasets.len(), 1);
        assert!(plan.container_content.contains("bundle_set ("));
    }

    #[test]
    fn rejects_empty_pages_and_container_clashes() {
        assert!(plan_barrel_page("import \"./x.rq\" as x\n", None, "page.rq")
            .unwrap_err()
            .contains("at least one top-level idea"));
        assert!(plan_barrel_page("alpha {\n    a\n}\n", Some("alpha"), "page.rq")
            .unwrap_err()
            .contains("conflicts with an idea"));
    }
}
