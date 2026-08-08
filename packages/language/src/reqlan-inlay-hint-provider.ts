/**
 * Inlay hints showing inbound references on idea declarations as a computed attribute.
 *
 * Builds a single workspace inbound index per request so large `.rq` files stay responsive
 * (avoids per-idea full-workspace `findAllReferences` scans).
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".inbound_inlay_index_performance]
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".view_references_as_inlay_hints]
 */
import { AstUtils, GrammarUtils, interruptAndCheck, type AstNode, type LangiumDocument } from 'langium';
import { AbstractInlayHintProvider } from 'langium/lsp';
import type { CancellationToken } from 'vscode-languageserver';
import { CancellationToken as CancelToken, InlayHintKind, type InlayHint, type InlayHintParams } from 'vscode-languageserver';
import {
    isIdea,
    isIdeaSet,
    isOneLinerIdea
} from './generated/ast.js';
import {
    buildInboundReferencesInlayLabel,
    buildInboundReferencerIndex,
    lookupInboundReferencers,
    type InboundReferencerIndex,
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
    private inboundIndex: InboundReferencerIndex | undefined;

    constructor(services: ReqlanServices) {
        super();
        this.services = services;
    }

    override async getInlayHints(
        document: LangiumDocument,
        params: InlayHintParams,
        cancelToken: CancellationToken = CancelToken.None
    ): Promise<InlayHint[] | undefined> {
        const settings = await this.services.shared.workspace.ConfigurationProvider.getConfiguration(
            'reqlan',
            REQLAN_REFERENCE_INLAY_HINTS_SETTING
        ) as ReferenceInlayHintsSettings | undefined;
        if (!referenceInlayHintsEnabled(settings)) {
            return [];
        }
        // Must throw Langium's OperationCancelled symbol so the LSP maps this to
        // RequestCancelled (-32800), not InternalError (-32603) with "Operation cancelled".
        await interruptAndCheck(cancelToken);
        // One inverse index for the whole request — not findReferences per idea.
        this.inboundIndex = buildInboundReferencerIndex(this.services);
        try {
            const root = document.parseResult.value;
            const inlayHints: InlayHint[] = [];
            const acceptor = (hint: InlayHint): void => {
                inlayHints.push(hint);
            };
            let checked = 0;
            for (const node of AstUtils.streamAst(root, { range: params.range })) {
                if ((++checked & 31) === 0) {
                    await interruptAndCheck(cancelToken);
                }
                this.computeInlayHint(node, acceptor);
            }
            return inlayHints;
        } finally {
            this.inboundIndex = undefined;
        }
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
        const index = this.inboundIndex ?? buildInboundReferencerIndex(this.services);
        const referencers = lookupInboundReferencers(index, this.services, declaration);
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
