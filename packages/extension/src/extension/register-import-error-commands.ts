/**
 * Extension-host commands for unresolved-reference quick fixes that need UI.
 * rq:["../../../../reqlan rq/extension/language-support/features-imports.rq".import_error]
 */
import * as path from 'node:path';
import {
    REQLAN_IMPORT_ERROR_CREATE_COMMAND,
    REQLAN_IMPORT_ERROR_SEARCH_COMMAND,
    fileBasenameAlias,
    relativeRqImportPath,
    type ImportErrorCommandArgs
} from 'reqlan-language';
import { URI } from 'langium';
import * as vscode from 'vscode';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';

interface SearchPickItem extends vscode.QuickPickItem {
    fileUri: string;
    symbolName?: string;
    matchKind: 'idea' | 'oneliner' | 'ideaset' | 'file';
}

export function registerImportErrorCommands(
    context: vscode.ExtensionContext,
    index: IndexService
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            REQLAN_IMPORT_ERROR_SEARCH_COMMAND,
            async (args?: ImportErrorCommandArgs) => {
                if (!args?.documentUri || !args.refText) {
                    return;
                }
                await searchAndApplyImport(index, args);
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

async function searchAndApplyImport(
    index: IndexService,
    args: ImportErrorCommandArgs
): Promise<void> {
    if (!index.isReady) {
        void vscode.window.showWarningMessage('Reqlan index is not ready yet.');
        return;
    }

    const ideas = await index.indexStore.searchByNameOrSummary(args.refText);
    const picks: SearchPickItem[] = [];
    const seen = new Set<string>();

    for (const idea of ideas) {
        const key = `${idea.kind}:${idea.fileUri}:${idea.name}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        picks.push({
            label: idea.name,
            description: idea.kind,
            detail: vscode.workspace.asRelativePath(idea.fileUri),
            fileUri: idea.fileUri,
            symbolName: idea.name,
            matchKind: idea.kind === 'ideaset' ? 'ideaset' : idea.kind === 'oneliner' ? 'oneliner' : 'idea'
        });
    }

    for (const fileUri of await matchIndexedFiles(index, args.refText)) {
        const key = `file:${fileUri}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        const base = path.basename(vscode.Uri.parse(fileUri).fsPath, '.rq');
        picks.push({
            label: base,
            description: 'file',
            detail: vscode.workspace.asRelativePath(fileUri),
            fileUri,
            matchKind: 'file'
        });
    }

    if (picks.length === 0) {
        void vscode.window.showInformationMessage(`No index matches for '${args.refText}'.`);
        return;
    }

    const selected = await vscode.window.showQuickPick(picks, {
        title: `Search for '${args.refText}'`,
        placeHolder: 'Select a matching idea, ideaset, or file'
    });
    if (!selected) {
        return;
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(args.documentUri));
    const importPath = relativeRqImportPath(URI.parse(args.documentUri), URI.parse(selected.fileUri));

    if (selected.matchKind === 'file' || selected.matchKind === 'ideaset') {
        await applyNamespaceImportText(document, importPath, fileBasenameAlias(selected.fileUri));
        return;
    }

    if (selected.symbolName) {
        await applyFromImportText(document, importPath, selected.symbolName);
    }
}

async function matchIndexedFiles(index: IndexService, query: string): Promise<string[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) {
        return [];
    }
    const ideas = await index.indexStore.listAllIdeas();
    const files = new Set<string>();
    for (const idea of ideas) {
        const base = path.basename(vscode.Uri.parse(idea.fileUri).fsPath, '.rq').toLowerCase();
        if (base === needle || base.includes(needle)) {
            files.add(idea.fileUri);
        }
    }
    return [...files];
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

async function applyFromImportText(
    document: vscode.TextDocument,
    importPath: string,
    symbolName: string
): Promise<void> {
    const text = document.getText();
    const fromPattern = new RegExp(
        `^from\\s+["']${escapeRegExp(importPath)}["']\\s+import\\s+(.+)$`,
        'm'
    );
    const existing = fromPattern.exec(text);
    const edit = new vscode.WorkspaceEdit();
    if (existing) {
        const lineStart = text.slice(0, existing.index).split(/\r?\n/).length - 1;
        const lineText = document.lineAt(lineStart).text;
        if (new RegExp(`\\b${escapeRegExp(symbolName)}\\b`).test(lineText)) {
            return;
        }
        edit.replace(
            document.uri,
            document.lineAt(lineStart).range,
            `${lineText.replace(/\s*$/, '')}, ${symbolName}`
        );
    } else {
        const insertLine = findPlainImportInsertLine(text);
        const suffix = insertLine === 0 ? '\n' : '';
        edit.insert(
            document.uri,
            new vscode.Position(insertLine, 0),
            `from "${importPath}" import ${symbolName}\n${suffix}`
        );
    }
    await vscode.workspace.applyEdit(edit);
}

async function applyNamespaceImportText(
    document: vscode.TextDocument,
    importPath: string,
    alias: string
): Promise<void> {
    const text = document.getText();
    if (new RegExp(`^import\\s+["']${escapeRegExp(importPath)}["']`, 'm').test(text)) {
        return;
    }
    const edit = new vscode.WorkspaceEdit();
    const insertLine = findPlainImportInsertLine(text);
    const suffix = insertLine === 0 ? '\n' : '';
    edit.insert(
        document.uri,
        new vscode.Position(insertLine, 0),
        `import "${importPath}" as ${alias}\n${suffix}`
    );
    await vscode.workspace.applyEdit(edit);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
