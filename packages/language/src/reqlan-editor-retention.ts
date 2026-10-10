/**
 * Which editor buffers may keep a native extract or a depth-1 neighbor list.
 * Closed files and deleted URIs leave the set.
 * rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".native_cache_retention]
 */
import { URI } from 'langium';

const openEditors = new Set<string>();
const neighborsByHost = new Map<string, Set<string>>();

/** URI strings that may be the map key for one file. */
export function uriCacheKeys(uri: string): readonly string[] {
    const keys = new Set<string>();
    keys.add(uri);
    try {
        const parsed = URI.parse(uri);
        keys.add(parsed.toString());
        if (parsed.scheme === 'file' && parsed.fsPath.length > 0) {
            keys.add(URI.file(parsed.fsPath).toString());
        }
    } catch {
        // Keep the raw string when it is not a URI.
    }
    return [...keys];
}

export function noteOpenEditor(uri: string): void {
    for (const key of uriCacheKeys(uri)) {
        openEditors.add(key);
    }
}

export function isOpenEditor(uri: string): boolean {
    for (const key of uriCacheKeys(uri)) {
        if (openEditors.has(key)) {
            return true;
        }
    }
    return false;
}

/**
 * The editor closed this buffer. Drop its neighbor ownership.
 * Another open editor may still list this file as a neighbor.
 */
export function noteClosedEditor(uri: string): void {
    for (const key of uriCacheKeys(uri)) {
        openEditors.delete(key);
        neighborsByHost.delete(key);
    }
}

/** The file is gone. Drop it as an editor and as a neighbor of every host. */
export function forgetUri(uri: string): void {
    const keys = new Set(uriCacheKeys(uri));
    noteClosedEditor(uri);
    for (const neighbors of neighborsByHost.values()) {
        for (const key of keys) {
            neighbors.delete(key);
        }
    }
}

export function retainNeighbor(hostUri: string, neighborUri: string): boolean {
    const hostKey = openKey(hostUri);
    if (hostKey === undefined) {
        return false;
    }
    let bucket = neighborsByHost.get(hostKey);
    if (!bucket) {
        bucket = new Set();
        neighborsByHost.set(hostKey, bucket);
    }
    for (const key of uriCacheKeys(neighborUri)) {
        bucket.add(key);
    }
    return true;
}

export function isNeighborRetained(neighborUri: string): boolean {
    const keys = new Set(uriCacheKeys(neighborUri));
    for (const [host, neighbors] of neighborsByHost) {
        if (!openEditors.has(host)) {
            continue;
        }
        for (const key of keys) {
            if (neighbors.has(key)) {
                return true;
            }
        }
    }
    return false;
}

export function retainedNeighborKeys(): ReadonlySet<string> {
    const keep = new Set<string>();
    for (const [host, neighbors] of neighborsByHost) {
        if (!openEditors.has(host)) {
            continue;
        }
        for (const neighbor of neighbors) {
            keep.add(neighbor);
        }
    }
    return keep;
}

export function clearEditorRetention(): void {
    openEditors.clear();
    neighborsByHost.clear();
}

function openKey(uri: string): string | undefined {
    for (const key of uriCacheKeys(uri)) {
        if (openEditors.has(key)) {
            return key;
        }
    }
    return undefined;
}
