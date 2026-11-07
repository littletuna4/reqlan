//! Import statements planned for the destination and cleaned up in the source.
//! rq:["../../../../reqlan rq/extension/mutation/refactor_native_planner.rq".refactor_native_planner]
//! rq:["../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_move]

use crate::ast::{FromImport, FromImportSpecifier, Import, Model, TopLevelElement};
use crate::barrel::file_basename_alias;
use crate::path::DEFAULT_IMPORT_ROOT_ALIAS;
use crate::token::Span;
use std::collections::{BTreeMap, BTreeSet};

use super::decl::{top_level_names, used_names_in_decl};
use super::edits::{edit_range, full_line_range, LineMap, Pos};
use super::pathing::{
    relative_from_file, relative_import, resolve_authored, same_target, uri_path,
};
use super::types::TextEdit;

enum Binding {
    From { path: String, idea: String, alias: Option<String> },
    Namespace { path: String, alias: String },
}

fn find_binding(model: &Model, name: &str) -> Option<Binding> {
    for import in &model.imports {
        match import {
            Import::From(from) => {
                for spec in &from.specifiers {
                    if binding_name(spec) == name {
                        return Some(Binding::From {
                            path: from.path.clone(),
                            idea: spec.idea.clone(),
                            alias: spec.alias.clone(),
                        });
                    }
                }
            }
            Import::Namespace(namespace) => {
                if namespace.alias.as_deref() == Some(name) {
                    return Some(Binding::Namespace {
                        path: namespace.path.clone(),
                        alias: name.to_string(),
                    });
                }
            }
            Import::Qualified(qualified) => {
                let bound = qualified
                    .alias
                    .as_deref()
                    .filter(|alias| !alias.is_empty())
                    .unwrap_or(qualified.idea.as_str());
                if bound == name {
                    return Some(Binding::From {
                        path: qualified.path.clone(),
                        idea: qualified.idea.clone(),
                        alias: qualified.alias.clone(),
                    });
                }
            }
            Import::InvalidFrom(_) => {}
        }
    }
    None
}

fn binding_name(spec: &FromImportSpecifier) -> &str {
    spec.alias.as_deref().filter(|alias| !alias.is_empty()).unwrap_or(spec.idea.as_str())
}

pub(crate) fn dest_required_import_edits(
    source_uri: &str,
    source_model: &Model,
    dest_uri: &str,
    dest: &str,
    dest_model: &Model,
    decl: Span,
) -> Vec<TextEdit> {
    let mut used = used_names_in_decl(source_model, decl);
    let decl_name = source_model.elements.iter().find_map(|element| match element {
        TopLevelElement::Idea(idea) if idea.span.start == decl.start => Some(idea.name.as_str()),
        TopLevelElement::OneLiner(idea) if idea.span.start == decl.start => {
            Some(idea.name.as_str())
        }
        _ => None,
    });
    if let Some(name) = decl_name {
        used.remove(name);
    }

    let dest_locals = top_level_names(dest_model);
    let mut siblings = top_level_names(source_model);
    if let Some(name) = decl_name {
        siblings.remove(name);
    }

    let mut from_needs: BTreeMap<String, Vec<(String, Option<String>)>> = BTreeMap::new();
    let mut ns_needs: BTreeMap<String, String> = BTreeMap::new();
    for name in &used {
        if dest_locals.contains(name) {
            continue;
        }
        if siblings.contains(name) {
            let path = relative_import(dest_uri, source_uri);
            push_from(&mut from_needs, path, name.clone(), None);
            continue;
        }
        let Some(binding) = find_binding(source_model, name) else {
            continue;
        };
        match binding {
            Binding::Namespace { path, alias } => {
                if let Some(rewritten) = rewrite_import_path(&path, source_uri, dest_uri) {
                    ns_needs.entry(rewritten).or_insert(alias);
                }
            }
            Binding::From { path, idea, alias } => {
                if let Some(rewritten) = rewrite_import_path(&path, source_uri, dest_uri) {
                    push_from(&mut from_needs, rewritten, idea, alias);
                }
            }
        }
    }
    build_dest_import_edits(dest, dest_model, &from_needs, &ns_needs)
}

fn push_from(
    needs: &mut BTreeMap<String, Vec<(String, Option<String>)>>,
    path: String,
    idea: String,
    alias: Option<String>,
) {
    let list = needs.entry(path).or_default();
    if list.iter().any(|(existing, existing_alias)| existing == &idea && existing_alias == &alias) {
        return;
    }
    list.push((idea, alias));
}

fn rewrite_import_path(path: &str, source_uri: &str, dest_uri: &str) -> Option<String> {
    if path.starts_with(&format!("{DEFAULT_IMPORT_ROOT_ALIAS}/")) {
        return Some(path.to_string());
    }
    let target = resolve_authored(source_uri, path);
    if same_target(&target, &uri_path(dest_uri)) {
        return None;
    }
    Some(relative_from_file(dest_uri, &target))
}

