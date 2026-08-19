/**
 * Base-local `.reqlan/.rqignore` — gitignore-syntax path filters for discovery and indexing.
 *
 * rq:["../../../reqlan rq/extension/configuration.rq".configuration_rqignore]
 * rq:["../../../reqlan rq/extension/module/index.rq".rqignore]
 * rq:["../../../reqlan rq/extension/module/index.rq".binary_ignore]
 * rq:["../../../reqlan rq/extension/module/index.rq".rqignore_initialisation]
 */
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import ignore, { type Ignore } from "ignore";
import {
  APPLICATION_MEMORY_DIR,
  RQIGNORE_FILENAME,
} from "./application-memory.js";

type RqIgnorePatternGroup = {
  title: string;
  patterns: readonly string[];
};

/** Core groups (not binary globs). Keep in sync with `crates/reqlan-index/src/ignore.rs`. */
const RQIGNORE_CORE_GROUPS: readonly RqIgnorePatternGroup[] = [
  {
    title: "Dependencies",
    patterns: ["node_modules/", "bower_components/", "vendor/"],
  },
  {
    title: "Python / virtualenvs",
    patterns: [
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
    ],
  },
  {
    title: "Build / tooling output",
    patterns: [
      "dist/",
      "out/",
      "build/",
      "coverage/",
      ".next/",
      ".nuxt/",
      ".turbo/",
      ".cache/",
      "*.tsbuildinfo",
    ],
  },
  {
    title: "VCS / editor / package stores",
    patterns: [
      ".git/",
      ".svn/",
      ".hg/",
      ".cursor/",
      ".pnpm-store/",
      ".vscode/",
      ".idea/",
    ],
  },
  {
    title: "Hidden paths - skip dotfiles; include one with !path",
    patterns: [".*", ".*/"],
  },
  {
    title: "Application memory - do not crawl this folder for .rq sources",
    patterns: [`${APPLICATION_MEMORY_DIR}/`],
  },
  {
    title: "Databases",
    patterns: ["*.db3", "*.sqlite", "*.sqlite3", "*.db"],
  },
  {
    title: "Secrets / logs / temp",
    patterns: ["*.secret.rq", "*.log", "tmp/", "temp/"],
  },
];

/**
 * Built-in patterns always applied (also seeded into new `.rqignore` files).
 * Users can un-ignore with `!pattern` in `.reqlan/.rqignore`.
 */
export const DEFAULT_RQIGNORE_PATTERNS: readonly string[] =
  RQIGNORE_CORE_GROUPS.flatMap((group) => group.patterns);

/**
 * Common binary globs. Always applied; opt in with a later `!*.ext` line.
 * Keep in sync with `crates/reqlan-index/src/ignore.rs`.
 */
export const BINARY_RQIGNORE_PATTERNS: readonly string[] = [
  "*.bin",
  "*.exe",
  "*.dll",
  "*.so",
  "*.dylib",
  "*.o",
  "*.obj",
  "*.a",
  "*.lib",
  "*.class",
  "*.wasm",
  "*.node",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.webp",
  "*.ico",
  "*.bmp",
  "*.tif",
  "*.tiff",
  "*.heic",
  "*.avif",
  "*.mp4",
  "*.webm",
  "*.mov",
  "*.avi",
  "*.mkv",
  "*.mp3",
  "*.wav",
  "*.ogg",
  "*.flac",
  "*.aac",
  "*.m4a",
  "*.zip",
  "*.tar",
  "*.gz",
  "*.tgz",
  "*.bz2",
  "*.xz",
  "*.7z",
  "*.rar",
  "*.pdf",
  "*.doc",
  "*.docx",
  "*.xls",
  "*.xlsx",
  "*.ppt",
  "*.pptx",
  "*.ttf",
  "*.otf",
  "*.woff",
  "*.woff2",
  "*.eot",
  "*.dmg",
  "*.iso",
  "*.img",
  "*.apk",
];

/**
 * Header comments for a new `.reqlan/.rqignore`.
 * rq:["../../../reqlan rq/extension/module/index.rq".rqignore_initialisation]
 */
