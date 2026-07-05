/**
 * Extracts ideas, attributes, and graph edges from parsed reqlan documents.
 */
import { AstUtils, type LangiumDocument } from 'langium';
import {
    findEmbeddedFileReferencesInText,
    isAttribute,
    isBodyLine,
    isBracketReference,
    isIdea,
    isIdeaSet,
    isMarkdownLink,
    isModel,
    isOneLinerIdea,
    isRichTextPart,
    isScalarValue,
    isWikiLink,
    parseMarkdownLink,
    type Attribute,
    type BodyLine,
    type Idea,
    type IdeaDeclaration,
    type Model,
    type OneLinerIdea,
    type ReferenceTarget
} from 'reqlan-language';
import {
    edgeId,
    ideaId,
    type EdgeRecord,
    type IdeaAttributeMap,
    type IdeaKind,
    type IdeaRecord,
    type IndexedDocument
} from '../core/types.js';
import { createHash } from 'node:crypto';

export function extractIndexedDocument(document: LangiumDocument): IndexedDocument | undefined {
    const model = document.parseResult.value;
    if (!isModel(model)) {
        return undefined;
    }
    const fileUri = document.uri.toString();
    const text = document.textDocument.getText();
    const contentHash = hashText(text);
    const ideas: IdeaRecord[] = [];
    const edges: EdgeRecord[] = [];

    for (const element of model.elements) {
        if (isIdea(element)) {
            ideas.push(toIdeaRecord(element, 'block', fileUri, document));
            collectIdeaEdges(element, fileUri, edges);
        } else if (isOneLinerIdea(element)) {
            ideas.push(toIdeaRecord(element, 'oneliner', fileUri, document));
            collectIdeaEdges(element, fileUri, edges);
        } else if (isIdeaSet(element)) {
            ideas.push(toIdeasetRecord(element, fileUri, document));
            for (const member of element.members) {
                const memberRef = member.ref;
                if (!memberRef) {
                    continue;
                }
                const sourceId = ideaId(fileUri, element.name);
                const targetId = ideaId(fileUri, memberRef.name);
                edges.push({
                    id: edgeId(sourceId, 'ideaset_member', targetId),
                    sourceId,
                    targetId,
                    kind: 'ideaset_member'
                });
            }
        }
    }

    for (const edge of collectReferenceEdges(model, fileUri)) {
        edges.push(edge);
    }
    for (const edge of collectFileReferenceEdges(text, fileUri, ideas)) {
        edges.push(edge);
    }

    return { fileUri, contentHash, ideas, edges };
}

function toIdeaRecord(
    idea: IdeaDeclaration,
    kind: IdeaKind,
    fileUri: string,
    document: LangiumDocument
): IdeaRecord {
    const range = idea.$cstNode?.range;
    const attributes = collectAttributes(idea);
    return {
        id: ideaId(fileUri, idea.name),
        name: idea.name,
        kind,
        fileUri,
        lineStart: range?.start.line ?? 0,
        lineEnd: range?.end.line ?? 0,
        summary: summarizeIdea(idea),
        attributesJson: JSON.stringify(attributes),
        contentHash: ''
    };
}

function toIdeasetRecord(
    ideaset: { name: string; $cstNode?: { range?: { start: { line: number }; end: { line: number } } } },
    fileUri: string,
    _document: LangiumDocument
): IdeaRecord {
    const range = ideaset.$cstNode?.range;
    return {
        id: ideaId(fileUri, ideaset.name),
        name: ideaset.name,
        kind: 'ideaset',
        fileUri,
        lineStart: range?.start.line ?? 0,
        lineEnd: range?.end.line ?? 0,
        summary: `Ideaset (${ideaset.name})`,
        attributesJson: '{}',
        contentHash: ''
    };
}

function collectAttributes(idea: IdeaDeclaration): IdeaAttributeMap {
    const attributes: IdeaAttributeMap = {};
    if (!isIdea(idea)) {
        return attributes;
    }
    for (const element of idea.elements) {
        if (!isAttribute(element)) {
            continue;
        }
        attributes[element.name] = attributeValue(element);
        if (element.negated) {
            attributes[element.name] = false;
        }
    }
    return attributes;
}

function attributeValue(attribute: Attribute): string | string[] | boolean {
    if (!attribute.value) {
        return true;
    }
    if (isScalarValue(attribute.value)) {
        return attribute.value.parts
            .map(part => typeof part === 'string' ? part : '')
            .join('')
            .trim();
    }
    return true;
}

