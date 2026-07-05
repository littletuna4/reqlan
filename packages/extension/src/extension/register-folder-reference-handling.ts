import * as vscode from 'vscode';
import type { LanguageClient, LanguageClientOptions } from 'vscode-languageclient/node';
import { State } from 'vscode-languageclient/node';
import { REQLAN_FILE_REFERENCE_AT_REQUEST, REQLAN_OPEN_FOLDER_COMMAND } from 'reqlan-language';

export interface FileReferenceAtResponse {
    sourceRange: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    targetUri: string;
    resolution: 'file' | 'folder' | 'missing';
    folderFiles?: string[];
}

export function registerFolderReferenceCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(REQLAN_OPEN_FOLDER_COMMAND, async (folderUri: string, folderFiles?: string[]) => {
            await openFolderReferencePicker(folderUri, folderFiles);
        })
    );
}

export function withFolderReferenceMiddleware(
    clientOptions: LanguageClientOptions,
    getClient: () => LanguageClient
): LanguageClientOptions {
    return {
        ...clientOptions,
        middleware: {
            ...clientOptions.middleware,
            provideDefinition: async (document, position, token, next) => {
                const line = document.lineAt(position.line).text;
                if (!line.includes('rq:') && !line.includes('["')) {
                    return next(document, position, token);
                }
                try {
                    const client = getClient();
                    if (client.state !== State.Running) {
                        return next(document, position, token);
                    }
                    const reference = await client.sendRequest<FileReferenceAtResponse | undefined>(
                        REQLAN_FILE_REFERENCE_AT_REQUEST,
                        {
                            uri: document.uri.toString(),
                            text: document.getText(),
                            position
                        }
                    );
                    if (reference?.resolution === 'folder') {
                        await openFolderReferencePicker(reference.targetUri, reference.folderFiles);
                        return null;
                    }
                } catch {
                    // Fall through to default definition handling.
                }
                return next(document, position, token);
            }
        }
    };
}

export async function openFolderReferencePicker(folderUri: string, fileNames?: string[]): Promise<void> {
    const folder = vscode.Uri.parse(folderUri);
    let names = fileNames;
    if (!names?.length) {
        const entries = await vscode.workspace.fs.readDirectory(folder);
        names = entries
            .filter(([, type]) => type === vscode.FileType.File)
            .map(([name]) => name)
            .sort((left, right) => left.localeCompare(right));
    }
    if (!names.length) {
        void vscode.window.showInformationMessage('Folder is empty.');
        return;
    }
    const picked = await vscode.window.showQuickPick(
        names.map(name => ({ label: name })),
        { placeHolder: 'Select a file in folder' }
    );
    if (!picked) {
        return;
    }
    const fileUri = vscode.Uri.joinPath(folder, picked.label);
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);
}
