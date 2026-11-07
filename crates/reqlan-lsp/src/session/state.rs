//! Session lifecycle: construction, settings, workspace and base registration, and document open, change, and close.
//! rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq".open_file_algorithm]
//! rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq".ast_lifecycle]

use std::cell::RefCell;
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};

use lsp_types::{TextDocumentContentChangeEvent, Url};
use reqlan_index::IndexStore;

use crate::analysis::{AttributeCatalog, DocModel};
use crate::path_completion::PathCompletionCache;

use super::records::{BaseIndex, CommentDoc, OpenDoc, Session};

impl Session {
    pub fn new() -> Self {
        Self {
            documents: HashMap::new(),
            comments: HashMap::new(),
            folders: Vec::new(),
            indexes: Vec::new(),
            neighbors: VecDeque::new(),
            inbound_names: HashMap::new(),
            file_referencers: HashMap::new(),
            attribute_catalog: AttributeCatalog::endorsed(),
            idea_content_tooltip: true,
            reference_inlay_hints: false,
            path_cache: PathCompletionCache::new(),
        }
    }

    pub fn set_idea_content_tooltip(&mut self, enabled: bool) {
        self.idea_content_tooltip = enabled;
    }

    pub fn set_reference_inlay_hints(&mut self, enabled: bool) {
        self.reference_inlay_hints = enabled;
    }

    pub fn note_attribute_catalog(&mut self, catalog: AttributeCatalog) {
        self.attribute_catalog = catalog;
    }

    pub fn document_count(&self) -> usize {
        self.documents.len() + self.comments.len()
    }

    pub fn comment_uris(&self) -> Vec<String> {
        let mut uris: Vec<String> = self.comments.keys().cloned().collect();
        uris.sort();
        uris
    }

    pub fn set_workspace_folders(&mut self, folders: &[PathBuf]) {
        self.folders = folders.to_vec();
        self.indexes.clear();
        for folder in folders {
            open_base_index(&mut self.indexes, folder);
        }
    }

    /// Replace open indexes with the bases from the extension's one workspace scan.
    /// Does not walk the tree.
    /// rq:["../../../../reqlan rq/indexer/cache-reuse.rq".single_sync_walk]
    pub fn note_base_roots(&mut self, roots: &[PathBuf]) {
        self.indexes.clear();
        for root in roots {
            open_base_index(&mut self.indexes, root);
        }
    }

    pub fn open(&mut self, uri: &str, text: String) {
        if is_rq_uri(uri) {
            self.comments.remove(uri);
            let path = uri_to_path(uri);
            let workspace = self.alias_workspace(path.as_deref());
            let model = DocModel::parse(uri, text, path.as_deref(), workspace.as_deref());
            self.documents.insert(uri.to_string(), OpenDoc { model, path });
            return;
        }
        self.documents.remove(uri);
        let Some(path) = uri_to_path(uri) else {
            self.comments.remove(uri);
            return;
        };
        if !text.contains("rq:") {
            self.comments.remove(uri);
            return;
        }
        self.comments.insert(uri.to_string(), CommentDoc { text, path });
    }

    /// Reparse with the import roots loaded at open. A change does not read the config again.
    pub fn change(&mut self, uri: &str, text: String) {
        let Some(doc) = self.documents.remove(uri) else {
            return self.open(uri, text);
        };
        let workspace = self.alias_workspace(doc.path.as_deref());
        let model = DocModel::parse_with_roots(
            uri,
            text,
            doc.path.as_deref(),
            doc.model.roots,
            workspace.as_deref(),
        );
        self.documents.insert(uri.to_string(), OpenDoc { model, path: doc.path });
    }

    /// Splice incremental `didChange` edits, then reparse the whole buffer.
    /// An empty batch leaves the buffer. A ranged edit for a URI that is not open is dropped.
    /// A rangeless edit for an unknown URI opens that text.
    /// `.rq` buffers keep import roots via [Session::change]. Comment buffers go through [Session::open].
    /// rq:["../../../../reqlan rq/extension/language/support/ts-lsp-vs-rust-gaps.rq".lsp_incremental_sync]
    pub fn apply_content_changes(
        &mut self,
        uri: &str,
        changes: &[TextDocumentContentChangeEvent],
    ) -> bool {
        if changes.is_empty() {
            return false;
        }
        let Some(current) = self.buffer_text(uri) else {
            if changes[0].range.is_some() {
                return false;
            }
            let text = crate::utf16::apply_content_changes("", changes);
            self.open(uri, text);
            return true;
        };
        let text = crate::utf16::apply_content_changes(&current, changes);
        if self.documents.contains_key(uri) {
            self.change(uri, text);
        } else {
            self.open(uri, text);
        }
        true
    }

    fn buffer_text(&self, uri: &str) -> Option<String> {
        if let Some(doc) = self.documents.get(uri) {
            return Some(doc.model.text.clone());
        }
        self.comments.get(uri).map(|doc| doc.text.clone())
    }

    pub fn close(&mut self, uri: &str) {
        self.documents.remove(uri);
        self.comments.remove(uri);
        self.inbound_names.remove(uri);
        self.file_referencers.remove(uri);
    }
}

impl Default for Session {
    fn default() -> Self {
        Self::new()
    }
}

fn open_base_index(indexes: &mut Vec<BaseIndex>, folder: &Path) {
    let db = folder.join(".reqlan").join("ideas-index.sqlite");
    if let Ok(store) = IndexStore::open_read_only(&db) {
        indexes.push(BaseIndex { root: folder.to_path_buf(), store: RefCell::new(Some(store)) });
    }
}

pub(crate) fn is_rq_uri(uri: &str) -> bool {
    let path = uri.split('?').next().unwrap_or(uri);
    let path = path.split('#').next().unwrap_or(path);
    path.to_ascii_lowercase().ends_with(".rq")
}

fn uri_to_path(uri: &str) -> Option<PathBuf> {
    Url::parse(uri).ok()?.to_file_path().ok()
}
