import * as vscode from 'vscode';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { shouldPromptForMovedFile } from './file-mutation-gate.js';
import { planFileMoveChanges } from './file-move-plan.js';
import { promptAndApplyFileMoveChanges } from './show-mutation-approval.js';

/**
 * rq:["../../../../reqlan rq/extension/refactor_support.rq".refactor_file_moves]
 * rq:["../../../../reqlan rq/extension/features-mutation-hooks.rq".move_file]
 */
export function registerFileMutationHooks(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    context.subscriptions.push(
        vscode.workspace.onDidRenameFiles(event => {
            void handleFileRenames(event.files, submodule);
        })
    );
}

async function handleFileRenames(
    files: ReadonlyArray<{ oldUri: vscode.Uri; newUri: vscode.Uri }>,
    submodule: AnalyticalSubmodule
): Promise<void> {
    if (!submodule.index.isReady || files.length === 0) {
        await migrateMovedRqFiles(files, submodule);
        return;
    }

    const qualifyingFiles: Array<{ oldUri: vscode.Uri; newUri: vscode.Uri }> = [];
    for (const file of files) {
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

    await migrateMovedRqFiles(files, submodule);
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
