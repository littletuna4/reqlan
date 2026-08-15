use crate::types::{
    ExportCluster, ExportCodeFile, ExportFile, ExportIdea, ExportPageInfo, ExportSnapshot,
};
use reqlan_index::{AttributeValue, FILTER_EMPTY, FILTER_NOT_PRESENT};

const FILTER_NOT_PRESENT_LABEL: &str = "Not present";
const FILTER_EMPTY_LABEL: &str = "Empty";
const FILTER_UNSPECIFIED: &str = "unspecified";

pub fn escape_html(value: &str) -> String {
    value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

pub fn format_date(value: &str) -> String {
    value.to_string()
}

pub fn stringify_json(value: &impl serde::Serialize) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|_| "null".into()).replace('<', "\\u003c")
}

pub fn normalize_url_base(url_base: Option<&str>) -> Option<String> {
    let trimmed = url_base?.trim();
    if trimmed.is_empty() {
        return None;
    }
    let without_trailing = trimmed.trim_end_matches('/');
    if without_trailing.is_empty() {
        return None;
    }
    if without_trailing.contains(':') || without_trailing.starts_with('/') {
        Some(without_trailing.to_string())
    } else {
        Some(format!("/{without_trailing}"))
    }
}

pub fn href_for(current_path: &str, target_path: &str, url_base: Option<&str>) -> String {
    let cleaned_target = target_path.trim_start_matches("./").trim_start_matches('/');
    if let Some(base) = normalize_url_base(url_base) {
        return if cleaned_target.is_empty() {
            format!("{base}/")
        } else {
            format!("{base}/{cleaned_target}")
        };
    }
    let mut from_dir: Vec<&str> = current_path.split('/').filter(|part| !part.is_empty()).collect();
    if !from_dir.is_empty() {
        from_dir.pop();
    }
    let mut to_segments: Vec<&str> =
        cleaned_target.split('/').filter(|part| !part.is_empty()).collect();
    while !from_dir.is_empty() && !to_segments.is_empty() && from_dir[0] == to_segments[0] {
        from_dir.remove(0);
        to_segments.remove(0);
    }
    let mut parts: Vec<&str> = from_dir.iter().map(|_| "..").collect();
    parts.extend(to_segments);
    if parts.is_empty() {
        ".".into()
    } else {
        parts.join("/")
    }
}

pub fn page_href(current_path: &str, page: &ExportPageInfo, url_base: Option<&str>) -> String {
    href_for(current_path, &page.path, url_base)
}

pub fn slug_attribute_key(key: &str) -> String {
    let slug = key
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' })
        .collect::<String>();
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "attribute".into()
    } else {
        slug
    }
}

pub fn export_idea_anchor_id(idea: &ExportIdea) -> String {
    format!("idea-{}", slug_attribute_key(&idea.id))
}

pub fn idea_status(idea: &ExportIdea) -> Option<String> {
    idea.status.as_ref().map(|value| value.trim().to_string()).filter(|value| !value.is_empty())
}

pub fn idea_tags(idea: &ExportIdea) -> Vec<String> {
    idea.tags.iter().map(|tag| tag.trim().to_string()).filter(|tag| !tag.is_empty()).collect()
}

pub fn is_filter_not_present(value: &str) -> bool {
    value == FILTER_NOT_PRESENT
}

pub fn is_filter_empty(value: &str) -> bool {
    value == FILTER_EMPTY
}

pub fn is_filter_unspecified(value: &str) -> bool {
    value.trim().eq_ignore_ascii_case(FILTER_UNSPECIFIED)
}

pub fn filter_display_label(value: &str) -> String {
    if is_filter_not_present(value) {
        FILTER_NOT_PRESENT_LABEL.into()
    } else if is_filter_empty(value) {
        FILTER_EMPTY_LABEL.into()
    } else {
        value.to_string()
    }
}

pub fn find_value_cluster<'a>(
    snapshot: &'a ExportSnapshot,
    kind: &str,
    value_key: &str,
) -> Option<&'a ExportCluster> {
    let id = format!("{kind}:{value_key}");
    snapshot.clusters_by_id.get(&id).or_else(|| {
        snapshot.clusters.iter().find(|cluster| {
            cluster.kind == kind
                && (cluster.id == id
                    || cluster.label == format!("{kind}: {}", filter_display_label(value_key)))
        })
    })
}

