/**
 * Track old/new paths for an in-flight rename so the index watcher does not
 * delete the pre-move URI before import rewrites can use it.
 * rq:["../../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_file_moves]
 * rq:["../../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_changes]
 * rq:["../../../../../reqlan rq/extension/mutation/mutation-hooks.rq".rename_file]
 */

export function normalizeFsPath(fsPath: string): string {
    return fsPath.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function pathIsUnderOrEqual(fsPath: string, root: string): boolean {
    const path = normalizeFsPath(fsPath);
    const base = normalizeFsPath(root);
    return path === base || path.startsWith(`${base}/`);
}

export class PendingRenamePaths {
    private readonly oldRoots = new Set<string>();
    private readonly newRoots = new Set<string>();

    note(files: ReadonlyArray<{ oldPath: string; newPath: string }>): void {
        for (const file of files) {
            this.oldRoots.add(normalizeFsPath(file.oldPath));
            this.newRoots.add(normalizeFsPath(file.newPath));
        }
    }

    clear(files: ReadonlyArray<{ oldPath: string; newPath: string }>): void {
        for (const file of files) {
            this.oldRoots.delete(normalizeFsPath(file.oldPath));
            this.newRoots.delete(normalizeFsPath(file.newPath));
        }
    }

    clearAll(): void {
        this.oldRoots.clear();
        this.newRoots.clear();
    }

    get isEmpty(): boolean {
        return this.oldRoots.size === 0 && this.newRoots.size === 0;
    }

    /** Watcher delete of the pre-move path (or a child under a renamed folder). */
    shouldSuppressDelete(fsPath: string): boolean {
        return [...this.oldRoots].some(root => pathIsUnderOrEqual(fsPath, root));
    }

    /** Watcher create of the post-move path — migrateRenamedFile indexes it. */
    shouldSuppressCreate(fsPath: string): boolean {
        return [...this.newRoots].some(root => pathIsUnderOrEqual(fsPath, root));
    }
}
