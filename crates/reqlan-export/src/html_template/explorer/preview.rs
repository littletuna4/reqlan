//! Explorer actions, preview pane HTML, and the per-item preview payload for the file explorer.
//! rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]

use super::tree::DirTree;
use crate::html_template::shell::export_page_href;
use crate::html_utils::{escape_html, idea_status, idea_tags, stringify_json};
use crate::types::ExportSnapshot;
use serde::Serialize;
use std::collections::BTreeMap;

/// Aggregate subtree counts shown in the workspace-root and folder previews.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExplorerCounts {
    folders: usize,
    files: usize,
    code_files: usize,
    ideas: usize,
}

/// Preview payload for one selectable tree item, keyed by the row's
/// `data-explorer-select` identity (`folder:{path}`, `file:{id}`, `code:{id}`, `idea:{id}`).
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
enum ExplorerItem {
    Root {
        name: String,
        path: String,
        counts: ExplorerCounts,
        #[serde(skip_serializing_if = "Option::is_none")]
        url: Option<String>,
    },
    Folder {
        name: String,
        path: String,
        counts: ExplorerCounts,
        #[serde(skip_serializing_if = "Option::is_none")]
        url: Option<String>,
    },
    File {
        name: String,
        path: String,
        idea_count: usize,
        #[serde(skip_serializing_if = "Option::is_none")]
        url: Option<String>,
    },
    Code {
        name: String,
        path: String,
        labels: Vec<String>,
        ref_count: usize,
        #[serde(skip_serializing_if = "Option::is_none")]
        url: Option<String>,
    },
    Idea {
        name: String,
        file: String,
        line: u32,
        summary: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        status: Option<String>,
        tags: Vec<String>,
        katz: f64,
        #[serde(skip_serializing_if = "Option::is_none")]
        url: Option<String>,
    },
}

/// Workspace-root name: the last path segment of `workspace_root`.
// rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
fn root_name(workspace_root: &str) -> String {
    std::path::Path::new(workspace_root)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| workspace_root.to_string())
}

/// Folder page href when folder pages are enabled and the folder has a page record.
// rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
fn folder_url(snapshot: &ExportSnapshot, current_path: &str, folder_path: &str) -> Option<String> {
    if !snapshot.page_options.include_folder_pages {
        return None;
    }
    snapshot
        .folders_by_path
        .get(folder_path)
        .map(|folder| export_page_href(snapshot, current_path, &folder.page))
}

/// Folder and workspace-root payload entries, walking the same directory tree the rows render.
// rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
fn collect_folder_items(
    snapshot: &ExportSnapshot,
    current_path: &str,
    dir: &DirTree<'_>,
    items: &mut BTreeMap<String, ExplorerItem>,
) {
    let (folders, files, code_files, ideas) = dir.subtree_counts();
    let counts = ExplorerCounts { folders, files, code_files, ideas };
    let path = dir.path();
    let item = if path == "." {
        ExplorerItem::Root {
            name: root_name(&snapshot.workspace_root),
            path: snapshot.workspace_root.clone(),
            counts,
            url: folder_url(snapshot, current_path, path),
        }
    } else {
        ExplorerItem::Folder {
            name: dir.name().to_string(),
            path: path.to_string(),
            counts,
            url: folder_url(snapshot, current_path, path),
        }
    };
    items.insert(format!("folder:{path}"), item);
    for child in dir.children() {
        collect_folder_items(snapshot, current_path, child, items);
    }
}

/// Static address-bar shell: the interactive wiring fills the breadcrumb from the selection.
/// Document and print modes keep the workspace-root fallback crumb.
// rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
pub fn render_explorer_addressbar(snapshot: &ExportSnapshot) -> String {
    format!(
        r#"<div class="explorer-addressbar" data-explorer-addressbar role="toolbar" aria-label="Selection path"><span class="explorer-crumb is-current">{}</span></div>"#,
        escape_html(&root_name(&snapshot.workspace_root)),
    )
}

// rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
pub fn render_explorer_actions() -> String {
    r#"<div class="explorer-actions"><input class="searchbar explorer-filter" type="search" placeholder="Filter files and ideas" data-explorer-filter aria-label="Filter the file tree" /><button type="button" class="graph-action" data-explorer-preview-toggle aria-expanded="true" aria-controls="file-explorer-preview">Preview</button></div>"#
        .to_string()
}

/// Drag handle between the tree and the resizable preview pane.
// rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
pub fn render_explorer_resize_handle() -> String {
    r#"<button type="button" class="explorer-resize-handle" data-explorer-resize role="separator" aria-orientation="vertical" aria-label="Resize preview pane"></button>"#
        .to_string()
}

// rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
pub fn render_explorer_preview() -> String {
    r#"<aside class="file-explorer-preview" id="file-explorer-preview" data-explorer-preview>
            <p class="explorer-preview-empty subtle">Select an item in the tree to preview it here.</p>
            <div class="explorer-preview-content" hidden>
                <h3 class="explorer-preview-name"></h3>
                <p class="explorer-preview-kind subtle"></p>
                <div class="pill-row">
                    <span class="pill explorer-preview-status" hidden></span>
                    <span class="pill-row explorer-preview-tags" hidden></span>
                    <span class="pill-row explorer-preview-counts" hidden></span>
                    <span class="pill explorer-preview-katz" hidden></span>
                </div>
                <p class="explorer-preview-file subtle"></p>
                <p class="explorer-preview-summary"></p>
                <a class="pill explorer-preview-open" data-explorer-open href="">Open page</a>
            </div>
        </aside>"#
        .to_string()
}

/// One `#explorer-data` payload covering every selectable tree item, keyed by select identity.
// rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
pub fn render_explorer_data_script(
    snapshot: &ExportSnapshot,
    current_path: &str,
    tree: &DirTree<'_>,
) -> String {
    let mut items: BTreeMap<String, ExplorerItem> = BTreeMap::new();
    collect_folder_items(snapshot, current_path, tree, &mut items);
    for file in &snapshot.files {
        let url = snapshot
            .page_options
            .include_file_pages
            .then(|| export_page_href(snapshot, current_path, &file.page));
        items.insert(
            format!("file:{}", file.id),
            ExplorerItem::File {
                name: file.name.clone(),
                path: file.file_uri.clone(),
                idea_count: file.ideas.len(),
                url,
            },
        );
    }
    for code_file in &snapshot.code_files {
        let url = snapshot
            .page_options
            .include_code_file_pages
            .then(|| export_page_href(snapshot, current_path, &code_file.page));
        items.insert(
            format!("code:{}", code_file.id),
            ExplorerItem::Code {
                name: code_file.name.clone(),
                path: code_file.file_uri.clone(),
                labels: code_file.labels.clone(),
                ref_count: code_file.referencing_idea_ids.len(),
                url,
            },
        );
    }
    for idea in &snapshot.ideas {
        let url = snapshot
            .page_options
            .include_idea_pages
            .then(|| export_page_href(snapshot, current_path, &idea.page));
        items.insert(
            format!("idea:{}", idea.id),
            ExplorerItem::Idea {
                name: idea.name.clone(),
                file: idea.file_uri.clone(),
                line: idea.line_start + 1,
                summary: idea.summary.trim().to_string(),
                status: idea_status(idea),
                tags: idea_tags(idea),
                katz: idea.katz_centrality,
                url,
            },
        );
    }
    format!(
        r#"<script id="explorer-data" type="application/json">{}</script>"#,
        stringify_json(&items)
    )
}
