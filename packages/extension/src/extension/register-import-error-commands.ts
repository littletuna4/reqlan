/**
 * Extension-host commands for unresolved-reference quick fixes and reference search.
 * rq:["../../../../reqlan rq/extension/language-support/features-imports.rq".import_error]
 * rq:["../../../../reqlan rq/extension/features-commands.rq".search_code_actions]
 */
import * as path from 'node:path';
import {
    REQLAN_IMPORT_ERROR_CREATE_COMMAND,
    REQLAN_IMPORT_ERROR_SEARCH_COMMAND,
    REQLAN_SEARCH_REFERENCE_COMMAND,
    relativeRqImportPath,
    type ImportErrorCommandArgs,
    type SearchReferenceCommandArgs
} from '@reqlan/language';
import { URI } from 'langium';
import * as vscode from 'vscode';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';
import { ReferenceSearchPanel } from './reference-search-panel.js';

export function registerImportErrorCommands(
    context: vscode.ExtensionContext,
    index: IndexService
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            REQLAN_SEARCH_REFERENCE_COMMAND,
            async (args?: SearchReferenceCommandArgs) => {
                if (!args?.documentUri || args.range === undefined) {
                    return;
                }
                await ReferenceSearchPanel.show(index, {
                    documentUri: args.documentUri,
                    refText: args.refText ?? '',
                    range: args.range,
                    mode: args.mode ?? 'replace',
                    context: args.context
                });
            }
        ),
        vscode.commands.registerCommand(
            REQLAN_IMPORT_ERROR_SEARCH_COMMAND,
            async (args?: ImportErrorCommandArgs) => {
                if (!args?.documentUri || !args.refText) {
                    return;
                }
                await ReferenceSearchPanel.show(index, {
                    ...args,
                    mode: 'replace'
                });
            }
        ),
        vscode.commands.registerCommand(
            REQLAN_IMPORT_ERROR_CREATE_COMMAND,
            async (args?: ImportErrorCommandArgs) => {
                if (!args?.documentUri || !args.refText) {
                    return;
                }
                await createFileAndImport(args);
            }
        )
    );
}

async function createFileAndImport(args: ImportErrorCommandArgs): Promise<void> {
    const sourceUri = vscode.Uri.parse(args.documentUri);
    const defaultName = `${args.refText}.rq`;
    const defaultUri = vscode.Uri.joinPath(dirnameUri(sourceUri), defaultName);
    const relativeDefault = vscode.workspace.asRelativePath(defaultUri);

    const input = await vscode.window.showInputBox({
        title: `Create idea '${args.refText}'`,
        prompt: 'New .rq file path (workspace-relative, or ./relative to this file)',
        value: relativeDefault,
        validateInput: value => value.trim() ? undefined : 'Path is required'
    });
    if (!input) {
        return;
    }

    const newFileUri = resolveNewFileUri(sourceUri, input.trim());
    const content = `${args.refText} {\n    \n}\n`;
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.createFile(newFileUri, {
        ignoreIfExists: true,
        overwrite: false,
        contents: Buffer.from(content, 'utf8')
    });

    const document = await vscode.workspace.openTextDocument(sourceUri);
    const importPath = relativeRqImportPath(
        URI.parse(args.documentUri),
        URI.parse(newFileUri.toString())
    );
    const insertLine = findPlainImportInsertLine(document.getText());
    const suffix = insertLine === 0 ? '\n' : '';
    workspaceEdit.insert(
        sourceUri,
        new vscode.Position(insertLine, 0),
        `from "${importPath}" import ${args.refText}\n${suffix}`
    );

    const applied = await vscode.workspace.applyEdit(workspaceEdit);
    if (!applied) {
        void vscode.window.showErrorMessage('Could not create file and import.');
        return;
    }
    await vscode.window.showTextDocument(newFileUri);
}

function dirnameUri(uri: vscode.Uri): vscode.Uri {
    return vscode.Uri.joinPath(uri, '..');
}

function resolveNewFileUri(sourceUri: vscode.Uri, input: string): vscode.Uri {
    if (path.isAbsolute(input)) {
        return vscode.Uri.file(input.endsWith('.rq') ? input : `${input}.rq`);
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceUri);
    if (input.startsWith('./') || input.startsWith('../')) {
        const resolved = path.resolve(path.dirname(sourceUri.fsPath), input);
        return vscode.Uri.file(resolved.endsWith('.rq') ? resolved : `${resolved}.rq`);
    }
    if (workspaceFolder) {
        const resolved = path.join(workspaceFolder.uri.fsPath, input);
        return vscode.Uri.file(resolved.endsWith('.rq') ? resolved : `${resolved}.rq`);
    }
    const resolved = path.resolve(path.dirname(sourceUri.fsPath), input);
    return vscode.Uri.file(resolved.endsWith('.rq') ? resolved : `${resolved}.rq`);
}

function findPlainImportInsertLine(text: string): number {
    const lines = text.split(/\r?\n/);
    let lastImport = -1;
    for (let index = 0; index < lines.length; index++) {
        const trimmed = lines[index]!.trimStart();
        if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
            lastImport = index;
            continue;
        }
        if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
            continue;
        }
        break;
    }
    return lastImport >= 0 ? lastImport + 1 : 0;
}
