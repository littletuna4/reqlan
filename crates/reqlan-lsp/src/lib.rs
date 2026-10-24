//! Editor language server. Parses open buffers with `reqlan-parse`.
//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
mod analysis;
mod code_actions;
mod duty;
mod hover_content;
mod path_completion;
mod server;
mod session;
mod utf16;

pub use analysis::{AttributeCatalog, InboundReferencer};
pub use code_actions::SymbolHit;
pub use server::serve;
pub use session::Session;
