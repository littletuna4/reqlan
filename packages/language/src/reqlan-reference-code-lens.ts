/**
 * Classification labels and summary stats for reference CodeLens buttons.
 * Click opens a reference card; navigation stays on document links / go-to-definition.
 */
import { AstUtils, GrammarUtils, URI, type AstNode } from 'langium';
import { Command, type CodeLens, type Range } from 'vscode-languageserver';
import { statSync } from 'node:fs';
import {
    isBracketReference,
    isFileReference,
    isFileSymbolReference,
    isIdea,
    isIdeaSet,
    isLocalReference,
    isOneLinerIdea,
    isQualifiedReference,
    isWikiLink,
    type IdeaDeclaration,
    type IdeaSet
} from './generated/ast.js';
import {
    collectInboundReferencers,
    type ReferencedDeclaration
} from './reqlan-inbound-reference-inlay-label.js';
import {
    listFolderFileNames,
    resolveFileReferenceLink,
    type ResolvedFileLink
} from './reqlan-file-link-resolver.js';
import {
    isNamespaceImportOnlyReference,
    resolveNamespaceImportReferenceLink
} from './reqlan-namespace-import-links.js';
import { pathResolveContextFromServices } from './reqlan-path-resolve.js';
import { referenceIdea } from './reqlan-references.js';
import { summarizeIdeaDeclaration, truncateSummary } from './reqlan-idea-summary.js';
import {
    REQLAN_OPEN_REFERENCE_CODE_LENS_COMMAND,
    type ReferenceCodeLensPayload
} from './reqlan-code-lens-settings.js';
import type { ReqlanServices } from './reqlan-module.js';

export type ReferenceCodeLensClassification =
    | { kind: 'idea'; declaration: ReferencedDeclaration }
    | { kind: 'reqlan-file'; link: ResolvedFileLink }
    | { kind: 'file'; link: ResolvedFileLink; extension: string }
    | { kind: 'folder'; link: ResolvedFileLink };

export function classifyReferenceForCodeLens(
    services: ReqlanServices,
    node: AstNode
): ReferenceCodeLensClassification | undefined {
    if (!isBracketReference(node) && !isWikiLink(node)) {
        return undefined;
    }
    const target = node.target;
    if (isLocalReference(target) || isQualifiedReference(target)) {
        if (isNamespaceImportOnlyReference(target)) {
            const link = resolveNamespaceImportReferenceLink(
                target,
                services.shared.workspace.LangiumDocuments,
                services.shared.workspace.FileSystemProvider,
                pathResolveContextFromServices(services)
            );
            return classifyResolvedFileLink(link);
        }
        const ideaRef = referenceIdea(target);
        if (ideaRef?.ref) {
            return { kind: 'idea', declaration: ideaRef.ref };
        }
        if (isQualifiedReference(target) && target.ideaset?.ref) {
            return { kind: 'idea', declaration: target.ideaset.ref };
        }
        return undefined;
    }
    if (isFileReference(target) || isFileSymbolReference(target)) {
        const link = resolveFileReferenceLink(
            target,
            services.shared.workspace.LangiumDocuments,
            services.shared.workspace.FileSystemProvider,
            pathResolveContextFromServices(services)
        );
        if (isFileSymbolReference(target) && target.symbols.length > 0) {
            const idea = resolveFileSymbolIdea(services, link, target.symbols[0]!);
            if (idea) {
                return { kind: 'idea', declaration: idea };
            }
        }
        return classifyResolvedFileLink(link);
    }
    return undefined;
}

function classifyResolvedFileLink(link: ResolvedFileLink | undefined): ReferenceCodeLensClassification | undefined {
    if (!link || link.resolution === 'missing') {
        return undefined;
    }
    if (link.resolution === 'folder') {
        return { kind: 'folder', link };
    }
    const extension = fileExtension(link.targetUri);
    if (!extension || extension === 'rq') {
        return { kind: 'reqlan-file', link };
    }
    return { kind: 'file', link, extension };
}

function resolveFileSymbolIdea(
    services: ReqlanServices,
    link: ResolvedFileLink | undefined,
    symbolName: string
): IdeaDeclaration | IdeaSet | undefined {
    if (!link || link.resolution !== 'file') {
        return undefined;
    }
    const targetDocument = services.shared.workspace.LangiumDocuments.getDocument(URI.parse(link.targetUri));
    if (!targetDocument) {
        return undefined;
    }
    for (const candidate of AstUtils.streamAst(targetDocument.parseResult.value)) {
        if ((isIdea(candidate) || isOneLinerIdea(candidate) || isIdeaSet(candidate)) && candidate.name === symbolName) {
            return candidate;
        }
    }
    return undefined;
}

export function referenceCodeLensTitle(classification: ReferenceCodeLensClassification): string {
    switch (classification.kind) {
        case 'idea':
            return 'open idea';
        case 'reqlan-file':
            return 'open reqlan file';
        case 'file':
            return `open ${classification.extension} file`;
        case 'folder':
            return 'open folder';
    }
}

export function buildReferenceCodeLens(
    services: ReqlanServices,
    node: AstNode,
    classification: ReferenceCodeLensClassification
): CodeLens | undefined {
    const range = codeLensRange(node);
    if (!range) {
        return undefined;
    }
    const payload = payloadForClassification(services, classification);
    if (!payload) {
        return undefined;
    }
    const title = payload.classification;
    const tooltip = payload.stats.length > 0
        ? `${payload.displayName} · ${payload.stats.join(' · ')}`
        : payload.displayName;
    const command = Command.create(title, REQLAN_OPEN_REFERENCE_CODE_LENS_COMMAND, payload);
    command.tooltip = tooltip;
    return { range, command };
}

