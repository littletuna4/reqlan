/**
 * Extension-host commands for unresolved-reference quick fixes and reference search.
 * rq:["../../../../reqlan rq/extension/language-support/features-imports.rq".import_error]
 * rq:["../../../../reqlan rq/extension/features-commands.rq".search_code_actions]
 */
import * as path from 'node:path';
import {
    createReqlanServices,
    REQLAN_IMPORT_ERROR_CREATE_COMMAND,
    REQLAN_IMPORT_ERROR_SEARCH_COMMAND,
    REQLAN_REFERENCE_SEARCH_SITE_REQUEST,
    REQLAN_SEARCH_REFERENCE_COMMAND,
    relativeRqImportPath,
    resolveReferenceSearchSiteFromDocument,
    type ImportErrorCommandArgs,
    type SearchReferenceCommandArgs
} from '@reqlan/language';
import { EmptyFileSystem, URI } from 'langium';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { State } from 'vscode-languageclient/node';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';
import { ReferenceSearchPanel } from './reference-search-panel.js';

export function registerImportErrorCommands(
    context: vscode.ExtensionContext,
    index: IndexService,
    getClient: () => LanguageClient | undefined = () => undefined
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            REQLAN_SEARCH_REFERENCE_COMMAND,
            async (args?: SearchReferenceCommandArgs) => {
                const resolved = args ?? await resolveSearchArgsFromEditor(getClient);
                if (!resolved?.documentUri || resolved.range === undefined) {
                    return;
                }
                await ReferenceSearchPanel.show(index, {
                    documentUri: resolved.documentUri,
                    refText: resolved.refText ?? '',
                    range: resolved.range,
                    mode: resolved.mode ?? 'replace',
                    context: resolved.context
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

/**
 * Code actions intentionally omit command arguments so VS Code does not cache
 * them under a disposable delegating id (see "Actual command not found … /N").
 * Resolve the search site from the active editor via the language server, or a
 * local parse when the client is not yet running.
 */
async function resolveSearchArgsFromEditor(
    getClient: () => LanguageClient | undefined
): Promise<SearchReferenceCommandArgs | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'reqlan') {
        void vscode.window.showErrorMessage('Open a .rq file and place the cursor on a reference or word.');
        return undefined;
    }

    const documentUri = editor.document.uri.toString();
    const text = editor.document.getText();
    const range = {
        start: {
            line: editor.selection.start.line,
            character: editor.selection.start.character
        },
        end: {
            line: editor.selection.end.line,
            character: editor.selection.end.character
        }
    };

    const client = getClient();
    if (client && client.state === State.Running) {
        try {
            const site = await client.sendRequest<SearchReferenceCommandArgs | null>(
                REQLAN_REFERENCE_SEARCH_SITE_REQUEST,
                {
                    uri: documentUri,
                    text,
                    range
                }
            );
            if (site) {
                return site;
            }
        } catch (error) {
            console.error('[reqlan] reference search site request failed:', error);
        }
    }

    const localSite = resolveSearchSiteLocally(documentUri, text, range);
    if (localSite) {
        return localSite;
    }

    // Last resort: open search against the selection/word text without AST context.
    const selected = editor.document.getText(editor.selection).trim();
    const refText = selected || wordAtPosition(editor.document, editor.selection.active);
    if (!refText) {
        if (!client || client.state !== State.Running) {
            void vscode.window.showErrorMessage('Reqlan language server is not ready yet. Try again in a moment.');
        } else {
            void vscode.window.showInformationMessage('Place the cursor inside a [reference] or idea-body word to search.');
        }
        return undefined;
    }
    return {
        documentUri,
        refText,
        range: selected
            ? range
            : wordRangeAtPosition(editor.document, editor.selection.active) ?? range,
        mode: selected.startsWith('[') ? 'replace' : 'wrap'
    };
}

/** Parse the active editor text locally when the language client is unavailable. */
function resolveSearchSiteLocally(
    documentUri: string,
    text: string,
    range: { start: { line: number; character: number }; end: { line: number; character: number } }
): SearchReferenceCommandArgs | undefined {
    try {
        const services = createReqlanServices(EmptyFileSystem);
        const document = services.shared.workspace.LangiumDocumentFactory.fromString(
            text,
            URI.parse(documentUri)
        );
        return resolveReferenceSearchSiteFromDocument(documentUri, document, range);
    } catch (error) {
        console.error('[reqlan] local reference search site resolve failed:', error);
        return undefined;
    }
}

function wordAtPosition(document: vscode.TextDocument, position: vscode.Position): string {
    const range = document.getWordRangeAtPosition(position, /[A-Za-z0-9_]+/);
    return range ? document.getText(range) : '';
}

function wordRangeAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
): { start: { line: number; character: number }; end: { line: number; character: number } } | undefined {
    const word = document.getWordRangeAtPosition(position, /[A-Za-z0-9_]+/);
    if (!word) {
        return undefined;
    }
    return {
        start: { line: word.start.line, character: word.start.character },
        end: { line: word.end.line, character: word.end.character }
    };
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
