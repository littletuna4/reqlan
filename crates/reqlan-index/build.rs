//! Embeds shared product defaults from packages/analytical/src/core/defaults.json.
//! rq:["../../reqlan rq/indexer/sequencing.rq".scan_limits]
//! rq:["../../reqlan rq/cli/click.rq".click_session_limit]
//! rq:["../../reqlan rq/extension/index-host/index.rq".rqignore]

use serde::Deserialize;
use std::env;
use std::fs;
use std::path::PathBuf;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Defaults {
    scan: ScanLimitSpec,
    click: ClickSpec,
    import_root_alias: String,
    parse_budget_ms: u64,
    graph_hop_depth: u32,
    paths: PathSpec,
    rqignore: RqIgnoreSpec,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ScanLimitSpec {
    default_max_depth: u32,
    default_max_entries: u32,
    min_depth: u32,
    max_depth_limit: u32,
    min_entries: u32,
    max_entries_limit: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ClickSpec {
    max_sessions: u32,
    list_limit: u32,
    minimum: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PathSpec {
    application_memory_dir: String,
    config_filename: String,
    rqignore_filename: String,
    gitignore_filename: String,
    ideas_index_filename: String,
    index_diagnostics_filename: String,
    click_sessions_filename: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RqIgnoreSpec {
    groups: Vec<RqIgnoreGroup>,
    binary_title: String,
    binary: Vec<String>,
    seed_header: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RqIgnoreGroup {
    title: String,
    patterns: Vec<String>,
}

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let spec_path = manifest_dir.join("../../packages/analytical/src/core/defaults.json");
    println!("cargo:rerun-if-changed={}", spec_path.display());

    let text = fs::read_to_string(&spec_path)
        .unwrap_or_else(|error| panic!("read {}: {error}", spec_path.display()));
    let spec: Defaults = serde_json::from_str(&text)
        .unwrap_or_else(|error| panic!("parse {}: {error}", spec_path.display()));
    assert_bounds(
        "depth",
        spec.scan.min_depth,
        spec.scan.default_max_depth,
        spec.scan.max_depth_limit,
    );
    assert_bounds(
        "entries",
        spec.scan.min_entries,
        spec.scan.default_max_entries,
        spec.scan.max_entries_limit,
    );
    if spec.click.minimum == 0
        || spec.click.minimum > spec.click.max_sessions
        || spec.click.minimum > spec.click.list_limit
    {
        panic!("click limits require 1 <= minimum <= maxSessions and listLimit");
    }
    if spec.import_root_alias.is_empty() {
        panic!("importRootAlias is empty");
    }
    if spec.parse_budget_ms == 0 {
        panic!("parseBudgetMs is 0");
    }
    if spec.graph_hop_depth == 0 {
        panic!("graphHopDepth is 0");
    }

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    fs::write(out_dir.join("scan_limits.rs"), scan_limits(&spec.scan))
        .unwrap_or_else(|error| panic!("write scan_limits.rs: {error}"));
    fs::write(out_dir.join("product_defaults.rs"), product_defaults(&spec))
        .unwrap_or_else(|error| panic!("write product_defaults.rs: {error}"));
}

fn scan_limits(spec: &ScanLimitSpec) -> String {
    format!(
        "pub const DEFAULT_SCAN_MAX_DEPTH: u32 = {default_max_depth};\n\
         pub const DEFAULT_SCAN_MAX_ENTRIES: u32 = {default_max_entries};\n\
         pub(crate) const SCAN_MIN_DEPTH: u32 = {min_depth};\n\
         pub const SCAN_MAX_DEPTH_LIMIT: u32 = {max_depth_limit};\n\
         pub(crate) const SCAN_MIN_ENTRIES: u32 = {min_entries};\n\
         pub const SCAN_MAX_ENTRIES_LIMIT: u32 = {max_entries_limit};\n",
        default_max_depth = spec.default_max_depth,
        default_max_entries = spec.default_max_entries,
        min_depth = spec.min_depth,
        max_depth_limit = spec.max_depth_limit,
        min_entries = spec.min_entries,
        max_entries_limit = spec.max_entries_limit,
    )
}

fn product_defaults(spec: &Defaults) -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "pub const APPLICATION_MEMORY_DIR: &str = {};\n\
         pub const CONFIG_FILENAME: &str = {};\n\
         pub const RQIGNORE_FILENAME: &str = {};\n\
         pub const GITIGNORE_FILENAME: &str = {};\n\
         pub const IDEAS_INDEX_FILENAME: &str = {};\n\
         pub const INDEX_DIAGNOSTICS_FILENAME: &str = {};\n\
         pub const CLICK_SESSIONS_FILENAME: &str = {};\n\
         pub const DEFAULT_CLICK_MAX_SESSIONS: u32 = {};\n\
         pub const DEFAULT_CLICK_LIST_LIMIT: u32 = {};\n\
         pub const CLICK_LIMIT_MIN: u32 = {};\n\
         pub const RQIGNORE_BINARY_TITLE: &str = {};\n",
        rust_str(&spec.paths.application_memory_dir),
        rust_str(&spec.paths.config_filename),
        rust_str(&spec.paths.rqignore_filename),
        rust_str(&spec.paths.gitignore_filename),
        rust_str(&spec.paths.ideas_index_filename),
        rust_str(&spec.paths.index_diagnostics_filename),
        rust_str(&spec.paths.click_sessions_filename),
        spec.click.max_sessions,
        spec.click.list_limit,
        spec.click.minimum,
        rust_str(&spec.rqignore.binary_title),
    ));
    out.push_str("pub struct RqIgnoreGroup {\n    pub title: &'static str,\n    pub patterns: &'static [&'static str],\n}\n");
    out.push_str("pub static RQIGNORE_CORE_GROUPS: &[RqIgnoreGroup] = &[\n");
    for group in &spec.rqignore.groups {
        out.push_str("    RqIgnoreGroup { title: ");
        out.push_str(&rust_str(&group.title));
        out.push_str(", patterns: &[");
        for pattern in &group.patterns {
            out.push_str(&rust_str(pattern));
            out.push_str(", ");
        }
        out.push_str("] },\n");
    }
    out.push_str("];\n");
    out.push_str("pub static BINARY_RQIGNORE_PATTERNS: &[&str] = &[");
    for pattern in &spec.rqignore.binary {
        out.push_str(&rust_str(pattern));
        out.push_str(", ");
    }
    out.push_str("];\n");
    out.push_str("pub static RQIGNORE_SEED_HEADER: &[&str] = &[");
    for line in &spec.rqignore.seed_header {
        out.push_str(&rust_str(line));
        out.push_str(", ");
    }
    out.push_str("];\n");
    let _ = spec.import_root_alias;
    let _ = spec.parse_budget_ms;
    let _ = spec.graph_hop_depth;
    out
}

fn rust_str(value: &str) -> String {
    let mut out = String::from("\"");
    for ch in value.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            other => out.push(other),
        }
    }
    out.push('"');
    out
}

fn assert_bounds(label: &str, min: u32, default: u32, max: u32) {
    if min == 0 || min > default || default > max {
        panic!(
            "{label} scan limits require 1 <= min <= default <= max; got min={min} default={default} max={max}"
        );
    }
}
