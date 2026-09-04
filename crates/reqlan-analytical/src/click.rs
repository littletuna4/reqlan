//! Click: kinded local context with search fallback, ranked ambiguity, and session revisit.
//! rq:["../../../reqlan rq/cli/click.rq".click]
//! rq:["../../../reqlan rq/cli/click.rq".click_input]
//! rq:["../../../reqlan rq/cli/click.rq".click_ambiguity]
//! rq:["../../../reqlan rq/cli/click.rq".click_max_detail]
//! rq:["../../../reqlan rq/cli/click.rq".click_output]
//! rq:["../../../reqlan rq/cli/click.rq".click_session]
//! rq:["../../../reqlan rq/cli/click.rq".click_code_file]

use crate::click_sessions::{ClickSessionStore, ROLE_CLICKED, ROLE_CONTENT, ROLE_LISTED};
use crate::types::{
    from_index_summary, ClickCandidate, ClickNameItem, ClickNameList, ClickResult, ClickTarget,
    IdeaSummary, NameAmbiguity,
};
use crate::AnalysisError;
use reqlan_index::{
    click_sessions_path, load_applying_rq_config, EdgeKind, EdgeRecord, IndexStore,
};
use reqlan_parse::{parse_file_reference_string, unquote_path};
use reqlan_search::{
    file_basename, fuzzy_search, hop_distances_from_centers, normalize_context_ref,
    SearchIdeasOptions, CONTEXT_UNREACHABLE_HOP,
};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

const FILE_ID_PREFIX: &str = "file:";

pub struct ClickOptions<'a> {
    pub target: &'a str,
    pub session_key: Option<&'a str>,
    pub max_detail: Option<u32>,
    pub max_backlinks: Option<u32>,
    pub max_siblings: Option<u32>,
    pub max_outbound: Option<u32>,
    pub max_candidates: Option<u32>,
}

impl<'a> ClickOptions<'a> {
    pub fn new(target: &'a str) -> Self {
        Self {
            target,
            session_key: None,
            max_detail: None,
            max_backlinks: None,
            max_siblings: None,
            max_outbound: None,
            max_candidates: None,
        }
    }

    pub fn with_session(mut self, session_key: &'a str) -> Self {
        self.session_key = Some(session_key);
        self
    }
}

struct Limits {
    backlinks: u32,
    siblings: u32,
    outbound: u32,
    candidates: u32,
}

#[derive(Clone)]
enum ResolvedTarget {
    Idea(IdeaSummary),
    File { uri: String },
}

impl ResolvedTarget {
    fn id(&self) -> String {
        match self {
            Self::Idea(idea) => idea.id.clone(),
            Self::File { uri } => file_entry_id(uri),
        }
    }

    fn name(&self) -> &str {
        match self {
            Self::Idea(idea) => idea.name.as_str(),
            Self::File { uri } => file_basename(uri),
        }
    }

    fn file_uri(&self) -> &str {
        match self {
            Self::Idea(idea) => idea.file_uri.as_str(),
            Self::File { uri } => uri.as_str(),
        }
    }

    fn kind_label(&self) -> &'static str {
        match self {
            Self::Idea(_) => "idea",
            Self::File { .. } => "file",
        }
    }

    fn fingerprint(&self) -> String {
        match self {
            Self::Idea(idea) => idea_fingerprint(idea),
            Self::File { uri } => format!("file|{uri}"),
        }
    }

    fn to_candidate(&self, hops: Option<u32>, score: Option<f64>) -> ClickCandidate {
        ClickCandidate {
            name: self.name().to_string(),
            id: self.id(),
            kind: self.kind_label().to_string(),
            file_uri: self.file_uri().to_string(),
            score,
            hops,
        }
    }

    fn to_target(&self, include_content: bool) -> ClickTarget {
        match self {
            Self::Idea(idea) => ClickTarget {
                kind: "idea".into(),
                id: idea.id.clone(),
                name: idea.name.clone(),
                file_uri: idea.file_uri.clone(),
                line_start: idea.line_start,
                content: include_content.then(|| idea.summary.clone()),
                status: idea.status.clone(),
            },
            Self::File { uri } => ClickTarget {
                kind: "file".into(),
                id: file_entry_id(uri),
                name: file_basename(uri).to_string(),
                file_uri: uri.clone(),
                line_start: 0,
                content: None,
                status: None,
            },
        }
    }
}

