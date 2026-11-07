//! Diagnostics for open buffers and comment documents, in hot, full, and confirm-pass forms.
//! rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq.open_file_hot_path]
//! rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq.missing_reference_colour_sequence]
//! rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq.lazy_features_after_outbound]

use std::collections::HashSet;

use lsp_types::Diagnostic;

use crate::duty::{Checkpoint, Idle, Stopped};

use super::records::Session;

impl Session {
    /// Hot-path diagnostics: this buffer plus import neighbors. No path-qualified confirm.
    pub fn diagnostics_hot(&mut self, uri: &str) -> Vec<Diagnostic> {
        self.diagnostics_with(uri, false, &mut Idle).unwrap_or_default()
    }

    /// Full diagnostics after qualified neighbor confirm.
    pub fn diagnostics(&mut self, uri: &str) -> Vec<Diagnostic> {
        self.diagnostics_with(uri, true, &mut Idle).unwrap_or_default()
    }

    /// Confirm-pass diagnostics. `Err` means a newer client message is waiting.
    pub fn diagnostics_checked(
        &mut self,
        uri: &str,
        tick: &mut dyn Checkpoint,
    ) -> Result<Vec<Diagnostic>, Stopped> {
        self.diagnostics_with(uri, true, tick)
    }

    fn diagnostics_with(
        &mut self,
        uri: &str,
        confirm_path_qualified: bool,
        tick: &mut dyn Checkpoint,
    ) -> Result<Vec<Diagnostic>, Stopped> {
        if tick.tick("Checking references", 0, 1) {
            return Err(Stopped);
        }
        if self.comments.contains_key(uri) {
            return Ok(self.comment_diagnostics_for(uri));
        }
        let Some(doc) = self.documents.get(uri) else {
            return Ok(Vec::new());
        };
        let path = doc.path.clone();
        let roots = doc.model.roots.clone();
        let mut outbound = doc.model.import_neighbor_queries();
        if confirm_path_qualified {
            outbound.extend(doc.model.qualified_neighbor_queries());
        }
        let total = outbound.len().max(1) as u32;
        let mut confirmed = HashSet::new();
        let mut alias_confirmed = HashSet::new();
        if let Some(from) = path.as_deref() {
            for (index, (authored, idea)) in outbound.into_iter().enumerate() {
                if tick.tick("Checking references", index as u32, total) {
                    return Err(Stopped);
                }
                if self.neighbor_has(from, &authored, &idea, &roots) {
                    confirmed.insert((authored, idea));
                } else if self.neighbor_binds_import(from, &authored, &idea, &roots) {
                    alias_confirmed.insert((authored, idea));
                }
            }
        }
        let parsed = {
            let Some(doc) = self.documents.get(uri) else {
                return Ok(Vec::new());
            };
            doc.model.diagnostics(
                |authored, idea| confirmed.contains(&(authored.to_string(), idea.to_string())),
                |authored, idea| {
                    alias_confirmed.contains(&(authored.to_string(), idea.to_string()))
                },
                confirm_path_qualified,
            )
        };
        let mut out = parsed;
        if let Some(doc) = self.documents.remove(uri) {
            if let Some(path) = doc.path.as_deref().filter(|_| doc.model.text.contains("rq:")) {
                out.extend(self.comment_diagnostics(&doc.model.text, path));
            }
            self.documents.insert(uri.to_string(), doc);
        }
        Ok(out)
    }

    pub fn comment_diagnostics_for(&mut self, uri: &str) -> Vec<Diagnostic> {
        let Some(doc) = self.comments.get(uri) else {
            return Vec::new();
        };
        let text = doc.text.clone();
        let path = doc.path.clone();
        self.comment_diagnostics(&text, &path)
    }
}
