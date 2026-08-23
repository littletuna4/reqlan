/**
 * Mtime-based staleness helpers for soft sync and idle checks.
 *
 * One SQLite `listDocumentMtimes()` loads the whole map; per-file skip then
 * compares in memory. A single MAX(mtime) watermark is not enough: one file can
 * get newer while another gets older and the max stays unchanged.
 *
 * rq:["../../../../reqlan rq/indexer/indexer.rq".nonblocking_index]
 * rq:["../../../../reqlan rq/extension/features-graph-analysers.rq".indexing_incrementality]
 * rq:["../../../../reqlan rq/extension/features-graph-analysers.rq".indexing_trigger_auto]
 */
import { stat } from 'node:fs/promises';

export interface StaleFileDiff {
    /** Absolute (or host) paths that need parse+persist. */
    dirtyPaths: string[];
    /** Indexed URIs present on disk for this pass. */
    presentUris: Set<string>;
    /** Indexed URIs in the store that were not among the provided paths. */
    removedUris: string[];
}

/**
 * Compare filesystem mtimes to a preloaded documents mtime map (one SQLite read).
 */
export async function diffStaleFiles(
    filePaths: string[],
    toIndexedUri: (filePath: string) => string,
    storedMtimes: Map<string, number | undefined>
): Promise<StaleFileDiff> {
    const presentUris = new Set<string>();
    const dirtyPaths: string[] = [];

    for (const filePath of filePaths) {
        const indexedUri = toIndexedUri(filePath);
        presentUris.add(indexedUri);
        let fileMtime: number;
        try {
            fileMtime = Math.trunc((await stat(filePath)).mtimeMs);
        } catch {
            continue;
        }
        const storedMtime = storedMtimes.get(indexedUri);
        if (storedMtime === undefined || storedMtime !== fileMtime) {
            dirtyPaths.push(filePath);
        }
    }

    const removedUris: string[] = [];
    for (const indexedUri of storedMtimes.keys()) {
        if (!presentUris.has(indexedUri)) {
            removedUris.push(indexedUri);
        }
    }

    return { dirtyPaths, presentUris, removedUris };
}

/** True when the file's mtime matches the preloaded store map entry. */
export async function isUnchangedByMtime(
    filePath: string,
    indexedUri: string,
    storedMtimes: Map<string, number | undefined>
): Promise<boolean> {
    const storedMtime = storedMtimes.get(indexedUri);
    if (storedMtime === undefined) {
        return false;
    }
    try {
        const fileMtime = Math.trunc((await stat(filePath)).mtimeMs);
        return fileMtime === storedMtime;
    } catch {
        return false;
    }
}
