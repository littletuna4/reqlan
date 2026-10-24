//! Compact, single-materialisation snapshot of the ideas index used by `check`
//! and `list_broken_references`.
//! rq:["../../../../reqlan rq/core_analysis/check_oom.rq".check_single_index_snapshot]

use crate::comment::IdeaRef;
use crate::path_resolve::{is_rq_uri, rq_path_exists};
use crate::store::{IndexStore, StoreError};
use crate::types::{EdgeKind, IdeaKind};
use reqlan_parse::{import_path_candidates, parse_document};
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// Compact idea snapshot used by the bounded check intermediate repr.
/// rq:["../../../../reqlan rq/core_analysis/check_oom.rq".check_single_index_snapshot]
#[derive(Debug, Clone)]
pub struct CheckIdea {
    pub id: String,
    pub file_uri: String,
    pub name: String,
    pub kind: IdeaKind,
}

impl IdeaRef for CheckIdea {
    fn id(&self) -> &str {
        &self.id
    }
    fn name(&self) -> &str {
        &self.name
    }
    fn file_uri(&self) -> &str {
        &self.file_uri
    }
}

/// Compact edge snapshot.
/// rq:["../../../../reqlan rq/core_analysis/check_oom.rq".check_single_index_snapshot]
#[derive(Debug, Clone)]
pub struct CheckEdge {
    pub source_id: String,
    pub target_id: Option<String>,
    pub target_file: Option<String>,
    pub kind: EdgeKind,
    pub label: Option<String>,
    pub source_line: Option<u32>,
    pub snippet: Option<String>,
    pub is_resolved: Option<bool>,
}

/// Bounded intermediate repr: one full read of catalog + edges, then all phases
/// run against this compact structure. Avoids 3+ full materializations.
/// rq:["../../../../reqlan rq/core_analysis/check_oom.rq".check_single_index_snapshot]
#[derive(Debug)]
pub struct CheckIndex {
    pub ideas: Vec<CheckIdea>,
    pub idea_by_id: HashMap<String, usize>,
    pub local_ideas: HashSet<(String, String)>,
    pub ideas_by_file: HashMap<String, HashSet<String>>,
    pub edges: Vec<CheckEdge>,
    pub indexed_rq_files: HashSet<String>,
}

impl CheckIndex {
    pub fn build(store: &IndexStore) -> Result<Self, StoreError> {
        let catalog = store.all_idea_records()?;
        let edges = store.get_all_edges()?;
        let doc_uris = store.list_document_uris()?;
        let indexed_rq: HashSet<String> = doc_uris.into_iter().filter(|u| is_rq_uri(u)).collect();

        let mut idea_by_id: HashMap<String, usize> = HashMap::with_capacity(catalog.len());
        let mut local_ideas: HashSet<(String, String)> = HashSet::with_capacity(catalog.len());
        let mut ideas_by_file: HashMap<String, HashSet<String>> = HashMap::new();
        let mut ideas: Vec<CheckIdea> = Vec::with_capacity(catalog.len());
        for record in catalog {
            let i = ideas.len();
            idea_by_id.insert(record.id.clone(), i);
            local_ideas.insert((record.file_uri.clone(), record.name.clone()));
            ideas_by_file.entry(record.file_uri.clone()).or_default().insert(record.name.clone());
            ideas.push(CheckIdea {
                id: record.id,
                file_uri: record.file_uri,
                name: record.name,
                kind: record.kind,
            });
        }

        let check_edges: Vec<CheckEdge> = edges
            .into_iter()
            .map(|e| CheckEdge {
                source_id: e.source_id,
                target_id: e.target_id,
                target_file: e.target_file,
                kind: e.kind,
                label: e.label,
                source_line: e.source_line,
                snippet: e.snippet,
                is_resolved: e.is_resolved,
            })
            .collect();

        Ok(CheckIndex {
            ideas,
            idea_by_id,
            local_ideas,
            ideas_by_file,
            edges: check_edges,
            indexed_rq_files: indexed_rq,
        })
    }

    pub fn get_idea(&self, id: &str) -> Option<&CheckIdea> {
        self.idea_by_id.get(id).map(|&i| &self.ideas[i])
    }

    pub fn has_idea_id(&self, id: &str) -> bool {
        self.idea_by_id.contains_key(id)
    }

    pub fn has_local_idea(&self, file_uri: &str, name: &str) -> bool {
        self.local_ideas.contains(&(file_uri.to_string(), name.to_string()))
    }

    /// True when `file_uri` declares top-level `name` (in index or on disk if unindexed).
    pub fn file_declares_idea(&self, workspace_root: &Path, file_uri: &str, name: &str) -> bool {
        if !is_rq_uri(file_uri) {
            return false;
        }
        if let Some(names) = self.ideas_by_file.get(file_uri) {
            return names.contains(name);
        }
        if self.indexed_rq_files.contains(file_uri) {
            return false;
        }
        let path = workspace_root.join(file_uri);
        if !path.is_file() {
            return false;
        }
        let Ok(source) = std::fs::read_to_string(&path) else {
            return false;
        };
        parse_document(&source).model.elements.iter().any(|element| element.name() == Some(name))
    }

    /// True when any candidate path for `target_file` is an existing `.rq` file.
    pub fn qualified_target_is_rq(&self, workspace_root: &Path, target_file: &str) -> bool {
        import_path_candidates(target_file).iter().any(|candidate| {
            if !rq_path_exists(workspace_root, candidate) {
                return false;
            }
            is_rq_uri(candidate) || self.indexed_rq_files.contains(candidate)
        })
    }
}
