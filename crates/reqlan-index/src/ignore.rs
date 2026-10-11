//! .rqignore matching via the mature `ignore` crate.
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
//! rq:["../../../reqlan rq/extension/index-host/index.rq".rqignore]
//! rq:["../../../reqlan rq/extension/index-host/index.rq".binary_ignore]
//! rq:["../../../reqlan rq/extension/index-host/index.rq".commentless_file_ignore]
//! rq:["../../../reqlan rq/extension/index-host/index.rq".rqignore_initialisation]

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use std::path::{Path, PathBuf};

// Filenames, click caps, and .rqignore patterns come from defaults.json.
include!(concat!(env!("OUT_DIR"), "/product_defaults.rs"));

/// Gitignore patterns that exclude SQLite application-memory artifacts.
/// rq:["../../../reqlan rq/bases/base.rq".base_initialisation_ignore]
pub const DEFAULT_GITIGNORE_PATTERNS: &[&str] =
    &["*.sqlite", "*.sqlite-journal", "*.sqlite-shm", "*.sqlite-wal"];

fn add_core_rqignore_patterns(builder: &mut GitignoreBuilder) {
    for group in RQIGNORE_CORE_GROUPS {
        for pattern in group.patterns {
            let _ = builder.add_line(None, pattern);
        }
    }
}

/// True when `path` has an extension covered by [BINARY_RQIGNORE_PATTERNS].
pub fn is_binary_rqignore_path(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(|ext| ext.to_str()) else {
        return false;
    };
    BINARY_RQIGNORE_PATTERNS.iter().any(|pattern| {
        pattern.strip_prefix("*.").is_some_and(|suffix| suffix.eq_ignore_ascii_case(ext))
    })
}

pub struct RqIgnoreFilter {
    gitignore: Gitignore,
}

impl RqIgnoreFilter {
    pub fn load(base_root: &Path) -> Self {
        let mut builder = GitignoreBuilder::new(base_root);
        add_core_rqignore_patterns(&mut builder);
        for pattern in BINARY_RQIGNORE_PATTERNS {
            let _ = builder.add_line(None, pattern);
        }
        let path = base_root.join(APPLICATION_MEMORY_DIR).join(RQIGNORE_FILENAME);
        if path.exists() {
            let _ = builder.add(&path);
        }
        let gitignore = builder.build().unwrap_or_else(|_| {
            let mut fallback = GitignoreBuilder::new(base_root);
            add_core_rqignore_patterns(&mut fallback);
            for pattern in BINARY_RQIGNORE_PATTERNS {
                let _ = fallback.add_line(None, pattern);
            }
            fallback.build().unwrap_or_else(|_| Gitignore::empty())
        });
        Self { gitignore }
    }

    pub fn ignores(&self, relative_path: &str, is_directory: bool) -> bool {
        let normalized = relative_path.replace('\\', "/").trim_start_matches('/').to_string();
        if normalized.is_empty() || normalized == "." {
            return false;
        }
        if normalized.starts_with("../") {
            return true;
        }
        let path = normalized.trim_end_matches('/');
        if path.is_empty() {
            return false;
        }
        self.gitignore.matched_path_or_any_parents(path, is_directory).is_ignore()
    }
}

/// Workspace Git ignore matcher for [check] skip-gitignored-targets.
/// rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
pub struct WorkspaceGitignore {
    workspace_root: PathBuf,
    gitignore: Gitignore,
}

impl WorkspaceGitignore {
    /// Load the workspace `.gitignore` and `.git/info/exclude`.
    pub fn load(workspace_root: &Path) -> Self {
        let mut builder = GitignoreBuilder::new(workspace_root);
        let gitignore_path = workspace_root.join(GITIGNORE_FILENAME);
        if gitignore_path.is_file() {
            let _ = builder.add(&gitignore_path);
        }
        let exclude_path = workspace_root.join(".git").join("info").join("exclude");
        if exclude_path.is_file() {
            let _ = builder.add(&exclude_path);
        }
        let gitignore = builder.build().unwrap_or_else(|_| Gitignore::empty());
        Self { workspace_root: workspace_root.to_path_buf(), gitignore }
    }

