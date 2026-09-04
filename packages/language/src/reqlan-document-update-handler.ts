import { DefaultDocumentUpdateHandler } from 'langium/lsp';
import type { DidChangeWatchedFilesParams, FileEvent, FileSystemWatcher } from 'vscode-languageserver';

/** Client watchers for Langium document updates. Do not watch every file in the workspace. */
export const REQLAN_WATCHED_FILE_GLOBS = ['**/*.rq'] as const;

const NOISY_PATH_SEGMENTS: Readonly<Record<string, string>> = {
    node_modules: 'node_modules',
    '.git': 'git',
    '.reqlan': 'reqlan_index',
    out: 'build',
    dist: 'build'
};

/**
 * Langium default watches every workspace path. Reqlan watches `.rq` files only and drops
 * events under dependency, VCS, build, and index-artifact trees.
 * A kept `.rq` event marks that document Changed. The factory then replaces the AST
 * if the text changed.
 * rq:["../../../reqlan rq/extension/language-support/initialisation-and-sequencing.rq".lsp_file_watch]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".ast_lifecycle]
 */
export class ReqlanDocumentUpdateHandler extends DefaultDocumentUpdateHandler {
    protected override getWatchers(): FileSystemWatcher[] {
        return REQLAN_WATCHED_FILE_GLOBS.map(globPattern => ({ globPattern }));
    }

    override didChangeWatchedFiles(params: DidChangeWatchedFilesParams): void {
        const kept = filterWatchedFileChanges(params.changes);
        if (kept.length === 0) {
            return;
        }
        super.didChangeWatchedFiles({ ...params, changes: kept });
    }
}

export function watchedUriPath(uri: string): string {
    const normalized = uri.replace(/\\/g, '/');
    try {
        return decodeURIComponent(normalized).toLowerCase();
    } catch {
        return normalized.toLowerCase();
    }
}

export function classifyWatchedUri(uri: string): string {
    const path = watchedUriPath(uri);
    for (const segment of path.split('/')) {
        const bucket = NOISY_PATH_SEGMENTS[segment];
        if (bucket) {
            return bucket;
        }
    }
    if (path.endsWith('.rq')) {
        return 'rq';
    }
    return 'other';
}

export function isNoisyWatchedUri(uri: string): boolean {
    const bucket = classifyWatchedUri(uri);
    return bucket !== 'rq' && bucket !== 'other';
}

export function filterWatchedFileChanges(changes: readonly FileEvent[]): FileEvent[] {
    return changes.filter(change => !isNoisyWatchedUri(change.uri));
}
