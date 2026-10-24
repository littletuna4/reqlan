//! Unresolved import diagnostics (`import ...`, `from "..." import ...`).
//! rq:["../../../../reqlan rq/core_analysis/check.rq".check_unresolved_imports]
//! rq:["../../../../reqlan rq/extension/language/support/features-imports.rq".import_does_not_exist_error]
//! rq:["../../../../reqlan rq/extension/language/support/features-imports.rq".implicit_file_extension]
//! rq:["../../../../reqlan rq/extension/language/support/features-imports.rq".import_folder_targets]

use super::index::CheckIndex;
use super::{check_source_in_scope, BrokenReference, CheckReferencesOptions};
use crate::path_resolve::{
    is_remote_import_path, is_rq_uri, normalize_indexed_path, resolve_existing_import_path,
};
use crate::rq_ignore::is_line_rq_ignored;
use crate::store::StoreError;
use crate::types::EdgeKind;
use reqlan_parse::{
    parse_document, AttributeValue, BodyElement, Import, ImportRootMapping, ListItem, Model,
    ReferenceTarget, RichPart, TopLevelElement,
};
use std::collections::{HashMap, HashSet};
use std::path::Path;

pub(super) fn append_unresolved_import_rows(
    index: &CheckIndex,
    workspace_root: &Path,
    options: &CheckReferencesOptions<'_>,
    rows: &mut Vec<BrokenReference>,
    ignore_cache: &mut HashMap<String, HashSet<u32>>,
) -> Result<(), StoreError> {
    for file_uri in &index.indexed_rq_files {
        if !is_rq_uri(file_uri) || !check_source_in_scope(options, file_uri) {
            continue;
        }
        let path = workspace_root.join(file_uri);
        let Ok(source) = std::fs::read_to_string(&path) else {
            continue;
        };
        let import_roots = crate::import_roots_for_source(workspace_root, file_uri);
        let parsed = parse_document(&source);
        for import in &parsed.model.imports {
            push_unresolved_import_issues(
                index,
                import,
                file_uri,
                workspace_root,
                &import_roots,
                ignore_cache,
                rows,
            );
        }
    }
    Ok(())
}

fn push_unresolved_import_issues(
    index: &CheckIndex,
    import: &Import,
    source_file: &str,
    workspace_root: &Path,
    import_roots: &[ImportRootMapping],
    ignore_cache: &mut HashMap<String, HashSet<u32>>,
    rows: &mut Vec<BrokenReference>,
) {
    let Some((path, path_line, ideas)) = well_formed_import_parts(import) else {
        return;
    };
    if path.is_empty() || is_remote_import_path(path) {
        return;
    }
    match resolve_existing_import_path(workspace_root, source_file, path, import_roots) {
        None => {
            if !is_line_rq_ignored(workspace_root, source_file, Some(path_line), ignore_cache) {
                rows.push(import_issue(source_file, path, path_line));
            }
        }
        Some(resolved) => {
            let resolved = normalize_indexed_path(&resolved);
            for (idea, line) in ideas {
                if is_line_rq_ignored(workspace_root, source_file, Some(line), ignore_cache) {
                    continue;
                }
                if index.file_declares_idea(workspace_root, &resolved, &idea) {
                    continue;
                }
                rows.push(import_issue(source_file, &idea, line));
            }
        }
    }
}

type ImportSpecifierSites = Vec<(String, u32)>;

fn well_formed_import_parts(import: &Import) -> Option<(&str, u32, ImportSpecifierSites)> {
    match import {
        Import::InvalidFrom(_) => None,
        Import::From(from) if from.specifiers.is_empty() => None,
        Import::From(from) => {
            let ideas = from
                .specifiers
                .iter()
                .filter(|spec| !spec.idea.is_empty())
                .map(|spec| (spec.idea.clone(), spec.span.line_start))
                .collect();
            Some((from.path.as_str(), from.span.line_start, ideas))
        }
        Import::Namespace(ns) => Some((ns.path.as_str(), ns.span.line_start, Vec::new())),
        Import::Qualified(qualified) if qualified.idea.is_empty() => None,
        Import::Qualified(qualified) => Some((
            qualified.path.as_str(),
            qualified.span.line_start,
            vec![(qualified.idea.clone(), qualified.span.line_start)],
        )),
    }
}

