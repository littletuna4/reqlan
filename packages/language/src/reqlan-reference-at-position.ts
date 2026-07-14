/**
 * Locates file path references at a cursor position and resolves them to files, folders, or missing paths.
 */
import type { CstNode, FileSystemProvider, LangiumDocument, LangiumDocuments } from 'langium';
import { CstUtils, GrammarUtils } from 'langium';
import type { Position, LocationLink } from 'vscode-languageserver';
import {
    findCommentReferencePartAt,
    resolveCommentDefinitionLinks,
    resolveFileUri
} from './reqlan-comment-resolver.js';
import { findEmbeddedFileReferenceAt } from './reqlan-embedded-file-references.js';
import {
    classifyReferenceUri,
    listFolderFileNames,
    resolveEmbeddedFileReferenceLink,
    resolveFileReferenceLink,
    type ReferenceResolution,
    type ResolvedFileLink
} from './reqlan-file-link-resolver.js';
import {
    isFileReference,
    isFileSymbolReference,
    type FileReference,
    type FileSymbolReference
} from './generated/ast.js';
import type { PathResolveContext } from './reqlan-path-resolve.js';

export const REQLAN_OPEN_FOLDER_COMMAND = 'reqlan.openFolderReference';
export const REQLAN_FILE_REFERENCE_AT_REQUEST = 'reqlan/fileReferenceAt';
export const REQLAN_COMMENT_DEFINITION_REQUEST = 'reqlan/commentDefinition';

export function folderReferenceCommandTarget(folderUri: string): string {
    return `command:${REQLAN_OPEN_FOLDER_COMMAND}?${encodeURIComponent(JSON.stringify([folderUri]))}`;
}

export function findFileReferenceAtPosition(
    document: LangiumDocument,
    position: Position,
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider,
    context?: PathResolveContext
): ResolvedFileLink | undefined {
    const pathContext = { ...context, fileSystem: context?.fileSystem ?? fileSystem };
    const commentPart = findCommentReferencePartAt(document, position);
    if (commentPart?.property === 'path' && commentPart.reference.path) {
        return resolvePathReference(
            document,
            commentPart.reference.path,
            commentPart.reference.range,
            documents,
            fileSystem,
            pathContext
        );
    }
    const embeddedReference = findEmbeddedFileReferenceAt(document, position);
    if (embeddedReference) {
        return resolveEmbeddedFileReferenceLink(embeddedReference, document, documents, fileSystem, pathContext);
    }
    const fileReference = findFileReferenceNodeAtPosition(document, position);
    if (fileReference) {
        return resolveFileReferenceLink(fileReference.node, documents, fileSystem, pathContext);
    }
    return undefined;
}

function resolvePathReference(
    document: LangiumDocument,
    path: string,
    sourceRange: ResolvedFileLink['sourceRange'],
    documents: LangiumDocuments,
    fileSystem: FileSystemProvider,
    context?: PathResolveContext
): ResolvedFileLink | undefined {
    const targetUri = resolveFileUri(path, document, context);
    const resolution = classifyReferenceUri(targetUri, documents, fileSystem);
    if (resolution === 'missing') {
        return undefined;
    }
    if (resolution === 'folder') {
        return {
            sourceRange,
            targetUri: targetUri.toString(),
            resolution,
            folderFiles: listFolderFileNames(fileSystem, targetUri)
        };
    }
    const targetDocument = documents.getDocument(targetUri);
    const target = targetDocument?.parseResult.value.$cstNode;
    if (!targetDocument || !target) {
        return undefined;
    }
    return {
        sourceRange,
        targetUri: targetDocument.textDocument.uri,
        targetRange: target.range,
        resolution: 'file'
    };
}

function findFileReferenceNodeAtPosition(
    document: LangiumDocument,
    position: Position
): { node: FileReference | FileSymbolReference; pathNode: CstNode } | undefined {
    const root = document.parseResult.value.$cstNode;
    if (!root) {
        return undefined;
    }
    const offset = document.textDocument.offsetAt(position);
    let current: CstNode | undefined = CstUtils.findLeafNodeAtOffset(root, offset);
    while (current) {
        const assignment = GrammarUtils.findAssignment(current);
        const container = current.astNode;
        if ((isFileReference(container) || isFileSymbolReference(container)) && assignment?.feature === 'file') {
            const pathNode = GrammarUtils.findNodeForProperty(container.$cstNode, 'file');
            if (pathNode) {
                return { node: container, pathNode };
            }
        }
        current = current.container;
    }
    return undefined;
}

export interface FileReferenceAtRequestResult {
    sourceRange: ResolvedFileLink['sourceRange'];
    targetUri: string;
    resolution: ReferenceResolution;
    folderFiles?: string[];
}

export function findCommentDefinitionAtPosition(
    document: LangiumDocument,
    position: Position,
    documents: LangiumDocuments,
    context?: PathResolveContext
): LocationLink[] | undefined {
    const commentPart = findCommentReferencePartAt(document, position);
    if (commentPart?.property !== 'idea') {
        return undefined;
    }
    return resolveCommentDefinitionLinks(commentPart.reference, document, documents, context);
}

export function fileReferenceAtRequestResult(
    link: ResolvedFileLink
): FileReferenceAtRequestResult {
    return {
        sourceRange: link.sourceRange,
        targetUri: link.targetUri,
        resolution: link.resolution ?? 'file',
        folderFiles: link.folderFiles
    };
}