fn build_dest_import_edits(
    dest: &str,
    model: &Model,
    from_needs: &BTreeMap<String, Vec<(String, Option<String>)>>,
    ns_needs: &BTreeMap<String, String>,
) -> Vec<TextEdit> {
    let lines = LineMap::new(dest);
    let mut edits = Vec::new();
    let mut new_lines = Vec::new();
    for (path, alias) in ns_needs {
        if namespace_alias_for_path(model, path).is_some() {
            continue;
        }
        new_lines.push(format!("import \"{path}\" as {alias}"));
    }
    for (path, specifiers) in from_needs {
        let existing = find_from_import(model, path);
        let to_add: Vec<_> = specifiers
            .iter()
            .filter(|(idea, alias)| !from_has_specifier(existing, idea, alias.as_deref()))
            .cloned()
            .collect();
        if to_add.is_empty() {
            continue;
        }
        if let Some(existing) = existing {
            if let Some(last) = existing.specifiers.last() {
                let end = last.alias_span.map(|span| span.end).unwrap_or(last.idea_span.end);
                let at = lines.position(dest, end);
                let text = to_add
                    .iter()
                    .map(|(idea, alias)| format_specifier(idea, alias.as_deref()))
                    .collect::<Vec<_>>()
                    .join(", ");
                edits.push(TextEdit {
                    start_line: at.line,
                    start_character: at.character,
                    end_line: at.line,
                    end_character: at.character,
                    new_text: format!(", {text}"),
                });
                continue;
            }
        }
        let rendered = to_add
            .iter()
            .map(|(idea, alias)| format_specifier(idea, alias.as_deref()))
            .collect::<Vec<_>>()
            .join(", ");
        new_lines.push(format!("from \"{path}\" import {rendered}"));
    }
    if !new_lines.is_empty() {
        let (at, trailing) = import_insert_point(dest, model);
        let block = format!("{}\n", new_lines.join("\n"));
        let new_text = if trailing { format!("{block}\n") } else { block };
        edits.push(TextEdit {
            start_line: at.line,
            start_character: at.character,
            end_line: at.line,
            end_character: at.character,
            new_text,
        });
    }
    edits
}

fn format_specifier(idea: &str, alias: Option<&str>) -> String {
    match alias {
        Some(alias) => format!("{idea} as {alias}"),
        None => idea.to_string(),
    }
}

fn from_has_specifier(existing: Option<&FromImport>, idea: &str, alias: Option<&str>) -> bool {
    let Some(existing) = existing else {
        return false;
    };
    existing.specifiers.iter().any(|spec| {
        if let Some(alias) = alias {
            spec.alias.as_deref() == Some(alias)
        } else {
            binding_name(spec) == idea || spec.idea == idea
        }
    })
}

fn find_from_import<'a>(model: &'a Model, path: &str) -> Option<&'a FromImport> {
    model.imports.iter().find_map(|import| match import {
        Import::From(from) if from.path == path && !from.specifiers.is_empty() => Some(from),
        _ => None,
    })
}

pub(crate) fn namespace_alias_for_path(model: &Model, path: &str) -> Option<String> {
    for import in &model.imports {
        if let Import::Namespace(namespace) = import {
            if namespace.path == path {
                return namespace.alias.clone();
            }
        }
    }
    None
}

pub(crate) fn unused_import_edits(
    text: &str,
    model: &Model,
    used: &BTreeSet<String>,
) -> Vec<TextEdit> {
    let mut edits = Vec::new();
    for import in &model.imports {
        match import {
            Import::From(from) if !from.specifiers.is_empty() => {
                let unused: Vec<_> = from
                    .specifiers
                    .iter()
                    .filter(|spec| !used.contains(binding_name(spec)))
                    .collect();
                if unused.is_empty() {
                    continue;
                }
                if unused.len() == from.specifiers.len() {
                    let lines = LineMap::new(text);
                    edits.push(edit_range(full_line_range(&lines, text, from.span), String::new()));
                    continue;
                }
                for spec in unused {
                    if let Some(edit) = specifier_removal(text, spec) {
                        edits.push(edit);
                    }
                }
            }
            Import::Namespace(namespace) => {
                let alias = namespace.alias.as_deref().unwrap_or("");
                if alias.is_empty() || !used.contains(alias) {
                    let lines = LineMap::new(text);
                    edits.push(edit_range(
                        full_line_range(&lines, text, namespace.span),
                        String::new(),
                    ));
                }
            }
            Import::Qualified(qualified) => {
                let name = qualified
                    .alias
                    .as_deref()
                    .filter(|alias| !alias.is_empty())
                    .unwrap_or(qualified.idea.as_str());
                if name.is_empty() || !used.contains(name) {
                    let lines = LineMap::new(text);
                    edits.push(edit_range(
                        full_line_range(&lines, text, qualified.span),
                        String::new(),
                    ));
                }
            }
            Import::From(_) | Import::InvalidFrom(_) => {}
        }
    }
    edits
}

