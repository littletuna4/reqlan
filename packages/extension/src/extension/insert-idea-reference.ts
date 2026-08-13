/**
 * Insert / replace idea references in .rq editors, including required imports.
 * rq:["../../../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane_insert_reference]
 * rq:["../../../../reqlan rq/extension/features-commands.rq".search_code_actions]
 */
import {
    fileBasenameAlias,
    type SearchReferenceCommandArgs
} from '@reqlan/language';
import * as vscode from 'vscode';
import {
    isSameIndexedFile,
    relativeImportPathForIndexedFile
} from './reference-search-import-path.js';
import { escapeRegExp, findPlainImportInsertLine } from './insert-idea-reference-helpers.js';

export { findPlainImportInsertLine } from './insert-idea-reference-helpers.js';

export interface IdeaReferenceTarget {
    fileUri: string;
    name: string;
    kind: string;
}

/**
 * Insert `[name]` at the active editor selection (or replace it), and add an import
 * when the target idea lives in another file.
 */
export async function insertIdeaReferenceAtCursor(
    selected: IdeaReferenceTarget
): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        void vscode.window.showWarningMessage('No active editor to insert a reference into.');
        return false;
    }
    if (editor.document.languageId !== 'reqlan' && !editor.document.fileName.endsWith('.rq')) {
        void vscode.window.showWarningMessage('Open a .rq file to insert an idea reference.');
        return false;
    }
    const document = editor.document;
    const range = editor.selection;
    return applyIdeaReferenceEdit(
        {
            documentUri: document.uri.toString(),
            range: {
                start: { line: range.start.line, character: range.start.character },
                end: { line: range.end.line, character: range.end.character }
            },
            mode: 'wrap'
        },
        selected
    );
}

/**
 * Replace a document range with an idea name or `[name]` (wrap mode), and add imports.
 */
export async function applyIdeaReferenceEdit(
    args: Pick<SearchReferenceCommandArgs, 'documentUri' | 'range' | 'mode'>,
    selected: IdeaReferenceTarget
): Promise<boolean> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(args.documentUri));
    const editor = await vscode.window.showTextDocument(document);
    const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath
        ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const edit = new vscode.WorkspaceEdit();
    const replaceRange = new vscode.Range(
        args.range.start.line,
        args.range.start.character,
        args.range.end.line,
        args.range.end.character
    );
    const replacement = (args.mode ?? 'replace') === 'wrap'
        ? `[${selected.name}]`
        : selected.name;
    edit.replace(document.uri, replaceRange, replacement);

    if (!isSameIndexedFile(args.documentUri, selected.fileUri, workspaceRoot)) {
        const importPath = relativeImportPathForIndexedFile(
            args.documentUri,
            selected.fileUri,
            workspaceRoot
        );
        if (selected.kind === 'ideaset') {
            appendNamespaceImport(edit, document, importPath, fileBasenameAlias(selected.fileUri));
        } else {
            appendFromImport(edit, document, importPath, selected.name);
        }
    }

    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
        void vscode.window.showErrorMessage('Could not apply reference selection.');
        return false;
    }
    const end = replaceRange.start.character + replacement.length;
    editor.selection = new vscode.Selection(
        replaceRange.start.line,
        end,
        replaceRange.start.line,
        end
    );
    return true;
}

export function appendFromImport(
    edit: vscode.WorkspaceEdit,
    document: vscode.TextDocument,
    importPath: string,
    symbolName: string
): void {
    const text = document.getText();
    const fromPattern = new RegExp(
        `^from\\s+["']${escapeRegExp(importPath)}["']\\s+import\\s+(.+)$`,
        'm'
    );
    const existing = fromPattern.exec(text);
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
        return;
    }
    const insertLine = findPlainImportInsertLine(text);
    const suffix = insertLine === 0 ? '\n' : '';
    edit.insert(
        document.uri,
        new vscode.Position(insertLine, 0),
        `from "${importPath}" import ${symbolName}\n${suffix}`
    );
}

export function appendNamespaceImport(
    edit: vscode.WorkspaceEdit,
    document: vscode.TextDocument,
    importPath: string,
    alias: string
): void {
    const text = document.getText();
    if (new RegExp(`^import\\s+["']${escapeRegExp(importPath)}["']`, 'm').test(text)) {
        return;
    }
    const insertLine = findPlainImportInsertLine(text);
    const suffix = insertLine === 0 ? '\n' : '';
    edit.insert(
        document.uri,
        new vscode.Position(insertLine, 0),
        `import "${importPath}" as ${alias}\n${suffix}`
    );
}
