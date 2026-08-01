/**
 * Locate a bracket/wiki idea reference under the cursor for search code actions.
 * rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
 */
import type { CstNode, LangiumDocument } from 'langium';
import { CstUtils } from 'langium';
import type { Position, Range } from 'vscode-languageserver';
import {
    isBracketReference,
    isLocalReference,
    isQualifiedReference,
    isWikiLink,
    type BracketReference,
    type WikiLink
} from './generated/ast.js';
import { referenceIdea } from './reqlan-references.js';

export interface IdeaReferenceSite {
    /** Current idea name text inside the reference (may be empty or partial). */
    refText: string;
    /** Range of text to replace with the chosen idea name (inside brackets). */
    range: Range;
    kind: 'bracket' | 'wikilink';
}

export function findIdeaReferenceAtPosition(
    document: LangiumDocument,
    position: Position
): IdeaReferenceSite | undefined {
    const root = document.parseResult.value.$cstNode;
    if (!root) {
        return undefined;
    }
    const offset = document.textDocument.offsetAt(position);
    let current: CstNode | undefined = CstUtils.findLeafNodeAtOffset(root, offset);
    while (current) {
        const node = current.astNode;
        if (isBracketReference(node) || isWikiLink(node)) {
            return siteFromReferenceContainer(node);
        }
        current = current.container;
    }
    return undefined;
}

function siteFromReferenceContainer(node: BracketReference | WikiLink): IdeaReferenceSite | undefined {
    const kind = isWikiLink(node) ? 'wikilink' : 'bracket';
    const target = node.target;
    if (!target) {
        return undefined;
    }

    if (isLocalReference(target) || isQualifiedReference(target)) {
        const idea = referenceIdea(target);
        const ideaNode = idea?.$refNode;
        if (ideaNode) {
            return {
                refText: idea.$refText,
                range: ideaNode.range,
                kind
            };
        }
    }

    const targetNode = target.$cstNode;
    if (!targetNode) {
        return undefined;
    }
    return {
        refText: targetNode.text,
        range: targetNode.range,
        kind
    };
}
