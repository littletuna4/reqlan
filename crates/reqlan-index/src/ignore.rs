//! .rqignore matching via the mature `ignore` crate.
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
//! rq:["../../../reqlan rq/extension/module/index.rq".rqignore]

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use std::path::{Path, PathBuf};

pub const APPLICATION_MEMORY_DIR: &str = ".reqlan";
pub const RQIGNORE_FILENAME: &str = ".rqignore";
pub const IDEAS_INDEX_FILENAME: &str = "ideas-index.sqlite";
pub const INDEX_DIAGNOSTICS_FILENAME: &str = "index-diagnostics.sqlite";

pub const DEFAULT_RQIGNORE_PATTERNS: &[&str] = &[
    "node_modules/",
    "bower_components/",
    "vendor/",
    "venv/",
    ".venv/",
    "env/",
    ".env/",
    "__pycache__/",
    "*.pyc",
    ".pytest_cache/",
    ".mypy_cache/",
    ".tox/",
    ".ruff_cache/",
    "dist/",
    "out/",
    "build/",
    "coverage/",
    ".next/",
    ".nuxt/",
    ".turbo/",
    ".cache/",
    "*.tsbuildinfo",
    ".git/",
    ".svn/",
    ".hg/",
    ".cursor/",
    ".pnpm-store/",
    ".vscode/",
    ".idea/",
    ".*",
    ".*/",
    ".reqlan/",
    "*.db3",
    "*.sqlite",
    "*.sqlite3",
    "*.db",
    "*.secret.rq",
    "*.log",
    "tmp/",
    "temp/",
];

pub struct RqIgnoreFilter {
    gitignore: Gitignore,
}

impl RqIgnoreFilter {
    pub fn load(base_root: &Path) -> Self {
        let mut builder = GitignoreBuilder::new(base_root);
        for pattern in DEFAULT_RQIGNORE_PATTERNS {
            let _ = builder.add_line(None, pattern);
        }
        let path = base_root.join(APPLICATION_MEMORY_DIR).join(RQIGNORE_FILENAME);
        if path.exists() {
            let _ = builder.add(&path);
        }
        let gitignore = builder.build().unwrap_or_else(|_| {
            let mut fallback = GitignoreBuilder::new(base_root);
            for pattern in DEFAULT_RQIGNORE_PATTERNS {
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

pub const CONFIG_FILENAME: &str = "config.json";

/// Text seeded into a new base's `.reqlan/.rqignore` (built-in defaults + header).
/// rq:["../../../reqlan rq/extension/configuration.rq".configuration_rqignore]
pub fn default_rqignore_file_contents() -> String {
    let mut lines = vec![
        "# reqlan path ignore (gitignore syntax).".to_string(),
        "# Applied relative to the base root (parent of .reqlan).".to_string(),
        "# Built-in defaults always apply; use !pattern to force-include.".to_string(),
        String::new(),
    ];
    lines.extend(DEFAULT_RQIGNORE_PATTERNS.iter().map(|pattern| pattern.to_string()));
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

/// Ensure `<base_root>/.reqlan/` exists and seed `config.json` + `.rqignore` when new.
/// Idempotent: existing markers are left untouched and reported as `created: false`.
/// rq:["../../../reqlan rq/extension/module/index.rq".rqignore]
pub fn create_base(base_root: &Path) -> std::io::Result<CreateBaseResult> {
    let memory_path = base_root.join(APPLICATION_MEMORY_DIR);
    let created = !memory_path.exists();
    std::fs::create_dir_all(&memory_path)?;
    if created {
        std::fs::write(memory_path.join(CONFIG_FILENAME), "{}\n")?;
        std::fs::write(memory_path.join(RQIGNORE_FILENAME), default_rqignore_file_contents())?;
    }
    Ok(CreateBaseResult { created, memory_path })
}

pub fn ideas_index_path(storage_path: &Path) -> PathBuf {
    storage_path.join(IDEAS_INDEX_FILENAME)
}

pub fn index_diagnostics_path(storage_path: &Path) -> PathBuf {
    storage_path.join(INDEX_DIAGNOSTICS_FILENAME)
}

pub fn application_memory_path(workspace_root: &Path, storage_path: Option<&Path>) -> PathBuf {
    storage_path
        .map(Path::to_path_buf)
        .unwrap_or_else(|| workspace_root.join(APPLICATION_MEMORY_DIR))
}
