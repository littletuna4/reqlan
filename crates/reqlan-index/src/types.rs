//! Shared index records. Schema v4 compatible with sql.js.
//! rq:["../../../reqlan rq/ontology.rq".idea]
//! rq:["../../../reqlan rq/ontology.rq".ideaset]
//! rq:["../../../reqlan rq/ontology.rq".reference_types]
//! rq:["../../../reqlan rq/indexer/indexer.rq".index]
//! rq:["../../../reqlan rq/indexer/indexer.rq".wildcard_reference_edges]
//! rq:["../../../reqlan rq/reference_types.rq".wildcard_reference]
//! rq:["../../../reqlan rq/reference_types.rq".url_reference]

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IdeaKind {
    Block,
    Oneliner,
    Ideaset,
}

impl IdeaKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Block => "block",
            Self::Oneliner => "oneliner",
            Self::Ideaset => "ideaset",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "oneliner" => Self::Oneliner,
            "ideaset" => Self::Ideaset,
            _ => Self::Block,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeKind {
    References,
    WildcardReference,
    FileReference,
    UrlReference,
    IdeasetMember,
    Import,
    CommentLink,
}

impl EdgeKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::References => "references",
            Self::WildcardReference => "wildcard_reference",
            Self::FileReference => "file_reference",
            Self::UrlReference => "url_reference",
            Self::IdeasetMember => "ideaset_member",
            Self::Import => "import",
            Self::CommentLink => "comment_link",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "wildcard_reference" => Self::WildcardReference,
            "file_reference" => Self::FileReference,
            "url_reference" => Self::UrlReference,
            "ideaset_member" => Self::IdeasetMember,
            "import" => Self::Import,
            "comment_link" => Self::CommentLink,
            _ => Self::References,
        }
    }
}

pub type IdeaAttributeMap = BTreeMap<String, AttributeValue>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AttributeValue {
    Flag(bool),
    Text(String),
    List(Vec<String>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdeaRecord {
    pub id: String,
    pub name: String,
    pub kind: IdeaKind,
    pub file_uri: String,
    pub line_start: u32,
    pub line_end: u32,
    pub summary: String,
    pub attributes_json: String,
    pub content_hash: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_modified_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_change_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeRecord {
    pub id: String,
    pub source_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_file: Option<String>,
    pub kind: EdgeKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_resolved: Option<bool>,
    /// UTF-8 byte offset of the reference span (live extract only; not persisted).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_offset_start: Option<u32>,
    /// UTF-8 byte offset end (exclusive) of the reference span (live extract only).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_offset_end: Option<u32>,
}

impl EdgeRecord {
    pub fn with_source_offsets(mut self, start: u32, end: u32) -> Self {
        self.source_offset_start = Some(start);
        self.source_offset_end = Some(end);
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedDocument {
    pub file_uri: String,
    pub content_hash: String,
    pub ideas: Vec<IdeaRecord>,
    pub edges: Vec<EdgeRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdeaSummary {
    pub id: String,
    pub name: String,
    pub kind: IdeaKind,
    pub file_uri: String,
    pub line_start: u32,
    pub summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    pub status_key: String,
    pub tags: Vec<String>,
    pub tags_keys: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_modified_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_change_count: Option<i64>,
}

pub const FILTER_NOT_PRESENT: &str = "__not_present__";
pub const FILTER_EMPTY: &str = "__empty__";

pub fn parse_attributes(json: &str) -> IdeaAttributeMap {
    serde_json::from_str(json).unwrap_or_default()
}

pub fn idea_tags(attributes: &IdeaAttributeMap) -> Vec<String> {
    match attributes.get("tags") {
        Some(AttributeValue::List(tags)) => tags.clone(),
        Some(AttributeValue::Text(text)) => text
            .split(|c: char| c == ',' || c.is_whitespace())
            .filter(|part| !part.is_empty())
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

pub fn idea_status(attributes: &IdeaAttributeMap) -> Option<String> {
    match attributes.get("status") {
        Some(AttributeValue::Text(text)) => Some(text.clone()),
        _ => None,
    }
}

pub fn is_deprecated(attributes: &IdeaAttributeMap) -> bool {
    matches!(attributes.get("deprecated"), Some(AttributeValue::Flag(true)))
        || idea_tags(attributes).iter().any(|tag| tag.eq_ignore_ascii_case("deprecated"))
}

pub fn attribute_presence(attributes: &IdeaAttributeMap, key: &str) -> &'static str {
    match attributes.get(key) {
        None => "missing",
        Some(AttributeValue::Flag(true)) => "empty",
        Some(AttributeValue::Text(text)) if text.trim().is_empty() => "empty",
        Some(AttributeValue::List(items)) if items.iter().all(|item| item.trim().is_empty()) => {
            "empty"
        }
        Some(AttributeValue::Flag(false)) => "empty",
        _ => "valued",
    }
}

pub fn status_filter_key(attributes: &IdeaAttributeMap) -> String {
    match attribute_presence(attributes, "status") {
        "missing" => FILTER_NOT_PRESENT.to_string(),
        "empty" => FILTER_EMPTY.to_string(),
        _ => idea_status(attributes)
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| FILTER_EMPTY.to_string()),
    }
}

pub fn tags_filter_keys(attributes: &IdeaAttributeMap) -> Vec<String> {
    match attribute_presence(attributes, "tags") {
        "missing" => vec![FILTER_NOT_PRESENT.to_string()],
        "empty" => vec![FILTER_EMPTY.to_string()],
        _ => {
            let tags = idea_tags(attributes);
            if tags.is_empty() {
                vec![FILTER_EMPTY.to_string()]
            } else {
                tags
            }
        }
    }
}

pub fn to_summary(record: &IdeaRecord) -> IdeaSummary {
    let attributes = parse_attributes(&record.attributes_json);
    IdeaSummary {
        id: record.id.clone(),
        name: record.name.clone(),
        kind: record.kind,
        file_uri: record.file_uri.clone(),
        line_start: record.line_start,
        summary: record.summary.clone(),
        status: idea_status(&attributes),
        status_key: status_filter_key(&attributes),
        tags: idea_tags(&attributes),
        tags_keys: tags_filter_keys(&attributes),
        git_created_at: record.git_created_at.clone(),
        git_modified_at: record.git_modified_at.clone(),
        git_change_count: record.git_change_count,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRelatedRequirements {
    pub file_uri: String,
    pub ideas_in_file: Vec<IdeaSummary>,
    pub referencing_ideas: Vec<IdeaSummary>,
    pub comment_linked_ideas: Vec<IdeaSummary>,
    pub folder_referencing_ideas: Vec<IdeaSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphSlice {
    pub center_id: String,
    pub depth: u32,
    pub nodes: Vec<IdeaSummary>,
    pub edges: Vec<EdgeRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionSummary {
    pub total: usize,
    pub by_status: BTreeMap<String, usize>,
    pub by_tag: BTreeMap<String, usize>,
    pub outstanding: Vec<IdeaSummary>,
    pub deprecated: Vec<IdeaSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeprecationImpact {
    pub deprecated: IdeaSummary,
    pub dependents: Vec<IdeaSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticMatch {
    pub idea: IdeaSummary,
    pub score: f64,
    pub reasons: Vec<String>,
}