    /// True when Git ignore rules ignore `relative_path` (file or directory).
    pub fn ignores(&self, relative_path: &str) -> bool {
        let Some(normalized) = normalize_workspace_relative(relative_path) else {
            return false;
        };
        if gitignore_matches(&self.gitignore, &normalized) {
            return true;
        }
        nested_gitignore_matches(&self.workspace_root, &normalized)
    }
}

fn normalize_workspace_relative(relative_path: &str) -> Option<String> {
    let normalized = relative_path.replace('\\', "/").trim_start_matches('/').to_string();
    if normalized.is_empty() || normalized == "." || normalized.starts_with("../") {
        return None;
    }
    let path = normalized.trim_end_matches('/');
    if path.is_empty() {
        return None;
    }
    Some(path.to_string())
}

fn gitignore_matches(gitignore: &Gitignore, relative_path: &str) -> bool {
    gitignore.matched_path_or_any_parents(relative_path, false).is_ignore()
        || gitignore.matched_path_or_any_parents(relative_path, true).is_ignore()
}

fn nested_gitignore_matches(workspace_root: &Path, relative_path: &str) -> bool {
    let mut current = Path::new(relative_path);
    while let Some(parent) = current.parent() {
        if parent.as_os_str().is_empty() || parent == Path::new(".") {
            break;
        }
        let gitignore_path = workspace_root.join(parent).join(GITIGNORE_FILENAME);
        if gitignore_path.is_file() {
            let (gitignore, _) = Gitignore::new(&gitignore_path);
            if let Ok(remainder) = Path::new(relative_path).strip_prefix(parent) {
                let rem = remainder.to_string_lossy().replace('\\', "/");
                if !rem.is_empty() && gitignore_matches(&gitignore, &rem) {
                    return true;
                }
            }
        }
        current = parent;
    }
    false
}

/// Text seeded into a new base's `.reqlan/.rqignore` (comments + built-in defaults).
/// rq:["../../../reqlan rq/extension/host/configuration.rq".configuration_rqignore]
/// rq:["../../../reqlan rq/extension/index-host/index.rq".rqignore_initialisation]
pub fn default_rqignore_file_contents() -> String {
    let mut lines: Vec<String> =
        RQIGNORE_SEED_HEADER.iter().map(|line| (*line).to_string()).collect();
    lines.push(String::new());
    for group in RQIGNORE_CORE_GROUPS {
        lines.push(format!("# {}", group.title));
        lines.extend(group.patterns.iter().map(|pattern| (*pattern).to_string()));
        lines.push(String::new());
    }
    lines.push(RQIGNORE_BINARY_TITLE.to_string());
    lines.extend(BINARY_RQIGNORE_PATTERNS.iter().map(|pattern| (*pattern).to_string()));
    lines.push(String::new());
    lines.join("\n")
}

/// Text seeded into a new base's `.reqlan/.gitignore`.
/// rq:["../../../reqlan rq/bases/base.rq".base_initialisation_ignore]
pub fn default_gitignore_file_contents() -> String {
    let mut lines = vec![
        "# reqlan SQLite artifacts — do not commit.".to_string(),
        "# ideas-index.sqlite, index-diagnostics.sqlite, click-sessions.sqlite, and sidecars."
            .to_string(),
        String::new(),
    ];
    lines.extend(DEFAULT_GITIGNORE_PATTERNS.iter().map(|pattern| pattern.to_string()));
    lines.push(String::new());
    lines.join("\n")
}

/// Outcome of seeding a reqlan base marker.
#[derive(Debug, Clone)]
pub struct CreateBaseResult {
    /// True when `.reqlan` did not already exist before this call.
    pub created: bool,
    /// Absolute path of the `.reqlan` application-memory directory.
    pub memory_path: PathBuf,
}