pub fn click(
    store: &IndexStore,
    workspace_root: &Path,
    memory_path: &Path,
    options: ClickOptions<'_>,
) -> Result<ClickResult, AnalysisError> {
    let config = load_applying_rq_config(workspace_root, None);
    let mut sessions =
        ClickSessionStore::open(&click_sessions_path(memory_path), config.click_max_sessions)?;
    let session_key = sessions.ensure_session(options.session_key)?;
    let limits = Limits {
        backlinks: cap_limit(options.max_backlinks, config.click_max_backlinks),
        siblings: cap_limit(options.max_siblings, config.click_max_siblings),
        outbound: cap_limit(options.max_outbound, config.click_max_outbound),
        candidates: cap_limit(options.max_candidates, config.click_max_candidates),
    };
    let _ = options.max_detail;

    let mut resolved = resolve_targets(store, workspace_root, options.target)?;
    if resolved.is_empty() {
        return search_result(store, &mut sessions, &session_key, options.target, &limits);
    }
    if resolved.len() > 1 {
        let session_ids = sessions.session_idea_ids(&session_key)?;
        let candidates =
            rank_ambiguous_candidates(store, &mut resolved, &session_ids, limits.candidates)?;
        sessions.record_entries(&session_key, &[])?;
        return Ok(ClickResult {
            session_key,
            kind: "ambiguous".into(),
            target: None,
            outbound: None,
            backlinks: None,
            comment_refs: None,
            siblings: None,
            connected: None,
            candidates: Some(candidates),
        });
    }

    let centre = resolved.remove(0);
    let clicked = sessions.hashes_for_role(&session_key, ROLE_CLICKED)?;
    let fingerprint = centre.fingerprint();
    let is_revisit = clicked.get(&centre.id()).is_some_and(|previous| previous == &fingerprint);
    if is_revisit {
        return revisit_result(store, &mut sessions, &session_key, &centre, &limits);
    }
    unique_result(store, &mut sessions, &session_key, &centre, &limits)
}

/// Classify a name or target as none, unique, or ambiguous.
/// rq:["../../../reqlan rq/cli/click.rq".click_ambiguity]
pub fn check_name_ambiguity(
    store: &IndexStore,
    workspace_root: &Path,
    name: &str,
) -> Result<NameAmbiguity, AnalysisError> {
    let matches = resolve_targets(store, workspace_root, name)?;
    let kind = match matches.len() {
        0 => "none",
        1 => "unique",
        _ => "ambiguous",
    };
    Ok(NameAmbiguity {
        kind: kind.into(),
        matches: matches.into_iter().map(|target| target.to_candidate(None, None)).collect(),
    })
}

fn search_result(
    store: &IndexStore,
    sessions: &mut ClickSessionStore,
    session_key: &str,
    query: &str,
    limits: &Limits,
) -> Result<ClickResult, AnalysisError> {
    let search = fuzzy_search(
        store,
        query,
        SearchIdeasOptions {
            limit: Some(limits.candidates as usize),
            offset: 0,
            require_query: true,
        },
    )?;
    let candidates: Vec<ClickCandidate> = search
        .hits
        .into_iter()
        .map(|hit| ClickCandidate {
            name: hit.name,
            id: hit.id,
            kind: if matches!(hit.kind, reqlan_search::FuzzyHitKind::File) {
                "file".into()
            } else {
                "idea".into()
            },
            file_uri: hit.file_uri,
            score: Some(hit.score),
            hops: None,
        })
        .collect();
    sessions.record_entries(session_key, &[])?;
    Ok(ClickResult {
        session_key: session_key.to_string(),
        kind: "search".into(),
        target: None,
        outbound: None,
        backlinks: None,
        comment_refs: None,
        siblings: None,
        connected: None,
        candidates: Some(candidates),
    })
}

