/**
 * Quick Fix on comment-reference diagnostics in non-`.rq` source files.
 * Inserts `//rq-ignore-error` (hash-prefixed in `#` comments) on the previous line.
 * rq:["../../../../reqlan rq/extension/features-commands.rq".code_actions_ignore_error]
 * rq:["../../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
 * rq:["../../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq".references_in_functional_code_comments]
 */
import * as vscode from 'vscode';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createIgnoreErrorCodeActions } from '@reqlan/language';
import { COMMENT_REFERENCE_LANGUAGES } from './register-comment-reference-links.js';
import { isReqlanCommentDiagnostic } from './ignore-error-comment-filter.js';

export function registerIgnoreErrorCodeActions(context: vscode.ExtensionContext): void {
    const selector = COMMENT_REFERENCE_LANGUAGES.map(language => ({ scheme: 'file', language }));
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            selector,
            {
                provideCodeActions(document, _range, actionContext) {
                    return commentFileIgnoreErrorCodeActions(document, actionContext);
                }
            },
            { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
        )
    );
}

export function commentFileIgnoreErrorCodeActions(
    document: vscode.TextDocument,
    actionContext: vscode.CodeActionContext
): vscode.CodeAction[] {
    if (!wantsQuickFix(actionContext.only)) {
        return [];
    }
    const reqlanDiagnostics = actionContext.diagnostics.filter(isReqlanCommentDiagnostic);
    if (reqlanDiagnostics.length === 0) {
        return [];
    }
    const textDocument = TextDocument.create(
        document.uri.toString(),
        document.languageId,
        document.version,
        document.getText()
    );
    const lspDiagnostics = reqlanDiagnostics.map(diagnostic => ({
        range: {
            start: {
                line: diagnostic.range.start.line,
                character: diagnostic.range.start.character
            },
            end: {
                line: diagnostic.range.end.line,
                character: diagnostic.range.end.character
            }
        },
        message: diagnostic.message
    }));
    return createIgnoreErrorCodeActions(textDocument, lspDiagnostics).map(action => {
        const vsAction = new vscode.CodeAction(action.title, vscode.CodeActionKind.QuickFix);
        const insertLine = action.edit?.changes?.[textDocument.uri]?.[0]?.range.start.line;
        vsAction.diagnostics = insertLine === undefined
            ? reqlanDiagnostics
            : reqlanDiagnostics.filter(diagnostic => diagnostic.range.start.line === insertLine);
        vsAction.edit = new vscode.WorkspaceEdit();
        const edits = action.edit?.changes?.[textDocument.uri] ?? [];
        vsAction.edit.set(
            document.uri,
            edits.map(edit => vscode.TextEdit.insert(
                new vscode.Position(edit.range.start.line, edit.range.start.character),
                edit.newText
            ))
        );
        return vsAction;
    });
}

function wantsQuickFix(only: vscode.CodeActionKind | undefined): boolean {
    if (!only) {
        return true;
    }
    return only.contains(vscode.CodeActionKind.QuickFix)
        || vscode.CodeActionKind.QuickFix.contains(only);
}
