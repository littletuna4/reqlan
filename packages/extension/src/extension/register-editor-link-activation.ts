/**
 * Hide file document links from the editor.
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
 */
import type { LanguageClientOptions } from 'vscode-languageclient/node';
import { editorDocumentLinks } from './editor-link-activation.js';

export function withEditorLinkMiddleware(clientOptions: LanguageClientOptions): LanguageClientOptions {
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
            }
        }
    };
}
