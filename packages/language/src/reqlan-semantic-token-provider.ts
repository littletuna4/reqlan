/**
 * Semantic highlighting for requirement graph syntax: attributes, ideas, and references.
 */
import type { AstNode } from 'langium';
import { AbstractSemanticTokenProvider, type SemanticTokenAcceptor } from 'langium/lsp';
import { SemanticTokenModifiers, SemanticTokenTypes } from 'vscode-languageserver';
import {
    isAttribute,
    isCodeSnippet,
    isFileReference,
    isFileSymbolReference,
    isFromImport,
    isFromImportSpecifier,
    isIdea,
    isIdeaSet,
    isImport,
    isInvalidFromImport,
    isLocalReference,
    isMarkdownLink,
    isQualifiedImport,
    isQualifiedReference,
    isOneLinerIdea,
    isUrlReference,
    isWildcardReference,
    type Import
} from './generated/ast.js';
import { isWellFormedFromImport } from './reqlan-import-bindings.js';

export class ReqlanSemanticTokenProvider extends AbstractSemanticTokenProvider {

    protected highlightElement(node: AstNode, acceptor: SemanticTokenAcceptor): void {
        if (isAttribute(node)) {
            acceptor({ node, keyword: '@', type: SemanticTokenTypes.operator });
            acceptor({ node, property: 'name', type: SemanticTokenTypes.decorator });
            return;
        }
        if (isIdea(node) || isOneLinerIdea(node)) {
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
        if (isWildcardReference(node)) {
            acceptor({ node, property: 'pathPattern', type: SemanticTokenTypes.string });
            acceptor({ node, property: 'ideaPattern', type: SemanticTokenTypes.variable });
            return;
        }
        if (isQualifiedReference(node)) {
            if (node.qualifier) {
                acceptor({ node, property: 'qualifier', type: SemanticTokenTypes.namespace });
            }
            if (node.path) {
                acceptor({ node, property: 'path', type: SemanticTokenTypes.string });
            }
            if (node.ideaset) {
                acceptor({ node, property: 'ideaset', type: SemanticTokenTypes.namespace });
            }
            if (node.idea) {
                acceptor({ node, property: 'idea', type: SemanticTokenTypes.variable });
            }
            return;
        }
        if (isLocalReference(node)) {
            if (node.idea) {
                acceptor({ node, property: 'idea', type: SemanticTokenTypes.variable });
            }
            return;
        }
        if (isFileReference(node) || isFileSymbolReference(node)) {
            acceptor({ node, property: 'file', type: SemanticTokenTypes.string });
            if (isFileSymbolReference(node)) {
                acceptor({ node, property: 'symbols', type: SemanticTokenTypes.method });
            }
            return;
        }
        if (isUrlReference(node)) {
            acceptor({ node, property: 'url', type: SemanticTokenTypes.string });
            return;
        }
        if (isCodeSnippet(node)) {
            return;
        }
        if (isMarkdownLink(node)) {
            return;
        }
        if (isImport(node)) {
            highlightImportKeywords(node, acceptor);
            if (!isInvalidFromImport(node)) {
                acceptor({ node, property: 'path', type: SemanticTokenTypes.string, modifier: SemanticTokenModifiers.declaration });
            }
            if (isFromImport(node) && node.alias) {
                acceptor({ node, property: 'alias', type: SemanticTokenTypes.namespace });
            } else if (!isFromImport(node) && !isInvalidFromImport(node) && node.alias) {
                acceptor({ node, property: 'alias', type: SemanticTokenTypes.namespace, modifier: SemanticTokenModifiers.declaration });
            }
            return;
        }
        if (isFromImportSpecifier(node)) {
            acceptor({ node, property: 'idea', type: SemanticTokenTypes.variable });
            if (node.alias) {
                acceptor({ node, property: 'alias', type: SemanticTokenTypes.namespace, modifier: SemanticTokenModifiers.declaration });
                acceptor({ node, keyword: 'as', type: SemanticTokenTypes.keyword });
            }
            return;
        }
        if (isQualifiedImport(node)) {
            acceptor({ node, property: 'idea', type: SemanticTokenTypes.variable });
            return;
        }
    }
}

function highlightImportKeywords(node: Import, acceptor: SemanticTokenAcceptor): void {
    if (isFromImport(node) || isInvalidFromImport(node)) {
        acceptor({ node, keyword: 'from', type: SemanticTokenTypes.keyword });
    }
    if (isFromImport(node)) {
        if (isWellFormedFromImport(node)) {
            acceptor({ node, keyword: 'import', type: SemanticTokenTypes.keyword });
        }
        if (node.alias) {
            acceptor({ node, keyword: 'as', type: SemanticTokenTypes.keyword });
        }
        return;
    }
    if (isInvalidFromImport(node)) {
        return;
    }
    acceptor({ node, keyword: 'import', type: SemanticTokenTypes.keyword });
    if (node.alias) {
        acceptor({ node, keyword: 'as', type: SemanticTokenTypes.keyword });
    }
}
