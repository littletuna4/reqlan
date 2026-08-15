use crate::types::{
    from_index_summary, CompletionSummary, DeprecationImpact, EdgeDto, ExportRequestDto,
    ExportResultDto, FileReferenceMatch, FileRelatedRequirements, GraphSlice, IdeaSummary,
    InteractionDescriptor, RequirementMatch, SearchRequirementsOptions,
};
use reqlan_export::{
    build_export_snapshot, write_csv_export, write_html_export, write_json_export,
    write_markdown_export, ExportFormat, ExportHeaderLink, ExportRequest,
};
use reqlan_index::ignore::{application_memory_path, ideas_index_path};
use reqlan_index::sync::{sync_workspace, to_indexed_uri, SyncOptions};
use reqlan_index::{is_deprecated, parse_attributes, IndexStore, StoreError};
use reqlan_search::{rerank_matches_with_context, resolve_search_context_refs, semantic_search};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AnalysisError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error("export: {0}")]
    Export(String),
    #[error("{0}")]
    Message(String),
}

pub struct AnalysisRuntime {
    workspace_root: PathBuf,
    store: IndexStore,
    ready: bool,
}

impl AnalysisRuntime {
    pub fn open(
        workspace_root: impl Into<PathBuf>,
        storage_path: Option<&Path>,
    ) -> Result<Self, AnalysisError> {
        let workspace_root = workspace_root.into();
        let memory = application_memory_path(&workspace_root, storage_path);
        let db_path = ideas_index_path(&memory);
        let store = IndexStore::open(&db_path)?;
        Ok(Self { workspace_root, store, ready: false })
    }

    pub fn ensure_ready(&mut self) -> Result<(), AnalysisError> {
        if self.ready {
            return Ok(());
        }
        let cancel = AtomicBool::new(false);
        sync_workspace(
            &mut self.store,
            &SyncOptions { workspace_root: self.workspace_root.clone(), hard_rebuild: false },
            &cancel,
        )?;
        self.ready = true;
        Ok(())
    }

    pub fn sync(&mut self, hard: bool) -> Result<(), AnalysisError> {
        let cancel = AtomicBool::new(false);
        sync_workspace(
            &mut self.store,
            &SyncOptions { workspace_root: self.workspace_root.clone(), hard_rebuild: hard },
            &cancel,
        )?;
        self.ready = true;
        Ok(())
    }

    pub fn search_requirements(
        &mut self,
        query: &str,
        limit: usize,
        options: Option<&SearchRequirementsOptions>,
    ) -> Result<Vec<RequirementMatch>, AnalysisError> {
        self.ensure_ready()?;
        let context_refs = options.map(|opts| opts.context.clone()).unwrap_or_default();
        let context_ids = if context_refs.is_empty() {
            Vec::new()
        } else {
            resolve_search_context_refs(&self.store, &self.workspace_root, &context_refs)?
        };
        let fetch_limit = if context_ids.is_empty() { limit } else { (limit * 3).max(24) };
        let matches = semantic_search(&self.store, query, None, fetch_limit)?;
        let ranked = if context_ids.is_empty() {
            matches
        } else {
            rerank_matches_with_context(&self.store, matches, &context_ids)?
        };
        Ok(ranked
            .into_iter()
            .take(limit)
            .map(|match_| RequirementMatch {
                idea: from_index_summary(match_.idea),
                score: Some(match_.score),
                reasons: Some(match_.reasons),
            })
            .collect())
    }

    pub fn list_requirements(&mut self, limit: usize) -> Result<Vec<IdeaSummary>, AnalysisError> {
        self.ensure_ready()?;
        Ok(self.store.list_all_ideas()?.into_iter().take(limit).map(from_index_summary).collect())
    }

