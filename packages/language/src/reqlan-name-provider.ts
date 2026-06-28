/**
 * Resolves declaration names for ideas, ideasets, and import aliases in the requirement graph.
 * Interacts with rename, scope export, and cross-reference linking.
 */
import type { AstNode, CstNode } from 'langium';
import { DefaultNameProvider, GrammarUtils } from 'langium';
import {
    isFromImport,
    isIdea,
    isIdeaSet,
    isNamespaceImport,
    isQualifiedImport,
    isSimpleIdea,
    type Import
} from './generated/ast.js';

export class ReqlanNameProvider extends DefaultNameProvider {

    override getName(node: AstNode): string | undefined {
        if (isImportWithAlias(node)) {
            return node.alias;
        }
        if (isImportWithPath(node)) {
            return node.path;
        }
        if (isIdea(node) || isSimpleIdea(node) || isIdeaSet(node)) {
            return node.name;
        }
        return super.getName(node);
    }

    override getNameNode(node: AstNode): CstNode | undefined {
        if (isImportWithAlias(node)) {
            return GrammarUtils.findNodeForProperty(node.$cstNode, 'alias');
        }
        if (isImportWithPath(node)) {
            return GrammarUtils.findNodeForProperty(node.$cstNode, 'path');
        }
        if (isIdea(node) || isSimpleIdea(node) || isIdeaSet(node)) {
            return GrammarUtils.findNodeForProperty(node.$cstNode, 'name');
        }
        return super.getNameNode(node);
    }
}

function isImportWithAlias(node: AstNode): node is Import & { alias: string } {
    return (isFromImport(node) || isNamespaceImport(node) || isQualifiedImport(node)) && node.alias !== undefined;
}

function isImportWithPath(node: AstNode): node is Import & { path: string } {
    return (isFromImport(node) || isNamespaceImport(node) || isQualifiedImport(node)) && node.alias === undefined;
}