pub fn list_filter_href(
    snapshot: &ExportSnapshot,
    current_path: &str,
    page: &ExportPageInfo,
    filters: &[(&str, &str)],
) -> String {
    let base = page_href(current_path, page, snapshot.url_base.as_deref());
    let mut params = Vec::new();
    for (key, value) in filters {
        if !value.is_empty() {
            params.push(format!("{}={}", form_encode(key), form_encode(value)));
        }
    }
    if params.is_empty() {
        base
    } else {
        format!("{base}?{}", params.join("&"))
    }
}

pub fn status_or_tag_facet_href(
    snapshot: &ExportSnapshot,
    current_path: &str,
    kind: &str,
    value_key: &str,
) -> String {
    if let Some(cluster) = find_value_cluster(snapshot, kind, value_key) {
        if snapshot.page_options.include_cluster_pages {
            return page_href(current_path, &cluster.page, snapshot.url_base.as_deref());
        }
    }
    let filter_key = if kind == "status" { "status" } else { "tags" };
    list_filter_href(
        snapshot,
        current_path,
        &snapshot.manifest.ideas_index,
        &[(filter_key, &filter_display_label(value_key))],
    )
}

pub fn render_linked_status_cell(
    snapshot: &ExportSnapshot,
    current_path: &str,
    idea: &ExportIdea,
) -> String {
    let key =
        if idea.status_key.is_empty() { FILTER_NOT_PRESENT } else { idea.status_key.as_str() };
    let label = filter_display_label(key);
    let href = status_or_tag_facet_href(snapshot, current_path, "status", key);
    let sort_value = escape_html(&label);
    match idea_status(idea) {
        None => format!(r#"<span data-sort-value="{sort_value}"></span>"#),
        Some(visible) => format!(
            r#"<a href="{}" data-sort-value="{sort_value}">{}</a>"#,
            escape_html(&href),
            escape_html(&visible)
        ),
    }
}

pub fn render_linked_tags_cell(
    snapshot: &ExportSnapshot,
    current_path: &str,
    idea: &ExportIdea,
) -> String {
    let keys = if idea.tags_keys.is_empty() {
        vec![FILTER_NOT_PRESENT.to_string()]
    } else {
        idea.tags_keys.clone()
    };
    let tags = idea_tags(idea);
    let sort_value = escape_html(&if tags.is_empty() {
        filter_display_label(keys.first().map(String::as_str).unwrap_or(FILTER_NOT_PRESENT))
    } else {
        tags.join(", ")
    });
    if tags.is_empty() {
        return format!(r#"<span data-sort-value="{sort_value}"></span>"#);
    }
    let links = tags
        .iter()
        .map(|tag| {
            let href = status_or_tag_facet_href(snapshot, current_path, "tag", tag);
            format!(r#"<a href="{}">{}</a>"#, escape_html(&href), escape_html(tag))
        })
        .collect::<Vec<_>>()
        .join(", ");
    format!(r#"<span data-sort-value="{sort_value}">{links}</span>"#)
}

pub fn render_optional_status_cell(idea: &ExportIdea) -> String {
    idea_status(idea).map(|status| escape_html(&status)).unwrap_or_default()
}

pub fn render_optional_tags_cell(idea: &ExportIdea) -> String {
    let tags = idea_tags(idea);
    if tags.is_empty() {
        String::new()
    } else {
        escape_html(&tags.join(", "))
    }
}

pub fn render_file_path_cell(
    snapshot: &ExportSnapshot,
    current_path: &str,
    file_uri: &str,
) -> String {
    if let Some((page, kind)) = resolve_export_file_page(snapshot, None, Some(file_uri)) {
        if file_page_enabled(snapshot, kind) {
            return format!(
                r#"<a href="{}" data-sort-value="{}">{}</a>"#,
                escape_html(&page_href(current_path, page, snapshot.url_base.as_deref())),
                escape_html(file_uri),
                escape_html(file_uri)
            );
        }
    }
    escape_html(file_uri)
}

pub fn resolve_export_file_page<'a>(
    snapshot: &'a ExportSnapshot,
    id: Option<&str>,
    file_uri: Option<&str>,
) -> Option<(&'a ExportPageInfo, &'static str)> {
    if let Some(id) = id {
        if let Some(file) = snapshot.files_by_id.get(id) {
            return Some((&file.page, "file"));
        }
        if let Some(file) = snapshot.code_files_by_id.get(id) {
            return Some((&file.page, "code-file"));
        }
    }
    let file_uri = file_uri?.trim();
    if file_uri.is_empty() {
        return None;
    }
    if let Some(file) = snapshot.files.iter().find(|file| file.file_uri == file_uri) {
        return Some((&file.page, "file"));
    }
    if let Some(file) = snapshot.code_files.iter().find(|file| file.file_uri == file_uri) {
        return Some((&file.page, "code-file"));
    }
    let normalized = file_uri.replace('\\', "/");
    let by_suffix = snapshot
        .files
        .iter()
        .map(|file| (file as &dyn FileLike, "file"))
        .chain(snapshot.code_files.iter().map(|file| (file as &dyn FileLike, "code-file")))
        .find(|(file, _)| {
            let candidate = file.file_uri().replace('\\', "/");
            candidate == normalized
                || candidate.ends_with(&format!("/{normalized}"))
                || candidate.ends_with(&normalized)
                || normalized.ends_with(&format!("/{candidate}"))
                || normalized.ends_with(&candidate)
        });
    if let Some((file, kind)) = by_suffix {
        return Some((file.page(), kind));
    }
    let base = file_base_name(file_uri).to_ascii_lowercase();
    if !base.is_empty() {
        let matches: Vec<_> = snapshot
            .files
            .iter()
            .map(|file| (file as &dyn FileLike, "file"))
            .chain(snapshot.code_files.iter().map(|file| (file as &dyn FileLike, "code-file")))
            .filter(|(file, _)| file_base_name(file.file_uri()).eq_ignore_ascii_case(&base))
            .collect();
        if matches.len() == 1 {
            return Some((matches[0].0.page(), matches[0].1));
        }
    }
    None
}

trait FileLike {
    fn file_uri(&self) -> &str;
    fn page(&self) -> &ExportPageInfo;
}

impl FileLike for ExportFile {
    fn file_uri(&self) -> &str {
        &self.file_uri
    }
    fn page(&self) -> &ExportPageInfo {
        &self.page
    }
}

impl FileLike for ExportCodeFile {
    fn file_uri(&self) -> &str {
        &self.file_uri
    }
    fn page(&self) -> &ExportPageInfo {
        &self.page
    }
}

pub fn file_page_enabled(snapshot: &ExportSnapshot, kind: &str) -> bool {
    if kind == "file" {
        snapshot.page_options.include_file_pages
    } else {
        snapshot.page_options.include_code_file_pages
    }
}

pub fn render_definition_list(
    values: &std::collections::BTreeMap<String, usize>,
    href_for_key: Option<&dyn Fn(&str) -> Option<String>>,
) -> String {
    if values.is_empty() {
        return r#"<p class="subtle">No data available.</p>"#.into();
    }
    let items = values
        .iter()
        .map(|(key, value)| {
            let label = filter_display_label(key);
            let special_class = if is_filter_not_present(key) {
                " class=\"rollup-special rollup-not-present\""
            } else if is_filter_empty(key) {
                " class=\"rollup-special rollup-empty\""
            } else if is_filter_unspecified(key) {
                " class=\"rollup-special rollup-unspecified\""
            } else {
                ""
            };
            let term = if let Some(href) = href_for_key.and_then(|callback| callback(key)) {
                format!(
                    r#"<dt><a class="rollup-link" href="{}">{}</a></dt><dd><a class="rollup-link" href="{}">{}</a></dd>"#,
                    escape_html(&href),
                    escape_html(&label),
                    escape_html(&href),
                    escape_html(&value.to_string())
                )
            } else {
                format!(
                    "<dt>{}</dt><dd>{}</dd>",
                    escape_html(&label),
                    escape_html(&value.to_string())
                )
            };
            format!("<div{special_class}>{term}</div>")
        })
        .collect::<Vec<_>>()
        .join("");
    format!(r#"<dl class="rollup-list">{items}</dl>"#)
}

pub fn render_metric(label: &str, value: &str, href: Option<&str>) -> String {
    let inner = format!(
        r#"<span class="metric-label">{}</span><strong class="metric-value">{}</strong>"#,
        escape_html(label),
        escape_html(value)
    );
    if let Some(href) = href {
        format!(
            r#"<article class="metric"><a class="metric-link" href="{}">{inner}</a></article>"#,
            escape_html(href)
        )
    } else {
        format!(r#"<article class="metric">{inner}</article>"#)
    }
}

pub fn related_clusters<'a>(
    snapshot: &'a ExportSnapshot,
    idea: &ExportIdea,
) -> Vec<&'a ExportCluster> {
    idea.cluster_ids.iter().filter_map(|id| snapshot.clusters_by_id.get(id)).collect()
}

pub fn file_by_idea<'a>(snapshot: &'a ExportSnapshot, idea: &ExportIdea) -> Option<&'a ExportFile> {
    snapshot.files.iter().find(|file| file.file_uri == idea.file_uri)
}

fn file_base_name(path: &str) -> String {
    let cleaned = path.trim().trim_matches(|ch| ch == '"' || ch == '\'');
    cleaned
        .split(['/', '\\'])
        .filter(|part| !part.is_empty())
        .next_back()
        .unwrap_or(cleaned)
        .to_string()
}

struct RefInner {
    is_wiki: bool,
    inner: String,
    target: String,
}

fn summary_ref_inner(raw: &str) -> RefInner {
    let is_wiki = raw.starts_with("[[") && raw.ends_with("]]");
    let inner =
        if is_wiki { raw[2..raw.len() - 2].to_string() } else { raw[1..raw.len() - 1].to_string() };
    let mut target = inner.trim().to_string();
    if is_wiki {
        if let Some(pipe) = inner.find('|') {
            target = inner[..pipe].trim().to_string();
        }
    }
    RefInner { is_wiki, inner, target }
}

fn summary_ref_display_name(raw: &str) -> String {
    let parsed = summary_ref_inner(raw);
    if parsed.is_wiki {
        if let Some(pipe) = parsed.inner.find('|') {
            let alias = parsed.inner[pipe + 1..].trim();
            if !alias.is_empty() {
                return alias.to_string();
            }
        }
    }
    let target = parsed.target.trim_matches(|ch| ch == '"' || ch == '\'');
    if parsed.target.starts_with('"') || parsed.target.starts_with('\'') {
        return file_base_name(target);
    }
    target.split('.').filter(|part| !part.is_empty()).next_back().unwrap_or(target).to_string()
}

fn summary_ref_file_path(raw: &str) -> Option<String> {
    let parsed = summary_ref_inner(raw);
    let trimmed = parsed.target.trim();
    if (trimmed.starts_with('"') && trimmed.ends_with('"'))
        || (trimmed.starts_with('\'') && trimmed.ends_with('\''))
    {
        let inner = &trimmed[1..trimmed.len() - 1];
        if !inner.trim().is_empty() {
            return Some(inner.trim().to_string());
        }
    }
    None
}

fn find_idea_by_ref_name<'a>(
    snapshot: &'a ExportSnapshot,
    raw: &str,
    display_name: &str,
) -> Option<&'a ExportIdea> {
    let parsed = summary_ref_inner(raw);
    let qualified: Vec<&str> =
        parsed.target.split('.').map(str::trim).filter(|part| !part.is_empty()).collect();
    let idea_name = qualified.last().copied().unwrap_or(display_name).to_ascii_lowercase();
    if idea_name.is_empty() {
        return None;
    }
    let matches: Vec<_> = snapshot
        .ideas
        .iter()
        .filter(|candidate| candidate.name.eq_ignore_ascii_case(&idea_name))
        .collect();
    if matches.len() == 1 {
        return Some(matches[0]);
    }
    if matches.len() > 1 && qualified.len() > 1 {
        let qualifier = qualified[..qualified.len() - 1].join(".").to_ascii_lowercase();
        let narrowed: Vec<_> = matches
            .into_iter()
            .filter(|candidate| {
                let path = candidate.file_uri.to_ascii_lowercase();
                path.contains(&qualifier) || path.contains(&qualifier.replace('.', "/"))
            })
            .collect();
        if narrowed.len() == 1 {
            return Some(narrowed[0]);
        }
    }
    None
}

