//! Open-buffer language features from the Rust AST.
//! This barrel declares one module per feature and re-exports their surface.
//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".analysis_barrel]
//! rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".open_file_algorithm]
//! rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".outbound_one_hop]
//! rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".missing_reference_colour_sequence]

mod completion;
mod definition;
mod diagnostics;
mod hover;
mod inlays;
mod links;
mod model;
mod paths;
mod references;
mod refs;
mod selection;
mod sites;
mod text;
mod tokens;

pub use completion::AttributeCatalog;
pub use inlays::InboundReferencer;
pub use model::{DocModel, NameLoc};
pub use paths::resolve_neighbor_file;
pub use references::rename_edits;

pub(crate) use definition::location_url;
pub(crate) use refs::walk_refs;
pub(crate) use text::{
    authored_path_span, file_landing_range, ident_span_from, line_range, span_has,
};
