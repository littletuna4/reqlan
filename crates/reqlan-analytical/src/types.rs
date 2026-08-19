//! Specta-exported types matching AnalysisApi.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".ts_interface]

use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct IdeaSummary {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub file_uri: String,
    pub line_start: u32,
    pub summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    pub status_key: String,
    pub tags: Vec<String>,
    pub tags_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RequirementMatch {
    pub idea: IdeaSummary,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasons: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequirementsOptions {
    #[serde(default)]
    pub context: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileRelatedRequirements {
    pub file_uri: String,
    pub ideas_in_file: Vec<IdeaSummary>,
    pub referencing_ideas: Vec<IdeaSummary>,
    pub comment_linked_ideas: Vec<IdeaSummary>,
    pub folder_referencing_ideas: Vec<IdeaSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphSlice {
    pub center_id: String,
    pub depth: u32,
    pub nodes: Vec<IdeaSummary>,
    pub edges: Vec<EdgeDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EdgeDto {
    pub id: String,
    pub source_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_file: Option<String>,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CompletionSummary {
    pub total: u32,
    pub by_status: std::collections::BTreeMap<String, u32>,
    pub by_tag: std::collections::BTreeMap<String, u32>,
    pub outstanding: Vec<IdeaSummary>,
    pub deprecated: Vec<IdeaSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DeprecationImpact {
    pub deprecated: IdeaSummary,
    pub dependents: Vec<IdeaSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExportHeaderLinkDto {
    pub href: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequestDto {
    pub format: String,
    pub output_dir: String,
    pub export_name: String,
    #[serde(default)]
    pub workspace_root: Option<String>,
    #[serde(default = "default_template")]
    pub template_id: String,
    #[serde(default = "default_scope")]
    pub scope: String,
    #[serde(default)]
    pub source_file_uri: Option<String>,
    #[serde(default)]
    pub include_requirements_page: bool,
    #[serde(default)]
    pub include_graph_page: bool,
    #[serde(default = "default_print")]
    pub print_entry_file_name: String,
    #[serde(default)]
    pub exclude_secret_files: bool,
    #[serde(default)]
    pub exclude_ignored_files: bool,
    #[serde(default = "default_runtime_mode")]
    pub runtime_mode: String,
    #[serde(default = "default_cluster_strategy")]
    pub cluster_strategy: String,
    #[serde(default = "default_true")]
    pub include_idea_pages: bool,
    #[serde(default = "default_true")]
    pub include_file_pages: bool,
    #[serde(default = "default_true")]
    pub include_code_file_pages: bool,
    #[serde(default = "default_true")]
    pub include_cluster_pages: bool,
    #[serde(default = "default_true")]
    pub include_attribute_pages: bool,
    #[serde(default = "default_true")]
    pub include_print_pages: bool,
    #[serde(default)]
    pub max_graph_nodes: Option<u32>,
    #[serde(default)]
    pub url_base: Option<String>,
    #[serde(default)]
    pub header_link: Option<ExportHeaderLinkDto>,
}

impl Default for ExportRequestDto {
    fn default() -> Self {
        Self {
            format: "html".into(),
            output_dir: String::new(),
            export_name: String::new(),
            workspace_root: None,
            template_id: default_template(),
            scope: default_scope(),
            source_file_uri: None,
            include_requirements_page: false,
            include_graph_page: false,
            print_entry_file_name: default_print(),
            exclude_secret_files: false,
            exclude_ignored_files: false,
            runtime_mode: default_runtime_mode(),
            cluster_strategy: default_cluster_strategy(),
            include_idea_pages: true,
            include_file_pages: true,
            include_code_file_pages: true,
            include_cluster_pages: true,
            include_attribute_pages: true,
            include_print_pages: true,
            max_graph_nodes: None,
            url_base: None,
            header_link: None,
        }
    }
}

fn default_template() -> String {
    "default".into()
}
fn default_scope() -> String {
    "workspace".into()
}
fn default_print() -> String {
    "print.html".into()
}
fn default_runtime_mode() -> String {
    "interactive".into()
}
fn default_cluster_strategy() -> String {
    "hybrid".into()
}
fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExportResultDto {
    pub output_dir: String,
    pub index_file_path: String,
    pub print_file_path: String,
    pub data_file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct InteractionDescriptor {
    pub name: String,
    pub description: String,
    pub parameters: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileReferenceMatch {
    pub path: String,
    pub ideas: Vec<IdeaSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BrokenReferenceDto {
    pub file_uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_name: Option<String>,
    pub kind: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
}

pub fn from_index_summary(idea: reqlan_index::IdeaSummary) -> IdeaSummary {
    IdeaSummary {
        id: idea.id,
        name: idea.name,
        kind: idea.kind.as_str().to_string(),
        file_uri: idea.file_uri,
        line_start: idea.line_start,
        summary: idea.summary,
        status: idea.status,
        status_key: idea.status_key,
        tags: idea.tags,
        tags_keys: idea.tags_keys,
    }
}
