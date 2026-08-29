//! Load applying `.reqlan/config.json` importRoots for native path resolve.
//! rq:["../../../reqlan rq/extension/configuration.rq".configuration_location]
//! rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
//! rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
//! rq:["../../../reqlan rq/cli/click.rq".click_session_limit]

use crate::ignore::{
    APPLICATION_MEMORY_DIR, CONFIG_FILENAME, DEFAULT_CLICK_LIST_LIMIT, DEFAULT_CLICK_MAX_SESSIONS,
};
use reqlan_parse::{default_import_roots, ImportRootMapping};
use serde_json::Value;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RqConfig {
    pub import_roots: Vec<ImportRootMapping>,
    /// Max click sessions retained per base (`click.maxSessions`, default 100).
    pub click_max_sessions: u32,
    /// rq:["../../../reqlan rq/cli/click.rq".click_max_detail]
    pub click_max_backlinks: u32,
    pub click_max_siblings: u32,
    pub click_max_outbound: u32,
    pub click_max_candidates: u32,
}

pub fn default_rq_config() -> RqConfig {
    RqConfig {
        import_roots: default_import_roots(),
        click_max_sessions: DEFAULT_CLICK_MAX_SESSIONS,
        click_max_backlinks: DEFAULT_CLICK_LIST_LIMIT,
        click_max_siblings: DEFAULT_CLICK_LIST_LIMIT,
        click_max_outbound: DEFAULT_CLICK_LIST_LIMIT,
        click_max_candidates: DEFAULT_CLICK_LIST_LIMIT,
    }
}

/// Walk ancestors from `start`. The first directory that owns `.reqlan/` is the applying base.
/// Load that base's `config.json` when present; otherwise defaults.
/// A child base does not inherit a parent base's config.
pub fn load_applying_rq_config(workspace_root: &Path, start: Option<&Path>) -> RqConfig {
    let mut dir = start
        .map(|path| {
            if path.is_file() {
                path.parent().unwrap_or(workspace_root).to_path_buf()
            } else {
                path.to_path_buf()
            }
        })
        .unwrap_or_else(|| workspace_root.to_path_buf());
    if dir.is_relative() {
        dir = workspace_root.join(dir);
    }
    loop {
        let reqlan_dir = dir.join(APPLICATION_MEMORY_DIR);
        if reqlan_dir.is_dir() {
            let config_path = reqlan_dir.join(CONFIG_FILENAME);
            if config_path.is_file() {
                return parse_rq_config_file(&config_path, &dir);
            }
            return default_rq_config();
        }
        let Some(parent) = dir.parent() else {
            return default_rq_config();
        };
        if parent == dir {
            return default_rq_config();
        }
        dir = parent.to_path_buf();
    }
}

fn parse_rq_config_file(config_path: &Path, base_root: &Path) -> RqConfig {
    let Ok(text) = std::fs::read_to_string(config_path) else {
        return default_rq_config();
    };
    parse_rq_config_json(&text, base_root).unwrap_or_else(default_rq_config)
}

fn parse_rq_config_json(text: &str, base_root: &Path) -> Option<RqConfig> {
    let raw: Value = serde_json::from_str(text).ok()?;
    let object = raw.as_object()?;
    let mut config = default_rq_config();
    match object.get("importRoots") {
        None => {}
        Some(value) => {
            let import_roots = parse_import_roots(value, base_root)?;
            config.import_roots = import_roots;
        }
    }
    if let Some(click) = object.get("click").and_then(Value::as_object) {
        if let Some(max) = click.get("maxSessions").and_then(Value::as_u64) {
            config.click_max_sessions = normalize_click_u32(max);
        }
        if let Some(max) = click.get("maxBacklinks").and_then(Value::as_u64) {
            config.click_max_backlinks = normalize_click_u32(max);
        }
        if let Some(max) = click.get("maxSiblings").and_then(Value::as_u64) {
            config.click_max_siblings = normalize_click_u32(max);
        }
        if let Some(max) = click.get("maxOutbound").and_then(Value::as_u64) {
            config.click_max_outbound = normalize_click_u32(max);
        }
        if let Some(max) = click.get("maxCandidates").and_then(Value::as_u64) {
            config.click_max_candidates = normalize_click_u32(max);
        }
    }
    Some(config)
}

