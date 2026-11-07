//! Code actions, with quick fixes ranked against workspace symbols.
//! rq:["../../../../reqlan rq/extension/language/vsc-primitives.rq".code_actions]

use std::collections::HashSet;

use lsp_types::{CodeActionOrCommand, Diagnostic, Range};
use reqlan_index::IdeaKind;

use crate::code_actions::{import_fix_names, SymbolHit};

use super::index::indexed_file_uri;
use super::records::Session;

impl Session {
    pub fn code_actions(&mut self, uri: &str, range: Range) -> Vec<CodeActionOrCommand> {
        self.code_actions_for(uri, range, &[], &[])
    }

    pub fn code_actions_for(
        &mut self,
        uri: &str,
        range: Range,
        context_diagnostics: &[Diagnostic],
        only: &[String],
    ) -> Vec<CodeActionOrCommand> {
        let names = self.documents.get(uri).map(|doc| {
            import_fix_names(
                doc.model.syntax(),
                &doc.model.lines,
                &doc.model.text,
                context_diagnostics,
            )
        });
        let Some(names) = names else {
            return Vec::new();
        };
        let symbols = self.symbols_named(uri, &names);
        let server_diagnostics = self.diagnostics(uri);
        self.documents
            .get(uri)
            .map(|doc| {
                let workspace_files = self.workspace_files();
                doc.model.code_actions(
                    range,
                    uri,
                    context_diagnostics,
                    only,
                    &server_diagnostics,
                    &symbols,
                    &workspace_files,
                )
            })
            .unwrap_or_default()
    }

    /// All workspace `.rq` file URIs (open buffers + index rows), used to rank
    /// file-reference quick fixes when a path no longer exists.
    fn workspace_files(&self) -> Vec<String> {
        let mut out: Vec<String> = self.documents.keys().cloned().collect();
        for index in &self.indexes {
            let Ok(uris) = index.store().list_document_uris() else {
                continue;
            };
            for uri in &uris {
                if !out.contains(uri) {
                    out.push(uri.clone());
                }
            }
        }
        out.sort();
        out.dedup();
        out
    }

    fn symbols_named(&self, from_uri: &str, names: &HashSet<String>) -> Vec<SymbolHit> {
        if names.is_empty() {
            return Vec::new();
        }
        let mut symbols = Vec::new();
        for (uri, doc) in &self.documents {
            if uri == from_uri {
                continue;
            }
            for (name, kind) in doc.model.exported_names() {
                if !names.contains(&name) {
                    continue;
                }
                symbols.push(SymbolHit { name, kind: kind.to_string(), file_uri: uri.clone() });
            }
        }
        for index in &self.indexes {
            for name in names {
                let Ok(rows) = index.store().ideas_named(name) else {
                    continue;
                };
                for row in rows {
                    if matches!(row.kind, IdeaKind::Ideaset) {
                        continue;
                    }
                    let Some(file_uri) = indexed_file_uri(index, &row.file_uri) else {
                        continue;
                    };
                    let kind = match row.kind {
                        IdeaKind::Oneliner => "oneliner",
                        IdeaKind::Block => "idea",
                        IdeaKind::Ideaset => "ideaset",
                    };
                    symbols.push(SymbolHit { name: row.name, kind: kind.to_string(), file_uri });
                }
            }
        }
        symbols
    }
}
