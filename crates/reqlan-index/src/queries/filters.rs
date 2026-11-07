//! Query parameter types for the summary webview table and graph requests.
//! rq:["../../../../reqlan rq/extension/workspace-summary/ideas_summary/webview.rq".ideas_table_filters]
//! rq:["../../../../reqlan rq/extension/workspace-summary/ideas_summary/webview.rq".table_column_filters]
//! rq:["../../../../reqlan rq/extension/workspace-summary/ideas_summary/graphical_graph.rq".node_truncation]
use serde::Deserialize;

fn default_page_size() -> i64 {
    50
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnFilter {
    pub column: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub selected: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceFilter {
    #[serde(default)]
    pub direction: String,
    #[serde(default)]
    pub filter_key: String,
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdeasTableQuery {
    #[serde(default)]
    pub page: i64,
    #[serde(default = "default_page_size")]
    pub page_size: i64,
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub sort_by: Option<String>,
    #[serde(default)]
    pub sort_dir: Option<String>,
    #[serde(default)]
    pub attribute_columns: Vec<String>,
    #[serde(default)]
    pub reference_filters: Vec<ReferenceFilter>,
    #[serde(default)]
    pub column_filters: Vec<ColumnFilter>,
    #[serde(default)]
    pub group_by: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdeasetsTableQuery {
    #[serde(default)]
    pub page: i64,
    #[serde(default = "default_page_size")]
    pub page_size: i64,
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub sort_by: Option<String>,
    #[serde(default)]
    pub sort_dir: Option<String>,
    #[serde(default)]
    pub column_filters: Vec<ColumnFilter>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferencesTableQuery {
    #[serde(default)]
    pub page: i64,
    #[serde(default = "default_page_size")]
    pub page_size: i64,
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub sort_by: Option<String>,
    #[serde(default)]
    pub sort_dir: Option<String>,
    #[serde(default)]
    pub column_filters: Vec<ColumnFilter>,
    #[serde(default)]
    pub group_by: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphViewQuery {
    #[serde(default)]
    pub center_id: Option<String>,
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub path_filter: Option<String>,
    #[serde(default)]
    pub status_filter: Option<Vec<String>>,
    #[serde(default)]
    pub tag_filter: Option<Vec<String>>,
    #[serde(default)]
    pub include_indirect: bool,
    #[serde(default)]
    pub include_wildcard_refs: Option<bool>,
    #[serde(default)]
    pub hop_depth: Option<f64>,
    #[serde(default)]
    pub max_nodes: Option<i64>,
    #[serde(default)]
    pub ignore_hard_cap: Option<bool>,
    #[serde(default)]
    pub include_ideasets: Option<bool>,
    #[serde(default)]
    pub truncation_basis: Option<String>,
}
