use crate::html_utils::{filter_display_label, normalize_url_base, slug_attribute_key};
use crate::types::{
    format_attribute_value, ExportAncestorChain, ExportAttribute, ExportAttributeValue,
    ExportCluster, ExportClusterCounts, ExportCodeFile, ExportCounts, ExportFile,
    ExportGraphCatalog, ExportHeaderLink, ExportIdea, ExportIdeaReferenceGroups, ExportManifest,
    ExportPageInfo, ExportPageOptions, ExportReferenceRow, ExportRequest, ExportSearchDocument,
    ExportSnapshot, GraphEdgeView, GraphNodeView, GraphViewQuery, GraphViewSlice,
};
use reqlan_index::ignore::RqIgnoreFilter;
use reqlan_index::{
    parse_attributes, EdgeKind, EdgeRecord, IdeaAttributeMap, IdeaSummary, IndexStore, StoreError,
    FILTER_NOT_PRESENT,
};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};
use std::time::{SystemTime, UNIX_EPOCH};

const GRAPH_MAX_NODES: usize = 120;

pub fn build_export_snapshot(
    store: &IndexStore,
    request: &ExportRequest,
) -> Result<ExportSnapshot, StoreError> {
    let title = if request.scope == "currentFile" {
        if let Some(uri) = &request.source_file_uri {
            format!("{} ({uri})", request.export_name)
        } else {
            request.export_name.clone()
        }
    } else {
        request.export_name.clone()
    };
    let runtime_mode = if request.runtime_mode.is_empty() {
        "interactive".into()
    } else {
        request.runtime_mode.clone()
    };
    let cluster_strategy = if request.cluster_strategy.is_empty() {
        "hybrid".into()
    } else {
        request.cluster_strategy.clone()
    };
    let url_base = normalize_url_base(request.url_base.as_deref());
    let header_link = normalize_header_link(request.header_link.as_ref());
    let page_options = ExportPageOptions {
        include_idea_pages: request.include_idea_pages,
        include_file_pages: request.include_file_pages,
        include_code_file_pages: request.include_code_file_pages,
        include_cluster_pages: request.include_cluster_pages,
        include_attribute_pages: request.include_attribute_pages,
        include_print_pages: request.include_print_pages,
        include_requirements_page: request.include_requirements_page,
        include_graph_page: request.include_graph_page,
    };
    let manifest = build_manifest(request);

    let summaries = if request.scope == "currentFile" {
        match &request.source_file_uri {
            Some(uri) => store.get_ideas_in_file(uri)?,
            None => Vec::new(),
        }
    } else {
        store.list_all_ideas()?
    };
    let summaries = filter_export_ideas(summaries, request);
    let raw = store.all_idea_records()?;
    let raw_by_id: HashMap<String, String> =
        raw.iter().map(|record| (record.id.clone(), record.attributes_json.clone())).collect();
    let edges = store.get_all_edges()?;
    let idea_lookup: HashMap<String, IdeaSummary> =
        summaries.iter().map(|idea| (idea.id.clone(), idea.clone())).collect();

    let mut ideas = build_idea_records(&summaries, &raw_by_id, &edges, &idea_lookup);
    let by_status = rollup_statuses(&ideas);
    let by_tag = rollup_tags(&ideas);
    let mut clusters = build_cluster_records(&ideas, &cluster_strategy);
    attach_cluster_membership(&mut ideas, &clusters);
    finalize_cluster_counts(&mut clusters, &ideas);
    let files = build_file_records(&ideas);
    let code_files = build_code_file_records(&ideas, &files);
    let attributes = build_attribute_records(&ideas);
    let graphs = build_graph_catalog(&ideas, &files, &clusters, &edges, request);
    let search_documents =
        build_search_documents(&ideas, &files, &code_files, &clusters, &attributes);
    let all_files = {
        let mut uris: Vec<String> = ideas.iter().map(|idea| idea.file_uri.clone()).collect();
        uris.sort();
        uris.dedup();
        uris
    };
    let ideas_by_id =
        ideas.iter().map(|idea| (idea.id.clone(), idea.clone())).collect::<BTreeMap<_, _>>();
    let files_by_id =
        files.iter().map(|file| (file.id.clone(), file.clone())).collect::<BTreeMap<_, _>>();
    let code_files_by_id =
        code_files.iter().map(|file| (file.id.clone(), file.clone())).collect::<BTreeMap<_, _>>();
    let clusters_by_id = clusters
        .iter()
        .map(|cluster| (cluster.id.clone(), cluster.clone()))
        .collect::<BTreeMap<_, _>>();
    let attributes_by_key = attributes
        .iter()
        .map(|attribute| (attribute.key.clone(), attribute.clone()))
        .collect::<BTreeMap<_, _>>();

    Ok(ExportSnapshot {
        title,
        generated_at: chrono_now(),
        workspace_root: request.workspace_root.to_string_lossy().into_owned(),
        template_id: request.template_id.clone(),
        scope: request.scope.clone(),
        source_file_uri: request.source_file_uri.clone(),
        runtime_mode,
        cluster_strategy,
        page_options,
        url_base,
        header_link,
        manifest,
        counts: ExportCounts {
            ideas: ideas.len(),
            edges: if request.scope == "currentFile"
                || request.exclude_secret_files
                || request.exclude_ignored_files
            {
                graphs.workspace.edges.len()
            } else {
                edges.len()
            },
            files: files.len(),
            clusters: clusters.len(),
        },
        idea_order: ideas.iter().map(|idea| idea.id.clone()).collect(),
        ideas,
        ideas_by_id,
        files,
        files_by_id,
        code_files,
        code_files_by_id,
        clusters,
        clusters_by_id,
        attributes,
        attributes_by_key,
        graphs,
        search_documents,
        by_status,
        by_tag,
        all_files,
    })
}

