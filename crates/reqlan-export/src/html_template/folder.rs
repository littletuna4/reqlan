//! Folder detail page template.
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_folder_page]

use crate::html_template::common::{render_idea_anchor, render_katz_cell};
use crate::html_template::layout::{render_entity_layout_card, render_layout_card_with_actions};
use crate::html_template::shell::{export_page_href, render_shell, ActiveNav, RenderOptions};
use crate::html_utils::{
    escape_html, idea_status, idea_tags, render_file_path_cell, render_linked_status_cell,
    render_metric,
};
use crate::types::{ExportFolder, ExportIdea, ExportSnapshot};

pub fn render_folder_detail_page(snapshot: &ExportSnapshot, folder: &ExportFolder) -> String {
    let current_path = folder.page.path.as_str();
    let members: Vec<&ExportIdea> =
        folder.idea_ids.iter().filter_map(|id| snapshot.ideas_by_id.get(id)).collect();
    let rows = if members.is_empty() {
        r#"<tr><td colspan="4" class="subtle">No ideas directly in this folder.</td></tr>"#.into()
    } else {
        members
            .iter()
            .map(|idea| {
                format!(
                    r#"<tr data-filter-row="folderIdeas" data-filter-text="{}"><td>{}</td><td>{}</td><td>{}</td>{}</tr>"#,
                    escape_html(&format!(
                        "{} {} {} {}",
                        idea.name,
                        idea.summary,
                        idea_status(idea).unwrap_or_default(),
                        idea_tags(idea).join(" ")
                    )),
                    render_idea_anchor(snapshot, current_path, idea, &idea.name),
                    render_file_path_cell(snapshot, current_path, &idea.file_uri),
                    render_linked_status_cell(snapshot, current_path, idea),
                    render_katz_cell(idea.katz_centrality)
                )
            })
            .collect::<Vec<_>>()
            .join("")
    };

    let child_cards = snapshot
        .folders
        .iter()
        .filter(|child| child.parent_path == folder.path && child.path != folder.path)
        .map(|child| {
            let href = export_page_href(snapshot, current_path, &child.page);
            render_entity_layout_card(
                &format!("folder-{}", child.id),
                Some(href.as_str()),
                &child.name,
                &format!("{} ideas", child.subtree_idea_count),
                &format!("Folder {}", child.path),
                "",
            )
        })
        .collect::<Vec<_>>()
        .join("");

    let child_section = if child_cards.is_empty() {
        String::new()
    } else {
        render_layout_card_with_actions(
            "folder-children",
            "div",
            "panel layout-card-span-full",
            "Subfolders",
            "Folders nested under this folder.",
            "",
            &format!(
                r#"<div class="entity-list" data-layout-group="folder-children-cards">{child_cards}</div>"#
            ),
            "",
        )
    };

    let parent_link = if folder.parent_path.is_empty() {
        String::new()
    } else {
        match snapshot.folders_by_path.get(&folder.parent_path) {
            Some(parent) => {
                let href = export_page_href(snapshot, current_path, &parent.page);
                format!(
                    r#"<p><a href="{}">Up to {}</a></p>"#,
                    escape_html(&href),
                    escape_html(&parent.name)
                )
            }
            None => String::new(),
        }
    };

    let breadcrumbs = build_breadcrumbs(snapshot, current_path, folder);

    render_shell(RenderOptions {
        current_path,
        active_nav: ActiveNav::Folders,
        title: format!("{} - {}", snapshot.title, folder.name),
        snapshot,
        include_global_search: snapshot.runtime_mode == "interactive",
        breadcrumbs,
        body: format!(
            r#"<header class="page-header">
                <p class="eyebrow">Folder</p>
                <h1>{}</h1>
                <p class="subtle">{}</p>
                {parent_link}
            </header>
            <section class="grid">
                {}
                {}
                {}
            </section>
            <div class="layout-stack" data-layout-group="folder-main">
            {child_section}
            {ideas_card}
            </div>"#,
            escape_html(&folder.name),
            escape_html(&folder.path),
            render_metric("Direct ideas", &folder.idea_ids.len().to_string(), None),
            render_metric("Subtree ideas", &folder.subtree_idea_count.to_string(), None),
            render_metric("Files", &folder.file_count.to_string(), None),
            ideas_card = render_layout_card_with_actions(
                "folder-ideas",
                "div",
                "table-shell layout-card-span-full",
                "Ideas in folder",
                "Ideas hosted directly in this folder.",
                r#"<input class="searchbar" type="search" placeholder="Filter folder ideas" data-filter-input="folderIdeas" />"#,
                &format!(
                    r#"<div class="scroll-window">
                        <table>
                            <thead><tr><th data-filter-key="idea">Idea</th><th data-filter-key="file">File</th><th data-filter-key="status">Status</th><th data-filter-key="katz">Katz</th></tr></thead>
                            <tbody>{rows}</tbody>
                        </table>
                    </div>"#
                ),
                "",
            ),
        ),
    })
}

fn build_breadcrumbs(
    snapshot: &ExportSnapshot,
    current_path: &str,
    folder: &ExportFolder,
) -> Vec<(String, Option<String>)> {
    let mut chain: Vec<&ExportFolder> = Vec::new();
    let mut cursor = folder;
    loop {
        chain.push(cursor);
        if cursor.parent_path.is_empty() || cursor.parent_path == cursor.path {
            break;
        }
        match snapshot.folders_by_path.get(&cursor.parent_path) {
            Some(parent) => cursor = parent,
            None => break,
        }
    }
    chain.reverse();
    let mut crumbs = vec![(
        "Folders".to_string(),
        Some(export_page_href(snapshot, current_path, &snapshot.manifest.folders_index)),
    )];
    for entry in chain {
        crumbs.push((
            entry.name.clone(),
            Some(export_page_href(snapshot, current_path, &entry.page)),
        ));
    }
    crumbs
}
