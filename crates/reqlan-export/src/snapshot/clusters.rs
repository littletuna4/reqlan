//! Build export cluster records and cluster counts.
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_cluster_pages]
use super::manifest::build_page_info;
use super::util::slugify;
use crate::html_utils::filter_display_label;
use crate::types::{ExportCluster, ExportClusterCounts, ExportIdea};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};

pub(crate) fn build_cluster_records(ideas: &[ExportIdea], strategy: &str) -> Vec<ExportCluster> {
    let mut clusters = Vec::new();
    let mut files: BTreeMap<String, Vec<&ExportIdea>> = BTreeMap::new();
    for idea in ideas {
        files.entry(idea.file_uri.clone()).or_default().push(idea);
    }
    for (file_uri, members) in &files {
        let name = file_uri.rsplit('/').next().unwrap_or(file_uri);
        clusters.push(create_cluster(
            &format!("file:{file_uri}"),
            "file",
            name,
            &format!("Ideas defined in {file_uri}."),
            members.iter().map(|idea| idea.id.clone()).collect(),
            vec![file_uri.clone()],
        ));
    }
    let mut folders: BTreeMap<String, Vec<&ExportIdea>> = BTreeMap::new();
    for idea in ideas {
        let folder = if idea.file_segments.len() > 1 {
            idea.file_segments[..idea.file_segments.len() - 1].join("/")
        } else {
            ".".into()
        };
        folders.entry(folder).or_default().push(idea);
    }
    for (folder, members) in folders {
        clusters.push(create_cluster(
            &format!("folder:{folder}"),
            "folder",
            &folder,
            &format!("Ideas located under folder {folder}."),
            members.iter().map(|idea| idea.id.clone()).collect(),
            unique_file_uris(&members),
        ));
    }
    clusters.extend(build_value_clusters(ideas, "tag"));
    clusters.extend(build_value_clusters(ideas, "status"));
    if strategy != "deterministic" {
        clusters.extend(build_community_clusters(ideas));
    }
    clusters.retain(|cluster| !cluster.idea_ids.is_empty());
    clusters.sort_by(|left, right| left.label.cmp(&right.label));
    for cluster in &mut clusters {
        cluster.page = build_page_info(
            &cluster.label,
            &format!("clusters/{}--{}.html", slugify(&cluster.kind), slugify(&cluster.id)),
            Some(&format!(
                "print/clusters/{}--{}.html",
                slugify(&cluster.kind),
                slugify(&cluster.id)
            )),
        );
    }
    clusters
}

fn build_value_clusters(ideas: &[ExportIdea], kind: &str) -> Vec<ExportCluster> {
    let mut groups: BTreeMap<String, Vec<&ExportIdea>> = BTreeMap::new();
    for idea in ideas {
        let keys =
            if kind == "tag" { idea.tags_keys.clone() } else { vec![idea.status_key.clone()] };
        for key in keys {
            groups.entry(key).or_default().push(idea);
        }
    }
    groups
        .into_iter()
        .map(|(value, members)| {
            let label_value = filter_display_label(&value);
            create_cluster(
                &format!("{kind}:{value}"),
                kind,
                &format!("{kind}: {label_value}"),
                &format!(
                    "{} cluster for {label_value}.",
                    if kind == "tag" { "Tag" } else { "Status" }
                ),
                members.iter().map(|idea| idea.id.clone()).collect(),
                unique_file_uris(&members),
            )
        })
        .collect()
}

