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
    isImport,
    isQualifiedImport,
    isReferenceTarget,
    isSimpleIdea,
    type Import
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
            if (node.qualifier) {
                acceptor({ node, property: 'qualifier', type: SemanticTokenTypes.namespace });
            }
            if (node.path) {
                acceptor({ node, property: 'path', type: SemanticTokenTypes.string });
            }
            if (node.idea) {
                acceptor({ node, property: 'idea', type: SemanticTokenTypes.variable });
            }
            return;
        }
        if (isImport(node)) {
            highlightImportKeywords(node, acceptor);
            acceptor({ node, property: 'path', type: SemanticTokenTypes.string, modifier: SemanticTokenModifiers.declaration });
            if (node.alias) {
                acceptor({ node, property: 'alias', type: SemanticTokenTypes.namespace, modifier: SemanticTokenModifiers.declaration });
            }
        }
        if (isFromImport(node) || isQualifiedImport(node)) {
            acceptor({ node, property: 'idea', type: SemanticTokenTypes.variable });
        }
    }
}

function highlightImportKeywords(node: Import, acceptor: SemanticTokenAcceptor): void {
    if (isFromImport(node)) {
        acceptor({ node, keyword: 'from', type: SemanticTokenTypes.keyword });
    }
    acceptor({ node, keyword: 'import', type: SemanticTokenTypes.keyword });
    if (node.alias) {
        acceptor({ node, keyword: 'as', type: SemanticTokenTypes.keyword });
    }
}