export function buildReferenceCodeLensStats(
    services: ReqlanServices,
    classification: ReferenceCodeLensClassification
): string[] {
    const parts: string[] = [];
    if (classification.kind === 'idea') {
        const referencers = collectInboundReferencers(services, classification.declaration).length;
        const references = countOutboundReferences(classification.declaration);
        parts.push(`${referencers} referencer${referencers === 1 ? '' : 's'}`);
        parts.push(`${references} reference${references === 1 ? '' : 's'}`);
        const edited = fileLastEditedLabel(AstUtils.getDocument(classification.declaration).uri.toString());
        if (edited) {
            parts.push(`last edited ${edited}`);
        }
        return parts;
    }
    if (classification.kind === 'folder') {
        const files = classification.link.folderFiles
            ?? listFolderFileNames(
                services.shared.workspace.FileSystemProvider,
                URI.parse(classification.link.targetUri)
            );
        parts.push(`${files.length} file${files.length === 1 ? '' : 's'}`);
        return parts;
    }
    const edited = fileLastEditedLabel(classification.link.targetUri);
    if (edited) {
        parts.push(`last edited ${edited}`);
    }
    if (classification.kind === 'reqlan-file') {
        const targetDocument = services.shared.workspace.LangiumDocuments.getDocument(
            URI.parse(classification.link.targetUri)
        );
        if (targetDocument) {
            let ideaCount = 0;
            for (const candidate of AstUtils.streamAst(targetDocument.parseResult.value)) {
                if (isIdea(candidate) || isOneLinerIdea(candidate) || isIdeaSet(candidate)) {
                    ideaCount++;
                }
            }
            parts.push(`${ideaCount} idea${ideaCount === 1 ? '' : 's'}`);
        }
    }
    return parts;
}

/** @deprecated Prefer {@link buildReferenceCodeLensStats} — kept for existing tests. */
export function buildReferenceCodeLensTooltip(
    services: ReqlanServices,
    classification: ReferenceCodeLensClassification
): string | undefined {
    const parts = buildReferenceCodeLensStats(services, classification);
    return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function countOutboundReferences(declaration: ReferencedDeclaration): number {
    let count = 0;
    for (const node of AstUtils.streamAst(declaration)) {
        if (isBracketReference(node) || isWikiLink(node)) {
            count++;
        }
    }
    return count;
}

export function fileExtension(targetUri: string): string | undefined {
    const path = URI.parse(targetUri).path;
    const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    const base = slash >= 0 ? path.slice(slash + 1) : path;
    const dot = base.lastIndexOf('.');
    if (dot <= 0 || dot === base.length - 1) {
        return undefined;
    }
    return base.slice(dot + 1).toLowerCase();
}

export function fileLastEditedLabel(targetUri: string): string | undefined {
    try {
        const uri = URI.parse(targetUri);
        if (uri.scheme !== 'file') {
            return undefined;
        }
        const mtime = statSync(uri.fsPath).mtime;
        return mtime.toISOString().slice(0, 10);
    } catch {
        return undefined;
    }
}

function displayNameForUri(targetUri: string): string {
    const path = URI.parse(targetUri).path;
    const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return slash >= 0 ? path.slice(slash + 1) : path;
}

function payloadForClassification(
    services: ReqlanServices,
    classification: ReferenceCodeLensClassification
): ReferenceCodeLensPayload | undefined {
    const classificationLabel = referenceCodeLensTitle(classification);
    const stats = buildReferenceCodeLensStats(services, classification);

    if (classification.kind === 'idea') {
        const declaration = classification.declaration;
        const nameNode = GrammarUtils.findNodeForProperty(declaration.$cstNode, 'name');
        const document = AstUtils.getDocument(declaration);
        const summary = isIdea(declaration) || isOneLinerIdea(declaration)
            ? truncateSummary(summarizeIdeaDeclaration(declaration), 240)
            : undefined;
        return {
            kind: 'idea',
            classification: classificationLabel,
            displayName: declaration.name,
            targetUri: document.uri.toString(),
            line: nameNode?.range.start.line ?? 0,
            character: nameNode?.range.start.character ?? 0,
            summary: summary || undefined,
            stats
        };
    }

    const link = classification.link;
    const displayName = displayNameForUri(link.targetUri);
    if (classification.kind === 'folder') {
        const folderFiles = link.folderFiles
            ?? listFolderFileNames(
                services.shared.workspace.FileSystemProvider,
                URI.parse(link.targetUri)
            );
        return {
            kind: 'folder',
            classification: classificationLabel,
            displayName,
            targetUri: link.targetUri,
            folderFiles,
            summary: folderFiles.slice(0, 8).join(', ') + (folderFiles.length > 8 ? '…' : ''),
            stats
        };
    }
    return {
        kind: classification.kind === 'reqlan-file' ? 'reqlan-file' : 'file',
        classification: classificationLabel,
        displayName,
        targetUri: link.targetUri,
        line: link.targetRange?.start.line ?? 0,
        character: link.targetRange?.start.character ?? 0,
        extension: classification.kind === 'file' ? classification.extension : undefined,
        stats
    };
}

function codeLensRange(node: AstNode): Range | undefined {
    const cst = node.$cstNode;
    if (!cst) {
        return undefined;
    }
    return {
        start: { line: cst.range.start.line, character: 0 },
        end: cst.range.end
    };
}