fn find_ref_spans(line: &str) -> Vec<(usize, usize)> {
    let bytes = line.as_bytes();
    let mut spans = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'[' && index + 1 < bytes.len() && bytes[index + 1] == b'[' {
            if let Some(end) = line[index + 2..].find("]]") {
                let close = index + 2 + end + 2;
                spans.push((index, close));
                index = close;
                continue;
            }
        }
        if bytes[index] == b'[' {
            if let Some(rel) = line[index + 1..].find(']') {
                let inner = &line[index + 1..index + 1 + rel];
                if !inner.contains('[') && !inner.contains(']') {
                    let close = index + 1 + rel + 1;
                    spans.push((index, close));
                    index = close;
                    continue;
                }
            }
        }
        index += 1;
    }
    spans
}

pub fn render_text_with_refs_html(
    snapshot: &ExportSnapshot,
    current_path: &str,
    text: &str,
    idea: Option<&ExportIdea>,
    empty_message: Option<&str>,
    same_page_idea_anchors: bool,
) -> String {
    let source = text.trim();
    if source.is_empty() {
        return escape_html(empty_message.unwrap_or(""));
    }
    let mut used = std::collections::HashSet::new();
    source
        .split('\n')
        .map(|line| {
            render_line_with_refs(
                snapshot,
                current_path,
                line,
                idea,
                same_page_idea_anchors,
                &mut used,
            )
        })
        .collect::<Vec<_>>()
        .join("<br>")
}

