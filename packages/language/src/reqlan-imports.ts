/**
 * Resolves imported requirement documents from relative and import-root-aliased paths.
 * Interacts with scope linking and go-to-definition for import paths.
 * A path that exists as a folder is a valid import target (same as a file).
 * rq:["../../../reqlan rq/ontology.rq".import_statement]
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".implicit_file_extension]
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_folder_targets]
 */
import type { FileSystemProvider, LangiumDocument, LangiumDocuments } from 'langium';
import { URI } from 'langium';
import {
    resolveDocumentPathUri,
    type PathResolveContext
} from './reqlan-path-resolve.js';

export type { PathResolveContext };

export const IMPLICIT_IMPORT_EXTENSION = '.rq';

/**
 * Import paths written without an extension mean `.rq`; the literal path stays a fallback so
 * extensionless files and folders on disk keep resolving.
 */
export function importPathCandidates(path: string): string[] {
    const implicit = importPathWithImplicitExtension(path);
    return implicit ? [implicit, path] : [path];
}

export function importPathWithImplicitExtension(path: string): string | undefined {
    const basename = path.slice(path.lastIndexOf('/') + 1);
    if (basename.length === 0 || basename === '.' || basename === '..') {
        return undefined;
    }
    if (basename.includes('.', 1)) {
        return undefined;
    }
    return `${path}${IMPLICIT_IMPORT_EXTENSION}`;
}

export function resolveImportUri(
    path: string,
    document: LangiumDocument,
    context?: PathResolveContext
) {
    return resolveDocumentPathUri(path, document, context);
}

/** Candidate URIs in preference order: implicit `.rq` first, then the path as written. */
export function resolveImportCandidateUris(
    path: string,
    document: LangiumDocument,
    context?: PathResolveContext
): URI[] {
    return importPathCandidates(path).map(candidate =>
        resolveDocumentPathUri(candidate, document, context)
    );
}

export function isResolvableImportPath(
    path: string,
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem?: FileSystemProvider,
    context?: PathResolveContext
): boolean {
    return resolveImportCandidateUris(path, document, withFileSystem(context, fileSystem))
        .some(uri => isImportTarget(uri, documents, fileSystem));
}

export function findImportedDocument(
    path: string,
    document: LangiumDocument,
    documents: LangiumDocuments,
    context?: PathResolveContext
): LangiumDocument | undefined {
    for (const uri of resolveImportCandidateUris(path, document, context)) {
        const imported = documents.getDocument(uri);
        if (imported) {
            return imported;
        }
    }
    return undefined;
}

/** First candidate that exists, falling back to the path as written when none do. */
export function resolveExistingImportUri(
    path: string,
    document: LangiumDocument,
    documents: LangiumDocuments,
    fileSystem?: FileSystemProvider,
    context?: PathResolveContext
): URI {
    const uris = resolveImportCandidateUris(path, document, withFileSystem(context, fileSystem));
    return uris.find(uri => isImportTarget(uri, documents, fileSystem)) ?? uris[uris.length - 1]!;
}

/**
 * Neighbor file for 1-hop confirmation: implicit `.rq` first, then the path as written.
 * Native extract may keep an extensionless path; do not miss the loaded `.rq` buffer.
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".implicit_file_extension]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".outbound_one_hop]
 */
export function neighborTargetCandidateUris(
    filePart: string,
    document: LangiumDocument,
    context?: PathResolveContext
): URI[] {
    if (filePart.includes('://')) {
        try {
            const uri = URI.parse(filePart);
            const implicitPath = importPathWithImplicitExtension(uri.path);
            return implicitPath === undefined ? [uri] : [uri.with({ path: implicitPath }), uri];
        } catch {
            return resolveImportCandidateUris(filePart, document, context);
        }
    }
    return resolveImportCandidateUris(filePart, document, context);
}

export function resolveNeighborTargetUri(
    filePart: string,
    document: LangiumDocument,
    documents: LangiumDocuments | undefined,
    fileSystem?: FileSystemProvider,
    context?: PathResolveContext
): URI {
    const uris = neighborTargetCandidateUris(filePart, document, withFileSystem(context, fileSystem));
    return uris.find(uri => isImportTarget(uri, documents, fileSystem)) ?? uris[uris.length - 1]!;
}

function isImportTarget(
    uri: URI,
    documents: LangiumDocuments | undefined,
    fileSystem: FileSystemProvider | undefined
): boolean {
    if (documents?.getDocument(uri)) {
        return true;
    }
    return fileSystem?.existsSync(uri) === true;
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
