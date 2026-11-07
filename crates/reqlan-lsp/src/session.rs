//! Open documents and a read-only view of each base's ideas index.
//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".session_barrel]
//! rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".open_file_algorithm]
//! rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".open_file_hot_path]
//! rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".lazy_features_after_outbound]

mod actions;
mod comments;
mod completion;
mod diagnostics;
mod features;
mod inbound;
mod index;
mod neighbors;
mod records;
mod references;
mod rename;
mod state;
mod support;
mod symbols;

pub use records::Session;

pub(crate) use state::is_rq_uri;
