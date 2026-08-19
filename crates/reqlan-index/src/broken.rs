//! List unresolved (broken) references from the ideas index.
//! rq:["../../../reqlan rq/core_analysis/core.rq".test_references]

use crate::comment::{unresolved_comment_references, CommentReference};
use crate::extract::path_glob_matches;
use crate::store::{IndexStore, StoreError};
use crate::types::EdgeKind;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Default)]
pub struct ListBrokenReferencesOptions<'a> {
    pub path_glob: Option<&'a str>,
    pub include_comment_references: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokenReference {
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

pub fn list_broken_references(
    store: &IndexStore,
    workspace_root: &Path,
    options: ListBrokenReferencesOptions<'_>,
) -> Result<Vec<BrokenReference>, StoreError> {
    let mut broken = Vec::new();
    for (edge, source) in store.list_unresolved_idea_edges()? {
        if !file_matches(options.path_glob, &source.file_uri) {
            continue;
        }
        if edge.kind == EdgeKind::CommentLink {
            continue;
        }
        broken.push(BrokenReference {
            file_uri: source.file_uri,
            source_id: Some(source.id),
            source_name: Some(source.name),
            kind: edge.kind.as_str().to_string(),
            label: edge.label.unwrap_or_default(),
            source_line: edge.source_line,
            snippet: edge.snippet,
        });
    }

    if options.include_comment_references {
        let catalog = store.list_all_ideas()?;
        for file_uri in store.list_code_document_uris()? {
            if !file_matches(options.path_glob, &file_uri) {
                continue;
            }
            let path = workspace_root.join(&file_uri);
            let Ok(source) = std::fs::read_to_string(&path) else {
                continue;
            };
            for reference in unresolved_comment_references(&file_uri, &source, &catalog) {
                broken.push(broken_comment(&file_uri, &reference));
            }
        }
    }

    broken.sort_by(|left, right| {
        left.file_uri
            .cmp(&right.file_uri)
            .then(left.source_line.cmp(&right.source_line))
            .then(left.label.cmp(&right.label))
            .then(left.kind.cmp(&right.kind))
    });
    Ok(broken)
}

fn file_matches(glob: Option<&str>, file_uri: &str) -> bool {
    match glob {
        None => true,
        Some(glob) if glob.trim().is_empty() => true,
        Some(glob) => path_glob_matches(glob, file_uri),
    }
}

fn broken_comment(file_uri: &str, reference: &CommentReference) -> BrokenReference {
    BrokenReference {
        file_uri: file_uri.to_string(),
        source_id: None,
        source_name: None,
        kind: EdgeKind::CommentLink.as_str().to_string(),
        label: reference.display_label(),
        source_line: Some(reference.line),
        snippet: Some(reference.snippet.clone()),
    }
}
