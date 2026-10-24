//! Pure-text plans for moving or deleting an idea.
//! The host supplies file texts. This module does not read the disk or the index.
//! rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_move]
//! rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_delete]
//! rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".comment_reference_refactor_support]
//! rq:["../../../reqlan rq/extension/mutation/refactor_native_planner.rq".refactor_native_planner]

use crate::ast::{
    AttributeValue, BodyElement, FromImport, FromImportSpecifier, Import, ListItem, Model,
    ReferenceTarget, RichPart, TopLevelElement,
};
use crate::barrel::file_basename_alias;
use crate::parser::parse_document;
use crate::path::{
    import_path_with_implicit_extension, match_import_root_alias, normalize_posix_segments,
    posix_dirname, posix_join, DEFAULT_IMPORT_ROOT_ALIAS,
};
use crate::token::Span;
use std::collections::{BTreeMap, BTreeSet};

/// One file the host already loaded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileText {
    pub uri: String,
    pub text: String,
}

/// One LSP text edit. Columns are UTF-16 code units.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextEdit {
    pub start_line: u32,
    pub start_character: u32,
    pub end_line: u32,
    pub end_character: u32,
    pub new_text: String,
}

/// Edits for one document, sorted for bottom-up application.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentEdits {
    pub uri: String,
    pub edits: Vec<TextEdit>,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum PlanError {
    #[error("idea not found")]
    MissingIdea,
    #[error("destination already has this idea")]
    DestinationHasIdea,
}
// rq-ignore-error
/// Remove the idea and clear bracket, wiki, and `rq:[…]` hits of that name.
pub fn plan_idea_delete(
    source_uri: &str,
    source: &str,
    idea_name: &str,
    files: &[FileText],
) -> Vec<DocumentEdits> {
    let parsed = parse_document(source);
    let Some(decl) = find_declaration(&parsed.model, idea_name) else {
        return Vec::new();
    };
    let mut by_uri: BTreeMap<String, Vec<TextEdit>> = BTreeMap::new();
    let lines = LineMap::new(source);
    push(
        &mut by_uri,
        source_uri,
        edit_range(full_line_range(&lines, source, decl.span), String::new()),
    );
    clear_name_hits(&mut by_uri, source_uri, source, idea_name, Some(decl.span));
    clear_comments(&mut by_uri, source_uri, source, idea_name, Some(decl.span));
    for file in files {
        if file.uri == source_uri {
            continue;
        }
        if is_rq_uri(&file.uri) {
            clear_name_hits(&mut by_uri, &file.uri, &file.text, idea_name, None);
        }
        clear_comments(&mut by_uri, &file.uri, &file.text, idea_name, None);
    }
    finish(by_uri)
}

