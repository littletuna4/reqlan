//! Completion: attribute, import path, qualified file, and reference sites.
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax.rq".code_completion]
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_replaces_the_tail]
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion]
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_objects]
//! rq:["../../../../reqlan rq/indexer/cache-reuse.rq".path_completion_listing_cache]
//! rq:["../../../../reqlan rq/indexer/cache-reuse.rq".avoid_full_list_all_ideas]
use std::collections::HashSet;
use std::path::{Path, PathBuf};

use lsp_types::{
    CompletionItem, CompletionItemKind, CompletionList, CompletionTextEdit, Position, TextEdit, Url,
};
use reqlan_index::IdeaKind;
use reqlan_parse::{Import, Model};

use crate::code_actions::plan_from_import_edit;
use crate::duty::{Checkpoint, Idle, Stopped};
use crate::path_completion::{
    collect_path_items, detect_site, file_symbols, merge_tail, relative_path_between,
    CompletionSite, FileSymbols, PathEdit,
};

use super::index::indexed_file_uri;
use super::records::Session;
use super::support::path_of_file;

impl Session {
    pub fn path_completion_directory_reads(&self) -> u64 {
        self.path_cache.directory_reads()
    }

    pub fn completion(&mut self, uri: &str, pos: Position) -> CompletionList {
        self.completion_with(uri, pos, &mut Idle).unwrap_or_else(|_| completion_list(Vec::new()))
    }

    pub fn completion_with(
        &mut self,
        uri: &str,
        pos: Position,
        tick: &mut dyn Checkpoint,
    ) -> Result<CompletionList, Stopped> {
        if tick.tick("Completing", 0, 1) {
            return Err(Stopped);
        }
        let attribute_items = self.documents.get(uri).and_then(|doc| {
            doc.model
                .attribute_completion_site(pos)
                .then(|| doc.model.completion(pos, &self.attribute_catalog))
        });
        if let Some(items) = attribute_items {
            return Ok(completion_list(items));
        }
        if !self.documents.contains_key(uri) {
            return Ok(completion_list(Vec::new()));
        }
        let site = self
            .documents
            .get(uri)
            .and_then(|doc| detect_site(&doc.model.text, &doc.model.lines, pos));
        match site {
            Some(CompletionSite::ImportPath(edit)) => {
                // Prose that starts with `from "` is not an import site: the parsed
                // model must have an import statement on the cursor line.
                let confirmed = self
                    .documents
                    .get(uri)
                    .is_some_and(|doc| import_statement_on_line(doc.model.syntax(), pos.line));
                if confirmed {
                    self.path_items(uri, &edit, Some(".rq"), tick)
                } else {
                    Ok(completion_list(Vec::new()))
                }
            }
            Some(CompletionSite::AnonymousPath(edit)) => self.path_items(uri, &edit, None, tick),
            Some(CompletionSite::QualifiedFile { path, edit }) => {
                Ok(self.qualified_items(uri, &path, &edit))
            }
            Some(CompletionSite::Reference(edit)) => Ok(self.reference_items(uri, &edit)),
            None => Ok(completion_list(Vec::new())),
        }
    }

    fn path_items(
        &mut self,
        uri: &str,
        edit: &PathEdit,
        extension: Option<&str>,
        tick: &mut dyn Checkpoint,
    ) -> Result<CompletionList, Stopped> {
        let (from, roots, workspace) = {
            let Some(doc) = self.documents.get(uri) else {
                return Ok(completion_list(Vec::new()));
            };
            (
                doc.path.clone(),
                doc.model.roots.clone(),
                doc.model.workspace_root().map(Path::to_path_buf),
            )
        };
        let Some(from) = from else {
            return Ok(completion_list(Vec::new()));
        };
        let open_files: Vec<PathBuf> =
            self.documents.values().filter_map(|doc| doc.path.clone()).collect();
        let items = collect_path_items(
            &mut self.path_cache,
            &from,
            workspace.as_deref(),
            &roots,
            edit,
            extension,
            &open_files,
            tick,
        )?;
        Ok(completion_list(items))
    }

    fn qualified_items(&mut self, uri: &str, authored: &str, edit: &PathEdit) -> CompletionList {
        let resolved = self.documents.get(uri).and_then(|doc| doc.model.resolve_path(authored));
        let symbols = resolved
            .as_ref()
            .map(|path| self.symbols_at(path))
            .unwrap_or_else(|| FileSymbols { names: Vec::new(), sets: Vec::new() });
        completion_list(qualified_completion_items(&symbols, authored, edit))
    }

