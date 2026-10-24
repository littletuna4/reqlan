/**
 * Locate idea declarations in a Langium document for the node-engine code actions.
 * Move and delete edit plans live in reqlan-parse.
 * rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_move]
 * rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_delete]
 */
import { AstUtils, type AstNode, type LangiumDocument } from 'langium';
import type { Range } from 'vscode-languageserver';
import { isIdea, isOneLinerIdea, type Idea, type OneLinerIdea } from './generated/ast.js';

export type RefactorIdeaDeclaration = Idea | OneLinerIdea;

export function isRefactorIdeaDeclaration(node: AstNode): node is RefactorIdeaDeclaration {
    return isIdea(node) || isOneLinerIdea(node);
}

export function findIdeaDeclarationAtRange(
    document: LangiumDocument,
    range: Range
): RefactorIdeaDeclaration | undefined {
    const offset = document.textDocument.offsetAt(range.start);
    for (const node of AstUtils.streamAst(document.parseResult.value)) {
        if (!isRefactorIdeaDeclaration(node) || !node.$cstNode) {
            continue;
        }
        const start = document.textDocument.offsetAt(node.$cstNode.range.start);
        const end = document.textDocument.offsetAt(node.$cstNode.range.end);
        if (offset >= start && offset <= end) {
            return node;
        }
        if (
            range.start.line === node.$cstNode.range.start.line
            && range.start.character <= (node.name?.length ?? 0) + 1
        ) {
            return node;
        }
    }
    return undefined;
}
