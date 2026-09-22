/**
 * A folder rename is one directory event. Pair each file under the new directory
 * with the same relative path under the old directory so path rewrites see every file.
 * rq:["../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_file_moves]
 * rq:["../../../../reqlan rq/extension/mutation/mutation-hooks.rq".rename_file]
 */
import { join, relative } from 'node:path';

export interface RenamedPath {
    oldPath: string;
    newPath: string;
}

export async function expandRenamedPaths(
    entries: readonly RenamedPath[],
    isDirectory: (path: string) => Promise<boolean>,
    listFiles: (directory: string) => Promise<readonly string[]>
): Promise<RenamedPath[]> {
    const expanded: RenamedPath[] = [];
    const seen = new Set<string>();
    const push = (entry: RenamedPath): void => {
        const key = entry.newPath.replace(/\\/g, '/');
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        expanded.push(entry);
    };

    for (const entry of entries) {
        if (await isDirectory(entry.newPath)) {
            push(entry);
            for (const filePath of await listFiles(entry.newPath)) {
                const relativePath = relative(entry.newPath, filePath);
                push({
                    oldPath: join(entry.oldPath, relativePath),
                    newPath: filePath
                });
            }
            continue;
        }
        push(entry);
    }
    return expanded;
}
