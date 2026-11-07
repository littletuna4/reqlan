//! Search document building for the export snapshot.
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_search]

use crate::types::{
    ExportAttribute, ExportCluster, ExportCodeFile, ExportFile, ExportIdea, ExportSearchDocument,
};
use reqlan_index::IdeaAttributeMap;

pub(crate) fn build_search_documents(
    ideas: &[ExportIdea],
    files: &[ExportFile],
    code_files: &[ExportCodeFile],
    clusters: &[ExportCluster],
    attributes: &[ExportAttribute],
) -> Vec<ExportSearchDocument> {
    let mut documents = Vec::new();
    for idea in ideas {
        documents.push(ExportSearchDocument {
            id: idea.id.clone(),
            title: idea.name.clone(),
            kind: "idea".into(),
            summary: idea.summary.clone(),
            url: idea.page.url.clone(),
            tags: idea.tags.clone(),
            status: idea.status.clone(),
            path_tokens: idea.file_segments.clone(),
            keywords: collect_attribute_keywords(&idea.attributes)
                .into_iter()
                .chain(idea.cluster_ids.iter().cloned())
                .collect(),
        });
    }
    for file in files {
        documents.push(ExportSearchDocument {
            id: file.id.clone(),
            title: file.name.clone(),
            kind: "file".into(),
            summary: format!("{} ideas, {} references", file.ideas.len(), file.edge_count),
            url: file.page.url.clone(),
            tags: file.tags.keys().cloned().collect(),
            status: None,
            path_tokens: file
                .file_uri
                .split('/')
                .filter(|part| !part.is_empty())
                .map(str::to_string)
                .collect(),
            keywords: file.ideas.iter().map(|idea| idea.name.clone()).collect(),
        });
    }
    for file in code_files {
        documents.push(ExportSearchDocument {
            id: file.id.clone(),
            title: file.name.clone(),
            kind: "code-file".into(),
            summary: format!(
                "{} outbound references · {}",
                file.referencing_idea_ids.len(),
                file.file_uri
            ),
            url: file.page.url.clone(),
            tags: std::iter::once("file_reference".into())
                .chain(file.labels.iter().cloned())
                .collect(),
            status: None,
            path_tokens: file
                .file_uri
                .split('/')
                .filter(|part| !part.is_empty())
                .map(str::to_string)
                .collect(),
            keywords: file
                .labels
                .iter()
                .cloned()
                .chain(file.referencing_idea_ids.iter().cloned())
                .collect(),
        });
    }
    for cluster in clusters {
        documents.push(ExportSearchDocument {
            id: cluster.id.clone(),
            title: cluster.label.clone(),
            kind: "cluster".into(),
            summary: cluster.description.clone(),
            url: cluster.page.url.clone(),
            tags: vec![cluster.kind.clone()],
            status: None,
            path_tokens: cluster
                .file_uris
                .iter()
                .flat_map(|path| {
                    path.split('/').filter(|part| !part.is_empty()).map(str::to_string)
                })
                .take(12)
                .collect(),
            keywords: cluster.idea_ids.clone(),
        });
    }
    for attribute in attributes {
        documents.push(ExportSearchDocument {
            id: format!("attribute:{}", attribute.key),
            title: attribute.key.clone(),
            kind: "attribute".into(),
            summary: format!("{} ideas · {} values", attribute.idea_count, attribute.values.len()),
            url: attribute.page.url.clone(),
            tags: vec!["attribute".into()],
            status: None,
            path_tokens: vec![attribute.key.clone()],
            keywords: attribute.values.iter().map(|value| value.value.clone()).collect(),
        });
    }
    documents.sort_by(|left, right| left.title.cmp(&right.title));
    documents
}

fn collect_attribute_keywords(attributes: &IdeaAttributeMap) -> Vec<String> {
    let mut keywords = Vec::new();
    for (key, value) in attributes {
        keywords.push(key.clone());
        match value {
            reqlan_index::AttributeValue::Text(text) => keywords.push(text.clone()),
            reqlan_index::AttributeValue::List(items) => keywords.extend(items.iter().cloned()),
            reqlan_index::AttributeValue::Flag(true) => keywords.push(format!("has:{key}")),
            reqlan_index::AttributeValue::Flag(false) => {}
        }
    }
    keywords
}
