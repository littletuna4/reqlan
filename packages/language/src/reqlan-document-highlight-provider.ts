/**
 * Document highlights for requirement references, excluding markdown link labels.
 * Langium's default walk reads `.ref`; that is unsafe before ComputedScopes.
 */
import type { LangiumDocument, MaybePromise } from 'langium';
import { DefaultDocumentHighlightProvider } from 'langium/lsp';
import type { DocumentHighlight, DocumentHighlightParams } from 'vscode-languageserver';
import { isMarkdownLinkLabelPosition } from './reqlan-markdown-links.js';
import { documentHasComputedScopes } from './reqlan-reference-peek.js';

export class ReqlanDocumentHighlightProvider extends DefaultDocumentHighlightProvider {

    override getDocumentHighlight(
        document: LangiumDocument,
        params: DocumentHighlightParams
    ): MaybePromise<DocumentHighlight[] | undefined> {
        if (isMarkdownLinkLabelPosition(document, params.position)) {
            return undefined;
        }
        if (!documentHasComputedScopes(document)) {
            return undefined;
        }
        return super.getDocumentHighlight(document, params);
    }
}