fn import_issue(source_file: &str, label: &str, source_line: u32) -> BrokenReference {
    BrokenReference {
        file_uri: source_file.to_string(),
        source_id: None,
        source_name: None,
        kind: EdgeKind::Import.as_str().to_string(),
        label: label.to_string(),
        source_line: Some(source_line),
        snippet: None,
        severity: "error".to_string(),
        match_count: None,
    }
}

pub(super) fn append_unused_import_rows(
    index: &CheckIndex,
    workspace_root: &Path,
    options: &CheckReferencesOptions<'_>,
    rows: &mut Vec<BrokenReference>,
    ignore_cache: &mut HashMap<String, HashSet<u32>>,
) -> Result<(), StoreError> {
    use super::SparseWildcardHandling;
    let handling = options.unused_imports.unwrap_or(SparseWildcardHandling::Off);
    let Some(severity) = handling.severity() else {
        return Ok(());
    };
    for file_uri in &index.indexed_rq_files {
        if !is_rq_uri(file_uri) || !check_source_in_scope(options, file_uri) {
            continue;
        }
        let path = workspace_root.join(file_uri);
        let Ok(source) = std::fs::read_to_string(&path) else {
            continue;
        };
        let import_roots = crate::import_roots_for_source(workspace_root, file_uri);
        let parsed = parse_document(&source);
        let used_names = collect_used_names(&parsed.model);
        for import in &parsed.model.imports {
            push_unused_import_issues(
                index,
                import,
                file_uri,
                workspace_root,
                &import_roots,
                &used_names,
                severity,
                ignore_cache,
                rows,
            );
        }
    }
    Ok(())
}

fn collect_used_names(model: &Model) -> HashSet<String> {
    let mut names = HashSet::new();
    for element in &model.elements {
        match element {
            TopLevelElement::Idea(idea) => {
                collect_used_from_body(&idea.elements, &mut names);
            }
            TopLevelElement::OneLiner(one) => {
                collect_used_from_parts(&one.body, &mut names);
            }
            TopLevelElement::Anonymous(block) => {
                collect_used_from_body(&block.elements, &mut names);
            }
            TopLevelElement::IdeaSet(set) => {
                for member in &set.members {
                    if !member.is_empty() {
                        names.insert(member.clone());
                    }
                }
            }
        }
    }
    names
}

fn collect_used_from_body(elements: &[BodyElement], names: &mut HashSet<String>) {
    for elem in elements {
        match elem {
            BodyElement::BodyLine(line) => {
                collect_used_from_parts(&line.parts, names);
            }
            BodyElement::Attribute(attr) => match &attr.value {
                Some(AttributeValue::Scalar(scalar)) => {
                    collect_used_from_parts(&scalar.parts, names);
                }
                Some(AttributeValue::List(list)) => {
                    collect_used_from_list_items(&list.items, names);
                }
                Some(AttributeValue::Block(block)) => {
                    collect_used_from_body(&block.elements, names);
                }
                None => {}
            },
            BodyElement::NamedList(list) => {
                collect_used_from_list_items(&list.items, names);
            }
            BodyElement::NestedList(list) => {
                collect_used_from_list_items(&list.items, names);
            }
            BodyElement::CodeSnippet(_) => {}
        }
    }
}

fn collect_used_from_list_items(items: &[ListItem], names: &mut HashSet<String>) {
    for item in items {
        match item {
            ListItem::OneLiner(parts) => {
                collect_used_from_parts(parts, names);
            }
            ListItem::Anonymous(block) => {
                collect_used_from_body(&block.elements, names);
            }
            ListItem::NamedBlock(block) => {
                collect_used_from_body(&block.elements, names);
            }
            ListItem::Nested(list) => {
                collect_used_from_list_items(&list.items, names);
            }
        }
    }
}

fn collect_used_from_parts(parts: &[RichPart], names: &mut HashSet<String>) {
    for part in parts {
        match part {
            RichPart::BracketRef { target, .. } | RichPart::WikiLink { target, .. } => match target
            {
                ReferenceTarget::Local { idea, .. } => {
                    if !idea.is_empty() {
                        names.insert(idea.clone());
                    }
                }
                ReferenceTarget::Qualified { qualifier, idea, .. } => {
                    if let Some(q) = qualifier {
                        if !q.is_empty() {
                            names.insert(q.clone());
                        }
                    }
                    if !idea.is_empty() {
                        names.insert(idea.clone());
                    }
                }
                _ => {}
            },
            _ => {}
        }
    }
}

