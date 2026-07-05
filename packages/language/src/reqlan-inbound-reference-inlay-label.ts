/**
 * Formats inbound reference lists for idea declaration inlay hints.
 */
import type { AstNode } from 'langium';
import { isIdea, isIdeaSet, isOneLinerIdea, type IdeaDeclaration, type IdeaSet } from './generated/ast.js';
import type { ReqlanServices } from './reqlan-module.js';

export interface InboundReferenceInlayLabel {
    label: string;
    tooltip?: string;
}

export type ReferencedDeclaration = IdeaDeclaration | IdeaSet;

const MAX_INLINE_NAMES = 3;

export function collectInboundReferencingNames(
    services: ReqlanServices,
    declaration: ReferencedDeclaration
): string[] {
    const documents = services.shared.workspace.LangiumDocuments;
    const locator = services.workspace.AstNodeLocator;
    const names = new Set<string>();

    for (const reference of services.references.References.findReferences(declaration, { includeDeclaration: false }).toArray()) {
        const sourceDocument = documents.getDocument(reference.sourceUri);
        if (!sourceDocument) {
            continue;
        }
        const sourceNode = locator.getAstNode(sourceDocument.parseResult.value, reference.sourcePath);
        if (!sourceNode) {
            continue;
        }
        const referrer = enclosingReferrerName(sourceNode);
        if (!referrer || referrer === declaration.name) {
            continue;
        }
        names.add(referrer);
    }

    return [...names].sort((left, right) => left.localeCompare(right));
}

function enclosingReferrerName(node: AstNode): string | undefined {
    let current: AstNode | undefined = node;
    while (current) {
        if (isIdea(current) || isOneLinerIdea(current) || isIdeaSet(current)) {
            return current.name;
        }
        current = current.$container;
    }
    return undefined;
}

export function formatInboundReferencesInlayLabel(referencers: string[]): InboundReferenceInlayLabel | undefined {
    if (referencers.length === 0) {
        return undefined;
    }
    const inlineNames = referencers.slice(0, MAX_INLINE_NAMES);
    const remainder = referencers.length - inlineNames.length;
    const suffix = remainder > 0 ? `, +${remainder} more` : '';
    return {
        label: `@referenced-by: (${inlineNames.join(', ')}${suffix})`,
        tooltip: referencers.join('\n')
    };
}