    pub fn get_file_context(
        &mut self,
        file_path: &str,
    ) -> Result<FileRelatedRequirements, AnalysisError> {
        self.ensure_ready()?;
        let file_uri = to_indexed_uri(&self.workspace_root, file_path);
        let ideas_in_file = self.store.get_ideas_in_file(&file_uri)?;
        let file_name = file_uri.rsplit('/').next().unwrap_or(&file_uri).to_string();
        let mut referencing = HashSet::new();
        let mut folder_referencing = HashSet::new();
        for edge in self.store.get_all_edges()? {
            if let Some(target) = &edge.target_id {
                if ideas_in_file.iter().any(|idea| &idea.id == target) {
                    referencing.insert(edge.source_id.clone());
                }
            }
            if edge.kind == reqlan_index::EdgeKind::FileReference {
                if let Some(target_file) = &edge.target_file {
                    match match_file_reference(target_file, &file_uri, &file_name) {
                        Some("file") => {
                            referencing.insert(edge.source_id);
                        }
                        Some("folder") => {
                            folder_referencing.insert(edge.source_id);
                        }
                        _ => {}
                    }
                }
            }
        }
        let load = |ids: HashSet<String>| -> Result<Vec<IdeaSummary>, AnalysisError> {
            let mut ideas = Vec::new();
            for id in ids {
                if let Some(idea) = self.store.get_idea(&id)? {
                    ideas.push(from_index_summary(idea));
                }
            }
            Ok(ideas)
        };
        let referencing_ideas = load(referencing.clone())?;
        let folder_referencing_ideas = load(folder_referencing)?
            .into_iter()
            .filter(|idea| !referencing.contains(&idea.id))
            .collect();
        let comment_linked_ideas = {
            let mut ids = HashSet::new();
            for key in [&file_name, &file_uri] {
                for edge in self.store.get_edges_referencing_file(key)? {
                    if edge.kind == reqlan_index::EdgeKind::CommentLink {
                        ids.insert(edge.source_id);
                    }
                }
            }
            load(ids)?
        };
        Ok(FileRelatedRequirements {
            file_uri,
            ideas_in_file: ideas_in_file.into_iter().map(from_index_summary).collect(),
            referencing_ideas,
            comment_linked_ideas,
            folder_referencing_ideas,
        })
    }

    pub fn get_local_graph(
        &mut self,
        file_path: &str,
        depth: u32,
    ) -> Result<Option<GraphSlice>, AnalysisError> {
        self.ensure_ready()?;
        let file_uri = to_indexed_uri(&self.workspace_root, file_path);
        let ideas = self.store.get_ideas_in_file(&file_uri)?;
        let Some(center) = ideas.first() else {
            return Ok(None);
        };
        Ok(Some(self.local_graph(&center.id, depth)?))
    }

    pub fn summarize_subtree(
        &mut self,
        requirement_name: &str,
        depth: u32,
    ) -> Result<Option<GraphSlice>, AnalysisError> {
        let matches = self.search_requirements(requirement_name, 1, None)?;
        let Some(center) = matches.first() else {
            return Ok(None);
        };
        Ok(Some(self.local_graph(&center.idea.id, depth)?))
    }

    fn local_graph(&self, center_id: &str, depth: u32) -> Result<GraphSlice, AnalysisError> {
        let mut nodes = HashMap::new();
        let mut edges = HashMap::new();
        let mut visited = HashSet::new();
        let mut queue = VecDeque::from([(center_id.to_string(), depth)]);
        while let Some((current, remaining)) = queue.pop_front() {
            if !visited.insert(current.clone()) {
                continue;
            }
            if let Some(idea) = self.store.get_idea(&current)? {
                nodes.insert(idea.id.clone(), idea);
            }
            let outbound = self.store.get_edges_from(&current)?;
            let inbound = self.store.get_edges_to(&current)?;
            for edge in outbound.into_iter().chain(inbound) {
                edges.insert(edge.id.clone(), edge.clone());
                if remaining > 0 {
                    let next = if edge.source_id == current {
                        edge.target_id
                    } else {
                        Some(edge.source_id)
                    };
                    if let Some(next_id) = next {
                        queue.push_back((next_id, remaining - 1));
                    }
                }
            }
        }
        Ok(GraphSlice {
            center_id: center_id.to_string(),
            depth,
            nodes: nodes.into_values().map(from_index_summary).collect(),
            edges: edges
                .into_values()
                .map(|edge| EdgeDto {
                    id: edge.id,
                    source_id: edge.source_id,
                    target_id: edge.target_id,
                    target_file: edge.target_file,
                    kind: edge.kind.as_str().to_string(),
                    label: edge.label,
                })
                .collect(),
        })
    }

