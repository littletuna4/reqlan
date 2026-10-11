//! Compare ideas in two git snapshots.
//! rq:["../../../reqlan rq/cli/diff.rq".diff]
//! rq:["../../../reqlan rq/cli/diff.rq".diff_verbosity]
//! rq:["../../../reqlan rq/core_analysis/core.rq".consumption_silence]

use crate::api::AnalysisError;
use reqlan_index::{
    extract_from_parse, AttributeValue as IndexAttributeValue, ExtractOptions, IdeaAttributeMap,
    CREATE_NO_WINDOW,
};
use reqlan_parse::{
    parse_document, AttributeValue, BodyElement, ListItem, ReferenceTarget, RichPart,
    TopLevelElement,
};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum DiffVerbosity {
    Summary,
    References,
    Text,
}

impl DiffVerbosity {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim() {
            "summary" => Some(Self::Summary),
            "references" => Some(Self::References),
            "text" => Some(Self::Text),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum DiffChange {
    Created,
    Deleted,
    Modified,
    Moved,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiffReferences {
    pub added: Vec<String>,
    pub removed: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiffText {
    pub before: String,
    pub after: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiffRow {
    pub change: DiffChange,
    pub name: String,
    pub file: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub references: Option<DiffReferences>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<DiffText>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    pub from: String,
    pub to: String,
    pub implicit: bool,
    pub rows: Vec<DiffRow>,
}

#[derive(Debug, Clone)]
struct IdeaSnap {
    path: String,
    name: String,
    body: String,
    attributes: String,
    members: BTreeSet<String>,
    refs: BTreeSet<String>,
}

impl IdeaSnap {
    fn content_key(&self) -> String {
        let members = self.members.iter().cloned().collect::<Vec<_>>().join("\n");
        format!("{}\n{}\n{members}", self.body, self.attributes)
    }
}

/// Compare ideas. `from` and `to` omitted uses the working-tree default.
/// `to` omitted and `from` set compares that revision with `HEAD`.
pub fn diff_ideas(
    workspace: &Path,
    from: Option<&str>,
    to: Option<&str>,
    verbosity: DiffVerbosity,
) -> Result<DiffResult, AnalysisError> {
    ensure_repository(workspace)?;
    let from = blank(from);
    let to = blank(to);
    let implicit = from.is_none() || to.is_none();
    let (from_label, to_label, left, right) = match (from, to) {
        (None, None) => {
            let (from_label, to_label, left, right) = default_snapshots(workspace)?;
            (from_label, to_label, left, right)
        }
        (Some(from), None) => {
            let from_label = normalize_target(from);
            (
                from_label.clone(),
                "HEAD".to_string(),
                load_commit(workspace, &from_label)?,
                load_commit(workspace, "HEAD")?,
            )
        }
        (None, Some(to)) => {
            let to_label = normalize_target(to);
            (
                "HEAD".to_string(),
                to_label.clone(),
                load_commit(workspace, "HEAD")?,
                load_commit(workspace, &to_label)?,
            )
        }
        (Some(from), Some(to)) => {
            let from_label = normalize_target(from);
            let to_label = normalize_target(to);
            (
                from_label.clone(),
                to_label.clone(),
                load_commit(workspace, &from_label)?,
                load_commit(workspace, &to_label)?,
            )
        }
    };
    Ok(DiffResult {
        from: from_label,
        to: to_label,
        implicit,
        rows: classify(&left, &right, verbosity),
    })
}

fn blank(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn default_snapshots(
    workspace: &Path,
) -> Result<(String, String, Vec<IdeaSnap>, Vec<IdeaSnap>), AnalysisError> {
    if rq_changes(workspace)? {
        Ok((
            "HEAD".to_string(),
            "pending".to_string(),
            load_commit(workspace, "HEAD")?,
            load_pending(workspace)?,
        ))
    } else {
        let right = load_commit(workspace, "HEAD")?;
        let left = match resolve_commit(workspace, "HEAD~1") {
            Ok(rev) => load_commit_rev(workspace, &rev)?,
            Err(AnalysisError::BadRevision) => Vec::new(),
            Err(error) => return Err(error),
        };
        Ok(("HEAD~1".to_string(), "HEAD".to_string(), left, right))
    }
}

fn classify(left: &[IdeaSnap], right: &[IdeaSnap], verbosity: DiffVerbosity) -> Vec<DiffRow> {
    let left_by_key = by_key(left);
    let right_by_key = by_key(right);
    let mut consumed_left: BTreeSet<(String, String)> = BTreeSet::new();
    let mut consumed_right: BTreeSet<(String, String)> = BTreeSet::new();
    let mut rows = Vec::new();

    for (key, left_idea) in &left_by_key {
        if let Some(right_idea) = right_by_key.get(key) {
            consumed_left.insert(key.clone());
            consumed_right.insert(key.clone());
            if left_idea.content_key() != right_idea.content_key() {
                rows.push(row(DiffChange::Modified, left_idea, right_idea, verbosity));
            }
        }
    }

    let names = left
        .iter()
        .map(|idea| idea.name.as_str())
        .chain(right.iter().map(|idea| idea.name.as_str()))
        .collect::<BTreeSet<_>>();
    for name in names {
        let Some(left_idea) = unique_named(left, name) else {
            continue;
        };
        let Some(right_idea) = unique_named(right, name) else {
            continue;
        };
        let left_key = (left_idea.path.clone(), left_idea.name.clone());
        let right_key = (right_idea.path.clone(), right_idea.name.clone());
        if consumed_left.contains(&left_key) || consumed_right.contains(&right_key) {
            continue;
        }
        if left_idea.path != right_idea.path && left_idea.content_key() == right_idea.content_key()
        {
            consumed_left.insert(left_key);
            consumed_right.insert(right_key);
            rows.push(row(DiffChange::Moved, left_idea, right_idea, verbosity));
        }
    }

    for (key, idea) in &left_by_key {
        if consumed_left.contains(key) {
            continue;
        }
        rows.push(row(DiffChange::Deleted, idea, &empty_side(idea), verbosity));
    }
    for (key, idea) in &right_by_key {
        if consumed_right.contains(key) {
            continue;
        }
        rows.push(row(DiffChange::Created, &empty_side(idea), idea, verbosity));
    }

    rows.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then(left.file.cmp(&right.file))
            .then(change_rank(left.change).cmp(&change_rank(right.change)))
    });
    rows
}

fn change_rank(change: DiffChange) -> u8 {
    match change {
        DiffChange::Created => 0,
        DiffChange::Deleted => 1,
        DiffChange::Modified => 2,
        DiffChange::Moved => 3,
    }
}

fn row(change: DiffChange, left: &IdeaSnap, right: &IdeaSnap, verbosity: DiffVerbosity) -> DiffRow {
    let (file, from_file) = match change {
        DiffChange::Deleted => (left.path.clone(), None),
        DiffChange::Moved => (right.path.clone(), Some(left.path.clone())),
        DiffChange::Created | DiffChange::Modified => (right.path.clone(), None),
    };
    let references = match verbosity {
        DiffVerbosity::References => Some(ref_delta(&left.refs, &right.refs)),
        DiffVerbosity::Summary | DiffVerbosity::Text => None,
    };
    let text = match (change, verbosity) {
        (DiffChange::Moved, _) | (_, DiffVerbosity::Summary | DiffVerbosity::References) => None,
        (DiffChange::Created, DiffVerbosity::Text) => {
            Some(DiffText { before: String::new(), after: display_text(right) })
        }
        (DiffChange::Deleted, DiffVerbosity::Text) => {
            Some(DiffText { before: display_text(left), after: String::new() })
        }
        (DiffChange::Modified, DiffVerbosity::Text) => {
            Some(DiffText { before: display_text(left), after: display_text(right) })
        }
    };
    DiffRow { change, name: right.name.clone(), file, from_file, references, text }
}

fn display_text(idea: &IdeaSnap) -> String {
    let attrs = format_attributes(&idea.attributes);
    match (idea.body.is_empty(), attrs.is_empty()) {
        (true, true) => String::new(),
        (false, true) => idea.body.clone(),
        (true, false) => attrs,
        (false, false) => format!("{}\n{attrs}", idea.body),
    }
}

fn format_attributes(attributes_json: &str) -> String {
    let Ok(map) = serde_json::from_str::<IdeaAttributeMap>(attributes_json) else {
        return String::new();
    };
    map.into_iter()
        .filter_map(|(name, value)| match value {
            IndexAttributeValue::Flag(false) => None,
            IndexAttributeValue::Flag(true) => Some(format!("@{name}")),
            IndexAttributeValue::Text(text) if text.is_empty() => Some(format!("@{name}")),
            IndexAttributeValue::Text(text) => Some(format!("@{name} {text}")),
            IndexAttributeValue::List(items) => Some(format!("@{name} ( {})", items.join(" "))),
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn ref_delta(left: &BTreeSet<String>, right: &BTreeSet<String>) -> DiffReferences {
    DiffReferences {
        added: right.difference(left).cloned().collect(),
        removed: left.difference(right).cloned().collect(),
    }
}

fn empty_side(idea: &IdeaSnap) -> IdeaSnap {
    IdeaSnap {
        path: idea.path.clone(),
        name: idea.name.clone(),
        body: String::new(),
        attributes: String::new(),
        members: BTreeSet::new(),
        refs: BTreeSet::new(),
    }
}

fn by_key(ideas: &[IdeaSnap]) -> BTreeMap<(String, String), &IdeaSnap> {
    let mut map = BTreeMap::new();
    for idea in ideas {
        map.entry((idea.path.clone(), idea.name.clone())).or_insert(idea);
    }
    map
}

fn unique_named<'a>(ideas: &'a [IdeaSnap], name: &str) -> Option<&'a IdeaSnap> {
    let mut found = None;
    for idea in ideas {
        if idea.name != name {
            continue;
        }
        if found.is_some() {
            return None;
        }
        found = Some(idea);
    }
    found
}

fn ideas_from_source(path: &str, source: &str) -> Vec<IdeaSnap> {
    let parsed = parse_document(source);
    let extracted = extract_from_parse(path, source, &parsed, &ExtractOptions::default());
    let mut refs_by_name: HashMap<String, BTreeSet<String>> = HashMap::new();
    let mut members_by_name: HashMap<String, BTreeSet<String>> = HashMap::new();
    for element in &parsed.model.elements {
        match element {
            TopLevelElement::Idea(idea) => {
                refs_by_name.insert(idea.name.clone(), refs_in_elements(&idea.elements));
            }
            TopLevelElement::OneLiner(idea) => {
                refs_by_name.insert(idea.name.clone(), refs_in_parts(&idea.body));
            }
            TopLevelElement::IdeaSet(set) => {
                members_by_name.insert(set.name.clone(), set.members.iter().cloned().collect());
            }
            TopLevelElement::Anonymous(_) => {}
        }
    }
    extracted
        .ideas
        .into_iter()
        .map(|idea| IdeaSnap {
            path: path.to_string(),
            name: idea.name.clone(),
            body: idea.summary,
            attributes: idea.attributes_json,
            members: members_by_name.remove(&idea.name).unwrap_or_default(),
            refs: refs_by_name.remove(&idea.name).unwrap_or_default(),
        })
        .collect()
}

fn refs_in_elements(elements: &[BodyElement]) -> BTreeSet<String> {
    let mut refs = BTreeSet::new();
    for element in elements {
        match element {
            BodyElement::BodyLine(line) => collect_part_refs(&line.parts, &mut refs),
            BodyElement::Attribute(attribute) => {
                if let Some(value) = &attribute.value {
                    collect_value_refs(value, &mut refs);
                }
            }
            BodyElement::NamedList(list) => {
                for item in &list.items {
                    collect_item_refs(item, &mut refs);
                }
            }
            BodyElement::NestedList(list) => {
                for item in &list.items {
                    collect_item_refs(item, &mut refs);
                }
            }
            BodyElement::CodeSnippet(_) => {}
        }
    }
    refs
}

fn refs_in_parts(parts: &[RichPart]) -> BTreeSet<String> {
    let mut refs = BTreeSet::new();
    collect_part_refs(parts, &mut refs);
    refs
}

fn collect_value_refs(value: &AttributeValue, refs: &mut BTreeSet<String>) {
    match value {
        AttributeValue::Scalar(scalar) => collect_part_refs(&scalar.parts, refs),
        AttributeValue::List(list) => {
            for item in &list.items {
                collect_item_refs(item, refs);
            }
        }
        AttributeValue::Block(block) => refs.extend(refs_in_elements(&block.elements)),
    }
}

fn collect_item_refs(item: &ListItem, refs: &mut BTreeSet<String>) {
    match item {
        ListItem::OneLiner(parts) => collect_part_refs(parts, refs),
        ListItem::Anonymous(block) => refs.extend(refs_in_elements(&block.elements)),
        ListItem::NamedBlock(block) => refs.extend(refs_in_elements(&block.elements)),
        ListItem::Nested(list) => {
            for nested in &list.items {
                collect_item_refs(nested, refs);
            }
        }
    }
}

fn collect_part_refs(parts: &[RichPart], refs: &mut BTreeSet<String>) {
    for part in parts {
        match part {
            RichPart::BracketRef { target, .. } | RichPart::WikiLink { target, .. } => {
                if let Some(name) = idea_ref_label(target) {
                    refs.insert(name);
                }
            }
            RichPart::Text { .. } | RichPart::InlineCode { .. } | RichPart::MarkdownLink { .. } => {
            }
        }
    }
}

fn idea_ref_label(target: &ReferenceTarget) -> Option<String> {
    match target {
        ReferenceTarget::Local { idea, .. } => Some(idea.clone()),
        ReferenceTarget::Qualified { qualifier, path, ideaset, idea, .. } => {
            let head = qualifier.clone().or(path.clone()).unwrap_or_default();
            if head.is_empty() && ideaset.is_none() {
                Some(idea.clone())
            } else {
                Some(target.label())
            }
        }
        ReferenceTarget::Wildcard { path_pattern, idea_pattern, .. } => {
            Some(format!("{path_pattern}.{idea_pattern}"))
        }
        ReferenceTarget::File { .. }
        | ReferenceTarget::Url { .. }
        | ReferenceTarget::FileSymbol { .. } => None,
    }
}

fn load_commit(workspace: &Path, spec: &str) -> Result<Vec<IdeaSnap>, AnalysisError> {
    let rev = resolve_commit(workspace, spec)?;
    load_commit_rev(workspace, &rev)
}

fn load_commit_rev(workspace: &Path, rev: &str) -> Result<Vec<IdeaSnap>, AnalysisError> {
    let mut ideas = Vec::new();
    for path in list_rq(workspace, rev)? {
        let source = blob_text(workspace, &format!("{rev}:{path}"))?.unwrap_or_default();
        ideas.extend(ideas_from_source(&path, &source));
    }
    Ok(ideas)
}

fn load_pending(workspace: &Path) -> Result<Vec<IdeaSnap>, AnalysisError> {
    let mut files = commit_files(workspace, "HEAD")?;
    for path in dirty_rq_paths(workspace)? {
        match pending_text(workspace, &path)? {
            Some(source) => {
                files.insert(path, source);
            }
            None => {
                files.remove(&path);
            }
        }
    }
    let mut ideas = Vec::new();
    for (path, source) in files {
        ideas.extend(ideas_from_source(&path, &source));
    }
    Ok(ideas)
}

fn commit_files(workspace: &Path, spec: &str) -> Result<BTreeMap<String, String>, AnalysisError> {
    let rev = resolve_commit(workspace, spec)?;
    let mut files = BTreeMap::new();
    for path in list_rq(workspace, &rev)? {
        let source = blob_text(workspace, &format!("{rev}:{path}"))?.unwrap_or_default();
        files.insert(path, source);
    }
    Ok(files)
}

fn pending_text(workspace: &Path, path: &str) -> Result<Option<String>, AnalysisError> {
    let head = blob_text(workspace, &format!("HEAD:{path}"))?;
    let work = read_worktree(workspace, path);
    let work_differs = match (&work, &head) {
        (Some(work_text), Some(head_text)) => work_text != head_text,
        (Some(_), None) | (None, Some(_)) => true,
        (None, None) => false,
    };
    if work_differs {
        return Ok(work);
    }
    let index = blob_text(workspace, &format!(":{path}"))?;
    let index_differs = match (&index, &head) {
        (Some(index_text), Some(head_text)) => index_text != head_text,
        (Some(_), None) | (None, Some(_)) => true,
        (None, None) => false,
    };
    if index_differs {
        return Ok(index);
    }
    Ok(head)
}

fn read_worktree(workspace: &Path, path: &str) -> Option<String> {
    let full = workspace.join(PathBuf::from(path));
    let bytes = std::fs::read(full).ok()?;
    String::from_utf8(bytes).ok()
}

fn rq_changes(workspace: &Path) -> Result<bool, AnalysisError> {
    Ok(!dirty_rq_paths(workspace)?.is_empty())
}

fn dirty_rq_paths(workspace: &Path) -> Result<Vec<String>, AnalysisError> {
    let output = git(workspace, &["status", "--porcelain=v1", "-z", "-uall"])?;
    if !output.status.success() {
        return Err(AnalysisError::Message(git_stderr(&output)));
    }
    let mut paths = Vec::new();
    for path in porcelain_paths(&output.stdout) {
        if path.ends_with(".rq") {
            paths.push(path);
        }
    }
    paths.sort();
    paths.dedup();
    Ok(paths)
}

fn porcelain_paths(bytes: &[u8]) -> Vec<String> {
    let mut paths = Vec::new();
    let mut index = 0;
    while index + 3 < bytes.len() {
        let xy0 = bytes[index];
        let xy1 = bytes[index + 1];
        if bytes[index + 2] != b' ' {
            break;
        }
        index += 3;
        let Some(end) = bytes[index..].iter().position(|byte| *byte == 0) else {
            break;
        };
        let first = String::from_utf8_lossy(&bytes[index..index + end]).to_string();
        index += end + 1;
        let renamed = xy0 == b'R' || xy0 == b'C' || xy1 == b'R' || xy1 == b'C';
        if renamed {
            let Some(end) = bytes[index..].iter().position(|byte| *byte == 0) else {
                break;
            };
            let second = String::from_utf8_lossy(&bytes[index..index + end]).to_string();
            index += end + 1;
            if !first.is_empty() {
                paths.push(first);
            }
            if !second.is_empty() {
                paths.push(second);
            }
        } else if !first.is_empty() {
            paths.push(first);
        }
    }
    paths
}

fn list_rq(workspace: &Path, rev: &str) -> Result<Vec<String>, AnalysisError> {
    let output = git(workspace, &["ls-tree", "-r", "-z", "--name-only", rev])?;
    if !output.status.success() {
        return Err(AnalysisError::BadRevision);
    }
    let mut paths = Vec::new();
    for chunk in output.stdout.split(|byte| *byte == 0) {
        if chunk.is_empty() {
            continue;
        }
        let path = String::from_utf8_lossy(chunk).to_string();
        if path.ends_with(".rq") {
            paths.push(path);
        }
    }
    Ok(paths)
}

fn resolve_commit(workspace: &Path, spec: &str) -> Result<String, AnalysisError> {
    let spec = normalize_target(spec);
    if spec.is_empty() {
        return Err(AnalysisError::BadRevision);
    }
    let expr = format!("{spec}^{{commit}}");
    let output = git(workspace, &["rev-parse", "--verify", "--end-of-options", &expr])?;
    if !output.status.success() {
        return Err(AnalysisError::BadRevision);
    }
    let rev = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if rev.is_empty() {
        return Err(AnalysisError::BadRevision);
    }
    Ok(rev)
}

fn normalize_target(spec: &str) -> String {
    let spec = spec.trim();
    let digits = spec.strip_prefix('~').unwrap_or("");
    if !digits.is_empty() && digits.chars().all(|ch| ch.is_ascii_digit()) {
        return format!("HEAD~{digits}");
    }
    spec.to_string()
}

fn ensure_repository(workspace: &Path) -> Result<(), AnalysisError> {
    let output = match git(workspace, &["rev-parse", "--is-inside-work-tree"]) {
        Ok(output) => output,
        Err(AnalysisError::Message(_)) => return Err(AnalysisError::NotARepository),
        Err(error) => return Err(error),
    };
    if !output.status.success() {
        return Err(AnalysisError::NotARepository);
    }
    let text = String::from_utf8_lossy(&output.stdout);
    if text.trim() != "true" {
        return Err(AnalysisError::NotARepository);
    }
    Ok(())
}

fn blob_text(workspace: &Path, spec: &str) -> Result<Option<String>, AnalysisError> {
    let exists = git(workspace, &["cat-file", "-e", spec])?;
    if !exists.status.success() {
        return Ok(None);
    }
    let output = git(workspace, &["cat-file", "blob", spec])?;
    if !output.status.success() {
        return Err(AnalysisError::Message(git_stderr(&output)));
    }
    Ok(Some(String::from_utf8_lossy(&output.stdout).into_owned()))
}

struct GitOutput {
    status: std::process::ExitStatus,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

fn git(workspace: &Path, args: &[&str]) -> Result<GitOutput, AnalysisError> {
    let mut command = Command::new("git");
    apply_hidden_console(&mut command);
    let output = command
        .args(args)
        .current_dir(workspace)
        .output()
        .map_err(|error| AnalysisError::Message(format!("git: {error}")))?;
    Ok(GitOutput { status: output.status, stdout: output.stdout, stderr: output.stderr })
}

fn git_stderr(output: &GitOutput) -> String {
    let text = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if text.is_empty() {
        "git failed".to_string()
    } else {
        text
    }
}

#[allow(unused_variables)]
fn apply_hidden_console(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = CREATE_NO_WINDOW;
}
