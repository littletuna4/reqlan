//! Load applying `.reqlan/config.json` importRoots for native path resolve.
//! rq:["../../../reqlan rq/extension/host/configuration.rq".configuration_location]
//! rq:["../../../reqlan rq/extension/host/configuration.rq".configuration_import_roots]
//! rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
//! rq:["../../../reqlan rq/cli/click.rq".click_session_limit]

use crate::check::SparseWildcardHandling;
use crate::ignore::{
    APPLICATION_MEMORY_DIR, CLICK_LIMIT_MIN, CONFIG_FILENAME, DEFAULT_CLICK_LIST_LIMIT,
    DEFAULT_CLICK_MAX_SESSIONS,
};
use reqlan_parse::{
    default_import_roots, import_path_candidates, resolve_rq_path, unquote_path, ImportRootMapping,
};
use serde_json::Value;
use std::path::{Path, PathBuf};

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
    pub unused_imports: Option<SparseWildcardHandling>,
}

pub fn default_rq_config() -> RqConfig {
    RqConfig {
        import_roots: default_import_roots(),
        click_max_sessions: DEFAULT_CLICK_MAX_SESSIONS,
        click_max_backlinks: DEFAULT_CLICK_LIST_LIMIT,
        click_max_siblings: DEFAULT_CLICK_LIST_LIMIT,
        click_max_outbound: DEFAULT_CLICK_LIST_LIMIT,
        click_max_candidates: DEFAULT_CLICK_LIST_LIMIT,
        unused_imports: None,
    }
}

/// Walk ancestors from `start`. The first directory that owns `.reqlan/` is the applying base.
pub fn find_applying_base_root(workspace_root: &Path, start: Option<&Path>) -> Option<PathBuf> {
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
            return Some(dir);
        }
        let Some(parent) = dir.parent() else {
            return None;
        };
        if parent == dir {
            return None;
        }
        dir = parent.to_path_buf();
    }
}

/// Walk ancestors from `start`. The first directory that owns `.reqlan/` is the applying base.
/// Load that base's `config.json` when present; otherwise defaults.
/// A child base does not inherit a parent base's config.
pub fn load_applying_rq_config(workspace_root: &Path, start: Option<&Path>) -> RqConfig {
    let Some(dir) = find_applying_base_root(workspace_root, start) else {
        return default_rq_config();
    };
    let config_path = dir.join(APPLICATION_MEMORY_DIR).join(CONFIG_FILENAME);
    if config_path.is_file() {
        return parse_rq_config_file(&config_path, &dir);
    }
    default_rq_config()
}

/// Join a `resolve_rq_path` result with the workspace when the result is relative.
/// Same rule as check and the language server for `@/` file refs.
/// rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
pub fn absolute_rq_path(workspace_root: &Path, resolved: &str) -> PathBuf {
    let path = Path::new(resolved);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        workspace_root.join(path)
    }
}

/// True when `resolved` exists after the same workspace join as [absolute_rq_path].
pub fn rq_path_exists(workspace_root: &Path, resolved: &str) -> bool {
    absolute_rq_path(workspace_root, resolved).exists()
}

/// Resolve an authored path with `resolve_rq_path`, then locate it on disk under `workspace_root`.
/// Tries implicit `.rq` candidates the same way imports do.
pub fn locate_authored_rq_path(
    workspace_root: &Path,
    from_file: &str,
    authored: &str,
    import_roots: &[ImportRootMapping],
) -> Option<PathBuf> {
    let unquoted = unquote_path(authored);
    if unquoted.contains("://") {
        return None;
    }
    for candidate in import_path_candidates(&unquoted) {
        let resolved = resolve_rq_path(&candidate, from_file, import_roots);
        let path = absolute_rq_path(workspace_root, &resolved);
        if path.is_file() || path.is_dir() {
            return Some(path);
        }
    }
    None
}

/// Import-root mappings from the applying `.reqlan/config.json` for `source_file`.
/// rq:["../../../reqlan rq/extension/host/configuration.rq".configuration_location]
/// rq:["../../../reqlan rq/extension/host/configuration.rq".configuration_import_roots]
pub fn import_roots_for_source(workspace_root: &Path, source_file: &str) -> Vec<ImportRootMapping> {
    let path = Path::new(source_file);
    let absolute = if path.is_absolute() { path.to_path_buf() } else { workspace_root.join(path) };
    load_applying_rq_config(workspace_root, Some(&absolute)).import_roots
}

/// Locate an authored path using the applying config for `from_file`.
pub fn locate_authored_rq_path_for_source(
    workspace_root: &Path,
    from_file: &str,
    authored: &str,
) -> Option<PathBuf> {
    let roots = import_roots_for_source(workspace_root, from_file);
    locate_authored_rq_path(workspace_root, from_file, authored, &roots)
}

/// Resolve an authored import path against `source_file` and `import_roots`,
/// returning the first candidate that exists on disk under `workspace_root`.
pub fn resolve_existing_import_path(
    workspace_root: &Path,
    source_file: &str,
    authored: &str,
    import_roots: &[ImportRootMapping],
) -> Option<String> {
    for candidate in import_path_candidates(authored) {
        let resolved = resolve_rq_path(&candidate, source_file, import_roots);
        if rq_path_exists(workspace_root, &resolved) {
            return Some(resolved);
        }
    }
    None
}

