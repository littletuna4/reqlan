import * as vscode from 'vscode';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { shouldPromptForMovedFile } from './file-mutation-gate.js';
import { planFileMoveChanges } from './file-move-plan.js';
import { promptAndApplyFileMoveChanges } from './show-mutation-approval.js';

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
        return;
    }

    const qualifyingFiles: Array<{ oldUri: vscode.Uri; newUri: vscode.Uri }> = [];
    for (const file of files) {
        if (await shouldPromptForMovedFile(file.newUri, submodule.index.indexStore)) {
            qualifyingFiles.push(file);
        }
    }
    if (qualifyingFiles.length === 0) {
        return;
    }

    const changes = await planFileMoveChanges(qualifyingFiles);
    if (changes.length === 0) {
        return;
    }

    await promptAndApplyFileMoveChanges(changes);
}
