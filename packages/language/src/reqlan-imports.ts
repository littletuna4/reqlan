/**
 * Resolves imported requirement documents from relative paths.
 * Interacts with scope linking and go-to-definition for import paths.
 */
import type { LangiumDocument, LangiumDocuments } from 'langium';
import { UriUtils } from 'langium';

export function findImportedDocument(
    path: string,
    document: LangiumDocument,
    documents: LangiumDocuments
): LangiumDocument | undefined {
    const uri = UriUtils.resolvePath(UriUtils.dirname(document.uri), path);
    return documents.getDocument(uri);
}