/// Resolve `label` relative to `source_file` (with `import_roots`) into a
/// workspace-relative POSIX path, or `None` for URLs, absolute paths, and `../` escapes.
pub fn resolved_workspace_relative_path(
    source_file: &str,
    label: &str,
    import_roots: &[ImportRootMapping],
) -> Option<String> {
    if label.contains("://") {
        return None;
    }
    let resolved = resolve_rq_path(label, source_file, import_roots);
    if reqlan_parse::is_absolute_uri_or_path(&resolved) {
        return None;
    }
    if resolved.is_empty() || resolved == "." || resolved.starts_with("../") {
        return None;
    }
    Some(resolved)
}

/// Normalize an indexed path by converting backslashes to `/` and stripping leading `./`.
pub fn normalize_indexed_path(path: &str) -> String {
    let mut path = path.replace('\\', "/");
    while let Some(stripped) = path.strip_prefix("./") {
        path = stripped.to_string();
    }
    path
}

/// True when two workspace-relative paths normalize to the same indexed path.
pub fn same_indexed_path(left: &str, right: &str) -> bool {
    normalize_indexed_path(left) == normalize_indexed_path(right)
}

/// True when `file_uri` ends with `.rq` (case-insensitive).
pub fn is_rq_uri(file_uri: &str) -> bool {
    file_uri.to_ascii_lowercase().ends_with(".rq")
}

/// True when `path` is a remote URL (`scheme://...`).
pub fn is_remote_import_path(path: &str) -> bool {
    path.contains("://")
}

/// True when a file reference target from `source_id` does not resolve on disk.
/// rq:["../../../reqlan rq/language/syntax.rq".reference_file]
/// rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
pub fn file_reference_missing(
    workspace_root: &Path,
    source_id: &str,
    target_file: &str,
    import_roots: &[ImportRootMapping],
) -> bool {
    if target_file.contains("://") {
        return false;
    }
    let parsed = reqlan_parse::parse_file_reference_string(&unquote_path(target_file));
    let path = parsed.file_path.replace('\\', "/");
    if path.trim().is_empty() {
        return true;
    }
    let aliased = reqlan_parse::match_import_root_mapping(&path, import_roots).is_some();
    if !aliased && !path.contains('/') && !path.contains('\\') {
        return false;
    }
    locate_authored_rq_path(
        workspace_root,
        reqlan_parse::file_from_idea_id(source_id),
        target_file,
        import_roots,
    )
    .is_none()
}

/// True when a resolved qualified target file path does not exist on disk.
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_file]
pub fn qualified_target_file_missing(workspace_root: &Path, target_file: &str) -> bool {
    if target_file.contains("://") {
        return false;
    }
    !import_path_candidates(target_file)
        .iter()
        .any(|candidate| rq_path_exists(workspace_root, candidate))
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
    if let Some(value) = object.get("unusedImports").and_then(Value::as_str) {
        if let Some(handling) = SparseWildcardHandling::parse(value) {
            config.unused_imports = Some(handling);
        }
    }
    Some(config)
}

fn normalize_click_u32(max: u64) -> u32 {
    if max < u64::from(CLICK_LIMIT_MIN) {
        CLICK_LIMIT_MIN
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
        assert_eq!(config.import_roots[0].alias, reqlan_parse::DEFAULT_IMPORT_ROOT_ALIAS);
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
        assert_eq!(config.click_max_sessions, DEFAULT_CLICK_MAX_SESSIONS);
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

    // rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
    #[test]
    fn locate_aliased_file_ref_joins_workspace_root() {
        let root = scratch("alias-file");
        std::fs::write(root.join(".reqlan/config.json"), r#"{"$schema":"x"}"#).unwrap();
        std::fs::create_dir_all(root.join("docs")).unwrap();
        std::fs::write(root.join("docs/my file.ts"), "export {}\n").unwrap();
        let host = root.join("reqlan rq/host.rq");
        std::fs::create_dir_all(host.parent().unwrap()).unwrap();
        let found = locate_authored_rq_path(
            &root,
            &host.to_string_lossy(),
            "@/docs/my file.ts",
            &default_import_roots(),
        );
        assert_eq!(found.as_deref(), Some(root.join("docs/my file.ts").as_path()));
        assert!(locate_authored_rq_path(
            &root,
            &host.to_string_lossy(),
            "@/docs/gone.ts",
            &default_import_roots(),
        )
        .is_none());
        std::fs::remove_dir_all(&root).ok();
    }

    // rq:["../../../reqlan rq/extension/host/configuration.rq".configuration_import_roots]
    // rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
    #[test]
    fn locate_uses_import_roots_from_applying_config() {
        let root = scratch("alias-config");
        std::fs::write(
            root.join(".reqlan/config.json"),
            r#"{"importRoots":[{"alias":"@","root":"./lib"}]}"#,
        )
        .unwrap();
        std::fs::create_dir_all(root.join("lib")).unwrap();
        std::fs::write(root.join("lib/my file.ts"), "export {}\n").unwrap();
        let host = "reqlan rq/host.rq";
        std::fs::create_dir_all(root.join("reqlan rq")).unwrap();
        let found = locate_authored_rq_path_for_source(&root, host, "@/my file.ts");
        assert_eq!(found.as_deref(), Some(root.join("lib/my file.ts").as_path()));
        // Without the configured root, workspace-relative `@/my file.ts` would miss.
        assert!(locate_authored_rq_path(&root, host, "@/my file.ts", &default_import_roots(),)
            .is_none());
        std::fs::remove_dir_all(&root).ok();
    }
}