/// Ensure `<base_root>/.reqlan/` exists and seed `config.json`, `.rqignore`, and `.gitignore` when new.
/// Idempotent: existing markers are left untouched and reported as `created: false`.
/// rq:["../../../reqlan rq/extension/index-host/index.rq".rqignore]
/// rq:["../../../reqlan rq/extension/index-host/index.rq".rqignore_initialisation]
/// rq:["../../../reqlan rq/bases/base.rq".base_initialisation_ignore]
pub fn create_base(base_root: &Path) -> std::io::Result<CreateBaseResult> {
    let memory_path = base_root.join(APPLICATION_MEMORY_DIR);
    let created = !memory_path.exists();
    std::fs::create_dir_all(&memory_path)?;
    if created {
        std::fs::write(memory_path.join(CONFIG_FILENAME), "{}\n")?;
        std::fs::write(memory_path.join(RQIGNORE_FILENAME), default_rqignore_file_contents())?;
        std::fs::write(memory_path.join(GITIGNORE_FILENAME), default_gitignore_file_contents())?;
    }
    Ok(CreateBaseResult { created, memory_path })
}

pub fn ideas_index_path(storage_path: &Path) -> PathBuf {
    storage_path.join(IDEAS_INDEX_FILENAME)
}

pub fn index_diagnostics_path(storage_path: &Path) -> PathBuf {
    storage_path.join(INDEX_DIAGNOSTICS_FILENAME)
}

/// Path to `click-sessions.sqlite` under application memory.
/// rq:["../../../reqlan rq/cli/click.rq".click_session]
pub fn click_sessions_path(storage_path: &Path) -> PathBuf {
    storage_path.join(CLICK_SESSIONS_FILENAME)
}

