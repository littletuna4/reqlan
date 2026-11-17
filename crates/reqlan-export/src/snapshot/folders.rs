//! Build export folder records and the folder hierarchy.
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_include_folder_path_hierarchy]
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_folder_page]
use super::manifest::build_page_info;
use super::util::slugify;
use crate::types::{ExportFolder, ExportIdea};
use std::collections::{BTreeMap, BTreeSet, HashSet};

pub(crate) fn build_folder_records(ideas: &[ExportIdea]) -> Vec<ExportFolder> {
    // Direct ideas keyed by their directory path ("." for the workspace root).
    let mut direct: BTreeMap<String, Vec<&ExportIdea>> = BTreeMap::new();
    let mut all_paths: BTreeSet<String> = BTreeSet::new();
    for idea in ideas {
        let path = directory_of(&idea.file_segments);
        direct.entry(path.clone()).or_default().push(idea);
        // Register the folder and every ancestor so the hierarchy is complete.
        let mut current = path.as_str();
        loop {
            all_paths.insert(current.to_string());
            if current == "." {
                break;
            }
            current = parent_of(current);
        }
    }

    let mut folders: Vec<ExportFolder> = all_paths
        .into_iter()
        .map(|path| {
            let members = direct.get(&path).cloned().unwrap_or_default();
            let name = if path == "." {
                "/".to_string()
            } else {
                path.rsplit('/').next().unwrap_or(&path).to_string()
            };
            let parent_path = parent_of(&path).to_string();
            let direct_ids: Vec<String> = members.iter().map(|idea| idea.id.clone()).collect();
            let subtree_idea_count = ideas
                .iter()
                .filter(|idea| in_subtree(&directory_of(&idea.file_segments), &path))
                .count();
            let file_count =
                members.iter().map(|idea| idea.file_uri.as_str()).collect::<HashSet<_>>().len();
            let slug = slugify(&path);
            ExportFolder {
                id: format!("folder:{path}"),
                path: path.clone(),
                name,
                parent_path,
                page: build_page_info(
                    &path,
                    &format!("folders/{slug}.html"),
                    Some(&format!("print/folders/{slug}.html")),
                ),
                idea_ids: direct_ids,
                subtree_idea_count,
                file_count,
            }
        })
        .collect();

    folders.sort_by(|left, right| {
        let left_depth = left.path.matches('/').count();
        let right_depth = right.path.matches('/').count();
        left_depth.cmp(&right_depth).then(left.path.cmp(&right.path))
    });
    folders
}

/// Directory path of an idea (`file_segments` minus the final file name).
fn directory_of(file_segments: &[String]) -> String {
    if file_segments.len() > 1 {
        file_segments[..file_segments.len() - 1].join("/")
    } else {
        ".".to_string()
    }
}

fn parent_of(path: &str) -> &str {
    if path == "." {
        return "";
    }
    match path.rfind('/') {
        Some(index) => &path[..index],
        None => ".",
    }
}

fn in_subtree(candidate: &str, root: &str) -> bool {
    if root == "." {
        true
    } else {
        candidate == root || candidate.starts_with(&format!("{root}/"))
    }
}

pub(crate) fn attach_folder_membership(ideas: &mut [ExportIdea], folders: &[ExportFolder]) {
    let mut by_idea: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for folder in folders {
        for idea_id in &folder.idea_ids {
            by_idea.entry(idea_id.clone()).or_default().push(folder.id.clone());
        }
    }
    for idea in ideas {
        if let Some(ids) = by_idea.get_mut(&idea.id) {
            ids.sort();
            idea.folder_ids = ids.clone();
        }
    }
}
