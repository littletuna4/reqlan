/**
 * Document highlights for requirement references, excluding markdown link labels.
 */
import type { LangiumDocument } from 'langium';
import { DefaultDocumentHighlightProvider } from 'langium/lsp';
import type { MaybePromise } from 'langium';
import type { DocumentHighlight, DocumentHighlightParams } from 'vscode-languageserver';
import { isMarkdownLinkLabelPosition } from './reqlan-markdown-links.js';

export class ReqlanDocumentHighlightProvider extends DefaultDocumentHighlightProvider {

    override getDocumentHighlight(
        document: LangiumDocument,
        params: DocumentHighlightParams
    ): MaybePromise<DocumentHighlight[] | undefined> {
        if (isMarkdownLinkLabelPosition(document, params.position)) {
            return undefined;
        }
        return super.getDocumentHighlight(document, params);
    }
}
