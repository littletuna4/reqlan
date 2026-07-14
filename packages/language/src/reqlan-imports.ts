/**
 * Resolves imported requirement documents from relative and import-root-aliased paths.
 * Interacts with scope linking and go-to-definition for import paths.
 */
import type { FileSystemProvider, LangiumDocument, LangiumDocuments } from 'langium';
import {
    resolveDocumentPathUri,
    type PathResolveContext
} from './reqlan-path-resolve.js';

export type { PathResolveContext };

export function resolveImportUri(
    path: string,
    document: LangiumDocument,
    context?: PathResolveContext
) {
    return resolveDocumentPathUri(path, document, context);
}

export function isResolvableImportPath(
    path: string,
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem?: FileSystemProvider,
    context?: PathResolveContext
): boolean {
    const uri = resolveImportUri(path, document, withFileSystem(context, fileSystem));
    if (documents.getDocument(uri)) {
        return true;
    }
    if (!fileSystem?.existsSync(uri)) {
        return false;
    }
    return !fileSystem.statSync(uri).isDirectory;
}

export function findImportedDocument(
    path: string,
    document: LangiumDocument,
    documents: LangiumDocuments,
    context?: PathResolveContext
): LangiumDocument | undefined {
    return documents.getDocument(resolveImportUri(path, document, context));
}

function withFileSystem(
    context: PathResolveContext | undefined,
    fileSystem: FileSystemProvider | undefined
): PathResolveContext | undefined {
    if (!fileSystem && !context) {
        return undefined;
    }
    return { ...context, fileSystem: fileSystem ?? context?.fileSystem };
}
