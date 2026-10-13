/**
 * Record go-to-definition JUMPS and restore them with Alt+Left.
 * Skip syncing blocklisted languages to the language server.
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
 * rq:["../../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_language_blocklist]
 */
import type { LanguageClientOptions } from 'vscode-languageclient/node';
import * as vscode from 'vscode';
import { isCommentReferenceHostLanguage } from './comment-reference-languages.js';
import {
    DefinitionNavigationStack,
    REQLAN_CAN_NAVIGATE_BACK_CONTEXT,
    REQLAN_NAVIGATE_BACK_COMMAND,
    rewriteDefinitionTargets
} from './definition-navigation.js';
import { editorDocumentLinks } from './editor-link-activation.js';

export function withEditorNavigationMiddleware(
    clientOptions: LanguageClientOptions
): LanguageClientOptions {
    return {
        ...clientOptions,
        middleware: {
            ...clientOptions.middleware,
            async didOpen(document, next) {
                if (
                    document.languageId !== 'reqlan'
                    && !isCommentReferenceHostLanguage(document.languageId)
                ) {
                    return;
                }
                return next(document);
            },
            async didChange(event, next) {
                if (
                    event.document.languageId !== 'reqlan'
                    && !isCommentReferenceHostLanguage(event.document.languageId)
                ) {
                    return;
                }
                return next(event);
            },
            async didClose(document, next) {
                if (
                    document.languageId !== 'reqlan'
                    && !isCommentReferenceHostLanguage(document.languageId)
                ) {
                    return;
                }
                return next(document);
            },
            async provideDocumentLinks(document, token, next) {
                if (
                    document.languageId !== 'reqlan'
                    && !isCommentReferenceHostLanguage(document.languageId)
                ) {
                    return [];
                }
                const links = await next(document, token);
                if (!links) {
                    return links;
                }
                return editorDocumentLinks(links);
            },
            async provideDefinition(document, position, token, next) {
                if (
                    document.languageId !== 'reqlan'
                    && !isCommentReferenceHostLanguage(document.languageId)
                ) {
                    return undefined;
                }
                const result = await next(document, position, token);
                return rewriteDefinitionTargets(result);
            }
        }
    };
}

export function registerDefinitionNavigation(context: vscode.ExtensionContext): void {
    const stack = new DefinitionNavigationStack();
    stack.snapshot(vscode.window.activeTextEditor);
    void vscode.commands.executeCommand('setContext', REQLAN_CAN_NAVIGATE_BACK_CONTEXT, false);
    context.subscriptions.push(
        vscode.commands.registerCommand(REQLAN_NAVIGATE_BACK_COMMAND, () => stack.navigateBack()),
        vscode.window.onDidChangeTextEditorSelection(event => {
            stack.noteSelectionChange(event);
        }),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            stack.noteActiveEditor(editor);
        })
    );
}
