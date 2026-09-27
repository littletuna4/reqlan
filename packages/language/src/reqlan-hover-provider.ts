/**
 * Hover for idea declarations. Default Langium hover resolves `.ref` via findDeclarations;
 * that must not run before ComputedScopes (Parsed-time LSP handlers for open-file speed).
 */
import type { LangiumDocument } from 'langium';
import { MultilineCommentHoverProvider } from 'langium/lsp';
import type { Hover, HoverParams } from 'vscode-languageserver';
import { documentHasComputedScopes } from './reqlan-reference-peek.js';
import type { ReqlanServices } from './reqlan-module.js';

export class ReqlanHoverProvider extends MultilineCommentHoverProvider {

    constructor(services: ReqlanServices) {
        super(services);
    }

    override getHoverContent(
        document: LangiumDocument,
        params: HoverParams
    ): Promise<Hover | undefined> {
        if (!documentHasComputedScopes(document)) {
            return Promise.resolve(undefined);
        }
        return Promise.resolve(super.getHoverContent(document, params));
    }
}
