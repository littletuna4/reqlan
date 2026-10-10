/**
 * Bracket links of the form `[idea.attribute]`.
 * The same dot form still names an ideaset member when the first name is an ideaset.
 * rq:["../../../reqlan rq/language/syntax.rq".attribute_namespacing]
 * rq:["../../../reqlan rq/language/syntax.rq".references_to_subidea]
 */
import { AstUtils, GrammarUtils, type LangiumDocument } from 'langium';
import type { Range } from 'vscode-languageserver';
import {
    isAttribute,
    isIdea,
    isIdeaSet,
    isModel,
    isOneLinerIdea,
    isQualifiedReference,
    type Attribute,
    type Model
} from './generated/ast.js';
import type { ResolvedFileLink } from './reqlan-file-link-resolver.js';

const NAME = /^[_A-Za-z][\w-]*$/;

export function unresolvedAttributeMessage(owner: string, attribute: string): string {
    return `Could not resolve attribute '${attribute}' on idea '${owner}'.`;
}

/** Two identifier segments inside a bracket or wikilink. Quoted paths are not this form. */
export function attributeReferenceParts(text: string | undefined): { owner: string; attribute: string } | undefined {
    if (!text) {
        return undefined;
    }
    let inner = text.trim();
    if (inner.startsWith('[[') && inner.endsWith(']]') && inner.length >= 4) {
        inner = inner.slice(2, -2).trim();
    } else if (inner.startsWith('[') && inner.endsWith(']') && inner.length >= 2) {
        inner = inner.slice(1, -1).trim();
    }
    if (inner.startsWith('"') || inner.startsWith('\'')) {
        return undefined;
    }
    const dot = inner.indexOf('.');
    if (dot <= 0 || inner.indexOf('.', dot + 1) !== -1) {
        return undefined;
    }
    const owner = inner.slice(0, dot).trim();
    const attribute = inner.slice(dot + 1).trim();
    if (!NAME.test(owner) || !NAME.test(attribute)) {
        return undefined;
    }
    return { owner, attribute };
}

function modelOf(document: LangiumDocument): Model | undefined {
    const model = document.parseResult.value;
    return isModel(model) ? model : undefined;
}

/** A block idea or one-liner. An ideaset with the same name is not an attribute host. */
export function ownerIsAttributeHost(model: Model, ownerName: string): boolean {
    if (model.elements.some(element => isIdeaSet(element) && element.name === ownerName)) {
        return false;
    }
    return model.elements.some(element =>
        (isIdea(element) || isOneLinerIdea(element)) && element.name === ownerName
    );
}

/** Direct `@attribute` on a block idea. Ideaset names do not expose attributes. */
export function findDeclaredAttribute(model: Model, ownerName: string, attributeName: string): Attribute | undefined {
    if (model.elements.some(element => isIdeaSet(element) && element.name === ownerName)) {
        return undefined;
    }
    const owner = model.elements.find(element => isIdea(element) && element.name === ownerName);
    if (!isIdea(owner)) {
        return undefined;
    }
    return owner.elements.find((element): element is Attribute =>
        isAttribute(element) && element.name === attributeName
    );
}

export function collectAttributeDocumentLinks(document: LangiumDocument): ResolvedFileLink[] {
    const model = modelOf(document);
    if (!model) {
        return [];
    }
    const links: ResolvedFileLink[] = [];
    for (const node of AstUtils.streamAst(model)) {
        if (!isQualifiedReference(node) || node.path || node.ideaset) {
            continue;
        }
        const ownerName = node.qualifier?.$refText;
        const attributeName = node.idea?.$refText;
        if (!ownerName || !attributeName) {
            continue;
        }
        const attribute = findDeclaredAttribute(model, ownerName, attributeName);
        const sourceNode = node.idea?.$refNode;
        const targetNode = attribute
            ? GrammarUtils.findNodeForProperty(attribute.$cstNode, 'name') ?? attribute.$cstNode
            : undefined;
        if (!attribute || !sourceNode || !targetNode) {
            continue;
        }
        links.push({
            sourceRange: sourceNode.range,
            targetUri: document.uri.toString(),
            targetRange: targetNode.range,
            resolution: 'file'
        });
    }
    return links;
}

export function attributeDefinitionAt(
    document: LangiumDocument,
    offset: number
): { targetUri: string; targetRange?: Range; sourceRange: Range } | undefined {
    for (const link of collectAttributeDocumentLinks(document)) {
        const start = document.textDocument.offsetAt(link.sourceRange.start);
        const end = document.textDocument.offsetAt(link.sourceRange.end);
        if (offset >= start && offset < end) {
            return {
                targetUri: link.targetUri,
                targetRange: link.targetRange,
                sourceRange: link.sourceRange
            };
        }
    }
    return undefined;
}

export function isAttributeShapedSnippet(document: LangiumDocument, snippet: string | undefined, label: string | undefined): boolean {
    const parts = attributeReferenceParts(snippet);
    if (!parts || label !== parts.attribute) {
        return false;
    }
    const model = modelOf(document);
    return model !== undefined && ownerIsAttributeHost(model, parts.owner);
}
