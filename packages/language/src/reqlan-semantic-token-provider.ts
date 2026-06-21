/**
 * Semantic highlighting for requirement graph syntax: attributes, ideas, and references.
 * Interacts with VS Code semantic token theming (decorator, type, variable scopes).
 */
import type { AstNode } from 'langium';
import { AbstractSemanticTokenProvider, type SemanticTokenAcceptor } from 'langium/lsp';
import { SemanticTokenModifiers, SemanticTokenTypes } from 'vscode-languageserver';
import {
    isAttribute,
    isFromImport,
    isIdea,
    isIdeaSet,
    isQualifiedImport,
    isReferenceTarget,
    isSimpleIdea
} from './generated/ast.js';

export class ReqlanSemanticTokenProvider extends AbstractSemanticTokenProvider {

    protected highlightElement(node: AstNode, acceptor: SemanticTokenAcceptor): void {
        if (isAttribute(node)) {
            acceptor({ node, keyword: '@', type: SemanticTokenTypes.operator });
            acceptor({ node, property: 'name', type: SemanticTokenTypes.decorator });
            return;
        }
        if (isIdea(node) || isSimpleIdea(node)) {
            acceptor({
                node,
                property: 'name',
                type: SemanticTokenTypes.type,
                modifier: SemanticTokenModifiers.definition
            });
            return;
        }
        if (isIdeaSet(node)) {
            acceptor({
                node,
                property: 'name',
                type: SemanticTokenTypes.namespace,
                modifier: SemanticTokenModifiers.definition
            });
            return;
        }
        if (isReferenceTarget(node)) {
            acceptor({ node, property: 'idea', type: SemanticTokenTypes.variable });
            return;
        }
        if (isFromImport(node) || isQualifiedImport(node)) {
            acceptor({ node, property: 'idea', type: SemanticTokenTypes.variable });
        }
    }
}
