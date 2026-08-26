/**
 * Formats inbound reference lists for idea declaration inlay hints.
 * Inbound lists come from the SQLite snapshot pushed by the extension host.
 * rq:["../../../reqlan rq/indexer/cache-reuse.rq".unify_inbound_indexes]
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".inbound_inlay_index_performance]
 */
import { AstUtils } from 'langium';
import {
    Command,
    InlayHintLabelPart,
    Location,
    MarkupKind,
    type InlayHintLabelPart as InlayHintLabelPartType,
    type MarkupContent
} from 'vscode-languageserver';
import type { IdeaDeclaration, IdeaSet } from './generated/ast.js';
import { REQLAN_INBOUND_REFERENCES_SUMMARY_COMMAND } from './reqlan-inlay-hint-settings.js';
import { sharedInboundSnapshot } from './reqlan-inbound-snapshot.js';
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

/** Test helper map keyed by `${documentUri}#${ideaName}`. */
export type InboundReferencerIndex = Map<string, InboundReferencer[]>;

export function declarationInboundKey(
    _services: ReqlanServices,
    declaration: ReferencedDeclaration
): string {
    const document = AstUtils.getDocument(declaration);
    return `${document.uri.toString()}#${declaration.name}`;
}

/**
 * Empty stub — open-file inbound uses {@link sharedInboundSnapshot}.
 * Tests may still inject a map via {@link lookupInboundReferencers}.
 */
export function buildInboundReferencerIndex(_services: ReqlanServices): InboundReferencerIndex {
    return new Map();
}

export function lookupInboundReferencers(
    index: InboundReferencerIndex,
    services: ReqlanServices,
    declaration: ReferencedDeclaration
): InboundReferencer[] {
    const fromSnapshot = sharedInboundSnapshot.referencersForIdea(
        AstUtils.getDocument(declaration).uri.toString(),
        declaration.name
    );
    if (fromSnapshot.length > 0) {
        return fromSnapshot;
    }
    return index.get(declarationInboundKey(services, declaration)) ?? [];
}

/**
 * Collect inbound idea referencers from the SQLite snapshot for this file.
 */
export function collectInboundReferencers(
    _services: ReqlanServices,
    declaration: ReferencedDeclaration
): InboundReferencer[] {
    return sharedInboundSnapshot.referencersForIdea(
        AstUtils.getDocument(declaration).uri.toString(),
        declaration.name
    );
}

/** @deprecated Use {@link collectInboundReferencers} */
export function collectInboundReferencingNames(
    services: ReqlanServices,
    declaration: ReferencedDeclaration
): string[] {
    return collectInboundReferencers(services, declaration).map(referrer => referrer.name);
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
            value: inlineReferencers[index]!.name,
            location: inlineReferencers[index]!.location,
            tooltip: referencerPartTooltip(inlineReferencers[index]!)
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
