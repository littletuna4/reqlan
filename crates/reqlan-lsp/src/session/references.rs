//! Find references across open buffers, comment documents, and the ideas index.
//! rq:["../../../../reqlan rq/extension/language/support/ts-lsp-vs-rust-gaps.rq.lsp_migration_remainder]
//! rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq.comment_backlink_sequence]
//! rq:["../../../../reqlan rq/indexer/cache-reuse.rq.avoid_full_list_all_ideas]
use std::collections::HashSet;

use lsp_types::{Location, Position, Url};
use reqlan_index::find_comment_references_in_text;

use crate::duty::{Checkpoint, Idle, Stopped};
use crate::utf16::LineMap;

use super::records::Session;

impl Session {
    pub fn references(&self, uri: &str, pos: Position) -> Vec<Location> {
        self.references_with(uri, pos, &mut Idle).unwrap_or_default()
    }

    pub fn references_with(
        &self,
        uri: &str,
        pos: Position,
        tick: &mut dyn Checkpoint,
    ) -> Result<Vec<Location>, Stopped> {
        if tick.tick("Finding references", 0, 1) {
            return Err(Stopped);
        }
        let Some(name) = self.documents.get(uri).and_then(|doc| doc.model.name_at(pos)) else {
            return Ok(Vec::new());
        };
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        let total = (self.documents.len() + self.comments.len()).max(1) as u32;
        let mut done = 0u32;
        for (doc_uri, doc) in &self.documents {
            if tick.tick("Finding references", done, total) {
                return Err(Stopped);
            }
            done += 1;
            for location in doc.model.reference_locations(doc_uri, &name) {
                let key = location_key(&location);
                if seen.insert(key) {
                    out.push(location);
                }
            }
        }
        for (doc_uri, doc) in &self.comments {
            if tick.tick("Finding references", done, total) {
                return Err(Stopped);
            }
            done += 1;
            let lines = LineMap::new(&doc.text);
            for reference in find_comment_references_in_text(&doc.text) {
                if reference.idea != name {
                    continue;
                }
                let location = Location {
                    uri: Url::parse(doc_uri)
                        .unwrap_or_else(|_| Url::parse("file:///reqlan.rq").expect("uri")),
                    range: lines.range(&doc.text, reference.start, reference.end),
                };
                let key = location_key(&location);
                if seen.insert(key) {
                    out.push(location);
                }
            }
        }
        for location in self.index_reference_locations(&name, tick)? {
            let key = location_key(&location);
            if seen.insert(key) {
                out.push(location);
            }
        }
        Ok(out)
    }
}

fn location_key(location: &Location) -> String {
    format!(
        "{}:{}:{}:{}:{}",
        location.uri,
        location.range.start.line,
        location.range.start.character,
        location.range.end.line,
        location.range.end.character
    )
}
