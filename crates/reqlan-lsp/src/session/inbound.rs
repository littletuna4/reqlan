//! Host-pushed inbound references: the file CodeLens and reference inlay hints.
//! rq:["../../../../reqlan rq/extension/language/vsc-primitives.rq".inlay_hints]
//! rq:["../../../../reqlan rq/extension/language/vsc-primitives.rq".codelens]
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".file_inbound_code_lens]
//! rq:["../../../../reqlan rq/indexer/cache-reuse.rq".inbound_snapshot_events]
//! rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq".lazy_features_after_outbound]

use lsp_types::{CodeLens, Command, InlayHint, Range};

use crate::analysis::InboundReferencer;

use super::records::Session;

impl Session {
    pub fn note_inbound(
        &mut self,
        uri: &str,
        names: Vec<(String, Vec<InboundReferencer>)>,
        file_referencers: Vec<InboundReferencer>,
    ) {
        self.inbound_names.insert(uri.to_string(), names);
        self.file_referencers.insert(uri.to_string(), file_referencers);
    }

    pub fn code_lenses(&self, uri: &str) -> Vec<CodeLens> {
        let count = self.file_inbound_count(uri);
        if count == 0 {
            return Vec::new();
        }
        vec![CodeLens {
            range: Range::default(),
            command: Some(Command {
                title: format!("{count} inbound file references"),
                command: "reqlan.openInboundFileReferencesSummary".into(),
                arguments: Some(vec![serde_json::json!(uri)]),
            }),
            data: None,
        }]
    }

    pub fn inlays(&self, uri: &str) -> Vec<InlayHint> {
        if !self.reference_inlay_hints {
            return Vec::new();
        }
        let Some(doc) = self.documents.get(uri) else {
            return Vec::new();
        };
        let names = self.idea_inbound_names(uri);
        doc.model.inlays(uri, &names)
    }

    fn idea_inbound_names(&self, uri: &str) -> Vec<(String, Vec<InboundReferencer>)> {
        // Snapshot-first: once the host pushes for this URI, never open SQLite here.
        if let Some(pushed) = self.inbound_names.get(uri) {
            return pushed
                .iter()
                .map(|(idea, names)| (idea.clone(), sort_referencers(names.clone())))
                .collect();
        }
        Vec::new()
    }

    fn file_inbound_count(&self, uri: &str) -> u32 {
        if let Some(rows) = self.file_referencers.get(uri) {
            return rows.len() as u32;
        }
        0
    }
}

fn sort_referencers(mut referencers: Vec<InboundReferencer>) -> Vec<InboundReferencer> {
    referencers.sort_by(|left, right| left.name.cmp(&right.name));
    referencers.dedup_by(|left, right| left.name == right.name);
    referencers
}