fn render_line_with_refs(
    snapshot: &ExportSnapshot,
    current_path: &str,
    line: &str,
    idea: Option<&ExportIdea>,
    same_page_idea_anchors: bool,
    used: &mut std::collections::HashSet<String>,
) -> String {
    let mut html = String::new();
    let mut last = 0;
    for (start, end) in find_ref_spans(line) {
        html.push_str(&escape_html(&line[last..start]));
        last = end;
        let raw = &line[start..end];
        let display_name = summary_ref_display_name(raw);
        let row = idea.and_then(|idea| take_row(idea, raw, &display_name, used));
        let linked_idea = row
            .and_then(|row| idea_from_row(snapshot, row))
            .or_else(|| find_idea_by_ref_name(snapshot, raw, &display_name));
        let file_path = summary_ref_file_path(raw).or_else(|| {
            if linked_idea.is_none() {
                row.map(|row| row.target_path.clone())
            } else {
                None
            }
        });
        let file_target = if linked_idea.is_none() {
            file_path
                .as_deref()
                .and_then(|path| resolve_export_file_page(snapshot, None, Some(path)))
        } else {
            None
        };
        let label = linked_idea.map(|idea| idea.name.clone()).unwrap_or_else(|| {
            if file_target.is_some() {
                file_base_name(file_path.as_deref().unwrap_or(&display_name))
            } else {
                display_name.clone()
            }
        });
        let title = if let Some(linked) = linked_idea {
            format!("{} · {}", linked.file_uri, linked.name)
        } else if let Some(path) = file_path.as_deref().or(row.map(|row| row.target_path.as_str()))
        {
            path.to_string()
        } else if row.is_some_and(|row| !row.is_resolved) {
            format!("Unresolved reference: {display_name}")
        } else {
            display_name.clone()
        };
        let href = if let Some(linked) = linked_idea {
            if same_page_idea_anchors {
                Some(format!("#{}", export_idea_anchor_id(linked)))
            } else if snapshot.page_options.include_idea_pages {
                Some(page_href(current_path, &linked.page, snapshot.url_base.as_deref()))
            } else {
                None
            }
        } else if let Some((page, kind)) = file_target {
            if file_page_enabled(snapshot, kind) {
                Some(page_href(current_path, page, snapshot.url_base.as_deref()))
            } else {
                None
            }
        } else {
            None
        };
        let class_name = [
            "idea-ref",
            if linked_idea.is_some() { "idea-ref--idea" } else { "" },
            if file_target.is_some() { "idea-ref--file" } else { "" },
            if href.is_none() { "idea-ref--unresolved" } else { "" },
        ]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
        if let Some(href) = href {
            html.push_str(&format!(
                r#"<a class="{class_name}" href="{}" title="{}">{}</a>"#,
                escape_html(&href),
                escape_html(&title),
                escape_html(&label)
            ));
        } else {
            html.push_str(&format!(
                r#"<span class="{class_name}" title="{}">{}</span>"#,
                escape_html(&title),
                escape_html(&label)
            ));
        }
    }
    html.push_str(&escape_html(&line[last..]));
    html
}