    fn symbols_at(&mut self, path: &Path) -> FileSymbols {
        if let Some(symbols) = self.open_doc_at(path).map(|doc| file_symbols(doc.model.syntax())) {
            return symbols;
        }
        self.ensure_neighbor(path)
            .map(|neighbor| file_symbols(&neighbor.model))
            .unwrap_or(FileSymbols { names: Vec::new(), sets: Vec::new() })
    }

    fn reference_items(&mut self, uri: &str, edit: &PathEdit) -> CompletionList {
        let prefix = edit.prefix.as_str();
        if let Some((qualifier, member_prefix)) = prefix.split_once('.') {
            return completion_list(self.dotted_reference_items(
                uri,
                qualifier,
                member_prefix,
                edit,
            ));
        }
        let (from, locals) = {
            let Some(doc) = self.documents.get(uri) else {
                return completion_list(Vec::new());
            };
            (doc.path.clone(), file_symbols(doc.model.syntax()).names)
        };
        let mut items = Vec::new();
        let mut seen = HashSet::new();
        for (name, _) in locals {
            if !prefix.is_empty() && !name.starts_with(prefix) {
                continue;
            }
            if !seen.insert(format!("local::{name}")) {
                continue;
            }
            items.push(reference_item(&name, true, None, None, edit));
        }
        let mut remote = 0usize;
        for (doc_uri, other) in &self.documents {
            if doc_uri == uri {
                continue;
            }
            let Some(path) = &other.path else {
                continue;
            };
            let file_uri = Url::from_file_path(path)
                .map(|url| url.to_string())
                .unwrap_or_else(|_| doc_uri.clone());
            for (name, importable) in file_symbols(other.model.syntax()).names {
                if self.push_remote_item(
                    uri,
                    prefix,
                    edit,
                    &from,
                    &name,
                    &file_uri,
                    importable,
                    &mut items,
                    &mut seen,
                    &mut remote,
                ) {
                    return completion_list(items);
                }
            }
        }
        for index in &self.indexes {
            let Ok(rows) = index.store().idea_names_with_prefix(prefix, 80) else {
                continue;
            };
            for row in rows {
                let Some(file_uri) = indexed_file_uri(index, &row.file_uri) else {
                    continue;
                };
                if self.push_remote_item(
                    uri,
                    prefix,
                    edit,
                    &from,
                    &row.name,
                    &file_uri,
                    row.kind != IdeaKind::Ideaset,
                    &mut items,
                    &mut seen,
                    &mut remote,
                ) {
                    return completion_list(items);
                }
            }
        }
        completion_list(items)
    }

    /// Dotted references complete ideaset members (`set.member`) from open
    /// documents and from the ideas index, so closed indexed files contribute too.
    /// Namespace-import members (`alias.member`) reach closed files through
    /// on-demand parse. Dotted members are not importable, so the index rows
    /// carry no import path.
    fn dotted_reference_items(
        &mut self,
        uri: &str,
        qualifier: &str,
        member_prefix: &str,
        edit: &PathEdit,
    ) -> Vec<CompletionItem> {
        let mut items = Vec::new();
        let mut seen = HashSet::new();
        for doc in self.documents.values() {
            let symbols = file_symbols(doc.model.syntax());
            for label in ideaset_member_labels(&symbols, qualifier, member_prefix) {
                if seen.insert(label.clone()) {
                    items.push(reference_item(&label, false, None, None, edit));
                }
            }
        }
        for index in &self.indexes {
            let Ok(rows) = index.store().set_member_names(qualifier, 80) else {
                continue;
            };
            for row in rows {
                if !member_prefix.is_empty() && !row.name.starts_with(member_prefix) {
                    continue;
                }
                let label = format!("{qualifier}.{}", row.name);
                if seen.insert(label.clone()) {
                    items.push(reference_item(&label, false, None, None, edit));
                }
            }
        }
        let alias_paths: Vec<String> = self
            .documents
            .get(uri)
            .map(|doc| {
                doc.model
                    .syntax()
                    .imports
                    .iter()
                    .filter_map(|import| match import {
                        Import::Namespace(namespace)
                            if namespace.alias.as_deref() == Some(qualifier) =>
                        {
                            Some(namespace.path.clone())
                        }
                        _ => None,
                    })
                    .collect()
            })
            .unwrap_or_default();
        for path in alias_paths {
            let resolved = self.documents.get(uri).and_then(|doc| doc.model.resolve_path(&path));
            let Some(resolved) = resolved else {
                continue;
            };
            let symbols = self.symbols_at(&resolved);
            for label in dotted_member_labels(&symbols, member_prefix) {
                let full = format!("{qualifier}.{label}");
                if seen.insert(full.clone()) {
                    items.push(reference_item(&full, false, None, None, edit));
                }
            }
        }
        items
    }

