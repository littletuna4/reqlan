import * as vscode from 'vscode';
import { REQLAN_OPEN_FOLDER_COMMAND } from '@reqlan/language';

export function registerFolderReferenceCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(REQLAN_OPEN_FOLDER_COMMAND, async (folderUri: string, folderFiles?: string[]) => {
            await openFolderReferencePicker(folderUri, folderFiles);
        })
    );
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
