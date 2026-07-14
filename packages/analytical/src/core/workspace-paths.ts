/**
 * Normalize file paths and idea ids relative to the workspace root.
 */
import { URI } from 'langium';
import { isAbsolute, relative, resolve } from 'node:path';
import { edgeId, ideaId, type IndexedDocument } from './types.js';

function normalizeSlashes(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

function relativeWindowsDrivePath(filePath: string, workspaceRoot: string): string | undefined {
    const normalizedFile = normalizeSlashes(filePath);
    const normalizedRoot = normalizeSlashes(workspaceRoot).replace(/\/+$/, '');

    const fileMatch = normalizedFile.match(/^([A-Za-z]:)(\/.*)?$/);
    const rootMatch = normalizedRoot.match(/^([A-Za-z]:)(\/.*)?$/);
    if (!fileMatch || !rootMatch || fileMatch[1].toLowerCase() !== rootMatch[1].toLowerCase()) {
        return undefined;
    }

    const fileRest = (fileMatch[2] ?? '').replace(/^\/+/, '');
    const rootRest = (rootMatch[2] ?? '').replace(/^\/+/, '');
    if (fileRest === rootRest) {
        return '';
    }
    const rootPrefix = rootRest ? `${rootRest}/` : '';
    if (!rootRest || fileRest.startsWith(rootPrefix)) {
        return rootRest ? fileRest.slice(rootPrefix.length) : fileRest;
    }
    return undefined;
}

export function toWorkspaceRelativePath(fileUri: string, workspaceRoot: string): string {
    if (!workspaceRoot) {
        return normalizeSlashes(fileUri);
    }

    const filePath = fileUri.startsWith('file://') ? URI.parse(fileUri).fsPath : fileUri;
    const driveRelative = relativeWindowsDrivePath(filePath, workspaceRoot);
    if (driveRelative !== undefined) {
        return driveRelative;
    }

    if (!isAbsolute(filePath)) {
        return normalizeSlashes(filePath);
    }

    const rel = relative(workspaceRoot, filePath);
    if (rel.startsWith('..')) {
        return normalizeSlashes(fileUri);
    }
    return normalizeSlashes(rel);
}

export function resolveWorkspaceFileUri(relativeOrAbsolute: string, workspaceRoot?: string): string {
    if (relativeOrAbsolute.startsWith('file://')) {
        return relativeOrAbsolute;
    }
    if (workspaceRoot) {
        const absolute = resolve(workspaceRoot, relativeOrAbsolute);
        return URI.file(absolute).toString();
    }
    if (relativeOrAbsolute.startsWith('/')) {
        return URI.file(relativeOrAbsolute).toString();
    }
    return relativeOrAbsolute;
}

function relativeIdeaId(sourceId: string, workspaceRoot: string): string {
    const separator = sourceId.lastIndexOf('#');
    if (separator < 0) {
        return sourceId;
    }
    const fileUri = toWorkspaceRelativePath(sourceId.slice(0, separator), workspaceRoot);
    const name = sourceId.slice(separator + 1);
    return ideaId(fileUri, name);
}

export function normalizeIndexedDocument(document: IndexedDocument, workspaceRoot: string): IndexedDocument {
    const fileUri = toWorkspaceRelativePath(document.fileUri, workspaceRoot);
    const ideas = document.ideas.map(idea => {
        const relativeUri = toWorkspaceRelativePath(idea.fileUri, workspaceRoot);
        return {
            ...idea,
            fileUri: relativeUri,
            id: ideaId(relativeUri, idea.name)
        };
    });
    const edges = document.edges.map(edge => {
        const sourceId = relativeIdeaId(edge.sourceId, workspaceRoot);
        const targetId = edge.targetId ? relativeIdeaId(edge.targetId, workspaceRoot) : undefined;
        const targetKey = targetId ?? edge.targetFile ?? edge.label ?? '?';
        return {
            ...edge,
            sourceId,
            targetId,
            id: edgeId(sourceId, edge.kind, targetKey)
        };
    });
    return { fileUri, contentHash: document.contentHash, ideas, edges };
}
