//! Build export file and code file records.
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_pages]
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_code_reference_pages]
use super::manifest::build_page_info;
use super::util::{rollup_statuses, rollup_tags, slugify};
use crate::types::{ExportCodeFile, ExportFile, ExportIdea};
use reqlan_index::EdgeKind;
use std::collections::{BTreeMap, BTreeSet, HashSet};

pub(crate) fn build_file_records(ideas: &[ExportIdea]) -> Vec<ExportFile> {
    let mut groups: BTreeMap<String, Vec<ExportIdea>> = BTreeMap::new();
    for idea in ideas {
        groups.entry(idea.file_uri.clone()).or_default().push(idea.clone());
    }
    groups
        .into_iter()
        .map(|(file_uri, file_ideas)| {
            let segments: Vec<&str> = file_uri.split('/').filter(|part| !part.is_empty()).collect();
            let name = segments.last().copied().unwrap_or(file_uri.as_str()).to_string();
            let directory = if segments.len() > 1 {
                segments[..segments.len() - 1].join("/")
            } else {
                String::new()
            };
            let slug = slugify(&file_uri);
            let edge_count = file_ideas
                .iter()
                .map(|idea| {
                    idea.references.inbound.len()
                        + idea.references.outbound.len()
                        + idea.references.unresolved.len()
                })
                .sum();
            ExportFile {
                id: format!("file:{file_uri}"),
                file_uri,
                name: name.clone(),
                directory,
                page: build_page_info(
                    &name,
                    &format!("files/{slug}.html"),
                    Some(&format!("print/files/{slug}.html")),
                ),
                print_page: build_page_info(
                    &format!("{name} print"),
                    &format!("print/files/{slug}.html"),
                    None,
                ),
                statuses: rollup_statuses(&file_ideas),
                tags: rollup_tags(&file_ideas),
                ideas: file_ideas,
                edge_count,
            }
        })
        .collect()
}

pub(crate) fn build_code_file_records(
    ideas: &[ExportIdea],
    files: &[ExportFile],
) -> Vec<ExportCodeFile> {
    let hosting: HashSet<String> = files.iter().map(|file| file.file_uri.clone()).collect();
    let mut groups: BTreeMap<String, (BTreeSet<String>, BTreeSet<String>)> = BTreeMap::new();
    for idea in ideas {
        for row in idea.references.outbound.iter().chain(idea.references.unresolved.iter()) {
            if row.kind != EdgeKind::FileReference.as_str()
                && row.kind != EdgeKind::CommentLink.as_str()
            {
                continue;
            }
            let file_uri = row.target_path.trim();
            if file_uri.is_empty() || hosting.contains(file_uri) {
                continue;
            }
            let entry = groups.entry(file_uri.to_string()).or_default();
            entry.0.insert(idea.id.clone());
            if !row.label.trim().is_empty() {
                entry.1.insert(row.label.trim().to_string());
            }
            if !row.target_name.trim().is_empty() {
                entry.1.insert(row.target_name.trim().to_string());
            }
        }
    }
    groups
        .into_iter()
        .map(|(file_uri, (idea_ids, labels))| {
            let segments: Vec<&str> = file_uri.split('/').filter(|part| !part.is_empty()).collect();
            let name = segments.last().copied().unwrap_or(file_uri.as_str()).to_string();
            let directory = if segments.len() > 1 {
                segments[..segments.len() - 1].join("/")
            } else {
                String::new()
            };
            let slug = slugify(&file_uri);
            ExportCodeFile {
                id: format!("file:{file_uri}"),
                file_uri,
                name: name.clone(),
                directory,
                page: build_page_info(
                    &name,
                    &format!("code-files/{slug}.html"),
                    Some(&format!("print/code-files/{slug}.html")),
                ),
                print_page: build_page_info(
                    &format!("{name} print"),
                    &format!("print/code-files/{slug}.html"),
                    None,
                ),
                referencing_idea_ids: idea_ids.into_iter().collect(),
                labels: labels.into_iter().collect(),
            }
        })
        .collect()
}
