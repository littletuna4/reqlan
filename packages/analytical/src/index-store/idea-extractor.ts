/**
 * Extracts ideas, attributes, and graph edges from parsed reqlan documents.
 */
import { AstUtils, type LangiumDocument } from 'langium';
import {
    findEmbeddedFileReferencesInText,
    findNamespaceImportByAlias,
    importPathOf,
    isAttribute,
    isBracketReference,
    isIdea,
    isIdeaSet,
    isLocalReference,
    isMarkdownLink,
    isModel,
    isNamespaceImportOnlyReference,
    isOneLinerIdea,
    isQualifiedReference,
    isBlockValue,
    isListValue,
    isScalarValue,
    isWikiLink,
    namespaceImportBindingName,
    parseMarkdownLink,
    summarizeIdeaDeclaration,
    unquoteReqlanString,
    type Attribute,
    type IdeaDeclaration,
    type Model,
    type ReferenceTarget
} from '@reqlan/language';
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
        summary: summarizeIdeaDeclaration(idea),
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
        return normalizeAttributeText(attribute.value.$cstNode?.text)
            || inlinePartsText(attribute.value.parts);
    }
    if (isListValue(attribute.value)) {
        return attribute.value.items
            .map(item => normalizeAttributeText(item.$cstNode?.text))
            .filter((item): item is string => Boolean(item));
    }
    if (isBlockValue(attribute.value)) {
        const raw = attribute.value.$cstNode?.text ?? '';
        const inner = raw.replace(/^\{\s*/, '').replace(/\s*\}$/, '').trim();
        return inner.replace(/\r\n/g, '\n');
    }
    return true;
}

/** Prefer source text; fall back to AST part fields for scalar-like nodes. */
function inlinePartsText(parts: ReadonlyArray<unknown>): string {
    return parts
        .map(part => {
            if (typeof part === 'string') {
                return part;
            }
            if (!part || typeof part !== 'object') {
                return '';
            }
            const node = part as {
                text?: string;
                inlineCode?: string;
                $cstNode?: { text?: string };
            };
            if (typeof node.text === 'string' && node.text.length > 0) {
                return node.text;
            }
            if (typeof node.inlineCode === 'string' && node.inlineCode.length > 0) {
                return node.inlineCode;
            }
            return node.$cstNode?.text ?? '';
        })
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeAttributeText(text: string | undefined): string {
    return text?.replace(/\s+/g, ' ').trim() ?? '';
}

function collectIdeaEdges(idea: IdeaDeclaration, fileUri: string, edges: EdgeRecord[]): void {
    const sourceId = ideaId(fileUri, idea.name);
    for (const node of AstUtils.streamAst(idea)) {
        if (isWikiLink(node) || isBracketReference(node)) {
            const edge = referenceToEdge(sourceId, node.target, fileUri, node);
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
                    label: target,
                    ...edgeMetaFromNode(node),
                    isResolved: true
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
        const owningIdea = AstUtils.getContainerOfType(node, (candidate): candidate is IdeaDeclaration =>
            isIdea(candidate) || isOneLinerIdea(candidate)
        );
        if (!owningIdea) {
            continue;
        }
        const edge = referenceToEdge(ideaId(fileUri, owningIdea.name), node.target, fileUri, node);
        if (edge) {
            edges.push(edge);
        }
    }
    return edges;
}

function edgeMetaFromNode(node: {
    $cstNode?: { range?: { start: { line: number } }; text?: string };
}): Pick<EdgeRecord, 'sourceLine' | 'snippet'> {
    const line = node.$cstNode?.range?.start.line;
    const raw = node.$cstNode?.text ?? '';
    const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 120);
    return {
        sourceLine: line !== undefined ? line + 1 : undefined,
        snippet: snippet || undefined
    };
}

function unresolvedIdeaName(target: ReferenceTarget): string | undefined {
    if (!('idea' in target) || !target.idea || typeof target.idea !== 'object') {
        return undefined;
    }
    const idea = target.idea as { ref?: unknown; $refText?: string; name?: string };
    if (idea.ref) {
        return undefined;
    }
    return idea.$refText ?? idea.name;
}

/**
 * Bare `[alias]` refs to namespace imports target the imported file (same as the editor),
 * not an idea — emit a file_reference edge using the shared namespace-import classifier.
 */
function namespaceAliasFileEdge(
    sourceId: string,
    target: ReferenceTarget,
    meta: Pick<EdgeRecord, 'sourceLine' | 'snippet'>
): EdgeRecord | undefined {
    if (!isLocalReference(target) && !isQualifiedReference(target)) {
        return undefined;
    }
    if (!isNamespaceImportOnlyReference(target)) {
        return undefined;
    }
    const document = AstUtils.getDocument(target);
    const model = document.parseResult.value;
    if (!isModel(model)) {
        return undefined;
    }
    const bindingName = isQualifiedReference(target)
        ? target.qualifier?.$refText
        : namespaceImportBindingName(target);
    if (!bindingName) {
        return undefined;
    }
    const importDecl = isQualifiedReference(target)
        ? target.qualifier?.ref
        : findNamespaceImportByAlias(model.imports, bindingName);
    const rawPath = importDecl ? importPathOf(importDecl) : undefined;
    if (!rawPath) {
        return undefined;
    }
    const targetFile = unquoteReqlanString(rawPath);
    return {
        id: edgeId(sourceId, 'file_reference', targetFile),
        sourceId,
        targetFile,
        kind: 'file_reference',
        label: bindingName,
        ...meta,
        isResolved: true
    };
}

function referenceToEdge(
    sourceId: string,
    target: ReferenceTarget,
    fileUri: string,
    sourceNode?: { $cstNode?: { range?: { start: { line: number } }; text?: string } }
): EdgeRecord | undefined {
    const meta = sourceNode ? edgeMetaFromNode(sourceNode) : {};
    const ideaRef = 'idea' in target ? target.idea : undefined;
    if (ideaRef && typeof ideaRef === 'object' && 'ref' in ideaRef && ideaRef.ref) {
        const targetFileUri = AstUtils.getDocument(ideaRef.ref).uri.toString();
        const targetId = ideaId(targetFileUri, ideaRef.ref.name);
        return {
            id: edgeId(sourceId, 'references', targetId),
            sourceId,
            targetId,
            kind: 'references',
            label: ideaRef.ref.name,
            ...meta,
            isResolved: true
        };
    }
    const namespaceFile = namespaceAliasFileEdge(sourceId, target, meta);
    if (namespaceFile) {
        return namespaceFile;
    }
    const unresolved = unresolvedIdeaName(target);
    if (unresolved) {
        return {
            id: edgeId(sourceId, 'references', `unresolved:${unresolved}`),
            sourceId,
            kind: 'references',
            label: unresolved,
            ...meta,
            isResolved: false
        };
    }
    if ('file' in target && typeof target.file === 'string') {
        return {
            id: edgeId(sourceId, 'file_reference', target.file),
            sourceId,
            targetFile: target.file,
            kind: 'file_reference',
            label: target.file,
            ...meta,
            isResolved: true
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