fn unique_result(
    store: &IndexStore,
    sessions: &mut ClickSessionStore,
    session_key: &str,
    centre: &ResolvedTarget,
    limits: &Limits,
) -> Result<ClickResult, AnalysisError> {
    let name_counts = idea_name_counts(store)?;
    let file_counts = file_basename_counts(store)?;
    let Neighbours { outbound, backlinks, comment_refs, siblings } =
        collect_neighbours(store, centre)?;
    let outbound_list = cap_names(&outbound, limits.outbound, &name_counts, &file_counts);
    let backlink_list = cap_names(&backlinks, limits.backlinks, &name_counts, &file_counts);
    let comment_list = cap_names(&comment_refs, limits.backlinks, &name_counts, &file_counts);
    let sibling_list = cap_names(&siblings, limits.siblings, &name_counts, &file_counts);

    let mut entries = vec![(centre.id(), ROLE_CLICKED.to_string(), centre.fingerprint())];
    if matches!(centre, ResolvedTarget::Idea(_)) {
        entries.push((centre.id(), ROLE_CONTENT.to_string(), centre.fingerprint()));
    }
    for item in outbound_list
        .items
        .iter()
        .chain(backlink_list.items.iter())
        .chain(comment_list.items.iter())
        .chain(sibling_list.items.iter())
    {
        entries.push((item.id.clone(), ROLE_LISTED.to_string(), String::new()));
    }
    sessions.record_entries(session_key, &entries)?;

    let comment_refs =
        if matches!(centre, ResolvedTarget::File { .. }) { Some(comment_list) } else { None };
    let siblings = if matches!(centre, ResolvedTarget::File { uri } if !uri.to_lowercase().ends_with(".rq"))
    {
        None
    } else {
        Some(sibling_list)
    };

    Ok(ClickResult {
        session_key: session_key.to_string(),
        kind: "unique".into(),
        target: Some(centre.to_target(matches!(centre, ResolvedTarget::Idea(_)))),
        outbound: Some(outbound_list),
        backlinks: Some(backlink_list),
        comment_refs,
        siblings,
        connected: None,
        candidates: None,
    })
}

fn revisit_result(
    store: &IndexStore,
    sessions: &mut ClickSessionStore,
    session_key: &str,
    centre: &ResolvedTarget,
    limits: &Limits,
) -> Result<ClickResult, AnalysisError> {
    let listed = sessions.listed_ids(session_key)?;
    let listed_set: HashSet<&str> = listed.iter().map(String::as_str).collect();
    let shown = sessions.hashes_for_role(session_key, ROLE_CONTENT)?;
    let Neighbours { outbound, backlinks, comment_refs, siblings } =
        collect_neighbours(store, centre)?;
    let mut connected_ids: Vec<String> = Vec::new();
    for item in
        outbound.iter().chain(backlinks.iter()).chain(comment_refs.iter()).chain(siblings.iter())
    {
        if item.kind != "idea" {
            continue;
        }
        if listed_set.contains(item.id.as_str()) {
            connected_ids.push(item.id.clone());
        }
    }
    connected_ids.dedup();
    let cap = (limits.backlinks + limits.siblings + limits.outbound) as usize;
    let mut connected = Vec::new();
    let mut entries = vec![(centre.id(), ROLE_CLICKED.to_string(), centre.fingerprint())];
    for id in connected_ids.into_iter().take(cap) {
        let Some(idea) = store.get_idea(&id)? else {
            continue;
        };
        let summary = from_index_summary(idea);
        let hash = idea_fingerprint(&summary);
        if shown.get(&id).is_some_and(|previous| previous == &hash) {
            continue;
        }
        entries.push((id.clone(), ROLE_CONTENT.to_string(), hash));
        connected.push(ClickTarget {
            kind: "idea".into(),
            id: summary.id,
            name: summary.name,
            file_uri: summary.file_uri,
            line_start: summary.line_start,
            content: Some(summary.summary),
            status: summary.status,
        });
    }
    sessions.record_entries(session_key, &entries)?;
    Ok(ClickResult {
        session_key: session_key.to_string(),
        kind: "revisit".into(),
        target: Some(centre.to_target(false)),
        outbound: None,
        backlinks: None,
        comment_refs: None,
        siblings: None,
        connected: Some(connected),
        candidates: None,
    })
}

