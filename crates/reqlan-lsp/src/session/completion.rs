//! Completion: attribute, import path, qualified file, and reference sites.
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax.rq.code_completion]
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq.reference_code_completion]
//! rq:["../../../../reqlan rq/indexer/cache-reuse.rq.path_completion_listing_cache]
//! rq:["../../../../reqlan rq/indexer/cache-reuse.rq.avoid_full_list_all_ideas]
use std::collections::HashSet;
use std::path::{Path, PathBuf};

use lsp_types::{
    CompletionItem, CompletionItemKind, CompletionList, CompletionTextEdit, Position, Range,
    TextEdit, Url,
};
use reqlan_index::IdeaKind;

use crate::code_actions::plan_from_import_edit;
use crate::duty::{Checkpoint, Idle, Stopped};
use crate::path_completion::{
    collect_path_items, detect_site, file_symbols, relative_path_between, CompletionSite,
    FileSymbols, PathEdit,
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
                self.path_items(uri, &edit, Some(".rq"), tick)
            }
            Some(CompletionSite::AnonymousPath(edit)) => self.path_items(uri, &edit, None, tick),
            Some(CompletionSite::QualifiedFile { path, idea_prefix, replace }) => {
                Ok(self.qualified_items(uri, &path, &idea_prefix, replace))
            }
            Some(CompletionSite::Reference { prefix, replace }) => {
                Ok(self.reference_items(uri, &prefix, replace))
            }
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
        let items = collect_path_items(
            &mut self.path_cache,
            &from,
            workspace.as_deref(),
            &roots,
            edit,
            extension,
            tick,
        )?;
        Ok(completion_list(items))
    }

    fn qualified_items(
        &mut self,
        uri: &str,
        authored: &str,
        idea_prefix: &str,
        replace: Range,
    ) -> CompletionList {
        let resolved = self.documents.get(uri).and_then(|doc| doc.model.resolve_path(authored));
        let symbols = resolved
            .as_ref()
            .map(|path| self.symbols_at(path))
            .unwrap_or_else(|| FileSymbols { names: Vec::new(), sets: Vec::new() });
        completion_list(qualified_completion_items(&symbols, idea_prefix, authored, replace))
    }

    fn symbols_at(&mut self, path: &Path) -> FileSymbols {
        if let Some(symbols) = self.open_doc_at(path).map(|doc| file_symbols(doc.model.syntax())) {
            return symbols;
        }
        self.ensure_neighbor(path)
            .map(|neighbor| file_symbols(&neighbor.model))
            .unwrap_or(FileSymbols { names: Vec::new(), sets: Vec::new() })
    }

    fn reference_items(&self, uri: &str, prefix: &str, replace: Range) -> CompletionList {
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
            items.push(reference_item(&name, true, None, None, replace));
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
                    replace,
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
                    replace,
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

    /// `true` when the remote list is full.
    fn push_remote_item(
        &self,
        uri: &str,
        prefix: &str,
        replace: Range,
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
        let edit = if importable {
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
        items.push(reference_item(name, false, import_path, edit, replace));
        *remote += 1;
        false
    }
}

fn completion_list(items: Vec<CompletionItem>) -> CompletionList {
    CompletionList { is_incomplete: true, items, ..CompletionList::default() }
}

fn qualified_completion_items(
    symbols: &FileSymbols,
    idea_prefix: &str,
    authored: &str,
    replace: Range,
) -> Vec<CompletionItem> {
    let labels = if let Some((qualifier, member_prefix)) = idea_prefix.split_once('.') {
        symbols
            .sets
            .iter()
            .filter(|(name, _)| name == qualifier)
            .flat_map(|(_, members)| {
                members
                    .iter()
                    .filter(|member| member.starts_with(member_prefix))
                    .map(|member| format!("{qualifier}.{member}"))
                    .collect::<Vec<_>>()
            })
            .collect::<Vec<_>>()
    } else {
        symbols
            .names
            .iter()
            .filter(|(name, _)| idea_prefix.is_empty() || name.starts_with(idea_prefix))
            .map(|(name, _)| name.clone())
            .collect()
    };
    labels
        .into_iter()
        .map(|label| CompletionItem {
            label: label.clone(),
            kind: Some(CompletionItemKind::REFERENCE),
            detail: Some(authored.to_string()),
            text_edit: Some(CompletionTextEdit::Edit(TextEdit { range: replace, new_text: label })),
            ..CompletionItem::default()
        })
        .collect()
}

fn reference_item(
    name: &str,
    local: bool,
    detail: Option<String>,
    edit: Option<TextEdit>,
    replace: Range,
) -> CompletionItem {
    CompletionItem {
        label: name.to_string(),
        kind: Some(if local { CompletionItemKind::CLASS } else { CompletionItemKind::REFERENCE }),
        detail,
        additional_text_edits: edit.map(|edit| vec![edit]),
        text_edit: Some(CompletionTextEdit::Edit(TextEdit {
            range: replace,
            new_text: name.to_string(),
        })),
        ..CompletionItem::default()
    }
}
