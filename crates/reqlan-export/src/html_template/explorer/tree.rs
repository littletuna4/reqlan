//! Directory tree building and node/leaf renderers for the file explorer.
//! rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]

use crate::html_utils::{escape_html, idea_status, idea_tags, idea_tip_attrs, slug_attribute_key};
use crate::types::{ExportCodeFile, ExportFile, ExportIdea};

/// Directory node derived from `ExportFile.directory` / `ExportCodeFile.directory`
/// (empty string for the workspace root, which folders model as ".").
pub(super) struct DirTree<'a> {
    directory: String,
    path: String,
    name: String,
    /// True when this folder or any descendant holds a `.rq` document; drives the rq folder icon.
    contains_rq: bool,
    child_dirs: Vec<DirTree<'a>>,
    files: Vec<&'a ExportFile>,
    code_files: Vec<&'a ExportCodeFile>,
}

impl<'a> DirTree<'a> {
    fn root() -> Self {
        DirTree {
            directory: String::new(),
            path: ".".to_string(),
            name: "Root".to_string(),
            contains_rq: false,
            child_dirs: Vec::new(),
            files: Vec::new(),
            code_files: Vec::new(),
        }
    }

    fn ensure_dir(&mut self, directory: &str) -> &mut DirTree<'a> {
        let mut node: &mut DirTree<'a> = self;
        let mut current = String::new();
        for segment in directory.split('/').filter(|part| !part.is_empty()) {
            current = if current.is_empty() {
                segment.to_string()
            } else {
                format!("{current}/{segment}")
            };
            let found = node.child_dirs.iter().position(|child| child.directory == current);
            let index = match found {
                Some(index) => index,
                None => {
                    node.child_dirs.push(DirTree {
                        directory: current.clone(),
                        path: current.clone(),
                        name: segment.to_string(),
                        contains_rq: false,
                        child_dirs: Vec::new(),
                        files: Vec::new(),
                        code_files: Vec::new(),
                    });
                    node.child_dirs.len() - 1
                }
            };
            node = &mut node.child_dirs[index];
        }
        node
    }

    fn sort(&mut self) {
        self.child_dirs.sort_by(|left, right| left.name.cmp(&right.name));
        for child in &mut self.child_dirs {
            child.sort();
        }
        self.files.sort_by(|left, right| left.name.cmp(&right.name));
        self.code_files.sort_by(|left, right| left.name.cmp(&right.name));
    }

    fn total_files(&self) -> usize {
        self.files.len()
            + self.code_files.len()
            + self.child_dirs.iter().map(DirTree::total_files).sum::<usize>()
    }

    /// Descendant folders, hosting files, code files, and ideas in this subtree,
    /// for the folder and workspace-root preview payloads.
    // rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
    pub(super) fn subtree_counts(&self) -> (usize, usize, usize, usize) {
        let mut counts = (self.child_dirs.len(), self.files.len(), self.code_files.len(), 0usize);
        for file in &self.files {
            counts.3 += file.ideas.len();
        }
        for child in &self.child_dirs {
            let child_counts = child.subtree_counts();
            counts.0 += child_counts.0;
            counts.1 += child_counts.1;
            counts.2 += child_counts.2;
            counts.3 += child_counts.3;
        }
        counts
    }

    // rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
    fn compute_contains_rq(&mut self) -> bool {
        let own = self.files.iter().any(|file| file.file_uri.ends_with(".rq"))
            || self.code_files.iter().any(|file| file.file_uri.ends_with(".rq"));
        self.contains_rq =
            own || self.child_dirs.iter_mut().any(|child| child.compute_contains_rq());
        self.contains_rq
    }

    /// Folder path ("." for the workspace root).
    pub(super) fn path(&self) -> &str {
        &self.path
    }

    pub(super) fn name(&self) -> &str {
        &self.name
    }

    pub(super) fn children(&self) -> &[DirTree<'_>] {
        &self.child_dirs
    }
}

/// Tree row icon kinds for the file explorer rows.
enum ExplorerIcon {
    Folder,
    FolderRq,
    RqDoc,
    Doc,
    Idea,
    Code,
}

// rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
fn icon(kind: ExplorerIcon) -> &'static str {
    match kind {
        ExplorerIcon::Folder => {
            r#"<svg class="explorer-icon explorer-icon-folder" data-explorer-icon="folder" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>"#
        }
        ExplorerIcon::FolderRq => {
            r#"<svg class="explorer-icon explorer-icon-folder-rq" data-explorer-icon="folder-rq" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="16.5" r="1.5" fill="currentColor" stroke="none"/></svg>"#
        }
        ExplorerIcon::RqDoc => {
            r#"<svg class="explorer-icon explorer-icon-rq" data-explorer-icon="rq" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3h7l4.5 4.5V19a2 2 0 0 1-2 2h-9.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M13 3v5h5"/><text x="12" y="17.5" text-anchor="middle" font-size="7" font-family="monospace" font-weight="bold" fill="currentColor" stroke="none">rq</text></svg>"#
        }
        ExplorerIcon::Doc => {
            r#"<svg class="explorer-icon explorer-icon-doc" data-explorer-icon="doc" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3h7l4.5 4.5V19a2 2 0 0 1-2 2h-9.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M13 3v5h5"/></svg>"#
        }
        ExplorerIcon::Idea => {
            r#"<svg class="explorer-icon explorer-icon-idea" data-explorer-icon="idea" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a5.5 5.5 0 0 1 3.3 9.9c-.8.6-1.3 1.4-1.3 2.3h-4c0-.9-.5-1.7-1.3-2.3A5.5 5.5 0 0 1 12 3z"/><path d="M10 18.5h4"/><path d="M10.5 21h3"/></svg>"#
        }
        ExplorerIcon::Code => {
            r#"<svg class="explorer-icon explorer-icon-code" data-explorer-icon="code" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 7l-5 5 5 5"/><path d="M15.5 7l5 5-5 5"/></svg>"#
        }
    }
}

// rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
pub(super) fn render_dir_tree(tree: &DirTree<'_>, out: &mut String) {
    render_dir_node(tree, out);
}

// rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
pub(super) fn build_dir_tree<'a>(
    files: &'a [ExportFile],
    code_files: &'a [ExportCodeFile],
) -> DirTree<'a> {
    let mut root = DirTree::root();
    for file in files {
        root.ensure_dir(&file.directory).files.push(file);
    }
    for code_file in code_files {
        root.ensure_dir(&code_file.directory).code_files.push(code_file);
    }
    root.sort();
    root.compute_contains_rq();
    root
}

fn plural(count: usize, singular: &str, plural_form: &str) -> String {
    if count == 1 {
        format!("{count} {singular}")
    } else {
        format!("{count} {plural_form}")
    }
}

// rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
fn render_dir_node(dir: &DirTree<'_>, out: &mut String) {
    let id = format!("explorer-children-{}", slug_attribute_key(&dir.path));
    let label = format!(
        r#"<span class="explorer-label" title="{}">{}</span>"#,
        escape_html(&dir.path),
        escape_html(&dir.name),
    );
    let folder_icon =
        icon(if dir.contains_rq { ExplorerIcon::FolderRq } else { ExplorerIcon::Folder });
    out.push_str(&format!(
        r#"<li class="explorer-node is-open" data-explorer-node data-explorer-key="{}">
  <div class="explorer-row" tabindex="0" data-explorer-select="folder:{}">
    <button type="button" class="explorer-disclosure" aria-expanded="true" aria-controls="{id}" aria-label="Toggle folder {}"></button>
    {folder_icon}
    {label}
    <span class="explorer-count">{}</span>
  </div>
  <ul id="{id}">"#,
        escape_html(&dir.path),
        escape_html(&dir.path),
        escape_html(&dir.name),
        plural(dir.total_files(), "file", "files"),
    ));
    for child in &dir.child_dirs {
        out.push('\n');
        render_dir_node(child, out);
    }
    for file in &dir.files {
        out.push('\n');
        render_file_node(file, out);
    }
    for code_file in &dir.code_files {
        out.push('\n');
        render_code_file_node(code_file, out);
    }
    out.push_str("\n  </ul>\n</li>");
}

// rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
fn render_file_node(file: &ExportFile, out: &mut String) {
    let mut ideas: Vec<&ExportIdea> = file.ideas.iter().collect();
    ideas.sort_by_key(|idea| idea.line_start);
    let id = format!("explorer-children-{}", slug_attribute_key(&file.id));
    let label = format!(
        r#"<span class="explorer-label" title="{}">{}</span>"#,
        escape_html(&file.file_uri),
        escape_html(&file.name),
    );
    let file_icon =
        icon(if file.file_uri.ends_with(".rq") { ExplorerIcon::RqDoc } else { ExplorerIcon::Doc });
    out.push_str(&format!(
        r#"<li class="explorer-node is-open" data-explorer-node data-explorer-key="{}">
  <div class="explorer-row" tabindex="0" data-explorer-select="file:{}">
    <button type="button" class="explorer-disclosure" aria-expanded="true" aria-controls="{id}" aria-label="Toggle ideas in {}"></button>
    {file_icon}
    {label}
    <span class="explorer-count">{}</span>
  </div>
  <ul id="{id}">"#,
        escape_html(&file.id),
        escape_html(&file.id),
        escape_html(&file.name),
        plural(file.ideas.len(), "idea", "ideas"),
    ));
    for idea in ideas {
        out.push('\n');
        out.push_str(&render_idea_leaf(idea));
    }
    out.push_str("\n  </ul>\n</li>");
}

// rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
fn render_idea_leaf(idea: &ExportIdea) -> String {
    let filter_text = format!(
        "{} {} {} {}",
        idea.name,
        idea.file_uri,
        idea_status(idea).unwrap_or_default(),
        idea_tags(idea).join(" "),
    );
    let label = format!(
        r#"<span class="explorer-label"{}>{}</span>"#,
        idea_tip_attrs(idea),
        escape_html(&idea.name),
    );
    format!(
        r#"<li class="explorer-leaf" data-explorer-leaf data-explorer-idea="{}" data-filter-text="{}"><div class="explorer-row" tabindex="0" data-explorer-select="idea:{}"><span class="explorer-spacer" aria-hidden="true"></span>{}{label}</div></li>"#,
        escape_html(&idea.id),
        escape_html(&filter_text),
        escape_html(&idea.id),
        icon(ExplorerIcon::Idea),
    )
}

// rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
fn render_code_file_node(code_file: &ExportCodeFile, out: &mut String) {
    let label = format!(
        r#"<span class="explorer-label" title="{}">{}</span>"#,
        escape_html(&code_file.file_uri),
        escape_html(&code_file.name),
    );
    out.push_str(&format!(
        r#"<li class="explorer-leaf" data-explorer-leaf data-filter-text="{}"><div class="explorer-row is-code" tabindex="0" data-explorer-select="code:{}"><span class="explorer-spacer" aria-hidden="true"></span>{}{label}<span class="explorer-count">{}</span></div></li>"#,
        escape_html(&format!(
            "{} {} {}",
            code_file.name,
            code_file.file_uri,
            code_file.labels.join(" ")
        )),
        escape_html(&code_file.id),
        icon(ExplorerIcon::Code),
        plural(code_file.referencing_idea_ids.len(), "ref", "refs"),
    ));
}