struct Neighbours {
    outbound: Vec<ClickNameItem>,
    backlinks: Vec<ClickNameItem>,
    comment_refs: Vec<ClickNameItem>,
    siblings: Vec<ClickNameItem>,
}

fn collect_neighbours(
    store: &IndexStore,
    centre: &ResolvedTarget,
) -> Result<Neighbours, AnalysisError> {
    match centre {
        ResolvedTarget::Idea(idea) => collect_idea_neighbours(store, idea),
        ResolvedTarget::File { uri } => collect_file_neighbours(store, uri),
    }
}

fn collect_idea_neighbours(
    store: &IndexStore,
    idea: &IdeaSummary,
) -> Result<Neighbours, AnalysisError> {
    let content = idea.summary.as_str();
    let mut outbound = Vec::new();
    let mut seen_out = HashSet::new();
    for edge in store.get_edges_from(&idea.id)? {
        if !outbound_edge_in_content(&edge, content) {
            continue;
        }
        if edge.kind == EdgeKind::WildcardReference {
            if let Some(target_id) = &edge.target_id {
                if let Some(item) = idea_name_item(store, target_id)? {
                    if seen_out.insert(item.id.clone()) {
                        outbound.push(item);
                    }
                }
            } else if let Some(path) = edge.target_file.or(edge.label) {
                push_file_item(&mut outbound, &mut seen_out, &path);
            }
            continue;
        }
        if let Some(target_id) = &edge.target_id {
            if let Some(item) = idea_name_item(store, target_id)? {
                if seen_out.insert(item.id.clone()) {
                    outbound.push(item);
                }
            }
        } else if let Some(path) = edge.target_file.or(edge.label) {
            push_file_item(&mut outbound, &mut seen_out, &path);
        }
    }

    let mut backlinks = Vec::new();
    let mut seen_in = HashSet::new();
    for edge in store.get_edges_to(&idea.id)? {
        if matches!(edge.kind, EdgeKind::IdeasetMember | EdgeKind::Import) {
            continue;
        }
        if let Some(item) = idea_name_item(store, &edge.source_id)? {
            if seen_in.insert(item.id.clone()) {
                backlinks.push(item);
            }
        }
    }

    let siblings = idea_siblings(store, idea)?;
    Ok(Neighbours { outbound, backlinks, comment_refs: Vec::new(), siblings })
}

fn collect_file_neighbours(store: &IndexStore, uri: &str) -> Result<Neighbours, AnalysisError> {
    let file_name = file_basename(uri).to_string();
    let mut backlinks = Vec::new();
    let mut comment_refs = Vec::new();
    let mut seen_back = HashSet::new();
    let mut seen_comment = HashSet::new();
    for edge in store.get_all_edges()? {
        if edge.kind == EdgeKind::FileReference {
            if let Some(target_file) = &edge.target_file {
                if match_file_reference(target_file, uri, &file_name).is_some() {
                    if let Some(item) = idea_name_item(store, &edge.source_id)? {
                        if seen_back.insert(item.id.clone()) {
                            backlinks.push(item);
                        }
                    }
                }
            }
        }
        if edge.kind == EdgeKind::CommentLink {
            if let Some(target_file) = &edge.target_file {
                if match_file_reference(target_file, uri, &file_name).is_some() {
                    if let Some(item) = idea_name_item(store, &edge.source_id)? {
                        if seen_comment.insert(item.id.clone()) {
                            comment_refs.push(item);
                        }
                    }
                }
            }
        }
    }
    let siblings = if uri.to_lowercase().ends_with(".rq") {
        file_idea_siblings(store, uri, None)?
    } else {
        Vec::new()
    };
    Ok(Neighbours { outbound: Vec::new(), backlinks, comment_refs, siblings })
}