/// Move an idea into an existing file, or leave a one-liner stub when `leave_stub` is set.
pub fn plan_idea_move(
    source_uri: &str,
    source: &str,
    dest_uri: &str,
    dest: &str,
    idea_name: &str,
    leave_stub: bool,
    files: &[FileText],
) -> Result<Vec<DocumentEdits>, PlanError> {
    let source_parsed = parse_document(source);
    let dest_parsed = parse_document(dest);
    let decl = find_declaration(&source_parsed.model, idea_name).ok_or(PlanError::MissingIdea)?;
    if find_declaration(&dest_parsed.model, idea_name).is_some() {
        return Err(PlanError::DestinationHasIdea);
    }

    let idea_text = source.get(decl.span.start..decl.span.end).unwrap_or("").to_string();
    let source_lines = LineMap::new(source);
    let mut by_uri: BTreeMap<String, Vec<TextEdit>> = BTreeMap::new();

    let dest_import_path = relative_import(source_uri, dest_uri);
    let existing_alias = namespace_alias_for_path(&source_parsed.model, &dest_import_path);
    let stub_alias = if leave_stub {
        Some(existing_alias.clone().unwrap_or_else(|| {
            unique_alias(&file_basename_alias(dest_uri), &bound_names(&source_parsed.model))
        }))
    } else {
        None
    };

    let stub_text = match &stub_alias {
        Some(alias) => format!("{idea_name} [{alias}.{idea_name}]\n"),
        None => String::new(),
    };
    push(
        &mut by_uri,
        source_uri,
        edit_range(full_line_range(&source_lines, source, decl.span), stub_text),
    );

    let mut used_after = used_names_outside(&source_parsed.model, decl.span);
    if let Some(alias) = &stub_alias {
        used_after.insert(alias.clone());
    }
    for edit in unused_import_edits(source, &source_parsed.model, &used_after) {
        push(&mut by_uri, source_uri, edit);
    }

    let mut dest_import_edits = dest_required_import_edits(
        source_uri,
        &source_parsed.model,
        dest_uri,
        dest,
        &dest_parsed.model,
        decl.span,
    );
    let idea_at = idea_insert_position(dest, &dest_parsed.model);
    let mut inserted = false;
    for edit in &mut dest_import_edits {
        if edit.start_line == idea_at.line
            && edit.start_character == idea_at.character
            && edit.end_line == idea_at.line
            && edit.end_character == idea_at.character
        {
            edit.new_text = format!("{}{idea_text}\n", edit.new_text);
            inserted = true;
            break;
        }
    }
    if !inserted {
        push(
            &mut by_uri,
            dest_uri,
            TextEdit {
                start_line: idea_at.line,
                start_character: idea_at.character,
                end_line: idea_at.line,
                end_character: idea_at.character,
                new_text: format!("{idea_text}\n"),
            },
        );
    }
    for edit in dest_import_edits {
        push(&mut by_uri, dest_uri, edit);
    }

    if let Some(alias) = &stub_alias {
        if existing_alias.is_none() {
            if let Some(edit) =
                namespace_import_edit(source, &source_parsed.model, &dest_import_path, alias)
            {
                push(&mut by_uri, source_uri, edit);
            }
        }
    } else if source_keeps_name(&source_parsed.model, idea_name, decl.span) {
        if let Some(edit) =
            from_import_edit(source, &source_parsed.model, &dest_import_path, idea_name)
        {
            push(&mut by_uri, source_uri, edit);
        }
    }

    rewrite_comments(&mut by_uri, source_uri, source, source_uri, dest_uri, idea_name);
    rewrite_comments(&mut by_uri, dest_uri, dest, source_uri, dest_uri, idea_name);
    for file in files {
        if file.uri == source_uri || file.uri == dest_uri {
            continue;
        }
        rewrite_comments(&mut by_uri, &file.uri, &file.text, source_uri, dest_uri, idea_name);
    }

    Ok(finish(by_uri))
}

struct Decl {
    span: Span,
}

fn find_declaration(model: &Model, name: &str) -> Option<Decl> {
    for element in &model.elements {
        match element {
            TopLevelElement::Idea(idea) if idea.name == name => {
                return Some(Decl { span: idea.span });
            }
            TopLevelElement::OneLiner(idea) if idea.name == name => {
                return Some(Decl { span: idea.span });
            }
            _ => {}
        }
    }
    None
}

fn clear_name_hits(
    by_uri: &mut BTreeMap<String, Vec<TextEdit>>,
    uri: &str,
    text: &str,
    idea_name: &str,
    skip: Option<Span>,
) {
    let parsed = parse_document(text);
    let lines = LineMap::new(text);
    let mut visit = |part: &RichPart| {
        let (span, target) = match part {
            RichPart::BracketRef { span, target } | RichPart::WikiLink { span, target, .. } => {
                (*span, target)
            }
            _ => return,
        };
        if hit_name(target) != Some(idea_name) {
            return;
        }
        if skip.is_some_and(|decl| spans_overlap(span, decl)) {
            return;
        }
        let range = lines.range(text, span.start, span.end);
        push(by_uri, uri, edit_range(range, String::new()));
    };
    walk_model(&parsed.model, &mut visit);
}

fn hit_name(target: &ReferenceTarget) -> Option<&str> {
    match target {
        ReferenceTarget::Local { idea, .. } | ReferenceTarget::Qualified { idea, .. } => {
            Some(idea.as_str())
        }
        _ => None,
    }
}

