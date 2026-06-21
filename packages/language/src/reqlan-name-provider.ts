/**
 * Resolves declaration names for ideas and ideasets in the requirement graph.
 * Interacts with rename, scope export, and cross-reference linking.
 */
import type { AstNode, CstNode } from 'langium';
import { DefaultNameProvider, GrammarUtils } from 'langium';
import { isIdea, isIdeaSet, isSimpleIdea } from './generated/ast.js';

export class ReqlanNameProvider extends DefaultNameProvider {

    override getName(node: AstNode): string | undefined {
        if (isIdea(node) || isSimpleIdea(node) || isIdeaSet(node)) {
            return node.name;
        }
        return super.getName(node);
    }

    override getNameNode(node: AstNode): CstNode | undefined {
        if (isIdea(node) || isSimpleIdea(node) || isIdeaSet(node)) {
            return GrammarUtils.findNodeForProperty(node.$cstNode, 'name');
        }
        return super.getNameNode(node);
    }
}
