use reqlan_index::{AttributeValue, IdeaAttributeMap};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    #[default]
    Html,
    Markdown,
    Json,
    Csv,
    Pdf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportHeaderLink {
    pub href: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub format: ExportFormat,
    pub output_dir: PathBuf,
    pub export_name: String,
    pub workspace_root: PathBuf,
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
    pub max_graph_nodes: Option<usize>,
    #[serde(default)]
    pub url_base: Option<String>,
    #[serde(default)]
    pub header_link: Option<ExportHeaderLink>,
}

impl Default for ExportRequest {
    fn default() -> Self {
        Self {
            format: ExportFormat::Html,
            output_dir: PathBuf::new(),
            export_name: String::new(),
            workspace_root: PathBuf::new(),
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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub output_dir: PathBuf,
    pub index_file_path: PathBuf,
    pub print_file_path: PathBuf,
    pub data_file_path: PathBuf,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub requirements_file_path: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub graph_file_path: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ideas_index_file_path: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub files_index_file_path: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code_files_index_file_path: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clusters_index_file_path: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attributes_index_file_path: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manifest_file_path: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPageInfo {
    pub title: String,
    pub path: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub section: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub printable_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub printable_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportManifest {
    pub home: ExportPageInfo,
    pub ideas_index: ExportPageInfo,
    pub files_index: ExportPageInfo,
    pub clusters_index: ExportPageInfo,
    pub attributes_index: ExportPageInfo,
    pub code_files_index: ExportPageInfo,
    pub graph: ExportPageInfo,
    pub print_home: ExportPageInfo,
    pub data_export: ExportPageInfo,
    pub data_graph: ExportPageInfo,
    pub data_search: ExportPageInfo,
    pub data_manifest: ExportPageInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPageOptions {
    pub include_idea_pages: bool,
    pub include_file_pages: bool,
    pub include_code_file_pages: bool,
    pub include_cluster_pages: bool,
    pub include_attribute_pages: bool,
    pub include_print_pages: bool,
    pub include_requirements_page: bool,
    pub include_graph_page: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCounts {
    pub ideas: usize,
    pub edges: usize,
    pub files: usize,
    pub clusters: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReferenceRow {
    pub edge_id: String,
    pub direction: String,
    pub kind: String,
    pub label: String,
    pub target_name: String,
    pub target_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
    pub is_resolved: bool,
    pub source_idea_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_idea_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExportIdeaReferenceGroups {
    pub inbound: Vec<ExportReferenceRow>,
    pub outbound: Vec<ExportReferenceRow>,
    pub unresolved: Vec<ExportReferenceRow>,
    pub nearby: Vec<ExportReferenceRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExportAncestor {
    pub id: String,
    pub name: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExportAncestorChain {
    pub idea_id: String,
    pub ancestors: Vec<ExportAncestor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportIdea {
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
    pub file_name: String,
    pub file_segments: Vec<String>,
    pub attributes: IdeaAttributeMap,
    pub page: ExportPageInfo,
    pub references: ExportIdeaReferenceGroups,
    pub ancestors: ExportAncestorChain,
    pub cluster_ids: Vec<String>,
}

impl ExportIdea {
    pub fn inbound_count(&self) -> usize {
        self.references.inbound.len()
    }

    pub fn outbound_count(&self) -> usize {
        self.references.outbound.len()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFile {
    pub id: String,
    pub file_uri: String,
    pub name: String,
    pub directory: String,
    pub page: ExportPageInfo,
    pub print_page: ExportPageInfo,
    pub ideas: Vec<ExportIdea>,
    pub edge_count: usize,
    pub statuses: BTreeMap<String, usize>,
    pub tags: BTreeMap<String, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCodeFile {
    pub id: String,
    pub file_uri: String,
    pub name: String,
    pub directory: String,
    pub page: ExportPageInfo,
    pub print_page: ExportPageInfo,
    pub referencing_idea_ids: Vec<String>,
    pub labels: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportClusterCounts {
    pub ideas: usize,
    pub files: usize,
    pub inbound: usize,
    pub outbound: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCluster {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub description: String,
    pub page: ExportPageInfo,
    pub idea_ids: Vec<String>,
    pub file_uris: Vec<String>,
    pub counts: ExportClusterCounts,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAttributeValue {
    pub value: String,
    pub count: usize,
    pub idea_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAttribute {
    pub key: String,
    pub idea_count: usize,
    pub values: Vec<ExportAttributeValue>,
    pub idea_ids: Vec<String>,
    pub page: ExportPageInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSearchDocument {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub summary: String,
    pub url: String,
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    pub path_tokens: Vec<String>,
    pub keywords: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GraphViewQuery {
    pub include_indirect: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_nodes: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ignore_hard_cap: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_ideasets: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNodeView {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub file_uri: String,
    pub line_start: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_key: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags_keys: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_external: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host_file_page_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_subject: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attribute_keys: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attributes: Option<IdeaAttributeMap>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdgeView {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphViewSlice {
    pub query: GraphViewQuery,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub center_id: Option<String>,
    pub depth: u32,
    pub truncated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_matching: Option<usize>,
    pub nodes: Vec<GraphNodeView>,
    pub edges: Vec<GraphEdgeView>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportGraphCatalog {
    pub workspace: GraphViewSlice,
    pub by_idea_id: BTreeMap<String, GraphViewSlice>,
    pub by_file_id: BTreeMap<String, GraphViewSlice>,
    pub by_cluster_id: BTreeMap<String, GraphViewSlice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSnapshot {
    pub title: String,
    pub generated_at: String,
    pub workspace_root: String,
    pub template_id: String,
    pub scope: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_file_uri: Option<String>,
    pub runtime_mode: String,
    pub cluster_strategy: String,
    pub page_options: ExportPageOptions,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url_base: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub header_link: Option<ExportHeaderLink>,
    pub manifest: ExportManifest,
    pub counts: ExportCounts,
    pub ideas: Vec<ExportIdea>,
    pub idea_order: Vec<String>,
    pub ideas_by_id: BTreeMap<String, ExportIdea>,
    pub files: Vec<ExportFile>,
    pub files_by_id: BTreeMap<String, ExportFile>,
    pub code_files: Vec<ExportCodeFile>,
    pub code_files_by_id: BTreeMap<String, ExportCodeFile>,
    pub clusters: Vec<ExportCluster>,
    pub clusters_by_id: BTreeMap<String, ExportCluster>,
    pub attributes: Vec<ExportAttribute>,
    pub attributes_by_key: BTreeMap<String, ExportAttribute>,
    pub graphs: ExportGraphCatalog,
    pub search_documents: Vec<ExportSearchDocument>,
    pub by_status: BTreeMap<String, usize>,
    pub by_tag: BTreeMap<String, usize>,
    pub all_files: Vec<String>,
}

pub fn format_attribute_value(value: &AttributeValue) -> String {
    match value {
        AttributeValue::Flag(true) => "true".into(),
        AttributeValue::Flag(false) => "false".into(),
        AttributeValue::List(items) => items.join(", "),
        AttributeValue::Text(text) => text.clone(),
    }
}
