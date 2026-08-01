/**
 * Workspace-local application memory for reqlan tools.
 *
 * The ideas index SQLite database lives under `<workspace>/.reqlan/` so the
 * extension, CLI, and MCP share one on-disk store — not VS Code globalStorage.
 */
import { join } from 'node:path';

/** Directory name under the workspace root for shared application memory. */
export const APPLICATION_MEMORY_DIR = '.reqlan';

/** Default SQLite filename for the ideas graph index inside application memory. */
export const IDEAS_INDEX_FILENAME = 'ideas-index.sqlite';

/**
 * Resolve the application-memory directory for a workspace.
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
