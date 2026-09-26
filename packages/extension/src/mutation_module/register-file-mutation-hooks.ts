import * as vscode from 'vscode';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { expandRenamedPaths } from './expand-renamed-paths.js';
import { shouldPromptForMovedFile } from './file-mutation-gate.js';
import { planFileMoveChanges } from './file-move-plan.js';
import { promptAndApplyFileMoveChanges } from './show-mutation-approval.js';

/**
 * rq:["../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_file_moves]
 * rq:["../../../../reqlan rq/extension/mutation/mutation-hooks.rq".move_file]
 * rq:["../../../../reqlan rq/extension/mutation/mutation-hooks.rq".rename_file]
 * rq:["../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_changes]
 */
export function registerFileMutationHooks(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    context.subscriptions.push(
        // Mark before the filesystem rename so watcher onDidDelete cannot clear the
        // pre-move index URI before inbound import planning runs.
        vscode.workspace.onWillRenameFiles(event => {
            submodule.index.notePendingRenames(event.files);
        }),
        vscode.workspace.onDidRenameFiles(event => {
            void handleFileRenames(event.files, submodule);
        })
    );
}

async function handleFileRenames(
    files: ReadonlyArray<{ oldUri: vscode.Uri; newUri: vscode.Uri }>,
    submodule: AnalyticalSubmodule
): Promise<void> {
    try {
        const expanded = await expandRenameUris(files);
        if (!submodule.index.isReady || expanded.length === 0) {
            await migrateMovedRqFiles(expanded, submodule);
            return;
        }

        const qualifyingFiles: Array<{ oldUri: vscode.Uri; newUri: vscode.Uri }> = [];
        for (const file of expanded) {
            if (await shouldPromptForMovedFile(file.oldUri, submodule.index.indexStore)) {
                qualifyingFiles.push(file);
            }
        }

        if (qualifyingFiles.length > 0) {
            const changes = await planFileMoveChanges(qualifyingFiles, submodule.index.indexStore);
            if (changes.length > 0) {
                await promptAndApplyFileMoveChanges(changes);
            }
        }

        await migrateMovedRqFiles(expanded, submodule);
    } finally {
        submodule.index.clearPendingRenames(files);
    }
}

async function expandRenameUris(
    files: ReadonlyArray<{ oldUri: vscode.Uri; newUri: vscode.Uri }>
): Promise<Array<{ oldUri: vscode.Uri; newUri: vscode.Uri }>> {
    const expanded = await expandRenamedPaths(
        files.map(file => ({ oldPath: file.oldUri.fsPath, newPath: file.newUri.fsPath })),
        async path => {
            try {
                return (await vscode.workspace.fs.stat(vscode.Uri.file(path))).type === vscode.FileType.Directory;
            } catch {
                return false;
            }
        },
        directory => listFiles(directory)
    );
    return expanded.map(entry => ({
        oldUri: vscode.Uri.file(entry.oldPath),
        newUri: vscode.Uri.file(entry.newPath)
    }));
}

async function listFiles(directory: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listFiles(entryPath));
            continue;
        }
        if (entry.isFile()) {
            files.push(entryPath);
        }
    }
    return files;
}

async function migrateMovedRqFiles(
    files: ReadonlyArray<{ oldUri: vscode.Uri; newUri: vscode.Uri }>,
    submodule: AnalyticalSubmodule
): Promise<void> {
    for (const { oldUri, newUri } of files) {
        if (!newUri.fsPath.endsWith('.rq') && !oldUri.fsPath.endsWith('.rq')) {
            continue;
        }
        await submodule.index.migrateRenamedFile(oldUri, newUri);
    }
}