pub fn application_memory_path(workspace_root: &Path, storage_path: Option<&Path>) -> PathBuf {
    storage_path
        .map(Path::to_path_buf)
        .unwrap_or_else(|| workspace_root.join(APPLICATION_MEMORY_DIR))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn scratch(label: &str) -> PathBuf {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("reqlan-{label}-{nanos}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    // rq:["../../../reqlan rq/bases/base.rq".base_initialisation_ignore]
    #[test]
    fn create_base_seeds_gitignore_for_sqlite_artifacts() {
        let root = scratch("create-base-gitignore");
        let result = create_base(&root).unwrap();
        assert!(result.created);
        let gitignore =
            std::fs::read_to_string(result.memory_path.join(GITIGNORE_FILENAME)).unwrap();
        assert!(gitignore.contains("*.sqlite"));
        assert!(gitignore.contains("*.sqlite-wal"));
        assert!(gitignore.contains("*.sqlite-shm"));
        assert!(gitignore.contains("*.sqlite-journal"));
        let rqignore = std::fs::read_to_string(result.memory_path.join(RQIGNORE_FILENAME)).unwrap();
        assert!(rqignore.contains("*.bin"));
        assert!(rqignore.contains("!*.bin"));
        std::fs::remove_dir_all(&root).ok();
    }

    // rq:["../../../reqlan rq/extension/index-host/index.rq".binary_ignore]
    #[test]
    fn default_rqignore_skips_binary_files_until_negated() {
        let root = scratch("binary-ignore");
        let filter = RqIgnoreFilter::load(&root);
        assert!(filter.ignores("assets/payload.bin", false));
        assert!(filter.ignores("photo.png", false));
        assert!(filter.ignores("favicon.ico", false));
        assert!(filter.ignores("logo.svg", false));
        assert!(filter.ignores("lib/native.jar", false));
        assert!(filter.ignores("bin/", true));
        assert!(filter.ignores("generated/page.rq", false));
        assert!(filter.ignores("out/bundle.js", false));
        assert!(filter.ignores("docs/index.html", false));
        assert!(!filter.ignores("src/app.ts", false));

        let memory = root.join(APPLICATION_MEMORY_DIR);
        std::fs::create_dir_all(&memory).unwrap();
        std::fs::write(memory.join(RQIGNORE_FILENAME), "!*.bin\n").unwrap();
        let opted = RqIgnoreFilter::load(&root);
        assert!(!opted.ignores("assets/payload.bin", false));
        assert!(opted.ignores("photo.png", false));
        std::fs::remove_dir_all(&root).ok();
    }

    // rq:["../../../reqlan rq/extension/index-host/index.rq".commentless_file_ignore]
    #[test]
    fn default_rqignore_skips_files_without_comments_until_negated() {
        let root = scratch("commentless-ignore");
        let filter = RqIgnoreFilter::load(&root);
        assert!(filter.ignores("package.json", false));
        assert!(filter.ignores("data/rows.csv", false));
        assert!(filter.ignores("src/app.min.js", false));
        assert!(filter.ignores("ideas-index.sqlite-wal", false));
        assert!(filter.ignores("ideas-index.sqlite-shm", false));
        assert!(filter.ignores("ideas-index.sqlite-journal", false));
        assert!(!filter.ignores("src/app.ts", false));
        assert!(!filter.ignores("tsconfig.jsonc", false));

        let memory = root.join(APPLICATION_MEMORY_DIR);
        std::fs::create_dir_all(&memory).unwrap();
        std::fs::write(memory.join(RQIGNORE_FILENAME), "!*.json\n").unwrap();
        let opted = RqIgnoreFilter::load(&root);
        assert!(!opted.ignores("package.json", false));
        assert!(opted.ignores("data/rows.csv", false));
        std::fs::remove_dir_all(&root).ok();
    }

    // rq:["../../../reqlan rq/extension/index-host/index.rq".rqignore_initialisation]
    #[test]
    fn seeded_rqignore_explains_features() {
        let text = default_rqignore_file_contents();
        assert!(text.contains("# Purpose"));
        assert!(text.contains("discovery and indexing"));
        assert!(text.contains("parent of .reqlan"));
        assert!(text.contains("not Git ignore"));
        assert!(text.contains("last matching rule wins"));
        assert!(text.contains("starts with !"));
        assert!(text.contains("Built-in defaults always apply"));
        assert!(text.contains("If you delete a line here"));
        assert!(text.contains("Binary globs are skipped by default"));
        assert!(text.contains("!*.bin"));
        assert!(text.contains("rq: comment references"));
        assert!(text.contains("Hidden paths"));
        assert!(text.contains("*.secret.rq is skipped"));
        assert!(text.contains(".reqlan/ is not crawled"));
        assert!(text.contains("# Dependencies"));
        assert!(text.contains("# Databases"));
        assert!(text.contains("SQLite sidecar files"));
        assert!(text.contains("*.sqlite-wal"));
        assert!(text.contains("# Files without comments"));
        assert!(text.contains("no comment syntax"));
        assert!(text.contains("!*.json"));
        assert!(text.contains("*.csv"));
        let root = scratch("rqignore-seed-comments");
        let result = create_base(&root).unwrap();
        let on_disk = std::fs::read_to_string(result.memory_path.join(RQIGNORE_FILENAME)).unwrap();
        assert_eq!(on_disk, text);
        std::fs::remove_dir_all(&root).ok();
    }

    // rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
    #[test]
    fn workspace_gitignore_matches_root_and_nested_rules() {
        let root = scratch("workspace-gitignore");
        std::fs::write(
            root.join(GITIGNORE_FILENAME),
            ".cursor/\npackages/extension/media/webviews/\n",
        )
        .unwrap();
        std::fs::create_dir_all(root.join("packages").join("extension")).unwrap();
        std::fs::write(root.join("packages").join("extension").join(GITIGNORE_FILENAME), "out/\n")
            .unwrap();

        let filter = WorkspaceGitignore::load(&root);
        assert!(filter.ignores(".cursor/mcp.json"));
        assert!(filter.ignores("packages/extension/media/webviews/onboarding"));
        assert!(filter.ignores("packages/extension/out/bundle.js"));
        assert!(!filter.ignores("src/gone.ts"));
        assert!(!filter.ignores("packages/extension/webviews/onboarding"));
        assert!(!filter.ignores("../outside.ts"));
        std::fs::remove_dir_all(&root).ok();
    }
}
