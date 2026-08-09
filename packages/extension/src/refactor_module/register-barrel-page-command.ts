/**
 * Command + WorkspaceEdit apply path for barrel page (code action / palette).
 * rq:["../../../../reqlan rq/extension/features-commands.rq".barrel_page]
 * rq:["../../../../reqlan rq/extension/features-commands.rq".file_based_code_actions]
 */
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { planBarrelPage } from '@reqlan/analytical';
import { REQLAN_BARREL_PAGE_COMMAND } from '@reqlan/language';
import * as vscode from 'vscode';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';
import {
    defaultBarrelContainerName,
    findBarrelOverwriteConflicts,
    toBarrelApplyPlan
} from './barrel-page-apply.js';

export function registerBarrelPageCommand(
    context: vscode.ExtensionContext,
    index: IndexService
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(REQLAN_BARREL_PAGE_COMMAND, async () => {
            await barrelActivePage(index);
        })
    );
}

async function barrelActivePage(index: IndexService): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'reqlan' || !editor.document.uri.fsPath.endsWith('.rq')) {
        void vscode.window.showErrorMessage('Open a .rq file to barrel the page.');
        return;
    }

    if (editor.document.isDirty) {
        const saved = await editor.document.save();
        if (!saved) {
            void vscode.window.showErrorMessage('Save the file before barrelling.');
            return;
        }
    }

    const sourceUri = editor.document.uri;
    const sourcePath = sourceUri.fsPath;
    const sourceText = editor.document.getText();
    const defaultName = defaultBarrelContainerName(sourcePath);

    const containerName = await vscode.window.showInputBox({
        title: 'Barrel page',
        prompt: 'Container idea name for the barreled page',
        value: defaultName,
        validateInput: value => {
            const trimmed = value.trim();
            if (!trimmed) {
                return 'Container name is required';
            }
            if (!/^[A-Za-z_][\w-]*$/.test(trimmed)) {
                return 'Use a valid idea name (letters, digits, _, -)';
            }
            return undefined;
        }
    });
    if (containerName === undefined) {
        return;
    }
    const trimmedName = containerName.trim();

    let plan;
    try {
        plan = await planBarrelPage(sourceText, {
            containerName: trimmedName,
            sourceFileName: basename(sourcePath)
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(message);
        return;
    }

    const applyPlan = toBarrelApplyPlan(sourcePath, plan);
    const conflicts = findBarrelOverwriteConflicts(sourcePath, applyPlan, existsSync);
    if (conflicts.length > 0) {
        void vscode.window.showErrorMessage(
            `Refusing to overwrite existing file(s): ${conflicts.map(path => basename(path)).join(', ')}`
        );
        return;
    }

    const confirm = await vscode.window.showInformationMessage(
        `Barrel this page into ${applyPlan.children.length} file(s) with container "${applyPlan.containerName}"?`,
        { modal: true },
        'Barrel'
    );
    if (confirm !== 'Barrel') {
        return;
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    for (const child of applyPlan.children) {
        workspaceEdit.createFile(vscode.Uri.file(child.absolutePath), {
            overwrite: false,
            ignoreIfExists: false,
            contents: Buffer.from(child.content, 'utf8')
        });
    }
    const fullRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(sourceText.length)
    );
    workspaceEdit.replace(sourceUri, fullRange, applyPlan.containerContent);

    const applied = await vscode.workspace.applyEdit(workspaceEdit);
    if (!applied) {
        void vscode.window.showErrorMessage('Could not apply barrel page edits.');
        return;
    }

    await editor.document.save();
    for (const child of applyPlan.children) {
        await index.indexFile(vscode.Uri.file(child.absolutePath));
    }
    await index.indexFile(sourceUri);

    void vscode.window.showInformationMessage(
        `Barreled into container "${applyPlan.containerName}" (${applyPlan.children.length} file(s)).`
    );
}