fn clear_comments(
    by_uri: &mut BTreeMap<String, Vec<TextEdit>>,
    uri: &str,
    text: &str,
    idea_name: &str,
    skip: Option<Span>,
) {
    let lines = LineMap::new(text);
    for hit in comment_hits(text) {
        if !comment_names_idea(&hit.inner, idea_name) {
            continue;
        }
        if skip.is_some_and(|decl| byte_range_overlaps(hit.start, hit.end, decl)) {
            continue;
        }
        let range = lines.range(text, hit.start, hit.end);
        push(by_uri, uri, edit_range(range, String::new()));
    }
}

fn rewrite_comments(
    by_uri: &mut BTreeMap<String, Vec<TextEdit>>,
    uri: &str,
    text: &str,
    old_target: &str,
    new_target: &str,
    idea_name: &str,
) {
    let lines = LineMap::new(text);
    for hit in comment_hits(text) {
        let Some(quoted) = quoted_path(&hit.inner) else {
            continue;
        };
        let rest = &hit.inner[quoted.end_in_inner..];
        if comment_idea(rest) != Some(idea_name) {
            continue;
        }
        let Some(rewritten) =
            rewrite_path_to_moved_target(&quoted.path, uri, old_target, new_target)
        else {
            continue;
        };
        let abs_start = hit.inner_start + quoted.start_in_inner;
        let abs_end = hit.inner_start + quoted.end_in_inner;
        let range = lines.range(text, abs_start, abs_end);
        let new_text =
            serde_json::to_string(&rewritten).unwrap_or_else(|_| format!("\"{rewritten}\""));
        push(by_uri, uri, edit_range(range, new_text));
    }
}

struct CommentHit {
    start: usize,
    end: usize,
    inner_start: usize,
    inner: String,
}

fn comment_hits(text: &str) -> Vec<CommentHit> {
    let bytes = text.as_bytes();
    let mut hits = Vec::new();
    let mut index = 0;
    while index + 3 < bytes.len() {
        if bytes[index] == b'r' && bytes[index + 1] == b'q' && bytes[index + 2] == b':' {
            let mut cursor = index + 3;
            while cursor < bytes.len() && (bytes[cursor] == b' ' || bytes[cursor] == b'\t') {
                cursor += 1;
            }
            if cursor < bytes.len() && bytes[cursor] == b'[' {
                if let Some(rel) = text[cursor + 1..].find(']') {
                    let close = cursor + 1 + rel;
                    hits.push(CommentHit {
                        start: index,
                        end: close + 1,
                        inner_start: cursor + 1,
                        inner: text[cursor + 1..close].to_string(),
                    });
                    index = close + 1;
                    continue;
                }
            }
        }
        index += 1;
    }
    hits
}

fn comment_names_idea(inner: &str, idea_name: &str) -> bool {
    inner == idea_name
        || inner.ends_with(&format!(".{idea_name}"))
        || inner.ends_with(&format!(". {idea_name}"))
}

fn comment_idea(rest: &str) -> Option<&str> {
    let rest = rest.trim_start();
    let rest = rest.strip_prefix('.')?.trim_start();
    let mut last = None;
    for part in rest.split('.') {
        let part = part.trim();
        if !part.is_empty() {
            last = Some(part);
        }
    }
    last
}

struct QuotedPath {
    start_in_inner: usize,
    end_in_inner: usize,
    path: String,
}

fn quoted_path(inner: &str) -> Option<QuotedPath> {
    let bytes = inner.as_bytes();
    if bytes.is_empty() || (bytes[0] != b'"' && bytes[0] != b'\'') {
        return None;
    }
    let quote = bytes[0];
    let mut path = String::new();
    let mut index = 1;
    while index < bytes.len() {
        if bytes[index] == b'\\' && index + 1 < bytes.len() {
            path.push(bytes[index + 1] as char);
            index += 2;
            continue;
        }
        if bytes[index] == quote {
            return Some(QuotedPath { start_in_inner: 0, end_in_inner: index + 1, path });
        }
        path.push(bytes[index] as char);
        index += 1;
    }
    None
}