    pub fn get_completion_status(&mut self) -> Result<CompletionSummary, AnalysisError> {
        self.ensure_ready()?;
        let ideas = self.store.list_all_ideas()?;
        let raw = self.store.all_idea_records()?;
        let mut by_status: std::collections::BTreeMap<String, u32> =
            std::collections::BTreeMap::new();
        let mut by_tag: std::collections::BTreeMap<String, u32> = std::collections::BTreeMap::new();
        let mut outstanding = Vec::new();
        let mut deprecated = Vec::new();
        const OUTSTANDING: &[&str] = &["pending", "todo", "open", "in_progress", "blocked", "stub"];
        for idea in ideas {
            let record = raw.iter().find(|entry| entry.id == idea.id);
            let attributes =
                parse_attributes(record.map(|r| r.attributes_json.as_str()).unwrap_or("{}"));
            let status = idea.status.clone().unwrap_or_else(|| "unspecified".into());
            *by_status.entry(status.clone()).or_insert(0) += 1;
            for tag in &idea.tags {
                *by_tag.entry(tag.clone()).or_insert(0) += 1;
            }
            if is_deprecated(&attributes)
                || idea.tags.iter().any(|tag| tag.eq_ignore_ascii_case("deprecated"))
            {
                deprecated.push(from_index_summary(idea));
            } else if OUTSTANDING.contains(&status.to_lowercase().as_str())
                || idea
                    .tags
                    .iter()
                    .any(|tag| ["todo", "stub", "open"].contains(&tag.to_lowercase().as_str()))
            {
                outstanding.push(from_index_summary(idea));
            }
        }
        Ok(CompletionSummary {
            total: by_status.values().copied().sum(),
            by_status,
            by_tag,
            outstanding,
            deprecated,
        })
    }

    pub fn get_deprecation_impact(&mut self) -> Result<Vec<DeprecationImpact>, AnalysisError> {
        self.ensure_ready()?;
        let ideas = self.store.list_all_ideas()?;
        let raw = self.store.all_idea_records()?;
        let mut impacts = Vec::new();
        for idea in ideas {
            let record = raw.iter().find(|entry| entry.id == idea.id);
            let attributes =
                parse_attributes(record.map(|r| r.attributes_json.as_str()).unwrap_or("{}"));
            if !is_deprecated(&attributes) {
                continue;
            }
            let dependents = self
                .store
                .get_edges_to(&idea.id)?
                .into_iter()
                .filter_map(|edge| self.store.get_idea(&edge.source_id).ok().flatten())
                .map(from_index_summary)
                .collect();
            impacts.push(DeprecationImpact { deprecated: from_index_summary(idea), dependents });
        }
        Ok(impacts)
    }

    pub fn export(&mut self, request: ExportRequestDto) -> Result<ExportResultDto, AnalysisError> {
        self.ensure_ready()?;
        let format = match request.format.as_str() {
            "markdown" => ExportFormat::Markdown,
            "json" => ExportFormat::Json,
            "csv" => ExportFormat::Csv,
            _ => ExportFormat::Html,
        };
        let native = ExportRequest {
            format,
            output_dir: PathBuf::from(&request.output_dir),
            export_name: request.export_name,
            workspace_root: request
                .workspace_root
                .map(PathBuf::from)
                .unwrap_or_else(|| self.workspace_root.clone()),
            template_id: request.template_id,
            scope: request.scope,
            source_file_uri: request.source_file_uri,
            include_requirements_page: request.include_requirements_page,
            include_graph_page: request.include_graph_page,
            print_entry_file_name: request.print_entry_file_name,
            exclude_secret_files: request.exclude_secret_files,
            exclude_ignored_files: request.exclude_ignored_files,
            runtime_mode: request.runtime_mode,
            cluster_strategy: request.cluster_strategy,
            include_idea_pages: request.include_idea_pages,
            include_file_pages: request.include_file_pages,
            include_code_file_pages: request.include_code_file_pages,
            include_cluster_pages: request.include_cluster_pages,
            include_attribute_pages: request.include_attribute_pages,
            include_print_pages: request.include_print_pages,
            max_graph_nodes: request.max_graph_nodes.map(|n| n as usize),
            url_base: request.url_base,
            header_link: request
                .header_link
                .map(|link| ExportHeaderLink { href: link.href, label: link.label }),
        };
        let snapshot = build_export_snapshot(&self.store, &native)?;
        let result = match format {
            ExportFormat::Json => write_json_export(&snapshot, &native),
            ExportFormat::Csv => write_csv_export(&snapshot, &native),
            ExportFormat::Markdown => write_markdown_export(&snapshot, &native),
            _ => write_html_export(&snapshot, &native),
        }
        .map_err(|error| AnalysisError::Export(error.to_string()))?;
        Ok(ExportResultDto {
            output_dir: result.output_dir.to_string_lossy().into_owned(),
            index_file_path: result.index_file_path.to_string_lossy().into_owned(),
            print_file_path: result.print_file_path.to_string_lossy().into_owned(),
            data_file_path: result.data_file_path.to_string_lossy().into_owned(),
        })
    }

