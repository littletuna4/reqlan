/**
 * Base-local `.reqlan/.rqignore` — gitignore-syntax path filters for discovery and indexing.
 *
 
 * rq:["../../../../reqlan rq/extension/index-host/index.rq".rqignore]
 * rq:["../../../../reqlan rq/extension/index-host/index.rq".binary_ignore]
 * rq:["../../../../reqlan rq/extension/index-host/index.rq".commentless_file_ignore]
 * rq:["../../../../reqlan rq/extension/index-host/index.rq".rqignore_initialisation]
 */
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import ignore, { type Ignore } from "ignore";
import {
  APPLICATION_MEMORY_DIR,
  RQIGNORE_FILENAME,
} from "./application-memory.js";
import {
  BINARY_RQIGNORE_PATTERNS,
  RQIGNORE_BINARY_TITLE,
  RQIGNORE_GROUPS,
  RQIGNORE_SEED_HEADER,
} from "./defaults.js";

export { BINARY_RQIGNORE_PATTERNS };

/**
 * Built-in patterns always applied (also seeded into new `.rqignore` files).
 * Users can un-ignore with `!pattern` in `.reqlan/.rqignore`.
 */
export const DEFAULT_RQIGNORE_PATTERNS: readonly string[] =
  RQIGNORE_GROUPS.flatMap((group) => group.patterns);

/** Text written when seeding a new base's `.reqlan/.rqignore`. */
export function defaultRqIgnoreFileContents(): string {
  const lines: string[] = [...RQIGNORE_SEED_HEADER, ""];
  for (const group of RQIGNORE_GROUPS) {
    lines.push(`# ${group.title}`, ...group.patterns, "");
  }
  lines.push(RQIGNORE_BINARY_TITLE, ...BINARY_RQIGNORE_PATTERNS, "");
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
