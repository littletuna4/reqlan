//! Closed `.rq` neighbor files: a bounded parse cache and file-declaration queries.
//! rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq.outbound_one_hop]
//! rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq.open_file_hot_path]
//! rq:["../../../../reqlan rq/indexer/indexer.rq.local_symbolic_analysis]

use std::path::{Path, PathBuf};

use lsp_types::Range;
use reqlan_index::find_applying_base_root;
use reqlan_parse::{parse_document, ImportRootMapping};

use crate::analysis::{line_range, resolve_neighbor_file};
use crate::utf16::LineMap;

use super::records::{FileStamp, Neighbor, Session};

const NEIGHBOR_CAP: usize = 32;

impl Session {
    pub(super) fn import_roots(&self, source: &Path) -> Vec<ImportRootMapping> {
        let workspace = self.alias_workspace(Some(source)).unwrap_or_else(|| source.to_path_buf());
        reqlan_index::import_roots_for_source(&workspace, &source.to_string_lossy())
    }

    pub(super) fn workspace_for(&self, source: &Path) -> Option<PathBuf> {
        let mut best: Option<&Path> = None;
        for folder in &self.folders {
            if source.starts_with(folder)
                && best.is_none_or(|current| folder.as_os_str().len() > current.as_os_str().len())
            {
                best = Some(folder);
            }
        }
        best.map(Path::to_path_buf)
    }

    /// Workspace folder when set; otherwise the applying `.reqlan` base (same root check uses).
    pub(super) fn alias_workspace(&self, source: Option<&Path>) -> Option<PathBuf> {
        let source = source?;
        self.workspace_for(source).or_else(|| find_applying_base_root(source, Some(source)))
    }

    fn path_declares(&mut self, path: &Path, idea: &str) -> bool {
        if let Some(doc) = self.open_doc_at(path) {
            return doc.model.has_idea(idea);
        }
        self.neighbor_declares(path, idea)
    }

    pub(super) fn neighbor_has(
        &mut self,
        from: &Path,
        authored: &str,
        idea: &str,
        roots: &[reqlan_parse::ImportRootMapping],
    ) -> bool {
        let workspace = self.alias_workspace(Some(from));
        let Some(path) = resolve_neighbor_file(from, authored, roots, workspace.as_deref()) else {
            return false;
        };
        self.path_declares(&path, idea)
    }

    pub(super) fn neighbor_binds_import(
        &mut self,
        from: &Path,
        authored: &str,
        idea: &str,
        roots: &[reqlan_parse::ImportRootMapping],
    ) -> bool {
        let workspace = self.alias_workspace(Some(from));
        let Some(path) = resolve_neighbor_file(from, authored, roots, workspace.as_deref()) else {
            return false;
        };
        if let Some(doc) = self.open_doc_at(&path) {
            return doc.model.binds_import(idea);
        }
        self.ensure_neighbor(&path)
            .is_some_and(|entry| entry.bindings.iter().any(|(name, _)| name == idea))
    }

    fn neighbor_declares(&mut self, path: &Path, idea: &str) -> bool {
        self.ensure_neighbor(path)
            .is_some_and(|entry| entry.names.iter().any(|(name, _)| name == idea))
    }

    /// Name token of `idea` in `path`. An open buffer wins over the file on disk.
    pub(super) fn neighbor_range(&mut self, path: &Path, idea: &str) -> Option<Range> {
        if let Some(doc) = self.open_doc_at(path) {
            return doc.model.idea_range(idea);
        }
        let entry = self.ensure_neighbor(path)?;
        if let Some((_, range)) = entry.names.iter().find(|(name, _)| name == idea) {
            return Some(*range);
        }
        entry
            .bindings
            .iter()
            .find(|(name, _)| name == idea)
            .map(|(name, line)| line_range(*line, name))
    }

    /// One `stat` when the cached parse is current. Read and parse only when the file changed.
    pub(super) fn ensure_neighbor(&mut self, path: &Path) -> Option<&Neighbor> {
        let meta = std::fs::metadata(path).ok().filter(|meta| meta.is_file())?;
        let stamp = FileStamp { modified: meta.modified().ok()?, len: meta.len() };
        if let Some(index) = self.neighbors.iter().position(|entry| entry.path == path) {
            if self.neighbors[index].stamp == stamp {
                return self.neighbors.get(index);
            }
            self.neighbors.remove(index);
        }
        let text = std::fs::read_to_string(path).ok()?;
        let parsed = parse_document(&text);
        let lines = LineMap::new(&text);
        let mut names = Vec::new();
        for element in &parsed.model.elements {
            let (name, span) = match element {
                reqlan_parse::TopLevelElement::Idea(item) => (&item.name, item.span),
                reqlan_parse::TopLevelElement::OneLiner(item) => (&item.name, item.span),
                reqlan_parse::TopLevelElement::IdeaSet(item) => (&item.name, item.span),
                reqlan_parse::TopLevelElement::Anonymous(_) => continue,
            };
            let start = text
                .get(span.start..span.end)
                .and_then(|body| body.find(name.as_str()))
                .map_or(span.start, |offset| span.start + offset);
            names.push((name.clone(), lines.range(&text, start, start + name.len())));
        }
        let bindings = parsed.model.import_bindings();
        self.neighbors.push_back(Neighbor {
            path: path.to_path_buf(),
            stamp,
            text,
            model: parsed.model,
            names,
            bindings,
        });
        while self.neighbors.len() > NEIGHBOR_CAP {
            self.neighbors.pop_front();
        }
        self.neighbors.back()
    }
}
