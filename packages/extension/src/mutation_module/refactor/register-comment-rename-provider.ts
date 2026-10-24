import {
    findCommentReferenceAtInText,
    findCommentReferencePartAtInText,
    findCommentIdeaRenameEdits,
    ideaTokenRangeInCommentReference
} from '@reqlan/language';
import * as vscode from 'vscode';

const CODE_LANGUAGE_IDS = [
    'typescript',
    'typescriptreact',
    'javascript',
    'javascriptreact',
    'python',
    'go',
    'rust',
    'java',
    'csharp',
    'cpp',
    'c',
    'json',
    'jsonc',
    'markdown',
    'plaintext'
];

/**
 * Rename provider for idea tokens embedded in non-.rq source comments.
 * rq:["../../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_rename]
 */
export function registerCommentRenameProvider(context: vscode.ExtensionContext): void {
    const provider: vscode.RenameProvider = {
        prepareRename(document, position) {
            const text = document.getText();
            const part = findCommentReferencePartAtInText(text, position);
            if (!part || part.property !== 'idea') {
                throw new Error('No renamable comment idea reference at position');
            }
            const ideaRange = ideaTokenRangeInCommentReference(text, part.reference);
            if (!ideaRange) {
                throw new Error('No renamable comment idea reference at position');
            }
            return new vscode.Range(
                ideaRange.start.line,
                ideaRange.start.character,
                ideaRange.end.line,
                ideaRange.end.character
            );
        },
        provideRenameEdits(document, position, newName) {
            const text = document.getText();
            const reference = findCommentReferenceAtInText(text, position);
            if (!reference) {
                return undefined;
            }
            const workspaceEdit = new vscode.WorkspaceEdit();
            // Rename matching comment idea tokens across open-ish workspace files is handled
            // by scanning the current document here; broader workspace rename uses LSP for .rq.
            const edits = findCommentIdeaRenameEdits(
                text,
                reference.idea,
                newName,
                { includePathless: true, targetPath: reference.path }
            );
            for (const edit of edits) {
                workspaceEdit.replace(
                    document.uri,
                    new vscode.Range(
                        edit.range.start.line,
                        edit.range.start.character,
                        edit.range.end.line,
                        edit.range.end.character
                    ),
                    edit.newText
                );
            }
            return workspaceEdit;
        }
    };

    for (const language of CODE_LANGUAGE_IDS) {
        context.subscriptions.push(
            vscode.languages.registerRenameProvider({ language, scheme: 'file' }, provider)
        );
    }
}