    /// `true` when the remote list is full.
    #[allow(clippy::too_many_arguments)]
    fn push_remote_item(
        &self,
        uri: &str,
        prefix: &str,
        edit: &PathEdit,
        from: &Option<PathBuf>,
        name: &str,
        file_uri: &str,
        importable: bool,
        items: &mut Vec<CompletionItem>,
        seen: &mut HashSet<String>,
        remote: &mut usize,
    ) -> bool {
        if *remote >= 80 {
            return true;
        }
        if !prefix.is_empty() && !name.starts_with(prefix) {
            return false;
        }
        let target = path_of_file(file_uri);
        let same = match (from, &target) {
            (Some(from), Some(target)) => from == target,
            _ => file_uri == uri,
        };
        if same || !seen.insert(format!("{file_uri}::{name}")) {
            return false;
        }
        let import_path = from
            .as_ref()
            .zip(target.as_ref())
            .and_then(|(from, target)| relative_path_between(from, target));
        let auto_import = if importable {
            self.documents.get(uri).and_then(|doc| {
                import_path.as_ref().and_then(|path| {
                    plan_from_import_edit(
                        &doc.model.text,
                        &doc.model.lines,
                        doc.model.syntax(),
                        path,
                        name,
                    )
                })
            })
        } else {
            None
        };
        items.push(reference_item(name, false, import_path, auto_import, edit));
        *remote += 1;
        false
    }
}

fn completion_list(items: Vec<CompletionItem>) -> CompletionList {
    CompletionList { is_incomplete: true, items }
}

/// Members of ideaset `set` whose name starts with `member_prefix`, labeled `set.member`.
fn ideaset_member_labels(symbols: &FileSymbols, set: &str, member_prefix: &str) -> Vec<String> {
    symbols
        .sets
        .iter()
        .filter(|(name, _)| name == set)
        .flat_map(|(_, members)| {
            members
                .iter()
                .filter(|member| member.starts_with(member_prefix))
                .map(|member| format!("{set}.{member}"))
                .collect::<Vec<_>>()
        })
        .collect()
}

/// Declared names whose name starts with `prefix`.
fn flat_labels(symbols: &FileSymbols, prefix: &str) -> Vec<String> {
    symbols
        .names
        .iter()
        .filter(|(name, _)| name.starts_with(prefix))
        .map(|(name, _)| name.clone())
        .collect()
}

/// Dotted labels inside one file: `set.member` when the member part names an
/// ideaset, otherwise the declared names.
fn dotted_member_labels(symbols: &FileSymbols, member_prefix: &str) -> Vec<String> {
    match member_prefix.split_once('.') {
        Some((set, rest)) => ideaset_member_labels(symbols, set, rest),
        None => flat_labels(symbols, member_prefix),
    }
}

/// An import site counts only when the parsed model has an import statement on the
/// cursor line. Prose lines that start with `from "` inside a body stay prose.
fn import_statement_on_line(model: &Model, line: u32) -> bool {
    model.imports.iter().any(|import| {
        let span = match import {
            Import::From(import) => import.span,
            Import::Namespace(import) => import.span,
            Import::Qualified(import) => import.span,
            Import::InvalidFrom(import) => import.span,
        };
        span.line_start <= line && line <= span.line_end
    })
}

fn qualified_completion_items(
    symbols: &FileSymbols,
    authored: &str,
    edit: &PathEdit,
) -> Vec<CompletionItem> {
    let labels = match edit.prefix.split_once('.') {
        Some((set, member_prefix)) => ideaset_member_labels(symbols, set, member_prefix),
        None => flat_labels(symbols, &edit.prefix),
    };
    labels
        .into_iter()
        .map(|label| CompletionItem {
            label: label.clone(),
            kind: Some(CompletionItemKind::REFERENCE),
            detail: Some(authored.to_string()),
            text_edit: Some(CompletionTextEdit::Edit(TextEdit {
                range: edit.replace,
                new_text: merge_tail(&label, &edit.prefix, &edit.tail),
            })),
            ..CompletionItem::default()
        })
        .collect()
}

fn reference_item(
    name: &str,
    local: bool,
    detail: Option<String>,
    auto_import: Option<TextEdit>,
    site: &PathEdit,
) -> CompletionItem {
    CompletionItem {
        label: name.to_string(),
        kind: Some(if local { CompletionItemKind::CLASS } else { CompletionItemKind::REFERENCE }),
        detail,
        additional_text_edits: auto_import.map(|edit| vec![edit]),
        text_edit: Some(CompletionTextEdit::Edit(TextEdit {
            range: site.replace,
            new_text: merge_tail(name, &site.prefix, &site.tail),
        })),
        ..CompletionItem::default()
    }
}
