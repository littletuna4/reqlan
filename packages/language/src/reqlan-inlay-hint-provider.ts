/**
 * Inlay hints showing inbound references on idea declarations as a computed attribute.
 */
import { AstUtils, GrammarUtils, type AstNode, type LangiumDocument } from 'langium';
import { AbstractInlayHintProvider } from 'langium/lsp';
import type { CancellationToken } from 'vscode-languageserver';
import { InlayHintKind, type InlayHint, type InlayHintParams } from 'vscode-languageserver';
import {
    isIdea,
    isIdeaSet,
    isOneLinerIdea
} from './generated/ast.js';
import {
    buildInboundReferencesInlayLabel,
    collectInboundReferencers,
    type ReferencedDeclaration
} from './reqlan-inbound-reference-inlay-label.js';
import {
    REQLAN_REFERENCE_INLAY_HINTS_SETTING,
    referenceInlayHintsEnabled,
    type ReferenceInlayHintsSettings
} from './reqlan-inlay-hint-settings.js';
import type { ReqlanServices } from './reqlan-module.js';

export class ReqlanInlayHintProvider extends AbstractInlayHintProvider {

    private readonly services: ReqlanServices;

    constructor(services: ReqlanServices) {
        super();
        this.services = services;
    }

    override async getInlayHints(
        document: LangiumDocument,
        params: InlayHintParams,
        cancelToken?: CancellationToken
    ): Promise<InlayHint[] | undefined> {
        const settings = await this.services.shared.workspace.ConfigurationProvider.getConfiguration(
            'reqlan',
            REQLAN_REFERENCE_INLAY_HINTS_SETTING
        ) as ReferenceInlayHintsSettings | undefined;
        if (!referenceInlayHintsEnabled(settings)) {
            return [];
        }
        return super.getInlayHints(document, params, cancelToken);
    }

    computeInlayHint(node: AstNode, acceptor: (hint: InlayHint) => void): void {
        if (isIdea(node) || isOneLinerIdea(node)) {
            this.acceptInboundReferenceHint(node, acceptor);
            return;
        }
        if (isIdeaSet(node)) {
            this.acceptInboundReferenceHint(node, acceptor);
        }
    }

    private acceptInboundReferenceHint(
        declaration: ReferencedDeclaration,
        acceptor: (hint: InlayHint) => void
    ): void {
        const nameNode = GrammarUtils.findNodeForProperty(declaration.$cstNode, 'name');
        if (!nameNode?.range) {
            return;
        }
        const referencers = collectInboundReferencers(this.services, declaration);
        const document = AstUtils.getDocument(declaration);
        const formatted = buildInboundReferencesInlayLabel(
            referencers,
            document.textDocument.uri,
            declaration.name
        );
        if (!formatted) {
            return;
        }
        acceptor({
            position: {
                line: nameNode.range.end.line,
                character: nameNode.range.end.character
            },
            label: formatted.labelParts,
            tooltip: formatted.tooltip,
            kind: InlayHintKind.Type,
            paddingLeft: true
        });
    }
}
