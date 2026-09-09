import * as vscode from 'vscode';
import { applyFileMoveChanges, showFileMoveDiffs } from './apply-mutation-plan.js';
import type { FileMoveChange } from './file-move-plan.js';

const APPROVAL_MESSAGE = 'reqlan wants to make refactoring changes to your codebase. Do you approve?';

export async function promptAndApplyFileMoveChanges(changes: FileMoveChange[]): Promise<void> {
    while (changes.length > 0) {
        const choice = await vscode.window.showInformationMessage(
            APPROVAL_MESSAGE,
            { modal: true },
            'Yes',
            'No',
            'View changes'
        );
        if (choice === 'Yes') {
            await applyFileMoveChanges(changes);
            return;
        }
        if (choice === 'View changes') {
            await showFileMoveDiffs(changes);
            continue;
        }
        return;
    }
}