fn source_keeps_name(model: &Model, idea_name: &str, decl: Span) -> bool {
    let mut found = false;
    let mut visit = |part: &RichPart| {
        let (span, target) = match part {
            RichPart::BracketRef { span, target } | RichPart::WikiLink { span, target, .. } => {
                (*span, target)
            }
            _ => return,
        };
        if hit_name(target) == Some(idea_name) && !spans_overlap(span, decl) {
            found = true;
        }
    };
    walk_model(model, &mut visit);
    found
}

fn used_names_outside(model: &Model, skip: Span) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    for element in &model.elements {
        if spans_overlap(element.span(), skip) && element_is_decl(element, skip) {
            continue;
        }
        if let TopLevelElement::IdeaSet(set) = element {
            for member in &set.members {
                if !member.is_empty() {
                    names.insert(member.clone());
                }
            }
        }
        walk_element(element, &mut |part| collect_binding(part, &mut names));
    }
    names
}

fn element_is_decl(element: &TopLevelElement, span: Span) -> bool {
    match element {
        TopLevelElement::Idea(idea) => idea.span.start == span.start,
        TopLevelElement::OneLiner(idea) => idea.span.start == span.start,
        _ => false,
    }
}

fn used_names_in_decl(model: &Model, span: Span) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    for element in &model.elements {
        if !element_is_decl(element, span) {
            continue;
        }
        walk_element(element, &mut |part| collect_binding(part, &mut names));
    }
    names
}

fn collect_binding(part: &RichPart, names: &mut BTreeSet<String>) {
    match part {
        RichPart::BracketRef { target, .. } | RichPart::WikiLink { target, .. } => match target {
            ReferenceTarget::Local { idea, .. } => {
                if !idea.is_empty() {
                    names.insert(idea.clone());
                }
            }
            ReferenceTarget::Qualified { qualifier, .. } => {
                if let Some(qualifier) = qualifier.as_ref().filter(|name| !name.is_empty()) {
                    names.insert(qualifier.clone());
                }
            }
            _ => {}
        },
        _ => {}
    }
}

fn bound_names(model: &Model) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    for element in &model.elements {
        if let Some(name) = element.name() {
            if !name.is_empty() {
                names.insert(name.to_string());
            }
        }
    }
    for (name, _) in model.import_bindings() {
        names.insert(name);
    }
    names
}

fn top_level_names(model: &Model) -> BTreeSet<String> {
    model.elements.iter().filter_map(|element| element.name().map(str::to_string)).collect()
}

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

