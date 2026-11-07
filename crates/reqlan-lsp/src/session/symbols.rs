//! Workspace symbol search over open buffers and the ideas index.
//! rq:["../../../../reqlan rq/extension/language/support/ts-lsp-vs-rust-gaps.rq.lsp_migration_remainder]

use std::collections::HashSet;

use lsp_types::{Position, Range};

use crate::duty::{Checkpoint, Idle, Stopped};

use super::index::indexed_file_uri;
use super::records::Session;
use super::support::utf16_len_name;

impl Session {
    /// Workspace symbols from the open buffers and a prefix query on the ideas index.
    pub fn workspace_symbols(&self, query: &str) -> Vec<lsp_types::WorkspaceSymbol> {
        self.workspace_symbols_with(query, &mut Idle).unwrap_or_default()
    }

    pub fn workspace_symbols_with(
        &self,
        query: &str,
        tick: &mut dyn Checkpoint,
    ) -> Result<Vec<lsp_types::WorkspaceSymbol>, Stopped> {
        let needle = query.to_lowercase();
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        let documents = self.documents.len().max(1) as u32;
        for (index, (uri, doc)) in self.documents.iter().enumerate() {
            if tick.tick("Searching workspace", index as u32, documents) {
                return Err(Stopped);
            }
            for loc in &doc.model.names {
                if !name_matches(&loc.name, &needle) {
                    continue;
                }
                seen.insert(loc.name.clone());
                let url = lsp_types::Url::parse(uri)
                    .unwrap_or_else(|_| lsp_types::Url::parse("file:///reqlan.rq").unwrap());
                out.push(lsp_types::WorkspaceSymbol {
                    name: loc.name.clone(),
                    kind: lsp_types::SymbolKind::NAMESPACE,
                    tags: None,
                    container_name: None,
                    location: lsp_types::OneOf::Left(lsp_types::Location {
                        uri: url,
                        range: loc.range.clone(),
                    }),
                    data: None,
                });
            }
        }
        let indexes = self.indexes.len().max(1) as u32;
        for (index_no, index) in self.indexes.iter().enumerate() {
            if tick.tick("Searching workspace", index_no as u32, indexes) {
                return Err(Stopped);
            }
            let Ok(rows) = index.store().idea_names_with_prefix(query, 80) else {
                continue;
            };
            for row in rows {
                if !name_matches(&row.name, &needle) {
                    continue;
                }
                if !seen.insert(row.name.clone()) {
                    continue;
                }
                let Some(file_uri) = indexed_file_uri(index, &row.file_uri) else {
                    continue;
                };
                let url = lsp_types::Url::parse(&file_uri)
                    .unwrap_or_else(|_| lsp_types::Url::parse("file:///reqlan.rq").unwrap());
                out.push(lsp_types::WorkspaceSymbol {
                    name: row.name.clone(),
                    kind: lsp_types::SymbolKind::MODULE,
                    tags: None,
                    container_name: None,
                    location: lsp_types::OneOf::Left(lsp_types::Location {
                        uri: url,
                        range: Range {
                            start: Position { line: row.line_start, character: 0 },
                            end: Position {
                                line: row.line_start,
                                character: utf16_len_name(&row.name),
                            },
                        },
                    }),
                    data: None,
                });
            }
        }
        Ok(out)
    }
}

fn name_matches(name: &str, needle: &str) -> bool {
    needle.is_empty() || name.to_lowercase().contains(needle)
}
