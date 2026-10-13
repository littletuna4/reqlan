//! HTML page templates for the multi-file export site.
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export]
//! rq:["../../../../reqlan rq/core_analysis/rust_port.rq".export_rust]

mod common;
mod detail;
mod graph;
mod home;
mod indexes;
mod layout;
mod print;
mod shell;

pub use detail::{
    render_attribute_detail_page, render_cluster_detail_page, render_code_file_detail_page,
    render_file_detail_page, render_idea_detail_page,
};
pub use graph::render_graph_page;
pub use home::render_home_page;
pub use indexes::{
    render_attributes_index_page, render_clusters_index_page, render_code_files_index_page,
    render_files_index_page, render_ideas_index_page,
};
pub use print::{
    render_print_cluster_page, render_print_code_file_page, render_print_file_page,
    render_print_home_page, render_print_idea_page,
};
