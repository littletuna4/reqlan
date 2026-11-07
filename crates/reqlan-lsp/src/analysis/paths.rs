//! Authored path location and neighbor file queries.
//! rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq".outbound_one_hop]

use std::path::{Path, PathBuf};

use reqlan_index::{local_name_binding, locate_authored_rq_path, LocalNameBinding};
use reqlan_parse::{
    import_path_candidates, unquote_path, Import, ImportRootMapping, ReferenceTarget,
};

use super::model::DocModel;
use super::refs::walk_refs;

impl DocModel {
    pub(super) fn locate(&self, authored: &str) -> Option<PathBuf> {
        if authored.contains("://") {
            return None;
        }
        if let Some(found) = self.located.borrow().get(authored) {
            return found.clone();
        }
        let found = self.locate_on_disk(authored);
        self.located.borrow_mut().insert(authored.to_string(), found.clone());
        found
    }

    fn locate_on_disk(&self, authored: &str) -> Option<PathBuf> {
        let from = self
            .file_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default();
        if let Some(workspace) = self.workspace.as_deref() {
            // Same definition as `reqlan check` (workspace join after resolve_rq_path).
            return locate_authored_rq_path(workspace, &from, authored, &self.roots);
        }
        // Absolute resolve_rq_path results (document-relative from an absolute from_file).
        existing_path_candidates(authored, &from, &self.roots)
    }

    /// Import targets and import-bound local names for the open-file hot path.
    pub fn import_neighbor_queries(&self) -> Vec<(String, String)> {
        let mut pairs = Vec::new();
        for import in &self.model.imports {
            match import {
                Import::From(from) => {
                    for spec in &from.specifiers {
                        pairs.push((from.path.clone(), spec.idea.clone()));
                    }
                }
                Import::Qualified(qualified) => {
                    pairs.push((qualified.path.clone(), qualified.idea.clone()));
                }
                Import::Namespace(_) | Import::InvalidFrom(_) => {}
            }
        }
        walk_refs(&self.model, &mut |target, _| match target {
            ReferenceTarget::Qualified { path: None, qualifier: Some(qualifier), idea, .. } => {
                if let Some(LocalNameBinding::Namespace { path }) =
                    local_name_binding(&self.model.imports, qualifier)
                {
                    pairs.push((path, idea.clone()));
                }
            }
            ReferenceTarget::Local { idea, .. } => {
                if let Some(LocalNameBinding::Imported { path, idea: imported }) =
                    local_name_binding(&self.model.imports, idea)
                {
                    pairs.push((path, imported));
                }
            }
            _ => {}
        });
        pairs
    }

    /// Path-qualified body references confirmed after the hot path.
    pub fn qualified_neighbor_queries(&self) -> Vec<(String, String)> {
        let mut pairs = Vec::new();
        walk_refs(&self.model, &mut |target, _| {
            if let ReferenceTarget::Qualified { path: Some(path), idea, .. } = target {
                pairs.push((path.clone(), idea.clone()));
            }
        });
        pairs
    }
}

fn existing_path(path: &str) -> Option<PathBuf> {
    let unquoted = unquote_path(path);
    if unquoted.contains("://") {
        return None;
    }
    for candidate in import_path_candidates(&unquoted) {
        let path = PathBuf::from(&candidate);
        if path.is_file() || path.is_dir() {
            return Some(path);
        }
    }
    None
}

fn existing_path_candidates(
    authored: &str,
    from_file: &str,
    roots: &[ImportRootMapping],
) -> Option<PathBuf> {
    let unquoted = unquote_path(authored);
    if unquoted.contains("://") {
        return None;
    }
    for candidate in import_path_candidates(&unquoted) {
        let resolved = reqlan_parse::resolve_rq_path(&candidate, from_file, roots);
        if let Some(path) = existing_path(&resolved) {
            return Some(path);
        }
    }
    None
}

pub fn resolve_neighbor_file(
    from_file: &Path,
    authored: &str,
    roots: &[ImportRootMapping],
    workspace: Option<&Path>,
) -> Option<PathBuf> {
    let from = from_file.display().to_string();
    if let Some(root) = workspace {
        return locate_authored_rq_path(root, &from, authored, roots).or_else(|| {
            let parent = from_file.parent()?;
            existing_path(&parent.join(authored.trim_matches('"')).display().to_string())
        });
    }
    existing_path_candidates(authored, &from, roots).or_else(|| {
        let parent = from_file.parent()?;
        existing_path(&parent.join(authored.trim_matches('"')).display().to_string())
    })
}