fn normalize_click_u32(max: u64) -> u32 {
    if max == 0 {
        1
    } else {
        max.min(u64::from(u32::MAX)) as u32
    }
}

fn parse_import_roots(raw: &Value, base_root: &Path) -> Option<Vec<ImportRootMapping>> {
    let array = raw.as_array()?;
    let mut import_roots = Vec::new();
    for entry in array {
        if let Some(mapping) = parse_import_root_entry(entry, base_root) {
            import_roots.push(mapping);
        }
    }
    if import_roots.is_empty() {
        Some(default_import_roots())
    } else {
        Some(import_roots)
    }
}

fn parse_import_root_entry(entry: &Value, base_root: &Path) -> Option<ImportRootMapping> {
    let object = entry.as_object()?;
    let alias = object.get("alias")?.as_str()?.to_string();
    if alias.is_empty() {
        return None;
    }
    let root = object.get("root").and_then(Value::as_str).and_then(|value| {
        if value.is_empty() {
            return None;
        }
        if reqlan_parse::is_absolute_uri_or_path(value) || value.contains("://") {
            return Some(value.to_string());
        }
        Some(reqlan_parse::posix_join(&path_to_posix(base_root), value))
    });
    Some(ImportRootMapping { alias, root })
}

fn path_to_posix(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn scratch(label: &str) -> PathBuf {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("reqlan-config-{label}-{nanos}"));
        std::fs::create_dir_all(dir.join(".reqlan")).unwrap();
        dir
    }

    #[test]
    fn missing_import_roots_uses_default_alias() {
        let root = scratch("default");
        std::fs::write(root.join(".reqlan/config.json"), r#"{"$schema":"x"}"#).unwrap();
        let config = load_applying_rq_config(&root, None);
        assert_eq!(config.import_roots.len(), 1);
        assert_eq!(config.import_roots[0].alias, "@");
        assert_eq!(config.import_roots[0].root, None);
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn relative_root_resolves_against_base() {
        let root = scratch("rel-root");
        std::fs::write(
            root.join(".reqlan/config.json"),
            r#"{"importRoots":[{"alias":"~","root":"./lib"}]}"#,
        )
        .unwrap();
        let config = load_applying_rq_config(&root, None);
        assert_eq!(config.import_roots[0].alias, "~");
        let expected = path_to_posix(&root.join("lib"));
        assert_eq!(config.import_roots[0].root.as_deref(), Some(expected.as_str()));
        std::fs::remove_dir_all(&root).ok();
    }

    // rq:["../../../reqlan rq/cli/click.rq".click_session_limit]
    #[test]
    fn click_max_sessions_defaults_to_100() {
        let root = scratch("click-default");
        std::fs::write(root.join(".reqlan/config.json"), r#"{"$schema":"x"}"#).unwrap();
        let config = load_applying_rq_config(&root, None);
        assert_eq!(config.click_max_sessions, 100);
        std::fs::remove_dir_all(&root).ok();
    }

    // rq:["../../../reqlan rq/cli/click.rq".click_session_limit]
    #[test]
    fn click_max_sessions_reads_config() {
        let root = scratch("click-max");
        std::fs::write(root.join(".reqlan/config.json"), r#"{"click":{"maxSessions":3}}"#).unwrap();
        let config = load_applying_rq_config(&root, None);
        assert_eq!(config.click_max_sessions, 3);
        std::fs::remove_dir_all(&root).ok();
    }

    // rq:["../../../reqlan rq/cli/click.rq".click_max_detail]
    #[test]
    fn click_list_limits_read_config() {
        let root = scratch("click-lists");
        std::fs::write(
            root.join(".reqlan/config.json"),
            r#"{"click":{"maxBacklinks":2,"maxSiblings":3,"maxOutbound":4,"maxCandidates":5}}"#,
        )
        .unwrap();
        let config = load_applying_rq_config(&root, None);
        assert_eq!(config.click_max_backlinks, 2);
        assert_eq!(config.click_max_siblings, 3);
        assert_eq!(config.click_max_outbound, 4);
        assert_eq!(config.click_max_candidates, 5);
        std::fs::remove_dir_all(&root).ok();
    }
}
