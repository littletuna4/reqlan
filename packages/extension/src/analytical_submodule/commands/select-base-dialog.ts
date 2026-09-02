/**
 * VS Code QuickPick dialog to choose the active reqlan base.
 * rq:["../../../../../reqlan rq/bases/base.rq".select_base_dialog]
 */
import * as vscode from 'vscode';
import type { IndexService } from '../index-store/index-service.js';

export async function showSelectBaseDialog(index: IndexService): Promise<string | undefined> {
    const bases = index.listBases();
    if (bases.length === 0) {
        void vscode.window.showInformationMessage(
            'No reqlan bases found. Create a base first (Reqlan: Create Base).'
        );
        return undefined;
    }

    const activeId = index.getActiveBaseId();
    const items = bases.map(base => ({
        label: base.label,
        description: base.root,
        detail: base.id === activeId ? 'Active' : undefined,
        baseId: base.id
    }));

    const picked = await vscode.window.showQuickPick(items, {
        title: 'Select reqlan base',
        placeHolder: 'Filter by name or path…',
        matchOnDescription: true
    });
    if (!picked) {
        return undefined;
    }
    index.setActiveBaseId(picked.baseId);
    return picked.baseId;
}
