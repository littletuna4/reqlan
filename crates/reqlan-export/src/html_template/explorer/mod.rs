//! File explorer section for the export home page: folder/file/idea tree plus preview pane.
//! rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]

mod preview;
mod tree;

use crate::html_template::layout::render_layout_card_with_actions;
use crate::types::ExportSnapshot;
use preview::{
    render_explorer_actions, render_explorer_addressbar, render_explorer_data_script,
    render_explorer_preview, render_explorer_resize_handle,
};
use tree::{build_dir_tree, render_dir_tree};

// rq:["../../../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
pub fn render_file_explorer(snapshot: &ExportSnapshot, current_path: &str) -> String {
    let tree = build_dir_tree(&snapshot.files, &snapshot.code_files);
    let mut tree_html = String::new();
    render_dir_tree(&tree, &mut tree_html);
    let interactive = snapshot.runtime_mode == "interactive";
    let actions = if interactive { render_explorer_actions() } else { String::new() };
    let preview = if interactive { render_explorer_preview() } else { String::new() };
    let data_script = if interactive {
        render_explorer_data_script(snapshot, current_path, &tree)
    } else {
        String::new()
    };
    let addressbar = render_explorer_addressbar(snapshot);
    let resize_handle = if interactive { render_explorer_resize_handle() } else { String::new() };
    let resize_class = if interactive { " is-resizable" } else { "" };
    let body = format!(
        r#"{addressbar}
        <div class="file-explorer-body{resize_class}">
            <nav class="file-explorer-tree" aria-label="Files and ideas" data-explorer-tree>
                <ul class="explorer-tree-root">{tree_html}
                </ul>
            </nav>
            {resize_handle}
            {preview}
        </div>
        {data_script}"#,
    );
    render_layout_card_with_actions(
        "file-explorer",
        "section",
        "panel layout-card-span-full",
        "File explorer",
        "Folders, hosting files, code files, and ideas in this export with a preview pane.",
        &actions,
        &body,
        r#"id="file-explorer" data-explorer"#,
    )
}
