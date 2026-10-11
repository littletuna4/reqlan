//! Embeds parse budget and the default import alias from the shared defaults file.
//! rq:["../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
//! rq:["../../reqlan rq/language/imports.rq".configuration_import_root_alias]

use serde::Deserialize;
use std::env;
use std::fs;
use std::path::PathBuf;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Defaults {
    import_root_alias: String,
    parse_budget_ms: u64,
}

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let spec_path = manifest_dir.join("../../packages/analytical/src/core/defaults.json");
    println!("cargo:rerun-if-changed={}", spec_path.display());
    let text = fs::read_to_string(&spec_path)
        .unwrap_or_else(|error| panic!("read {}: {error}", spec_path.display()));
    let spec: Defaults = serde_json::from_str(&text)
        .unwrap_or_else(|error| panic!("parse {}: {error}", spec_path.display()));
    if spec.import_root_alias.is_empty() {
        panic!("importRootAlias is empty");
    }
    if spec.parse_budget_ms == 0 {
        panic!("parseBudgetMs is 0");
    }
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let generated = format!(
        "pub const DEFAULT_IMPORT_ROOT_ALIAS: &str = {};\n\
         pub const DEFAULT_PARSE_BUDGET_MS: u64 = {};\n",
        rust_str(&spec.import_root_alias),
        spec.parse_budget_ms,
    );
    fs::write(out_dir.join("parse_defaults.rs"), generated)
        .unwrap_or_else(|error| panic!("write parse_defaults.rs: {error}"));
}

fn rust_str(value: &str) -> String {
    let mut out = String::from("\"");
    for ch in value.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            other => out.push(other),
        }
    }
    out.push('"');
    out
}
