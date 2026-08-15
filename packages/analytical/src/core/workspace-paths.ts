/**
 * Normalize file paths and idea ids relative to the workspace root.
 */
import { fileUriFromFsPath, isWindowsAbsolutePath } from '@reqlan/language';
import { resolve } from 'node:path';
import { edgeId, ideaId, type IndexedDocument } from './types.js';
import { toWorkspaceRelativePath } from './path-relative.js';

export { relativeWindowsDrivePath, toWorkspaceRelativePath } from './path-relative.js';

export function resolveWorkspaceFileUri(relativeOrAbsolute: string, workspaceRoot?: string): string {
    if (relativeOrAbsolute.startsWith('file://')) {
        return relativeOrAbsolute;
    }
    if (isWindowsAbsolutePath(relativeOrAbsolute)) {
        return fileUriFromFsPath(relativeOrAbsolute).toString();
    }
    if (workspaceRoot) {
        const absolute = resolve(workspaceRoot, relativeOrAbsolute);
        return fileUriFromFsPath(absolute).toString();
    }
    if (relativeOrAbsolute.startsWith('/')) {
        return fileUriFromFsPath(relativeOrAbsolute).toString();
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
