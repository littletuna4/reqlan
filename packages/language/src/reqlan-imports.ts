/**
 * Resolves imported requirement documents from relative paths.
 * Interacts with scope linking and go-to-definition for import paths.
 */
import type { FileSystemProvider, LangiumDocument, LangiumDocuments } from 'langium';
import { UriUtils } from 'langium';

export function resolveImportUri(path: string, document: LangiumDocument) {
    return UriUtils.resolvePath(UriUtils.dirname(document.uri), path);
}

export function isResolvableImportPath(
    path: string,
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem?: FileSystemProvider
): boolean {
    const uri = resolveImportUri(path, document);
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
    documents: LangiumDocuments
): LangiumDocument | undefined {
    return documents.getDocument(resolveImportUri(path, document));
}