const RQIGNORE_SEED_HEADER: readonly string[] = [
  "# reqlan path ignore",
  "#",
  "# Purpose",
  "# This file filters which paths discovery and indexing crawl.",
  "# The CLI, the MCP server, and the editor share this filter.",
  "#",
  "# Scope",
  "# Patterns are relative to the base root (the parent of .reqlan).",
  "# Patterns are not relative to this .reqlan folder.",
  "# This file is not Git ignore.",
  "# Git ignore for SQLite stores is .gitignore in this folder.",
  "#",
  "# Syntax",
  "# Use gitignore syntax. A trailing slash matches a directory.",
  "# The last matching rule wins.",
  "# A line that starts with ! includes a path that an earlier rule skipped.",
  "# Examples: !src/vendor/   !*.bin",
  "#",
  "# Built-in defaults",
  "# Built-in defaults always apply, even if this file is missing.",
  "# Lines in this file add to those defaults or override them.",
  "# If you delete a line here, the matching built-in rule still applies.",
  "#",
  "# Binary files",
  "# Binary globs are skipped by default.",
  "# That set includes images, archives, native objects, fonts, and office files.",
  "# Include a type with a negation. Example: !*.bin",
  "# Opted-in files can be scanned for rq: comment references.",
  "# They are not parsed as .rq sources.",
  "#",
  "# Hidden paths",
  "# .* and .*/ skip hidden files and directories.",
  "# Include one path with a negation. Example: !.github/",
  "#",
  "# Secrets",
  "# *.secret.rq is skipped.",
  "#",
  "# Application memory",
  "# .reqlan/ is not crawled for requirement sources.",
  "#",
  "# After you edit this file, the next index walk applies your rules.",
];

/** Text written when seeding a new base's `.reqlan/.rqignore`. */
export function defaultRqIgnoreFileContents(): string {
  const lines: string[] = [...RQIGNORE_SEED_HEADER, ""];
  for (const group of RQIGNORE_CORE_GROUPS) {
    lines.push(`# ${group.title}`, ...group.patterns, "");
  }
  lines.push(
    "# Binary files - skipped unless you opt in with !*.ext (example: !*.bin)",
    ...BINARY_RQIGNORE_PATTERNS,
    "",
  );
  return lines.join("\n");
}

export interface RqIgnoreFilter {
  /** True when `relativePath` (posix, from base root) should be skipped. */
  ignores(relativePath: string, isDirectory?: boolean): boolean;
}

function toPosixRelative(baseRoot: string, absPath: string): string {
  const rel = relative(resolve(baseRoot), resolve(absPath));
  if (!rel || rel === ".") {
    return "";
  }
  if (rel.startsWith("..")) {
    // Outside base — treat as ignored for safety.
    return "../";
  }
  return rel.split(sep).join("/");
}

function createFilter(ig: Ignore): RqIgnoreFilter {
  return {
    ignores(relativePath: string, isDirectory = false): boolean {
      const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
      if (!normalized || normalized === ".") {
        return false;
      }
      if (normalized.startsWith("../")) {
        return true;
      }
      const candidate =
        isDirectory && !normalized.endsWith("/")
          ? `${normalized}/`
          : normalized;
      return ig.ignores(candidate);
    },
  };
}

/**
 * Build a filter from built-in defaults plus optional extra pattern lines
 * (e.g. contents of `.reqlan/.rqignore`).
 */
export function createRqIgnoreFilter(
  extraPatterns?: string | readonly string[],
): RqIgnoreFilter {
  const ig = ignore();
  ig.add([...DEFAULT_RQIGNORE_PATTERNS, ...BINARY_RQIGNORE_PATTERNS]);
  if (typeof extraPatterns === "string") {
    if (extraPatterns.trim()) {
      ig.add(extraPatterns);
    }
  } else if (extraPatterns?.length) {
    ig.add([...extraPatterns]);
  }
  return createFilter(ig);
}

/** Absolute path to `<baseRoot>/.reqlan/.rqignore`. */
export function resolveRqIgnorePath(baseRoot: string): string {
  return join(resolve(baseRoot), APPLICATION_MEMORY_DIR, RQIGNORE_FILENAME);
}

/**
 * Load `.reqlan/.rqignore` for a base when present; always includes built-in defaults.
 * Missing or unreadable files still yield the default filter.
 */
export function loadRqIgnore(baseRoot: string): RqIgnoreFilter {
  const path = resolveRqIgnorePath(baseRoot);
  if (!existsSync(path)) {
    return createRqIgnoreFilter();
  }
  try {
    return createRqIgnoreFilter(readFileSync(path, "utf8"));
  } catch {
    return createRqIgnoreFilter();
  }
}

/** Whether an absolute path under `baseRoot` is ignored. */
export function isIgnoredPath(
  filter: RqIgnoreFilter,
  baseRoot: string,
  absPath: string,
  isDirectory?: boolean,
): boolean {
  const rel = toPosixRelative(baseRoot, absPath);
  if (!rel) {
    return false;
  }
  return filter.ignores(rel, isDirectory);
}