fn idea_siblings(
    store: &IndexStore,
    idea: &IdeaSummary,
) -> Result<Vec<ClickNameItem>, AnalysisError> {
    let mut siblings = file_idea_siblings(store, &idea.file_uri, Some(&idea.id))?;
    let mut seen: HashSet<String> = siblings.iter().map(|item| item.id.clone()).collect();
    for edge in store.get_edges_to(&idea.id)? {
        if edge.kind != EdgeKind::IdeasetMember {
            continue;
        }
        for member in store.get_edges_from(&edge.source_id)? {
            if member.kind != EdgeKind::IdeasetMember {
                continue;
            }
            let Some(target_id) = member.target_id else {
                continue;
            };
            if target_id == idea.id || !seen.insert(target_id.clone()) {
                continue;
            }
            if let Some(item) = idea_name_item(store, &target_id)? {
                siblings.push(item);
            }
        }
    }
    Ok(siblings)
}

fn file_idea_siblings(
    store: &IndexStore,
    file_uri: &str,
    exclude_id: Option<&str>,
) -> Result<Vec<ClickNameItem>, AnalysisError> {
    let mut siblings = Vec::new();
    for idea in store.get_ideas_in_file(file_uri)? {
        if idea.kind == reqlan_index::IdeaKind::Ideaset {
            continue;
        }
        if exclude_id.is_some_and(|id| idea.id == id) {
            continue;
        }
        siblings.push(ClickNameItem {
            name: idea.name,
            id: idea.id,
            kind: "idea".into(),
            file_uri: None,
        });
    }
    Ok(siblings)
}

/// Outbound lists refs that appear in the idea body (indexed summary), not attributes
/// or comment_link rows stored as idea → code file.
/// rq:["../../../reqlan rq/cli/click.rq".click_output]
fn outbound_edge_in_content(edge: &EdgeRecord, content: &str) -> bool {
    match edge.kind {
        EdgeKind::IdeasetMember | EdgeKind::Import | EdgeKind::CommentLink => false,
        EdgeKind::FileReference | EdgeKind::UrlReference => {
            snippet_in_content(content, edge.snippet.as_deref())
                || path_in_content(content, edge.target_file.as_deref().or(edge.label.as_deref()))
        }
        EdgeKind::References | EdgeKind::WildcardReference => {
            snippet_in_content(content, edge.snippet.as_deref())
                || edge.label.as_deref().is_some_and(|label| idea_name_in_content(content, label))
        }
    }
}

fn snippet_in_content(content: &str, snippet: Option<&str>) -> bool {
    snippet.is_some_and(|snippet| !snippet.is_empty() && content.contains(snippet))
}

fn path_in_content(content: &str, path: Option<&str>) -> bool {
    path.is_some_and(|path| {
        let path = unquote_path(path);
        !path.is_empty() && content.contains(&path)
    })
}

fn idea_name_in_content(content: &str, name: &str) -> bool {
    if name.is_empty() {
        return false;
    }
    content.contains(&format!("[{name}]"))
        || content.contains(&format!("[{name}."))
        || content.contains(&format!("\".{name}]"))
        || content.contains(&format!(".{name}]"))
        || content.contains(&format!("[[{name}]]"))
}

fn push_file_item(outbound: &mut Vec<ClickNameItem>, seen: &mut HashSet<String>, raw_path: &str) {
    let item = file_name_item(raw_path);
    if seen.insert(item.id.clone()) {
        outbound.push(item);
    }
}

fn file_name_item(raw_path: &str) -> ClickNameItem {
    let unquoted = unquote_path(raw_path);
    let parsed = parse_file_reference_string(&unquoted);
    let path = if parsed.file_path.is_empty() { unquoted } else { parsed.file_path };
    ClickNameItem {
        name: file_basename(&path).to_string(),
        id: file_entry_id(&path),
        kind: "file".into(),
        file_uri: Some(path),
    }
}