function summarizeOneLinerPart(part: OneLinerIdea['body']['content'][number]): string {
    if (typeof part === 'string') {
        return part;
    }
    if (isMarkdownLink(part)) {
        return parseMarkdownLink(part.raw)?.label ?? part.raw;
    }
    if (isWikiLink(part) || isBracketReference(part)) {
        return '[ref]';
    }
    return '';
}

function summarizeRichTextPart(part: BodyLine['parts'][number]): string {
    if (typeof part === 'string') {
        return part;
    }
    if (isRichTextPart(part) && part.$type === 'RichTextPart') {
        return part.text ?? part.inlineCode ?? part.punct ?? part.lparen ?? part.rparen ?? '';
    }
    if (isMarkdownLink(part)) {
        return parseMarkdownLink(part.raw)?.label ?? part.raw;
    }
    if (isWikiLink(part) || isBracketReference(part)) {
        return '[ref]';
    }
    return '';
}

function summarizeOneLinerBody(idea: OneLinerIdea): string {
    return idea.body.content
        .map(summarizeOneLinerPart)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function joinRichTextParts(parts: BodyLine['parts']): string {
    return parts
        .map(summarizeRichTextPart)
        .filter(part => part.length > 0)
        .join(' ')
        .replace(/\s+([.,!?;:])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function summarizeBlockIdeaBody(idea: Idea): string {
    const lines: string[] = [];
    for (const element of idea.elements) {
        if (!isBodyLine(element)) {
            continue;
        }
        const line = joinRichTextParts(element.parts);
        if (line) {
            lines.push(line);
        }
    }
    return lines.join('\n');
}

function summarizeIdea(idea: IdeaDeclaration): string {
    if (isOneLinerIdea(idea)) {
        return summarizeOneLinerBody(idea);
    }
    if (isIdea(idea)) {
        return summarizeBlockIdeaBody(idea);
    }
    return '';
}

function collectIdeaEdges(idea: IdeaDeclaration, fileUri: string, edges: EdgeRecord[]): void {
    const sourceId = ideaId(fileUri, idea.name);
    for (const node of AstUtils.streamAst(idea)) {
        if (isWikiLink(node) || isBracketReference(node)) {
            const edge = referenceToEdge(sourceId, node.target, fileUri);
            if (edge) {
                edges.push(edge);
            }
        }
        if (isMarkdownLink(node)) {
            const target = parseMarkdownLink(node.raw)?.target;
            if (target) {
                edges.push({
                    id: edgeId(sourceId, 'file_reference', target),
                    sourceId,
                    targetFile: target,
                    kind: 'file_reference',
                    label: target
                });
            }
        }
    }
}

function collectReferenceEdges(model: Model, fileUri: string): EdgeRecord[] {
    const edges: EdgeRecord[] = [];
    for (const node of AstUtils.streamAst(model)) {
        if (!isWikiLink(node) && !isBracketReference(node)) {
            continue;
        }
        const container = node.$container;
        let sourceName: string | undefined;
        if (container && (isIdea(container) || isOneLinerIdea(container))) {
            sourceName = container.name;
        }
        if (!sourceName) {
            continue;
        }
        const edge = referenceToEdge(ideaId(fileUri, sourceName), node.target, fileUri);
        if (edge) {
            edges.push(edge);
        }
    }
    return edges;
}

function referenceToEdge(sourceId: string, target: ReferenceTarget, fileUri: string): EdgeRecord | undefined {
    const ideaRef = 'idea' in target ? target.idea : undefined;
    if (ideaRef?.ref) {
        const targetFileUri = AstUtils.getDocument(ideaRef.ref).uri.toString();
        const targetId = ideaId(targetFileUri, ideaRef.ref.name);
        return {
            id: edgeId(sourceId, 'references', targetId),
            sourceId,
            targetId,
            kind: 'references',
            label: ideaRef.ref.name
        };
    }
    if ('file' in target && typeof target.file === 'string') {
        return {
            id: edgeId(sourceId, 'file_reference', target.file),
            sourceId,
            targetFile: target.file,
            kind: 'file_reference',
            label: target.file
        };
    }
    return undefined;
}

function collectFileReferenceEdges(text: string, fileUri: string, ideas: IdeaRecord[]): EdgeRecord[] {
    const edges: EdgeRecord[] = [];
    const sourceId = ideas[0]?.id ?? `${fileUri}#__file__`;
    for (const ref of findEmbeddedFileReferencesInText(text)) {
        edges.push({
            id: edgeId(sourceId, 'file_reference', ref.file),
            sourceId,
            targetFile: ref.file,
            kind: 'file_reference',
            label: ref.file
        });
    }
    return edges;
}

function hashText(text: string): string {
    return createHash('sha256').update(text).digest('hex').slice(0, 16);
}
