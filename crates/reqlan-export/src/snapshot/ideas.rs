//! Build export idea records and their reference rows.
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_idea_pages]
use super::manifest::build_page_info;
use super::util::{resolve_referenced_file_path, slugify};
use crate::types::{
    ExportAncestorChain, ExportIdea, ExportIdeaReferenceGroups, ExportReferenceRow,
};
use reqlan_index::{parse_attributes, EdgeRecord, IdeaSummary};
use std::collections::{BTreeSet, HashMap, HashSet};

pub(crate) fn build_idea_records(
    summaries: &[IdeaSummary],
    raw_by_id: &HashMap<String, String>,
    edges: &[EdgeRecord],
    idea_lookup: &HashMap<String, IdeaSummary>,
    katz_scores: &HashMap<String, f64>,
) -> Vec<ExportIdea> {
    let mut records: Vec<ExportIdea> = summaries
        .iter()
        .map(|summary| {
            let attributes =
                raw_by_id.get(&summary.id).map(|json| parse_attributes(json)).unwrap_or_default();
            let file_segments = summary
                .file_uri
                .split('/')
                .filter(|part| !part.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>();
            let file_name =
                file_segments.last().cloned().unwrap_or_else(|| summary.file_uri.clone());
            let slug = format!("{}--{}", slugify(&summary.name), slugify(&summary.id));
            ExportIdea {
                id: summary.id.clone(),
                name: summary.name.clone(),
                kind: summary.kind.as_str().to_string(),
                file_uri: summary.file_uri.clone(),
                line_start: summary.line_start,
                summary: summary.summary.clone(),
                status: summary.status.clone(),
                status_key: summary.status_key.clone(),
                tags: summary.tags.clone(),
                tags_keys: summary.tags_keys.clone(),
                file_name,
                file_segments,
                attributes,
                page: build_page_info(
                    &summary.name,
                    &format!("ideas/{slug}.html"),
                    Some(&format!("print/ideas/{slug}.html")),
                ),
                references: build_reference_groups(&summary.id, edges, idea_lookup),
                ancestors: ExportAncestorChain {
                    idea_id: summary.id.clone(),
                    ancestors: Vec::new(),
                },
                cluster_ids: Vec::new(),
                katz_centrality: *katz_scores
                    .get(&summary.id)
                    .unwrap_or_else(|| panic!("missing Katz score for {}", summary.id)),
            }
        })
        .collect();
    records.sort_by(|left, right| {
        left.file_uri
            .cmp(&right.file_uri)
            .then(left.line_start.cmp(&right.line_start))
            .then(left.name.cmp(&right.name))
    });
    records
}

fn build_reference_groups(
    idea_id: &str,
    edges: &[EdgeRecord],
    idea_lookup: &HashMap<String, IdeaSummary>,
) -> ExportIdeaReferenceGroups {
    let mut inbound = Vec::new();
    let mut outbound = Vec::new();
    let mut unresolved = Vec::new();
    for edge in edges {
        if edge.source_id == idea_id {
            let row = to_outbound_row(edge, idea_lookup);
            if row.is_resolved {
                outbound.push(row);
            } else {
                unresolved.push(row);
            }
        }
        if edge.target_id.as_deref() == Some(idea_id) {
            let row = to_inbound_row(edge, idea_lookup);
            if row.is_resolved {
                inbound.push(row);
            } else {
                unresolved.push(row);
            }
        }
    }
    let nearby = nearby_rows(idea_id, edges, idea_lookup, 2);
    ExportIdeaReferenceGroups { inbound, outbound, unresolved, nearby }
}

fn to_outbound_row(
    edge: &EdgeRecord,
    idea_lookup: &HashMap<String, IdeaSummary>,
) -> ExportReferenceRow {
    let target = edge.target_id.as_deref().and_then(|id| idea_lookup.get(id));
    let target_name = target
        .map(|idea| idea.name.clone())
        .or_else(|| edge.label.clone())
        .or_else(|| edge.target_file.clone())
        .unwrap_or_else(|| "unknown".into());
    let raw_path = target
        .map(|idea| idea.file_uri.clone())
        .or_else(|| edge.target_file.clone())
        .unwrap_or_default();
    let target_path = if target.is_none() {
        if let Some(file) = &edge.target_file {
            resolve_referenced_file_path(file, &edge.source_id)
        } else {
            raw_path
        }
    } else {
        raw_path
    };
    ExportReferenceRow {
        edge_id: edge.id.clone(),
        direction: "outbound".into(),
        kind: edge.kind.as_str().to_string(),
        label: edge.label.clone().unwrap_or_else(|| target_name.clone()),
        target_name,
        target_path,
        target_line: target.map(|idea| idea.line_start),
        source_line: edge.source_line,
        snippet: edge.snippet.clone(),
        is_resolved: edge.is_resolved.unwrap_or(true),
        source_idea_id: edge.source_id.clone(),
        target_idea_id: edge.target_id.clone(),
    }
}

fn to_inbound_row(
    edge: &EdgeRecord,
    idea_lookup: &HashMap<String, IdeaSummary>,
) -> ExportReferenceRow {
    let source = idea_lookup.get(&edge.source_id);
    let target_name = source.map(|idea| idea.name.clone()).unwrap_or_else(|| "unknown".into());
    ExportReferenceRow {
        edge_id: edge.id.clone(),
        direction: "inbound".into(),
        kind: edge.kind.as_str().to_string(),
        label: edge.label.clone().unwrap_or_else(|| target_name.clone()),
        target_name,
        target_path: source.map(|idea| idea.file_uri.clone()).unwrap_or_default(),
        target_line: source.map(|idea| idea.line_start),
        source_line: edge.source_line,
        snippet: edge.snippet.clone(),
        is_resolved: edge.is_resolved.unwrap_or(true),
        source_idea_id: edge.source_id.clone(),
        target_idea_id: edge.target_id.clone(),
    }
}

fn nearby_rows(
    idea_id: &str,
    edges: &[EdgeRecord],
    idea_lookup: &HashMap<String, IdeaSummary>,
    hop_depth: usize,
) -> Vec<ExportReferenceRow> {
    let mut seen_edges = HashSet::new();
    let mut rows = Vec::new();
    let mut visited = HashSet::new();
    let mut frontier = vec![idea_id.to_string()];
    for _ in 0..hop_depth {
        let mut next = BTreeSet::new();
        for id in &frontier {
            if !visited.insert(id.clone()) {
                continue;
            }
            for edge in edges {
                let touches =
                    edge.source_id == *id || edge.target_id.as_deref() == Some(id.as_str());
                if !touches || !seen_edges.insert(edge.id.clone()) {
                    continue;
                }
                if edge.source_id == *id {
                    let row = to_outbound_row(edge, idea_lookup);
                    if let Some(neighbor) = row.target_idea_id.clone() {
                        next.insert(neighbor);
                    }
                    rows.push(row);
                } else {
                    let row = to_inbound_row(edge, idea_lookup);
                    next.insert(row.source_idea_id.clone());
                    rows.push(row);
                }
            }
        }
        frontier = next.into_iter().filter(|id| !visited.contains(id)).collect();
    }
    rows
}
