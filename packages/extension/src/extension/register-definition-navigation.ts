/**
 * Definition locations stay on the editor Go Back / Go Forward stack.
 * Blocklisted languages are not synced to the language server.
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
 * rq:["../../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_language_blocklist]
 */
import type { LanguageClientOptions } from 'vscode-languageclient/node';
import { isCommentReferenceHostLanguage } from './comment-reference-languages.js';
import { rewriteDefinitionTargets } from './definition-navigation.js';
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
                return rewriteDefinitionTargets(await next(document, position, token));
            }
        }
    };
}