fn filter_export_ideas(ideas: Vec<IdeaSummary>, request: &ExportRequest) -> Vec<IdeaSummary> {
    ideas
        .into_iter()
        .filter(|idea| {
            if request.exclude_secret_files && is_secret_rq_path(&idea.file_uri) {
                return false;
            }
            if request.exclude_ignored_files {
                let filter = RqIgnoreFilter::load(&request.workspace_root);
                if filter.ignores(&idea.file_uri, false) {
                    return false;
                }
            }
            true
        })
        .collect()
}

fn is_secret_rq_path(file_uri: &str) -> bool {
    file_uri
        .replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or(file_uri)
        .to_ascii_lowercase()
        .ends_with(".secret.rq")
}

fn build_idea_records(
    summaries: &[IdeaSummary],
    raw_by_id: &HashMap<String, String>,
    edges: &[EdgeRecord],
    idea_lookup: &HashMap<String, IdeaSummary>,
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

fn build_file_records(ideas: &[ExportIdea]) -> Vec<ExportFile> {
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

fn build_code_file_records(ideas: &[ExportIdea], files: &[ExportFile]) -> Vec<ExportCodeFile> {
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

fn build_cluster_records(ideas: &[ExportIdea], strategy: &str) -> Vec<ExportCluster> {
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

fn attach_cluster_membership(ideas: &mut [ExportIdea], clusters: &[ExportCluster]) {
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

fn finalize_cluster_counts(clusters: &mut [ExportCluster], ideas: &[ExportIdea]) {
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

fn build_attribute_records(ideas: &[ExportIdea]) -> Vec<ExportAttribute> {
    let mut by_key: BTreeMap<String, (BTreeSet<String>, BTreeMap<String, BTreeSet<String>>)> =
        BTreeMap::new();
    for idea in ideas {
        for (key, value) in &idea.attributes {
            let entry = by_key.entry(key.clone()).or_default();
            entry.0.insert(idea.id.clone());
            let formatted = {
                let text = format_attribute_value(value);
                if text.is_empty() {
                    "(empty)".into()
                } else {
                    text
                }
            };
            entry.1.entry(formatted).or_default().insert(idea.id.clone());
        }
    }
    let mut records: Vec<ExportAttribute> = by_key
        .into_iter()
        .map(|(key, (idea_ids, values))| {
            let slug = slug_attribute_key(&key);
            let mut values: Vec<ExportAttributeValue> = values
                .into_iter()
                .map(|(value, ids)| ExportAttributeValue {
                    count: ids.len(),
                    idea_ids: ids.into_iter().collect(),
                    value,
                })
                .collect();
            values.sort_by(|left, right| {
                right.count.cmp(&left.count).then(left.value.cmp(&right.value))
            });
            ExportAttribute {
                idea_count: idea_ids.len(),
                idea_ids: idea_ids.into_iter().collect(),
                page: build_page_info(&key, &format!("attributes/{slug}.html"), None),
                key,
                values,
            }
        })
        .collect();
    records.sort_by(|left, right| {
        right.idea_count.cmp(&left.idea_count).then(left.key.cmp(&right.key))
    });
    records
}

fn build_search_documents(
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

fn build_graph_catalog(
    ideas: &[ExportIdea],
    files: &[ExportFile],
    clusters: &[ExportCluster],
    edges: &[EdgeRecord],
    request: &ExportRequest,
) -> ExportGraphCatalog {
    let budget = request.max_graph_nodes.unwrap_or(GRAPH_MAX_NODES);
    let idea_ids: Vec<String> = ideas.iter().map(|idea| idea.id.clone()).collect();
    let workspace =
        build_graph_slice_for_ids(ideas, edges, &idea_ids, budget.max(ideas.len()), 1, None, true);
    let by_idea_id = ideas
        .iter()
        .map(|idea| (idea.id.clone(), expand_from_center(ideas, edges, &idea.id, 2, budget)))
        .collect();
    let by_file_id = files
        .iter()
        .map(|file| {
            let ids: Vec<String> = file.ideas.iter().map(|idea| idea.id.clone()).collect();
            (
                file.id.clone(),
                build_graph_slice_for_ids(
                    ideas,
                    edges,
                    &ids,
                    budget.max(ids.len()),
                    2,
                    None,
                    false,
                ),
            )
        })
        .collect();
    let by_cluster_id = clusters
        .iter()
        .map(|cluster| {
            (
                cluster.id.clone(),
                build_graph_slice_for_ids(
                    ideas,
                    edges,
                    &cluster.idea_ids,
                    budget.max(cluster.idea_ids.len()),
                    2,
                    None,
                    false,
                ),
            )
        })
        .collect();
    ExportGraphCatalog { workspace, by_idea_id, by_file_id, by_cluster_id }
}

fn build_graph_slice_for_ids(
    ideas: &[ExportIdea],
    edges: &[EdgeRecord],
    idea_ids: &[String],
    max_nodes: usize,
    depth: u32,
    center_id: Option<&str>,
    include_ideasets: bool,
) -> GraphViewSlice {
    let allowed: HashSet<&str> = idea_ids.iter().map(String::as_str).collect();
    let seeds: Vec<&ExportIdea> =
        ideas.iter().filter(|idea| allowed.contains(idea.id.as_str())).take(max_nodes).collect();
    collect_slice(
        ideas,
        edges,
        &seeds,
        depth,
        max_nodes,
        seeds.len() < allowed.len(),
        allowed.len(),
        center_id,
        include_ideasets,
    )
}

fn expand_from_center(
    ideas: &[ExportIdea],
    edges: &[EdgeRecord],
    center_id: &str,
    depth: u32,
    max_nodes: usize,
) -> GraphViewSlice {
    let Some(center) = ideas.iter().find(|idea| idea.id == center_id) else {
        return empty_slice(Some(center_id), depth);
    };
    let mut nodes: BTreeMap<String, &ExportIdea> = BTreeMap::new();
    nodes.insert(center.id.clone(), center);
    let mut visited = HashSet::from([center_id.to_string()]);
    let mut frontier = vec![center_id.to_string()];
    let mut truncated = false;
    for _ in 0..depth {
        let mut next = Vec::new();
        for id in &frontier {
            for edge in edges.iter().filter(|edge| {
                edge.source_id == *id || edge.target_id.as_deref() == Some(id.as_str())
            }) {
                for endpoint in
                    [Some(edge.source_id.as_str()), edge.target_id.as_deref()].into_iter().flatten()
                {
                    if !visited.insert(endpoint.to_string()) {
                        continue;
                    }
                    if let Some(idea) = ideas.iter().find(|idea| idea.id == endpoint) {
                        if nodes.len() >= max_nodes {
                            truncated = true;
                            continue;
                        }
                        nodes.insert(idea.id.clone(), idea);
                        next.push(idea.id.clone());
                    }
                }
            }
        }
        frontier = next;
    }
    let seed_ids: Vec<&ExportIdea> = nodes.values().copied().collect();
    collect_slice(
        ideas,
        edges,
        &seed_ids,
        depth,
        max_nodes,
        truncated,
        nodes.len(),
        Some(center_id),
        true,
    )
}

fn collect_slice(
    ideas: &[ExportIdea],
    edges: &[EdgeRecord],
    seeds: &[&ExportIdea],
    depth: u32,
    max_nodes: usize,
    mut truncated: bool,
    total_matching: usize,
    center_id: Option<&str>,
    include_ideasets: bool,
) -> GraphViewSlice {
    let mut nodes: BTreeMap<String, GraphNodeView> = BTreeMap::new();
    for idea in seeds {
        if !include_ideasets && idea.kind == "ideaset" {
            continue;
        }
        nodes.insert(idea.id.clone(), to_graph_node(idea));
    }
    let seed_ids: HashSet<String> = nodes.keys().cloned().collect();
    let mut graph_edges = Vec::new();
    for edge in edges {
        let source_visible = seed_ids.contains(&edge.source_id);
        if !source_visible && depth <= 1 {
            continue;
        }
        if matches!(edge.kind, EdgeKind::FileReference | EdgeKind::UrlReference)
            && edge.target_id.is_none()
        {
            if let Some(target_file) = &edge.target_file {
                if seed_ids.contains(&edge.source_id) {
                    let external_id = format!("file:{target_file}");
                    if !nodes.contains_key(&external_id) {
                        nodes.insert(
                            external_id.clone(),
                            external_graph_node(
                                target_file,
                                &edge.source_id,
                                edge.label.as_deref(),
                            ),
                        );
                    }
                    graph_edges.push(GraphEdgeView {
                        id: edge.id.clone(),
                        source_id: edge.source_id.clone(),
                        target_id: external_id,
                        kind: edge.kind.as_str().to_string(),
                        label: edge.label.clone().or_else(|| Some(target_file.clone())),
                    });
                }
            }
            continue;
        }
        let Some(target_id) = &edge.target_id else { continue };
        let both_visible = seed_ids.contains(&edge.source_id) && seed_ids.contains(target_id);
        let incident = seed_ids.contains(&edge.source_id) || seed_ids.contains(target_id);
        if depth > 1 && incident && !both_visible {
            if let Some(missing) = ideas.iter().find(|idea| {
                (idea.id == edge.source_id || idea.id == *target_id)
                    && !nodes.contains_key(&idea.id)
            }) {
                if nodes.len() < max_nodes {
                    nodes.insert(missing.id.clone(), to_graph_node(missing));
                } else {
                    truncated = true;
                }
            }
        }
        if nodes.contains_key(&edge.source_id) && nodes.contains_key(target_id) {
            graph_edges.push(GraphEdgeView {
                id: edge.id.clone(),
                source_id: edge.source_id.clone(),
                target_id: target_id.clone(),
                kind: edge.kind.as_str().to_string(),
                label: edge.label.clone(),
            });
        }
    }
    graph_edges.sort_by(|left, right| left.id.cmp(&right.id));
    GraphViewSlice {
        query: GraphViewQuery {
            include_indirect: depth > 1,
            max_nodes: Some(max_nodes),
            ignore_hard_cap: Some(true),
            include_ideasets: Some(include_ideasets),
        },
        center_id: center_id.map(str::to_string),
        depth,
        truncated,
        total_matching: Some(total_matching),
        nodes: nodes.into_values().collect(),
        edges: graph_edges,
    }
}

fn to_graph_node(idea: &ExportIdea) -> GraphNodeView {
    GraphNodeView {
        id: idea.id.clone(),
        name: idea.name.clone(),
        kind: idea.kind.clone(),
        file_uri: idea.file_uri.clone(),
        line_start: idea.line_start,
        status: idea.status.clone(),
        status_key: Some(idea.status_key.clone()),
        tags: idea.tags.clone(),
        tags_keys: idea.tags_keys.clone(),
        is_external: None,
        page_url: None,
        host_file_page_url: None,
        is_subject: None,
        attribute_keys: None,
        attributes: None,
    }
}

fn external_graph_node(target_file: &str, source_id: &str, label: Option<&str>) -> GraphNodeView {
    GraphNodeView {
        id: format!("file:{target_file}"),
        name: label.unwrap_or(target_file).to_string(),
        kind: "file".into(),
        file_uri: resolve_referenced_file_path(target_file, source_id),
        line_start: 0,
        status: None,
        status_key: None,
        tags: Vec::new(),
        tags_keys: Vec::new(),
        is_external: Some(true),
        page_url: None,
        host_file_page_url: None,
        is_subject: None,
        attribute_keys: None,
        attributes: None,
    }
}

fn empty_slice(center_id: Option<&str>, depth: u32) -> GraphViewSlice {
    GraphViewSlice {
        query: GraphViewQuery {
            include_indirect: true,
            max_nodes: Some(GRAPH_MAX_NODES),
            ignore_hard_cap: None,
            include_ideasets: None,
        },
        center_id: center_id.map(str::to_string),
        depth,
        truncated: false,
        total_matching: Some(0),
        nodes: Vec::new(),
        edges: Vec::new(),
    }
}

pub fn resolve_referenced_file_path(target_file: &str, source_id: &str) -> String {
    reqlan_index::resolve_rq_path(target_file, reqlan_index::file_from_idea_id(source_id), &[])
}

fn build_manifest(request: &ExportRequest) -> ExportManifest {
    let print_file_name = ensure_html_file_name(&request.print_entry_file_name);
    ExportManifest {
        home: build_page_info("Overview", "index.html", None),
        ideas_index: build_page_info("Ideas", "ideas.html", None),
        files_index: build_page_info("Files", "files.html", None),
        clusters_index: build_page_info("Clusters", "clusters.html", None),
        attributes_index: build_page_info("Attributes", "attributes.html", None),
        code_files_index: build_page_info("Code files", "code-files.html", None),
        graph: build_page_info("Graph", "graph.html", None),
        print_home: build_page_info("Print", &print_file_name, None),
        data_export: build_page_info("Export data", "data/export.json", None),
        data_graph: build_page_info("Graph data", "data/graph.json", None),
        data_search: build_page_info("Search data", "data/search.json", None),
        data_manifest: build_page_info("Manifest data", "data/site-manifest.json", None),
    }
}

pub fn build_page_info(title: &str, path: &str, printable_path: Option<&str>) -> ExportPageInfo {
    ExportPageInfo {
        title: title.to_string(),
        path: path.to_string(),
        url: format!("./{path}"),
        section: None,
        printable_path: printable_path.map(str::to_string),
        printable_url: printable_path.map(|value| format!("./{value}")),
    }
}

fn rollup_statuses(ideas: &[ExportIdea]) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for idea in ideas {
        let key = if idea.status_key.is_empty() {
            FILTER_NOT_PRESENT.to_string()
        } else {
            idea.status_key.clone()
        };
        *counts.entry(key).or_insert(0) += 1;
    }
    counts
}

fn rollup_tags(ideas: &[ExportIdea]) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for idea in ideas {
        let keys = if idea.tags_keys.is_empty() {
            vec![FILTER_NOT_PRESENT.to_string()]
        } else {
            idea.tags_keys.clone()
        };
        for key in keys {
            *counts.entry(key).or_insert(0) += 1;
        }
    }
    counts
}

pub fn slugify(value: &str) -> String {
    let slug = value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' })
        .collect::<String>();
    let slug = slug.trim_matches('-').chars().take(80).collect::<String>();
    if slug.is_empty() {
        "item".into()
    } else {
        slug
    }
}

pub fn ensure_html_file_name(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.to_ascii_lowercase().ends_with(".html") {
        trimmed.to_string()
    } else {
        format!("{trimmed}.html")
    }
}

fn normalize_header_link(link: Option<&ExportHeaderLink>) -> Option<ExportHeaderLink> {
    let link = link?;
    let href = link.href.trim();
    let label = link.label.trim();
    if href.is_empty() || label.is_empty() {
        None
    } else {
        Some(ExportHeaderLink { href: href.to_string(), label: label.to_string() })
    }
}

fn chrono_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let days = secs / 86400;
    let tod = secs % 86400;
    let (year, month, day) = civil_from_days(days as i64);
    let hour = tod / 3600;
    let minute = (tod % 3600) / 60;
    let second = tod % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z")
}

fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m, d)
}
