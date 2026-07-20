/**
 * Formats inbound reference lists for idea declaration inlay hints.
 */
import { AstUtils, GrammarUtils, type AstNode } from 'langium';
import {
    Command,
    InlayHintLabelPart,
    Location,
    MarkupKind,
    type InlayHintLabelPart as InlayHintLabelPartType,
    type MarkupContent
} from 'vscode-languageserver';
import { isIdea, isIdeaSet, isOneLinerIdea, type IdeaDeclaration, type IdeaSet } from './generated/ast.js';
import { REQLAN_INBOUND_REFERENCES_SUMMARY_COMMAND } from './reqlan-inlay-hint-settings.js';
import type { ReqlanServices } from './reqlan-module.js';

export interface InboundReferenceInlayLabel {
    labelParts: InlayHintLabelPartType[];
    tooltip?: MarkupContent;
}

export interface InboundReferencer {
    name: string;
    location: Location;
}

export type ReferencedDeclaration = IdeaDeclaration | IdeaSet;

const MAX_INLINE_NAMES = 3;

export function collectInboundReferencers(
    services: ReqlanServices,
    declaration: ReferencedDeclaration
): InboundReferencer[] {
    const documents = services.shared.workspace.LangiumDocuments;
    const locator = services.workspace.AstNodeLocator;
    const referencers = new Map<string, InboundReferencer>();

    for (const reference of services.references.References.findReferences(declaration, { includeDeclaration: false }).toArray()) {
        const sourceDocument = documents.getDocument(reference.sourceUri);
        if (!sourceDocument) {
            continue;
        }
        const sourceNode = locator.getAstNode(sourceDocument.parseResult.value, reference.sourcePath);
        if (!sourceNode) {
            continue;
        }
        const referrer = enclosingReferrerDeclaration(sourceNode);
        if (!referrer || referrer.name === declaration.name) {
            continue;
        }
        const location = locationForReferrer(referrer);
        if (!location) {
            continue;
        }
        referencers.set(locationKey(location), {
            name: referrer.name,
            location
        });
    }

    return [...referencers.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/** @deprecated Use {@link collectInboundReferencers} */
export function collectInboundReferencingNames(
    services: ReqlanServices,
    declaration: ReferencedDeclaration
): string[] {
    return collectInboundReferencers(services, declaration).map(referrer => referrer.name);
}

function enclosingReferrerDeclaration(node: AstNode): ReferencedDeclaration | undefined {
    let current: AstNode | undefined = node;
    while (current) {
        if (isIdea(current) || isOneLinerIdea(current) || isIdeaSet(current)) {
            return current;
        }
        current = current.$container;
    }
    return undefined;
}

function locationForReferrer(referrer: ReferencedDeclaration): Location | undefined {
    const nameNode = GrammarUtils.findNodeForProperty(referrer.$cstNode, 'name');
    if (!nameNode?.range) {
        return undefined;
    }
    const document = AstUtils.getDocument(referrer);
    return Location.create(document.textDocument.uri, nameNode.range);
}

function locationKey(location: Location): string {
    const range = location.range;
    return `${location.uri}#${range.start.line}:${range.start.character}`;
}

export function referencerMarkdownLink(referrer: InboundReferencer): string {
    const line = referrer.location.range.start.line + 1;
    const character = referrer.location.range.start.character + 1;
    return `[${referrer.name}](${referrer.location.uri}#L${line},${character})`;
}

export function buildReferencersTooltipMarkup(referencers: InboundReferencer[]): MarkupContent {
    const items = referencers.map(referrer => `- ${referencerMarkdownLink(referrer)}`).join('\n');
    return {
        kind: MarkupKind.Markdown,
        value: `**Referenced by**\n\n${items}`
    };
}

function referencerPartTooltip(referrer: InboundReferencer): MarkupContent {
    return {
        kind: MarkupKind.Markdown,
        value: referencerMarkdownLink(referrer)
    };
}

export function buildInboundReferencesInlayLabel(
    referencers: InboundReferencer[],
    targetDocumentUri: string,
    targetName: string
): InboundReferenceInlayLabel | undefined {
    if (referencers.length === 0) {
        return undefined;
    }
    const tooltip = buildReferencersTooltipMarkup(referencers);
    const inlineReferencers = referencers.slice(0, MAX_INLINE_NAMES);
    const remainder = referencers.length - inlineReferencers.length;
    const labelParts: InlayHintLabelPartType[] = [
        InlayHintLabelPart.create('@referenced-by: (')
    ];

    for (let index = 0; index < inlineReferencers.length; index++) {
        if (index > 0) {
            labelParts.push(InlayHintLabelPart.create(', '));
        }
        labelParts.push({
            value: inlineReferencers[index].name,
            location: inlineReferencers[index].location,
            tooltip: referencerPartTooltip(inlineReferencers[index])
        });
    }

    if (remainder > 0) {
        labelParts.push(InlayHintLabelPart.create(', '));
        labelParts.push({
            value: `+${remainder} more`,
            tooltip,
            command: Command.create(
                'Show all inbound references',
                REQLAN_INBOUND_REFERENCES_SUMMARY_COMMAND,
                targetDocumentUri,
                targetName
            )
        });
    }

    labelParts.push(InlayHintLabelPart.create(')'));

    return {
        labelParts,
        tooltip
    };
}

/** @deprecated Use {@link buildInboundReferencesInlayLabel} */
export function formatInboundReferencesInlayLabel(referencers: string[]): { label: string; tooltip?: string } | undefined {
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
