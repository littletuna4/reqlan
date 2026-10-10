//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
fn main() {
    if let Err(error) = reqlan_lsp::serve() {
        eprintln!("reqlan-lsp: {error}");
        std::process::exit(1);
    }
}