    pub fn resolve_requirement_reference(
        &mut self,
        name: Option<&str>,
    ) -> Result<Vec<IdeaSummary>, AnalysisError> {
        let query = name.unwrap_or("").trim();
        if query.is_empty() {
            return self.list_requirements(12);
        }
        Ok(self
            .search_requirements(query, 8, None)?
            .into_iter()
            .map(|match_| match_.idea)
            .collect())
    }

    pub fn resolve_file_reference(
        &mut self,
        path_prefix: Option<&str>,
    ) -> Result<Vec<FileReferenceMatch>, AnalysisError> {
        self.ensure_ready()?;
        let prefix = path_prefix.unwrap_or("").trim().to_string();
        let mut files: Vec<String> =
            self.store.list_all_ideas()?.into_iter().map(|idea| idea.file_uri).collect();
        files.sort();
        files.dedup();
        let mut results = Vec::new();
        for path in
            files.into_iter().filter(|path| prefix.is_empty() || path.contains(&prefix)).take(12)
        {
            let related = self.get_file_context(&path).unwrap_or(FileRelatedRequirements {
                file_uri: path.clone(),
                ideas_in_file: Vec::new(),
                referencing_ideas: Vec::new(),
                comment_linked_ideas: Vec::new(),
                folder_referencing_ideas: Vec::new(),
            });
            results.push(FileReferenceMatch {
                path,
                ideas: related.ideas_in_file.into_iter().take(4).collect(),
            });
        }
        Ok(results)
    }

    pub fn list_interactions() -> Vec<InteractionDescriptor> {
        vec![
            desc(
                "search_requirements",
                "Search requirements by keyword across names, summaries, tags, and references.",
            ),
            desc("list_requirements", "List indexed requirements in the workspace."),
            desc("file_context", "Get requirements in, referencing, or comment-linked to a file."),
            desc(
                "local_graph",
                "Get the local requirement graph around the first requirement in a file.",
            ),
            desc("export_html", "Export the requirement graph as a multi-file static HTML site."),
        ]
    }
}

fn desc(name: &str, description: &str) -> InteractionDescriptor {
    InteractionDescriptor {
        name: name.into(),
        description: description.into(),
        parameters: std::collections::BTreeMap::new(),
    }
}

fn match_file_reference(
    target_file: &str,
    file_uri: &str,
    file_name: &str,
) -> Option<&'static str> {
    let target = target_file.replace('\\', "/").trim_end_matches('/').to_string();
    let file = file_uri.replace('\\', "/");
    if target.is_empty() {
        return None;
    }
    if target == file
        || target.ends_with(&format!("/{file_name}"))
        || file.ends_with(&format!("/{target}"))
    {
        return Some("file");
    }
    if !target.contains('.') || target_file.ends_with('/') {
        if file == target || file.starts_with(&format!("{target}/")) {
            return Some("folder");
        }
    }
    if file.contains(&target) || target.contains(&file) {
        return Some("file");
    }
    None
}
