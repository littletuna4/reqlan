//! Base ideas-index queries shared by rename, references, completion, and code actions.
//! rq:["../../../../reqlan rq/indexer/indexer.rq".index]
//! rq:["../../../../reqlan rq/indexer/cache-reuse.rq".avoid_full_list_all_ideas]
use std::collections::HashSet;
use std::path::{Path, PathBuf};

use lsp_types::{Location, Position, Range, Url};
use reqlan_index::idea_id;

use crate::duty::{Checkpoint, Stopped};

use super::records::{BaseIndex, Session};
use super::support::utf16_len_name;

impl Session {
    pub(super) fn index_rename_texts(
        &self,
        idea: &str,
        tick: &mut dyn Checkpoint,
    ) -> Result<Vec<(String, String)>, Stopped> {
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        let total = self.indexes.len().max(1) as u32;
        for (index_no, index) in self.indexes.iter().enumerate() {
            if tick.tick("Renaming", index_no as u32, total) {
                return Err(Stopped);
            }
            let Ok(ideas) = index.store().ideas_named(idea) else {
                continue;
            };
            for row in ideas {
                let id = idea_id(&row.file_uri, &row.name);
                let Ok(edges) = index.store().get_edges_to(&id) else {
                    continue;
                };
                let mut files = HashSet::new();
                files.insert(row.file_uri.clone());
                for edge in edges {
                    if let Some(source) = edge.source_id.split_once('#').map(|(file, _)| file) {
                        files.insert(source.to_string());
                    }
                }
                for relative in files {
                    let path = if Path::new(&relative).is_absolute() {
                        PathBuf::from(&relative)
                    } else {
                        index.root.join(&relative)
                    };
                    let Ok(file_uri) = Url::from_file_path(&path) else {
                        continue;
                    };
                    let file_uri = file_uri.to_string();
                    if !seen.insert(file_uri.clone()) {
                        continue;
                    }
                    if let Ok(text) = std::fs::read_to_string(&path) {
                        out.push((file_uri, text));
                    }
                }
            }
        }
        Ok(out)
    }

    pub(super) fn index_reference_locations(
        &self,
        idea: &str,
        tick: &mut dyn Checkpoint,
    ) -> Result<Vec<Location>, Stopped> {
        let mut out = Vec::new();
        let total = self.indexes.len().max(1) as u32;
        for (index_no, index) in self.indexes.iter().enumerate() {
            if tick.tick("Finding references", index_no as u32, total) {
                return Err(Stopped);
            }
            let Ok(ideas) = index.store().ideas_named(idea) else {
                continue;
            };
            for row in ideas {
                let path = if Path::new(&row.file_uri).is_absolute() {
                    PathBuf::from(&row.file_uri)
                } else {
                    index.root.join(&row.file_uri)
                };
                if let Ok(uri) = Url::from_file_path(&path) {
                    out.push(Location {
                        uri,
                        range: Range {
                            start: Position { line: row.line_start, character: 0 },
                            end: Position {
                                line: row.line_start,
                                character: utf16_len_name(&row.name),
                            },
                        },
                    });
                }
                let id = idea_id(&row.file_uri, &row.name);
                let Ok(edges) = index.store().get_edges_to(&id) else {
                    continue;
                };
                for edge in edges {
                    let Some((source_file, _)) = edge.source_id.split_once('#') else {
                        continue;
                    };
                    let path = if Path::new(source_file).is_absolute() {
                        PathBuf::from(source_file)
                    } else {
                        index.root.join(source_file)
                    };
                    let Ok(uri) = Url::from_file_path(&path) else {
                        continue;
                    };
                    let line = edge.source_line.unwrap_or(0);
                    out.push(Location {
                        uri,
                        range: Range {
                            start: Position { line, character: 0 },
                            end: Position { line, character: utf16_len_name(idea) },
                        },
                    });
                }
            }
        }
        Ok(out)
    }
}

pub(super) fn indexed_file_uri(index: &BaseIndex, file_uri: &str) -> Option<String> {
    let path = if Path::new(file_uri).is_absolute() {
        PathBuf::from(file_uri)
    } else {
        index.root.join(file_uri)
    };
    Url::from_file_path(path).ok().map(|url| url.to_string())
}
