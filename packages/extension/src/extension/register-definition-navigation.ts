/**
 * Definition locations stay on the editor Go Back / Go Forward stack.
 * The rust client syncs .rq files and other files only when the text contains rq:.
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
 * rq:["../../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_language_blocklist]
 */
import type { TextDocument, TextDocumentChangeEvent, Uri } from 'vscode';
import type { LanguageClientOptions } from 'vscode-languageclient/node';
import { isCommentReferenceHostLanguage } from './comment-reference-languages.js';
import { rewriteDefinitionTargets } from './definition-navigation.js';
import { documentSyncAction, isDocumentSyncCandidate } from './document-sync.js';
import { editorDocumentLinks } from './editor-link-activation.js';

/**
 * The language client sends `{ text }` with no range when `uri`, `version`, and `getText` are set.
 * A ranged change for an unknown URI does not open the buffer.
 */
function rangelessSyncEvent(document: TextDocument, text: string): TextDocumentChangeEvent {
    // The client treats version 0 as "not a document" (`!!version`).
    const version = document.version > 0 ? document.version : 1;
    const event: TextDocumentChangeEvent & {
        uri: Uri;
        version: number;
        getText(): string;
    } = {
        document,
        contentChanges: [],
        reason: undefined,
        uri: document.uri,
        version,
        getText() {
            return text;
        }
    };
    return event;
}

export function withEditorNavigationMiddleware(
    clientOptions: LanguageClientOptions
): LanguageClientOptions {
    const syncedUris = new Set<string>();
    return {
        ...clientOptions,
        middleware: {
            ...clientOptions.middleware,
            async didOpen(document, next) {
                if (!isDocumentSyncCandidate(document.languageId)) {
                    return;
                }
                const uri = document.uri.toString();
                const text = document.languageId === 'reqlan' ? '' : document.getText();
                const action = documentSyncAction(
                    document.languageId,
                    text,
                    syncedUris.has(uri),
                    'open'
                );
                if (action === 'skip' || action === 'drop') {
                    syncedUris.delete(uri);
                    return;
                }
                syncedUris.add(uri);
                return next(document);
            },
            async didChange(event, next) {
                const document = event.document;
                if (!isDocumentSyncCandidate(document.languageId)) {
                    return;
                }
                const uri = document.uri.toString();
                const wasSynced = syncedUris.has(uri);
                const text = document.languageId === 'reqlan' && wasSynced ? '' : document.getText();
                const action = documentSyncAction(document.languageId, text, wasSynced, 'change');
                if (action === 'skip') {
                    return;
                }
                if (action === 'drop') {
                    syncedUris.delete(uri);
                    return next(rangelessSyncEvent(document, ''));
                }
                syncedUris.add(uri);
                if (action === 'full') {
                    return next(rangelessSyncEvent(document, text));
                }
                return next(event);
            },
            async didClose(document, next) {
                if (!syncedUris.delete(document.uri.toString())) {
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
