//! .rqignore matching via the mature `ignore` crate.
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]
//! rq:["../../../reqlan rq/extension/module/index.rq".rqignore]
//! rq:["../../../reqlan rq/extension/module/index.rq".binary_ignore]
//! rq:["../../../reqlan rq/extension/module/index.rq".rqignore_initialisation]

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use std::path::{Path, PathBuf};

pub const APPLICATION_MEMORY_DIR: &str = ".reqlan";
pub const RQIGNORE_FILENAME: &str = ".rqignore";
pub const GITIGNORE_FILENAME: &str = ".gitignore";
pub const IDEAS_INDEX_FILENAME: &str = "ideas-index.sqlite";
pub const INDEX_DIAGNOSTICS_FILENAME: &str = "index-diagnostics.sqlite";

/// Gitignore patterns that exclude SQLite application-memory artifacts.
/// rq:["../../../reqlan rq/bases/base.rq".base_initialisation_ignore]
pub const DEFAULT_GITIGNORE_PATTERNS: &[&str] =
    &["*.sqlite", "*.sqlite-journal", "*.sqlite-shm", "*.sqlite-wal"];

const RQIGNORE_DEPENDENCIES: &[&str] = &["node_modules/", "bower_components/", "vendor/"];
const RQIGNORE_PYTHON: &[&str] = &[
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
];
const RQIGNORE_BUILD: &[&str] = &[
    "dist/",
    "out/",
    "build/",
    "coverage/",
    ".next/",
    ".nuxt/",
    ".turbo/",
    ".cache/",
    "*.tsbuildinfo",
];
const RQIGNORE_VCS: &[&str] =
    &[".git/", ".svn/", ".hg/", ".cursor/", ".pnpm-store/", ".vscode/", ".idea/"];
const RQIGNORE_HIDDEN: &[&str] = &[".*", ".*/"];
const RQIGNORE_MEMORY: &[&str] = &[".reqlan/"];
const RQIGNORE_DATABASES: &[&str] = &["*.db3", "*.sqlite", "*.sqlite3", "*.db"];
const RQIGNORE_SECRETS: &[&str] = &["*.secret.rq", "*.log", "tmp/", "temp/"];