fn idea_name_item(store: &IndexStore, id: &str) -> Result<Option<ClickNameItem>, AnalysisError> {
    let Some(idea) = store.get_idea(id)? else {
        return Ok(None);
    };
    if idea.kind == reqlan_index::IdeaKind::Ideaset {
        return Ok(None);
    }
    Ok(Some(ClickNameItem { name: idea.name, id: idea.id, kind: "idea".into(), file_uri: None }))
}

fn cap_names(
    items: &[ClickNameItem],
    limit: u32,
    idea_counts: &HashMap<String, u32>,
    file_counts: &HashMap<String, u32>,
) -> ClickNameList {
    let total = items.len() as u32;
    let take = (limit as usize).min(items.len());
    let omitted = total.saturating_sub(take as u32);
    let items = items
        .iter()
        .take(take)
        .map(|item| {
            let mut item = item.clone();
            if item.kind == "idea" {
                if idea_counts.get(&item.name).copied().unwrap_or(0) > 1 {
                    if let Some(stripped) = item.id.split_once('#') {
                        item.file_uri = Some(stripped.0.to_string());
                    }
                }
            } else if file_counts.get(&item.name).copied().unwrap_or(0) > 1 {
                if item.file_uri.is_none() {
                    item.file_uri = Some(item.id.trim_start_matches(FILE_ID_PREFIX).to_string());
                }
            } else if item.kind == "file" {
                // Unique file basename: keep path only when already set for wildcards.
            }
            item
        })
        .collect();
    ClickNameList { total, items, omitted }
}

fn resolve_targets(
    store: &IndexStore,
    workspace_root: &Path,
    raw: &str,
) -> Result<Vec<ResolvedTarget>, AnalysisError> {
    let token = normalize_context_ref(raw);
    if token.is_empty() {
        return Ok(Vec::new());
    }
    if let Some((path, name)) = token.rsplit_once('#') {
        if !path.is_empty() && !name.is_empty() {
            let uri = reqlan_index::sync::to_indexed_uri(workspace_root, path);
            let id = reqlan_index::idea_id(&uri, name);
            if let Some(idea) = store.get_idea(&id)? {
                return Ok(vec![ResolvedTarget::Idea(from_index_summary(idea))]);
            }
            return Ok(Vec::new());
        }
    }

    let as_file = reqlan_index::sync::to_indexed_uri(workspace_root, &token);
    let documents = store.list_document_uris()?;
    if documents.iter().any(|uri| uri == &as_file) {
        return Ok(vec![ResolvedTarget::File { uri: as_file }]);
    }

    let mut matches = Vec::new();
    for idea in store.list_all_ideas()? {
        if idea.name == token && idea.kind != reqlan_index::IdeaKind::Ideaset {
            matches.push(ResolvedTarget::Idea(from_index_summary(idea)));
        }
    }
    for uri in documents {
        if file_basename(&uri) == token {
            matches.push(ResolvedTarget::File { uri });
        }
    }
    Ok(matches)
}

fn rank_ambiguous_candidates(
    store: &IndexStore,
    targets: &mut Vec<ResolvedTarget>,
    session_ids: &[String],
    max_candidates: u32,
) -> Result<Vec<ClickCandidate>, AnalysisError> {
    if session_ids.is_empty() {
        rank_targets_by_name(targets);
        return Ok(targets
            .drain(..)
            .take(max_candidates as usize)
            .map(|target| target.to_candidate(None, None))
            .collect());
    }
    let hop_edges: Vec<(String, String)> = store
        .get_all_edges()?
        .into_iter()
        .filter_map(|edge| edge.target_id.map(|target| (edge.source_id, target)))
        .collect();
    let distances = hop_distances_from_centers(session_ids, &hop_edges);
    let file_hops = file_session_hops(store, session_ids)?;
    rank_targets_by_session_hops(targets, &distances, &file_hops);
    Ok(targets
        .drain(..)
        .take(max_candidates as usize)
        .map(|target| {
            let hops = target_hop(&target, &distances, &file_hops);
            target.to_candidate(Some(hops), None)
        })
        .collect())
}