fn push_unused_import_issues(
    index: &CheckIndex,
    import: &Import,
    source_file: &str,
    workspace_root: &Path,
    import_roots: &[ImportRootMapping],
    used_names: &HashSet<String>,
    severity: &str,
    ignore_cache: &mut HashMap<String, HashSet<u32>>,
    rows: &mut Vec<BrokenReference>,
) {
    match import {
        Import::InvalidFrom(_) => {}
        Import::From(from) => {
            let Some(mut resolved) =
                resolve_existing_import_path(workspace_root, source_file, &from.path, import_roots)
            else {
                return;
            };
            resolved = normalize_indexed_path(&resolved);
            for spec in &from.specifiers {
                let idea = spec.idea.as_str();
                if idea.is_empty() {
                    continue;
                }
                if !index.file_declares_idea(workspace_root, &resolved, idea) {
                    continue;
                }
                let bound =
                    spec.alias.as_deref().filter(|a| !a.is_empty()).unwrap_or(idea).to_string();
                if bound.is_empty() || used_names.contains(&bound) {
                    continue;
                }
                let line = spec.span.line_start;
                if is_line_rq_ignored(workspace_root, source_file, Some(line), ignore_cache) {
                    continue;
                }
                rows.push(unused_import_issue(source_file, &bound, line, severity));
            }
            if from.specifiers.is_empty() {
                if let Some(alias) = from.alias.as_deref().filter(|a| !a.is_empty()) {
                    if used_names.contains(alias) {
                        return;
                    }
                    let line =
                        from.alias_span.as_ref().map_or(from.span.line_start, |s| s.line_start);
                    if is_line_rq_ignored(workspace_root, source_file, Some(line), ignore_cache) {
                        return;
                    }
                    rows.push(unused_import_issue(source_file, alias, line, severity));
                }
            }
        }
        Import::Namespace(ns) => {
            let Some(_) =
                resolve_existing_import_path(workspace_root, source_file, &ns.path, import_roots)
            else {
                return;
            };
            if let Some(alias) = ns.alias.as_deref().filter(|a| !a.is_empty()) {
                if used_names.contains(alias) {
                    return;
                }
                let line = ns.alias_span.as_ref().map_or(ns.span.line_start, |s| s.line_start);
                if is_line_rq_ignored(workspace_root, source_file, Some(line), ignore_cache) {
                    return;
                }
                rows.push(unused_import_issue(source_file, alias, line, severity));
            } else {
                let line = ns.span.line_start;
                if is_line_rq_ignored(workspace_root, source_file, Some(line), ignore_cache) {
                    return;
                }
                rows.push(unused_import_issue(
                    source_file,
                    &format!("\"{}\"", ns.path),
                    line,
                    severity,
                ));
            }
        }
        Import::Qualified(qualified) => {
            let idea = qualified.idea.as_str();
            if idea.is_empty() {
                return;
            }
            let Some(mut resolved) = resolve_existing_import_path(
                workspace_root,
                source_file,
                &qualified.path,
                import_roots,
            ) else {
                return;
            };
            resolved = normalize_indexed_path(&resolved);
            if !index.file_declares_idea(workspace_root, &resolved, idea) {
                return;
            }
            let bound =
                qualified.alias.as_deref().filter(|a| !a.is_empty()).unwrap_or(idea).to_string();
            if bound.is_empty() || used_names.contains(&bound) {
                return;
            }
            let line =
                qualified.alias_span.as_ref().map_or(qualified.span.line_start, |s| s.line_start);
            if is_line_rq_ignored(workspace_root, source_file, Some(line), ignore_cache) {
                return;
            }
            rows.push(unused_import_issue(source_file, &bound, line, severity));
        }
    }
}

fn unused_import_issue(
    source_file: &str,
    label: &str,
    source_line: u32,
    severity: &str,
) -> BrokenReference {
    BrokenReference {
        file_uri: source_file.to_string(),
        source_id: None,
        source_name: None,
        kind: "unused_import".to_string(),
        label: label.to_string(),
        source_line: Some(source_line),
        snippet: None,
        severity: severity.to_string(),
        match_count: None,
    }
}