fn core_rqignore_groups() -> [(&'static str, &'static [&'static str]); 8] {
    [
        ("Dependencies", RQIGNORE_DEPENDENCIES),
        ("Python / virtualenvs", RQIGNORE_PYTHON),
        ("Build / tooling output", RQIGNORE_BUILD),
        ("VCS / editor / package stores", RQIGNORE_VCS),
        ("Hidden paths - skip dotfiles; include one with !path", RQIGNORE_HIDDEN),
        ("Application memory - do not crawl this folder for .rq sources", RQIGNORE_MEMORY),
        ("Databases", RQIGNORE_DATABASES),
        ("Secrets / logs / temp", RQIGNORE_SECRETS),
    ]
}

fn add_core_rqignore_patterns(builder: &mut GitignoreBuilder) {
    for (_title, patterns) in core_rqignore_groups() {
        for pattern in patterns {
            let _ = builder.add_line(None, pattern);
        }
    }
}

/// Common binary globs. Always applied; opt in with a later `!*.ext` line.
/// Keep in sync with `packages/analytical/src/core/rqignore.ts`.
pub const BINARY_RQIGNORE_PATTERNS: &[&str] = &[
    "*.bin", "*.exe", "*.dll", "*.so", "*.dylib", "*.o", "*.obj", "*.a", "*.lib", "*.class",
    "*.wasm", "*.node", "*.png", "*.jpg", "*.jpeg", "*.gif", "*.webp", "*.ico", "*.bmp", "*.tif",
    "*.tiff", "*.heic", "*.avif", "*.mp4", "*.webm", "*.mov", "*.avi", "*.mkv", "*.mp3", "*.wav",
    "*.ogg", "*.flac", "*.aac", "*.m4a", "*.zip", "*.tar", "*.gz", "*.tgz", "*.bz2", "*.xz",
    "*.7z", "*.rar", "*.pdf", "*.doc", "*.docx", "*.xls", "*.xlsx", "*.ppt", "*.pptx", "*.ttf",
    "*.otf", "*.woff", "*.woff2", "*.eot", "*.dmg", "*.iso", "*.img", "*.apk",
];

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

pub const CONFIG_FILENAME: &str = "config.json";

/// Text seeded into a new base's `.reqlan/.rqignore` (comments + built-in defaults).
/// rq:["../../../reqlan rq/extension/configuration.rq".configuration_rqignore]
/// rq:["../../../reqlan rq/extension/module/index.rq".rqignore_initialisation]
pub fn default_rqignore_file_contents() -> String {
    let mut lines = vec![
        "# reqlan path ignore".to_string(),
        "#".to_string(),
        "# Purpose".to_string(),
        "# This file filters which paths discovery and indexing crawl.".to_string(),
        "# The CLI, the MCP server, and the editor share this filter.".to_string(),
        "#".to_string(),
        "# Scope".to_string(),
        "# Patterns are relative to the base root (the parent of .reqlan).".to_string(),
        "# Patterns are not relative to this .reqlan folder.".to_string(),
        "# This file is not Git ignore.".to_string(),
        "# Git ignore for SQLite stores is .gitignore in this folder.".to_string(),
        "#".to_string(),
        "# Syntax".to_string(),
        "# Use gitignore syntax. A trailing slash matches a directory.".to_string(),
        "# The last matching rule wins.".to_string(),
        "# A line that starts with ! includes a path that an earlier rule skipped.".to_string(),
        "# Examples: !src/vendor/   !*.bin".to_string(),
        "#".to_string(),
        "# Built-in defaults".to_string(),
        "# Built-in defaults always apply, even if this file is missing.".to_string(),
        "# Lines in this file add to those defaults or override them.".to_string(),
        "# If you delete a line here, the matching built-in rule still applies.".to_string(),
        "#".to_string(),
        "# Binary files".to_string(),
        "# Binary globs are skipped by default.".to_string(),
        "# That set includes images, archives, native objects, fonts, and office files."
            .to_string(),
        "# Include a type with a negation. Example: !*.bin".to_string(),
        "# Opted-in files can be scanned for rq: comment references.".to_string(),
        "# They are not parsed as .rq sources.".to_string(),
        "#".to_string(),
        "# Hidden paths".to_string(),
        "# .* and .*/ skip hidden files and directories.".to_string(),
        "# Include one path with a negation. Example: !.github/".to_string(),
        "#".to_string(),
        "# Secrets".to_string(),
        "# *.secret.rq is skipped.".to_string(),
        "#".to_string(),
        "# Application memory".to_string(),
        "# .reqlan/ is not crawled for requirement sources.".to_string(),
        "#".to_string(),
        "# After you edit this file, the next index walk applies your rules.".to_string(),
        String::new(),
    ];
    for (title, patterns) in core_rqignore_groups() {
        lines.push(format!("# {title}"));
        lines.extend(patterns.iter().map(|pattern| (*pattern).to_string()));
        lines.push(String::new());
    }
    lines.push(
        "# Binary files - skipped unless you opt in with !*.ext (example: !*.bin)".to_string(),
    );
    lines.extend(BINARY_RQIGNORE_PATTERNS.iter().map(|pattern| (*pattern).to_string()));
    lines.push(String::new());
    lines.join("\n")
}

/// Text seeded into a new base's `.reqlan/.gitignore`.
/// rq:["../../../reqlan rq/bases/base.rq".base_initialisation_ignore]
pub fn default_gitignore_file_contents() -> String {
    let mut lines = vec![
        "# reqlan SQLite artifacts — do not commit.".to_string(),
        "# ideas-index.sqlite, index-diagnostics.sqlite, and sidecars.".to_string(),
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
/// rq:["../../../reqlan rq/extension/module/index.rq".rqignore]
/// rq:["../../../reqlan rq/extension/module/index.rq".rqignore_initialisation]
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

    // rq:["../../../reqlan rq/extension/module/index.rq".binary_ignore]
    #[test]
    fn default_rqignore_skips_binary_files_until_negated() {
        let root = scratch("binary-ignore");
        let filter = RqIgnoreFilter::load(&root);
        assert!(filter.ignores("assets/payload.bin", false));
        assert!(filter.ignores("photo.png", false));
        assert!(!filter.ignores("src/app.ts", false));

        let memory = root.join(APPLICATION_MEMORY_DIR);
        std::fs::create_dir_all(&memory).unwrap();
        std::fs::write(memory.join(RQIGNORE_FILENAME), "!*.bin\n").unwrap();
        let opted = RqIgnoreFilter::load(&root);
        assert!(!opted.ignores("assets/payload.bin", false));
        assert!(opted.ignores("photo.png", false));
        std::fs::remove_dir_all(&root).ok();
    }

    // rq:["../../../reqlan rq/extension/module/index.rq".rqignore_initialisation]
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