fn specifier_removal(text: &str, spec: &FromImportSpecifier) -> Option<TextEdit> {
    let start = spec.idea_span.start;
    let end = spec.alias_span.map(|span| span.end).unwrap_or(spec.idea_span.end);
    let after = text.get(end..).unwrap_or("");
    let (range_start, range_end) = if let Some(len) = comma_whitespace_prefix(after) {
        (start, end + len)
    } else {
        let before = text.get(..start).unwrap_or("");
        let trimmed = comma_whitespace_suffix(before)?;
        (start - trimmed, end)
    };
    let lines = LineMap::new(text);
    Some(edit_range(lines.range(text, range_start, range_end), String::new()))
}

fn comma_whitespace_prefix(text: &str) -> Option<usize> {
    let bytes = text.as_bytes();
    if bytes.first() != Some(&b',') {
        return None;
    }
    let mut len = 1;
    while len < bytes.len() && bytes[len].is_ascii_whitespace() {
        len += 1;
    }
    Some(len)
}

fn comma_whitespace_suffix(text: &str) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut index = bytes.len();
    while index > 0 && bytes[index - 1].is_ascii_whitespace() {
        index -= 1;
    }
    if index > 0 && bytes[index - 1] == b',' {
        Some(bytes.len() - (index - 1))
    } else {
        None
    }
}

pub(crate) fn from_import_edit(
    text: &str,
    model: &Model,
    path: &str,
    name: &str,
) -> Option<TextEdit> {
    let lines = LineMap::new(text);
    if let Some(existing) = find_from_import(model, path) {
        if from_has_specifier(Some(existing), name, None) {
            return None;
        }
        let end = existing
            .specifiers
            .last()
            .map(|spec| spec.alias_span.map(|span| span.end).unwrap_or(spec.idea_span.end))
            .unwrap_or(existing.span.end);
        let at = lines.position(text, end);
        return Some(TextEdit {
            start_line: at.line,
            start_character: at.character,
            end_line: at.line,
            end_character: at.character,
            new_text: format!(", {name}"),
        });
    }
    let (at, trailing) = import_insert_point(text, model);
    let line = format!("from \"{path}\" import {name}");
    let new_text = if trailing { format!("{line}\n\n") } else { format!("{line}\n") };
    Some(TextEdit {
        start_line: at.line,
        start_character: at.character,
        end_line: at.line,
        end_character: at.character,
        new_text,
    })
}

pub(crate) fn namespace_import_edit(
    text: &str,
    model: &Model,
    path: &str,
    alias: &str,
) -> Option<TextEdit> {
    if namespace_alias_for_path(model, path).is_some() {
        return None;
    }
    let (at, trailing) = import_insert_point(text, model);
    let line = format!("import \"{path}\" as {alias}");
    let new_text = if trailing { format!("{line}\n\n") } else { format!("{line}\n") };
    Some(TextEdit {
        start_line: at.line,
        start_character: at.character,
        end_line: at.line,
        end_character: at.character,
        new_text,
    })
}

fn import_insert_point(text: &str, model: &Model) -> (Pos, bool) {
    let lines = LineMap::new(text);
    if let Some(import) = model.imports.last() {
        let end = lines.position(text, import_span(import).end);
        let position =
            if end.character == 0 { end } else { Pos { line: end.line + 1, character: 0 } };
        return (position, false);
    }
    if let Some(element) = model.elements.first() {
        return (lines.position(text, element.span().start), true);
    }
    (Pos { line: 0, character: 0 }, true)
}

pub(crate) fn idea_insert_position(text: &str, model: &Model) -> Pos {
    let lines = LineMap::new(text);
    if let Some(element) = model.elements.last() {
        let end = lines.position(text, element.span().end);
        if end.character == 0 {
            end
        } else {
            Pos { line: end.line + 1, character: 0 }
        }
    } else {
        import_insert_point(text, model).0
    }
}

fn import_span(import: &Import) -> Span {
    match import {
        Import::From(from) => from.span,
        Import::Namespace(namespace) => namespace.span,
        Import::Qualified(qualified) => qualified.span,
        Import::InvalidFrom(invalid) => invalid.span,
    }
}

pub(crate) fn unique_alias(base: &str, taken: &BTreeSet<String>) -> String {
    let cleaned = file_basename_alias(base);
    if !taken.contains(&cleaned) {
        return cleaned;
    }
    let mut suffix = 2u32;
    loop {
        let candidate = format!("{cleaned}_{suffix}");
        if !taken.contains(&candidate) {
            return candidate;
        }
        suffix += 1;
    }
}