fn dest_required_import_edits(
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

fn namespace_alias_for_path(model: &Model, path: &str) -> Option<String> {
    for import in &model.imports {
        if let Import::Namespace(namespace) = import {
            if namespace.path == path {
                return namespace.alias.clone();
            }
        }
    }
    None
}

fn unused_import_edits(text: &str, model: &Model, used: &BTreeSet<String>) -> Vec<TextEdit> {
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

fn from_import_edit(text: &str, model: &Model, path: &str, name: &str) -> Option<TextEdit> {
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

fn namespace_import_edit(text: &str, model: &Model, path: &str, alias: &str) -> Option<TextEdit> {
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

fn idea_insert_position(text: &str, model: &Model) -> Pos {
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

fn unique_alias(base: &str, taken: &BTreeSet<String>) -> String {
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

fn rewrite_path_to_moved_target(
    path: &str,
    referencing_uri: &str,
    old_target: &str,
    new_target: &str,
) -> Option<String> {
    if path.is_empty() || path.starts_with("file://") {
        return None;
    }
    if match_import_root_alias(path, DEFAULT_IMPORT_ROOT_ALIAS).is_some() {
        return rewrite_aliased_path(path, old_target, new_target);
    }
    let resolved = resolve_authored(referencing_uri, path);
    let old = uri_path(old_target);
    let implicit = import_path_with_implicit_extension(path)
        .map(|extra| resolve_authored(referencing_uri, &extra));
    let matches = same_target(&resolved, &old)
        || implicit.as_ref().is_some_and(|path| same_target(path, &old));
    if !matches {
        return None;
    }
    let keep_extension = has_explicit_extension(path);
    let new_path = uri_path(new_target);
    let target =
        if keep_extension { new_path } else { new_path.trim_end_matches(".rq").to_string() };
    let relative =
        ensure_dot_relative(&posix_relative(&posix_dirname(&uri_path(referencing_uri)), &target));
    if relative == path {
        None
    } else {
        Some(relative)
    }
}

fn rewrite_aliased_path(path: &str, old_target: &str, new_target: &str) -> Option<String> {
    let remainder = match_import_root_alias(path, DEFAULT_IMPORT_ROOT_ALIAS)?;
    let old = uri_path(old_target);
    let new = uri_path(new_target);
    let matched = if path_ends_with(&old, &remainder) {
        remainder.clone()
    } else {
        let implicit = import_path_with_implicit_extension(&remainder)?;
        if path_ends_with(&old, &implicit) {
            implicit
        } else {
            return None;
        }
    };
    if matched.len() > old.len() {
        return None;
    }
    let prefix = &old[..old.len() - matched.len()];
    if !new.starts_with(prefix) {
        return None;
    }
    let mut new_remainder = new[prefix.len()..].to_string();
    if !has_explicit_extension(&remainder) && new_remainder.ends_with(".rq") {
        new_remainder.truncate(new_remainder.len() - 3);
    }
    let rewritten = format!("{DEFAULT_IMPORT_ROOT_ALIAS}/{new_remainder}");
    if rewritten == path {
        None
    } else {
        Some(rewritten)
    }
}

fn path_ends_with(absolute: &str, segment: &str) -> bool {
    let abs = absolute.trim_end_matches('/');
    let rel = segment.trim_matches('/');
    !rel.is_empty() && (abs == rel || abs.ends_with(&format!("/{rel}")))
}

fn has_explicit_extension(path: &str) -> bool {
    let base = path.rsplit('/').next().unwrap_or(path);
    base.len() > 1 && base[1..].contains('.')
}

fn relative_import(from_uri: &str, to_uri: &str) -> String {
    relative_from_file(from_uri, &uri_path(to_uri))
}

fn relative_from_file(from_uri: &str, to_path: &str) -> String {
    let from = uri_path(from_uri);
    let from_dir = posix_dirname(&from);
    ensure_dot_relative(&posix_relative(from_dir, to_path))
}

fn resolve_authored(from_uri: &str, authored: &str) -> String {
    if authored.starts_with('/') || authored.contains("://") {
        return authored.to_string();
    }
    let from = uri_path(from_uri);
    normalize_posix_segments(&posix_join(posix_dirname(&from), authored))
}

fn uri_path(uri: &str) -> String {
    let bare = uri.split('?').next().unwrap_or(uri);
    let bare = bare.split('#').next().unwrap_or(bare);
    if let Some(rest) = bare.strip_prefix("file://") {
        return rest.to_string();
    }
    bare.replace('\\', "/")
}

fn same_target(left: &str, right: &str) -> bool {
    let left = left.trim_end_matches('/');
    let right = right.trim_end_matches('/');
    left == right || left.trim_end_matches(".rq") == right.trim_end_matches(".rq")
}

fn posix_relative(from_dir: &str, to_path: &str) -> String {
    let from = normalize_posix_segments(from_dir);
    let to = normalize_posix_segments(to_path);
    let from_parts: Vec<&str> = from.split('/').filter(|part| !part.is_empty()).collect();
    let to_parts: Vec<&str> = to.split('/').filter(|part| !part.is_empty()).collect();
    let mut shared = 0;
    while shared < from_parts.len()
        && shared < to_parts.len()
        && from_parts[shared] == to_parts[shared]
    {
        shared += 1;
    }
    let mut out = Vec::new();
    for _ in shared..from_parts.len() {
        out.push("..");
    }
    out.extend_from_slice(&to_parts[shared..]);
    if out.is_empty() {
        ".".to_string()
    } else {
        out.join("/")
    }
}

fn ensure_dot_relative(path: &str) -> String {
    if path.starts_with('.') {
        path.to_string()
    } else {
        format!("./{path}")
    }
}

fn is_rq_uri(uri: &str) -> bool {
    let path = uri.split('?').next().unwrap_or(uri);
    path.to_ascii_lowercase().ends_with(".rq")
}

fn spans_overlap(left: Span, right: Span) -> bool {
    left.start < right.end && right.start < left.end
}

fn byte_range_overlaps(start: usize, end: usize, span: Span) -> bool {
    start < span.end && span.start < end
}

fn walk_model(model: &Model, visit: &mut dyn FnMut(&RichPart)) {
    for element in &model.elements {
        walk_element(element, visit);
    }
}

fn walk_element(element: &TopLevelElement, visit: &mut dyn FnMut(&RichPart)) {
    match element {
        TopLevelElement::Idea(idea) => walk_elements(&idea.elements, visit),
        TopLevelElement::OneLiner(idea) => walk_parts(&idea.body, visit),
        TopLevelElement::Anonymous(block) => walk_elements(&block.elements, visit),
        TopLevelElement::IdeaSet(_) => {}
    }
}

fn walk_elements(elements: &[BodyElement], visit: &mut dyn FnMut(&RichPart)) {
    for element in elements {
        match element {
            BodyElement::Attribute(attr) => match &attr.value {
                Some(AttributeValue::Scalar(value)) => walk_parts(&value.parts, visit),
                Some(AttributeValue::List(value)) => walk_items(&value.items, visit),
                Some(AttributeValue::Block(value)) => walk_elements(&value.elements, visit),
                None => {}
            },
            BodyElement::BodyLine(line) => walk_parts(&line.parts, visit),
            BodyElement::NamedList(list) => walk_items(&list.items, visit),
            BodyElement::NestedList(list) => walk_items(&list.items, visit),
            BodyElement::CodeSnippet(_) => {}
        }
    }
}

fn walk_items(items: &[ListItem], visit: &mut dyn FnMut(&RichPart)) {
    for item in items {
        match item {
            ListItem::OneLiner(parts) => walk_parts(parts, visit),
            ListItem::Anonymous(block) => walk_elements(&block.elements, visit),
            ListItem::NamedBlock(item) => walk_elements(&item.elements, visit),
            ListItem::Nested(list) => walk_items(&list.items, visit),
        }
    }
}

fn walk_parts(parts: &[RichPart], visit: &mut dyn FnMut(&RichPart)) {
    for part in parts {
        visit(part);
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Pos {
    line: u32,
    character: u32,
}

#[derive(Clone, Copy, Debug)]
struct Rng {
    start: Pos,
    end: Pos,
}

fn full_line_range(lines: &LineMap, text: &str, span: Span) -> Rng {
    let start = lines.position(text, span.start);
    let end = lines.position(text, span.end);
    let end_line = if end.character == 0 { end.line } else { end.line + 1 };
    Rng { start: Pos { line: start.line, character: 0 }, end: Pos { line: end_line, character: 0 } }
}

fn edit_range(range: Rng, new_text: String) -> TextEdit {
    TextEdit {
        start_line: range.start.line,
        start_character: range.start.character,
        end_line: range.end.line,
        end_character: range.end.character,
        new_text,
    }
}

fn push(map: &mut BTreeMap<String, Vec<TextEdit>>, uri: &str, edit: TextEdit) {
    map.entry(uri.to_string()).or_default().push(edit);
}

fn finish(map: BTreeMap<String, Vec<TextEdit>>) -> Vec<DocumentEdits> {
    map.into_iter()
        .filter(|(_, edits)| !edits.is_empty())
        .map(|(uri, mut edits)| {
            edits.sort_by(|left, right| {
                right
                    .start_line
                    .cmp(&left.start_line)
                    .then(right.start_character.cmp(&left.start_character))
                    .then(right.end_line.cmp(&left.end_line))
                    .then(right.end_character.cmp(&left.end_character))
            });
            DocumentEdits { uri, edits }
        })
        .collect()
}

struct LineMap {
    starts: Vec<usize>,
}

impl LineMap {
    fn new(text: &str) -> Self {
        let mut starts = vec![0];
        for (index, byte) in text.bytes().enumerate() {
            if byte == b'\n' {
                starts.push(index + 1);
            }
        }
        Self { starts }
    }

    fn position(&self, text: &str, byte: usize) -> Pos {
        let byte = byte.min(text.len());
        let line = match self.starts.binary_search(&byte) {
            Ok(index) => index,
            Err(index) => index.saturating_sub(1),
        };
        let line_start = self.starts[line];
        Pos { line: line as u32, character: utf16_len(&text[line_start..byte]) }
    }

    fn range(&self, text: &str, start: usize, end: usize) -> Rng {
        let start = start.min(text.len());
        let end = end.min(text.len()).max(start);
        Rng { start: self.position(text, start), end: self.position(text, end) }
    }

    #[cfg(test)]
    fn byte_at(&self, text: &str, line: u32, character: u32) -> usize {
        if self.starts.is_empty() {
            return 0;
        }
        let line = (line as usize).min(self.starts.len() - 1);
        let start = self.starts[line];
        let line_end = if line + 1 < self.starts.len() {
            self.starts[line + 1].saturating_sub(1).max(start)
        } else {
            text.len()
        };
        start + utf16_prefix_bytes(&text[start..line_end.min(text.len())], character)
    }
}

fn utf16_len(text: &str) -> u32 {
    text.chars().map(|ch| if (ch as u32) > 0xFFFF { 2 } else { 1 }).sum()
}

#[cfg(test)]
fn utf16_prefix_bytes(text: &str, utf16_col: u32) -> usize {
    let mut units = 0u32;
    for (index, ch) in text.char_indices() {
        if units >= utf16_col {
            return index;
        }
        units += if (ch as u32) > 0xFFFF { 2 } else { 1 };
    }
    text.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn apply(text: &str, edits: &[TextEdit]) -> String {
        let lines = LineMap::new(text);
        let mut items: Vec<(usize, usize, &str)> = edits
            .iter()
            .map(|edit| {
                (
                    lines.byte_at(text, edit.start_line, edit.start_character),
                    lines.byte_at(text, edit.end_line, edit.end_character),
                    edit.new_text.as_str(),
                )
            })
            .collect();
        items.sort_by(|left, right| right.0.cmp(&left.0).then(right.1.cmp(&left.1)));
        let mut result = text.to_string();
        for (start, end, new_text) in items {
            let end = end.min(result.len()).max(start.min(result.len()));
            let start = start.min(result.len());
            result = format!("{}{}{}", &result[..start], new_text, &result[end..]);
        }
        result
    }

    fn doc<'a>(planned: &'a [DocumentEdits], uri: &str) -> &'a DocumentEdits {
        planned.iter().find(|entry| entry.uri == uri).expect("document edits")
    }

    #[test]
    fn delete_plan_removes_declaration_and_bracket_references() {
        let source = "alpha {\n    body\n}\nbeta {\n    see [alpha]\n}\n";
        let uri = "file:///tmp/source.rq";
        let planned = plan_idea_delete(uri, source, "alpha", &[]);
        let text = apply(source, &doc(&planned, uri).edits);
        assert!(!text.contains("alpha {"));
        assert!(!text.contains("[alpha]"));
        assert!(text.contains("beta {"));
    }

    #[test]
    fn delete_plan_removes_matching_comment_references() {
        let source = "alpha {\n    body\n}\n";
        let uri = "file:///tmp/source.rq";
        let code = "file:///tmp/app.ts";
        let planned = plan_idea_delete(
            uri,
            source,
            "alpha",
            &[FileText { uri: code.into(), text: "// keep this rq:[alpha] here\n".into() }],
        );
        let code_edits = doc(&planned, code);
        assert_eq!(code_edits.edits.len(), 1);
        assert_eq!(code_edits.edits[0].new_text, "");
        let updated = apply("// keep this rq:[alpha] here\n", &code_edits.edits);
        assert_eq!(updated, "// keep this  here\n");
    }

    #[test]
    fn move_plan_cuts_from_source_and_inserts_into_destination() {
        let source = "alpha {\n    body\n}\n";
        let dest = "other {\n    keep\n}\n";
        let source_uri = "file:///tmp/source.rq";
        let dest_uri = "file:///tmp/dest.rq";
        let planned =
            plan_idea_move(source_uri, source, dest_uri, dest, "alpha", false, &[]).unwrap();
        let source_text = apply(source, &doc(&planned, source_uri).edits);
        let dest_text = apply(dest, &doc(&planned, dest_uri).edits);
        assert!(!source_text.contains("alpha {"));
        assert!(dest_text.contains("alpha {"));
        assert!(dest_text.contains("body"));
    }

    #[test]
    fn move_plan_rewrites_qualified_comment_paths_for_the_moved_idea() {
        let source = "alpha {\n    body\n}\nbeta {\n    stay\n}\n";
        let dest = "other {\n    keep\n}\n";
        let code = "file:///tmp/src/app.ts";
        let planned = plan_idea_move(
            "file:///tmp/a/source.rq",
            source,
            "file:///tmp/b/dest.rq",
            dest,
            "alpha",
            false,
            &[FileText {
                uri: code.into(),
                text: "// rq:[\"../a/source.rq\".alpha]\n// rq:[\"../a/source.rq\".beta]\n".into(),
            }],
        )
        .unwrap();
        let edits = &doc(&planned, code).edits;
        assert_eq!(edits.len(), 1);
        assert_eq!(edits[0].new_text, "\"../b/dest.rq\"");
    }

    #[test]
    fn move_plan_removes_unused_source_imports_and_copies_them_to_destination() {
        let source = "from \"./lib.rq\" import foo, stay\nalpha {\n    uses [foo]\n}\nbeta {\n    uses [stay]\n}\n";
        let dest = "other {\n    keep\n}\n";
        let source_uri = "file:///tmp/a/source.rq";
        let dest_uri = "file:///tmp/b/dest.rq";
        let planned =
            plan_idea_move(source_uri, source, dest_uri, dest, "alpha", false, &[]).unwrap();
        let source_text = apply(source, &doc(&planned, source_uri).edits);
        let dest_text = apply(dest, &doc(&planned, dest_uri).edits);
        assert!(!source_text.contains("import foo"));
        assert!(source_text.contains("from \"./lib.rq\" import stay"));
        assert!(!source_text.contains("alpha {"));
        assert!(dest_text.contains("from \"../a/lib.rq\" import foo"));
        assert!(dest_text.contains("alpha {"));
        assert!(dest_text.contains("uses [foo]"));
    }

    #[test]
    fn move_plan_adds_a_sibling_import_on_the_destination() {
        let source = "alpha {\n    uses [beta]\n}\nbeta {\n    stay\n}\n";
        let dest = "other {\n    keep\n}\n";
        let planned = plan_idea_move(
            "file:///tmp/source.rq",
            source,
            "file:///tmp/dest.rq",
            dest,
            "alpha",
            false,
            &[],
        )
        .unwrap();
        let dest_text = apply(dest, &doc(&planned, "file:///tmp/dest.rq").edits);
        assert!(dest_text.contains("from \"./source.rq\" import beta"));
        assert!(dest_text.contains("uses [beta]"));
    }

    #[test]
    fn move_content_plan_leaves_a_source_stub_that_imports_the_moved_idea() {
        let source = "from \"./lib.rq\" import foo\nalpha {\n    uses [foo]\n}\n";
        let dest = "other {\n    keep\n}\n";
        let source_uri = "file:///tmp/source.rq";
        let dest_uri = "file:///tmp/dest.rq";
        let planned =
            plan_idea_move(source_uri, source, dest_uri, dest, "alpha", true, &[]).unwrap();
        let source_text = apply(source, &doc(&planned, source_uri).edits);
        let dest_text = apply(dest, &doc(&planned, dest_uri).edits);
        assert!(source_text.contains("import \"./dest.rq\" as dest"));
        assert!(source_text.contains("alpha [dest.alpha]"));
        assert!(!source_text.contains("from \"./lib.rq\" import foo"));
        assert!(!source_text.contains("uses [foo]"));
        assert!(dest_text.contains("from \"./lib.rq\" import foo"));
        assert!(dest_text.contains("alpha {"));
        assert!(dest_text.contains("uses [foo]"));
    }

    #[test]
    fn move_rejects_a_destination_that_already_declares_the_idea() {
        let error = plan_idea_move(
            "file:///tmp/source.rq",
            "alpha {\n    body\n}\n",
            "file:///tmp/dest.rq",
            "alpha {\n    other\n}\n",
            "alpha",
            false,
            &[],
        );
        assert_eq!(error, Err(PlanError::DestinationHasIdea));
    }
}