fn rank_targets_by_name(targets: &mut [ResolvedTarget]) {
    targets.sort_by(|left, right| {
        left.name()
            .cmp(right.name())
            .then(left.file_uri().cmp(right.file_uri()))
            .then(left.id().cmp(&right.id()))
    });
}

fn rank_targets_by_session_hops(
    targets: &mut [ResolvedTarget],
    distances: &HashMap<String, u32>,
    file_hops: &HashMap<String, u32>,
) {
    targets.sort_by(|left, right| {
        let left_hop = target_hop(left, distances, file_hops);
        let right_hop = target_hop(right, distances, file_hops);
        left_hop
            .cmp(&right_hop)
            .then(left.name().cmp(right.name()))
            .then(left.file_uri().cmp(right.file_uri()))
            .then(left.id().cmp(&right.id()))
    });
}

fn file_session_hops(
    store: &IndexStore,
    session_idea_ids: &[String],
) -> Result<HashMap<String, u32>, AnalysisError> {
    let session: HashSet<&str> = session_idea_ids.iter().map(String::as_str).collect();
    let mut hops = HashMap::new();
    for edge in store.get_all_edges()? {
        if !session.contains(edge.source_id.as_str()) {
            continue;
        }
        if let Some(target_file) = edge.target_file {
            hops.entry(target_file).or_insert(1);
        }
    }
    Ok(hops)
}

fn target_hop(
    target: &ResolvedTarget,
    distances: &HashMap<String, u32>,
    file_hops: &HashMap<String, u32>,
) -> u32 {
    match target {
        ResolvedTarget::Idea(idea) => {
            distances.get(&idea.id).copied().unwrap_or(CONTEXT_UNREACHABLE_HOP)
        }
        ResolvedTarget::File { uri } => {
            file_hops.get(uri).copied().unwrap_or(CONTEXT_UNREACHABLE_HOP)
        }
    }
}

fn idea_name_counts(store: &IndexStore) -> Result<HashMap<String, u32>, AnalysisError> {
    let mut counts = HashMap::new();
    for idea in store.list_all_ideas()? {
        if idea.kind == reqlan_index::IdeaKind::Ideaset {
            continue;
        }
        *counts.entry(idea.name).or_insert(0) += 1;
    }
    Ok(counts)
}

fn file_basename_counts(store: &IndexStore) -> Result<HashMap<String, u32>, AnalysisError> {
    let mut counts = HashMap::new();
    for uri in store.list_document_uris()? {
        *counts.entry(file_basename(&uri).to_string()).or_insert(0) += 1;
    }
    Ok(counts)
}

fn match_file_reference(
    target_file: &str,
    file_uri: &str,
    file_name: &str,
) -> Option<&'static str> {
    let target = target_file.replace('\\', "/").trim_end_matches('/').to_string();
    let file = file_uri.replace('\\', "/");
    if target.is_empty() {
        return None;
    }
    if target == file
        || target.ends_with(&format!("/{file_name}"))
        || file.ends_with(&format!("/{target}"))
    {
        return Some("file");
    }
    if file.contains(&target) || target.contains(&file) {
        return Some("file");
    }
    None
}

fn cap_limit(override_value: Option<u32>, config_value: u32) -> u32 {
    let value = override_value.unwrap_or(config_value);
    if value < 1 {
        1
    } else {
        value
    }
}

fn file_entry_id(uri: &str) -> String {
    format!("{FILE_ID_PREFIX}{uri}")
}

fn idea_fingerprint(idea: &IdeaSummary) -> String {
    let status = idea.status.as_deref().unwrap_or("");
    let mut tags = idea.tags.clone();
    tags.sort();
    format!("{}|{}|{}|{}", idea.name, idea.summary, status, tags.join(","))
}

/// Resolve application-memory path for click sessions (tests / callers).
pub fn click_memory_path(workspace_root: &Path, storage_path: Option<&Path>) -> PathBuf {
    reqlan_index::ignore::application_memory_path(workspace_root, storage_path)
}