fn build_community_clusters(ideas: &[ExportIdea]) -> Vec<ExportCluster> {
    let mut neighbors: HashMap<String, BTreeSet<String>> = HashMap::new();
    for idea in ideas {
        neighbors.entry(idea.id.clone()).or_default();
    }
    for idea in ideas {
        for row in idea.references.inbound.iter().chain(idea.references.outbound.iter()) {
            let Some(target) = &row.target_idea_id else { continue };
            if !neighbors.contains_key(target) {
                continue;
            }
            neighbors.get_mut(&idea.id).unwrap().insert(target.clone());
            neighbors.get_mut(target).unwrap().insert(idea.id.clone());
        }
    }
    let idea_by_id: HashMap<_, _> = ideas.iter().map(|idea| (idea.id.as_str(), idea)).collect();
    let mut visited = HashSet::new();
    let mut clusters = Vec::new();
    for idea in ideas {
        if !visited.insert(idea.id.clone()) {
            continue;
        }
        let mut queue = VecDeque::from([idea.id.clone()]);
        let mut members = Vec::new();
        while let Some(current) = queue.pop_front() {
            members.push(current.clone());
            if let Some(nexts) = neighbors.get(&current) {
                for next in nexts {
                    if visited.insert(next.clone()) {
                        queue.push_back(next.clone());
                    }
                }
            }
        }
        if members.len() < 2 {
            continue;
        }
        let member_ideas: Vec<&ExportIdea> =
            members.iter().filter_map(|id| idea_by_id.get(id.as_str()).copied()).collect();
        let slug = members.iter().map(|id| slugify(id)).collect::<Vec<_>>().join("-");
        let slug = slug.chars().take(80).collect::<String>();
        clusters.push(create_cluster(
            &format!("community:{slug}"),
            "community",
            &format!("community {}", clusters.len() + 1),
            "Computed connectivity cluster from the reference graph.",
            members,
            unique_file_uris(&member_ideas),
        ));
    }
    clusters
}

fn create_cluster(
    id: &str,
    kind: &str,
    label: &str,
    description: &str,
    idea_ids: Vec<String>,
    file_uris: Vec<String>,
) -> ExportCluster {
    let mut idea_ids = idea_ids;
    idea_ids.sort();
    idea_ids.dedup();
    let mut file_uris = file_uris;
    file_uris.sort();
    file_uris.dedup();
    ExportCluster {
        id: id.to_string(),
        kind: kind.to_string(),
        label: label.to_string(),
        description: description.to_string(),
        page: build_page_info(
            label,
            &format!("clusters/{}--{}.html", slugify(kind), slugify(id)),
            None,
        ),
        counts: ExportClusterCounts {
            ideas: idea_ids.len(),
            files: file_uris.len(),
            inbound: 0,
            outbound: 0,
        },
        idea_ids,
        file_uris,
    }
}

fn unique_file_uris(ideas: &[&ExportIdea]) -> Vec<String> {
    let mut uris: Vec<String> = ideas.iter().map(|idea| idea.file_uri.clone()).collect();
    uris.sort();
    uris.dedup();
    uris
}

pub(crate) fn attach_cluster_membership(ideas: &mut [ExportIdea], clusters: &[ExportCluster]) {
    let mut by_idea: HashMap<String, Vec<String>> = HashMap::new();
    for cluster in clusters {
        for idea_id in &cluster.idea_ids {
            by_idea.entry(idea_id.clone()).or_default().push(cluster.id.clone());
        }
    }
    for idea in ideas {
        if let Some(ids) = by_idea.get_mut(&idea.id) {
            ids.sort();
            idea.cluster_ids = ids.clone();
        }
    }
}

pub(crate) fn finalize_cluster_counts(clusters: &mut [ExportCluster], ideas: &[ExportIdea]) {
    let by_id: HashMap<_, _> = ideas.iter().map(|idea| (idea.id.as_str(), idea)).collect();
    for cluster in clusters {
        let mut inbound = 0;
        let mut outbound = 0;
        for idea_id in &cluster.idea_ids {
            if let Some(idea) = by_id.get(idea_id.as_str()) {
                inbound += idea.references.inbound.len();
                outbound += idea.references.outbound.len();
            }
        }
        cluster.counts.inbound = inbound;
        cluster.counts.outbound = outbound;
    }
}