fn take_row<'a>(
    idea: &'a ExportIdea,
    raw: &str,
    display_name: &str,
    used: &mut std::collections::HashSet<String>,
) -> Option<&'a crate::types::ExportReferenceRow> {
    let candidates: Vec<_> = idea
        .references
        .outbound
        .iter()
        .chain(idea.references.unresolved.iter())
        .chain(idea.references.inbound.iter())
        .filter(|row| {
            row.snippet.as_deref() == Some(raw)
                || [
                    row.label.as_str(),
                    row.target_name.as_str(),
                    file_base_name(&row.target_path).as_str(),
                ]
                .into_iter()
                .filter(|value| !value.is_empty())
                .any(|value| value.eq_ignore_ascii_case(display_name))
        })
        .collect();
    let unused = candidates.iter().find(|row| !used.contains(&row.edge_id));
    let row = unused.or(candidates.first()).copied();
    if let Some(row) = row {
        used.insert(row.edge_id.clone());
    }
    row
}

fn idea_from_row<'a>(
    snapshot: &'a ExportSnapshot,
    row: &crate::types::ExportReferenceRow,
) -> Option<&'a ExportIdea> {
    if let Some(id) = &row.target_idea_id {
        if let Some(idea) = snapshot.ideas_by_id.get(id) {
            return Some(idea);
        }
    }
    if row.direction == "inbound" {
        return snapshot.ideas_by_id.get(&row.source_idea_id);
    }
    None
}

