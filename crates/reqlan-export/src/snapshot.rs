//! Export snapshot builder, split into small modules.
//! This file re-exports the module items, so old paths keep working.

mod attributes;
mod build;
mod clusters;
mod files;
mod filter;
mod graph;
mod ideas;
mod manifest;
mod search;
mod util;

pub use build::build_export_snapshot;
// Kept so old `crate::snapshot::` paths stay valid.
#[allow(unused_imports)]
pub use manifest::build_page_info;
#[allow(unused_imports)]
pub use util::ensure_html_file_name;
#[allow(unused_imports)]
pub use util::resolve_referenced_file_path;
#[allow(unused_imports)]
pub use util::slugify;
