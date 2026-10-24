/**
 * Base-local application memory for reqlan tools.
 *
 * The ideas index SQLite database lives under `<base>/.reqlan/` so the
 * extension, CLI, and MCP share one on-disk store per base — not VS Code globalStorage.
 * The presence of `.reqlan` marks a directory as a reqlan base.
 * Names live in defaults.json.
 
 * rq:["../../../../reqlan rq/bases/base.rq".base_initialisation_ignore]
 * rq:["../../../../reqlan rq/extension/index-host/index.rq".index_diagnostics_store]
 * rq:["../../../../reqlan rq/cli/click.rq".click_session]
 */
import { join } from 'node:path';
import {
    APPLICATION_MEMORY_DIR,
    CLICK_SESSIONS_FILENAME,
    CONFIG_FILENAME,
    GITIGNORE_FILENAME,
    IDEAS_INDEX_FILENAME,
    INDEX_DIAGNOSTICS_FILENAME,
    RQIGNORE_FILENAME
} from './defaults.js';

export {
    APPLICATION_MEMORY_DIR,
    CLICK_SESSIONS_FILENAME,
    CONFIG_FILENAME,
    GITIGNORE_FILENAME,
    IDEAS_INDEX_FILENAME,
    INDEX_DIAGNOSTICS_FILENAME,
    RQIGNORE_FILENAME
};

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

/** Full path to the click-sessions SQLite file under application memory. */
export function resolveClickSessionsDbPath(workspaceRoot: string, storagePath?: string): string {
    return join(resolveApplicationMemoryPath(workspaceRoot, storagePath), CLICK_SESSIONS_FILENAME);
}