pub fn render_idea_summary_html(
    snapshot: &ExportSnapshot,
    current_path: &str,
    idea: &ExportIdea,
    empty_message: &str,
    same_page_idea_anchors: bool,
) -> String {
    render_text_with_refs_html(
        snapshot,
        current_path,
        &idea.summary,
        Some(idea),
        Some(empty_message),
        same_page_idea_anchors,
    )
}

pub fn render_attribute_value_html(
    snapshot: &ExportSnapshot,
    current_path: &str,
    value: &AttributeValue,
    idea: Option<&ExportIdea>,
    same_page_idea_anchors: bool,
) -> String {
    match value {
        AttributeValue::Flag(true) => "true".into(),
        AttributeValue::Flag(false) => "false".into(),
        AttributeValue::List(items) if items.is_empty() => "—".into(),
        AttributeValue::List(items) => items
            .iter()
            .map(|item| {
                render_text_with_refs_html(
                    snapshot,
                    current_path,
                    item,
                    idea,
                    None,
                    same_page_idea_anchors,
                )
            })
            .collect::<Vec<_>>()
            .join(", "),
        AttributeValue::Text(text) if text.trim().is_empty() => "—".into(),
        AttributeValue::Text(text) => render_text_with_refs_html(
            snapshot,
            current_path,
            text,
            idea,
            None,
            same_page_idea_anchors,
        ),
    }
}

pub fn render_print_idea_attributes_html(
    snapshot: &ExportSnapshot,
    current_path: &str,
    idea: &ExportIdea,
    same_page_idea_anchors: bool,
) -> String {
    if idea.attributes.is_empty() {
        return String::new();
    }
    let rows = idea
        .attributes
        .iter()
        .map(|(key, value)| {
            format!(
                "<div><dt>{}</dt><dd>{}</dd></div>",
                escape_html(key),
                render_attribute_value_html(
                    snapshot,
                    current_path,
                    value,
                    Some(idea),
                    same_page_idea_anchors
                )
            )
        })
        .collect::<Vec<_>>()
        .join("");
    format!(r#"<dl class="print-attrs">{rows}</dl>"#)
}

fn form_encode(value: &str) -> String {
    let mut out = String::new();
    for ch in value.chars() {
        match ch {
            ' ' => out.push('+'),
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '*' => out.push(ch),
            _ => {
                for byte in ch.to_string().into_bytes() {
                    out.push_str(&format!("%{byte:02X}"));
                }
            }
        }
    }
    out
}
