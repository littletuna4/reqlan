/**
 * Record go-to-definition JUMPS and restore them with Alt+Left.
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
 */
import type { LanguageClientOptions } from 'vscode-languageclient/node';
import * as vscode from 'vscode';
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
            async provideDocumentLinks(document, token, next) {
                const links = await next(document, token);
                if (!links) {
                    return links;
                }
                return editorDocumentLinks(links);
            },
            async provideDefinition(document, position, token, next) {
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
