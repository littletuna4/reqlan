//! Rename across open buffers, comment documents, and index-tracked files.
//! rq:["../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_rename]
use std::collections::{HashMap, HashSet};

use lsp_types::{Position, Range, TextEdit, Url, WorkspaceEdit};

use crate::analysis::rename_edits;
use crate::duty::{Checkpoint, Idle, Stopped};
use crate::utf16::LineMap;

use super::records::Session;

impl Session {
    pub fn prepare_rename(&self, uri: &str, pos: Position) -> Option<Range> {
        self.documents.get(uri)?.model.prepare_rename(pos)
    }

    pub fn rename(&self, uri: &str, pos: Position, new_name: &str) -> Option<WorkspaceEdit> {
        self.rename_with(uri, pos, new_name, &mut Idle).ok().flatten()
    }

    pub fn rename_with(
        &self,
        uri: &str,
        pos: Position,
        new_name: &str,
        tick: &mut dyn Checkpoint,
    ) -> Result<Option<WorkspaceEdit>, Stopped> {
        let Some(old) = self.documents.get(uri).and_then(|doc| doc.model.name_at(pos)) else {
            return Ok(None);
        };
        let mut changes: HashMap<Url, Vec<TextEdit>> = HashMap::new();
        let mut touched: HashSet<String> = HashSet::new();
        let total = (self.documents.len() + self.comments.len() + self.indexes.len()).max(1) as u32;
        let mut done = 0u32;
        for (doc_uri, doc) in &self.documents {
            if tick.tick("Renaming", done, total) {
                return Err(Stopped);
            }
            done += 1;
            let edits = rename_edits(&doc.model.text, &doc.model.lines, &old, new_name);
            if !edits.is_empty() {
                if let Ok(url) = Url::parse(doc_uri) {
                    changes.insert(url, edits);
                    touched.insert(doc_uri.clone());
                }
            }
        }
        for (doc_uri, doc) in &self.comments {
            if tick.tick("Renaming", done, total) {
                return Err(Stopped);
            }
            done += 1;
            let edits = rename_edits(&doc.text, &LineMap::new(&doc.text), &old, new_name);
            if !edits.is_empty() {
                if let Ok(url) = Url::parse(doc_uri) {
                    changes.insert(url, edits);
                    touched.insert(doc_uri.clone());
                }
            }
        }
        for (file_uri, text) in self.index_rename_texts(&old, tick)? {
            if touched.contains(&file_uri) {
                continue;
            }
            let edits = rename_edits(&text, &LineMap::new(&text), &old, new_name);
            if edits.is_empty() {
                continue;
            }
            if let Ok(url) = Url::parse(&file_uri) {
                changes.insert(url, edits);
            }
        }
        if changes.is_empty() {
            Ok(None)
        } else {
            Ok(Some(WorkspaceEdit {
                changes: Some(changes),
                document_changes: None,
                change_annotations: None,
            }))
        }
    }
}
