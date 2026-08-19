/**
 * Base-local application memory for reqlan tools.
 *
 * The ideas index SQLite database lives under `<base>/.reqlan/` so the
 * extension, CLI, and MCP share one on-disk store per base — not VS Code globalStorage.
 * The presence of `.reqlan` marks a directory as a reqlan base.
 */
import { join } from 'node:path';

/** Directory name under the base root for shared application memory (also the base marker). */
export const APPLICATION_MEMORY_DIR = '.reqlan';

/** Config filename under `<base>/.reqlan/` (shared settings for the base). */
export const CONFIG_FILENAME = 'config.json';

/**
 * Gitignore-syntax ignore file under `<base>/.reqlan/` (path filters for discovery/indexing).
 * rq:["../../../reqlan rq/extension/configuration.rq".configuration_rqignore]
 */
export const RQIGNORE_FILENAME = '.rqignore';

/**
 * Git ignore file under `<base>/.reqlan/` so SQLite artifacts stay out of VCS.
 * rq:["../../../reqlan rq/bases/base.rq".base_initialisation_ignore]
 */
export const GITIGNORE_FILENAME = '.gitignore';

/** Default SQLite filename for the ideas graph index inside application memory. */
export const IDEAS_INDEX_FILENAME = 'ideas-index.sqlite';

/**
 * Sibling SQLite for indexing timing diagnostics (survives ideas-index rebuild).
 * rq:["../../../reqlan rq/extension/module/index.rq".index_diagnostics_store]
 * rq:["../../../reqlan rq/extension/features-index-diagnostics.rq".index_diagnostics]
 */
export const INDEX_DIAGNOSTICS_FILENAME = 'index-diagnostics.sqlite';

/**
 * Resolve the application-memory directory for a base.
 * Override with an absolute or relative `storagePath` when set (e.g. tests / REQLAN_INDEX_PATH).
 */
export function resolveApplicationMemoryPath(workspaceRoot: string, storagePath?: string): string {
    if (storagePath?.trim()) {
        return storagePath.trim();
    }
    return join(workspaceRoot, APPLICATION_MEMORY_DIR);
}

/** Full path to the ideas-index SQLite file under application memory. */
export function resolveIdeasIndexDbPath(workspaceRoot: string, storagePath?: string): string {
    return join(resolveApplicationMemoryPath(workspaceRoot, storagePath), IDEAS_INDEX_FILENAME);
}

/** Full path to the index-diagnostics SQLite file under application memory. */
export function resolveIndexDiagnosticsDbPath(workspaceRoot: string, storagePath?: string): string {
    return join(resolveApplicationMemoryPath(workspaceRoot, storagePath), INDEX_DIAGNOSTICS_FILENAME);
}
