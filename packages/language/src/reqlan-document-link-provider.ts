/**
 * Clickable document links for idea references, file references, import paths, and comment references.
 * Same-file and cross-file idea refs both get links so the editor underline is consistent.
 * Comment-reference links come from the same presentation as the missing-idea underline.
 * Missing file refs get an error underline and no document link.
 * rq:["../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq".comment_reference_resolution_error_state]
 * rq:["../../../reqlan rq/extension/language-support/language-server-errors.rq".file_reference_errors]
 */
import type { LangiumDocument } from 'langium';
import { URI } from 'langium';
import type { DocumentLinkProvider } from 'langium/lsp';
import type { DocumentLink, DocumentLinkParams } from 'vscode-languageserver';
import { DocumentLink as LspDocumentLink } from 'vscode-languageserver';
import { presentCommentReferencesForDocument } from './reqlan-comment-diagnostics.js';
import { collectFileLinks, resolvedFileLinkTargetUri } from './reqlan-file-link-resolver.js';
import { folderReferenceCommandTarget } from './reqlan-reference-at-position.js';
import { wildcardReferenceCommandTarget } from './reqlan-wildcard-resolve.js';
import type { ReqlanServices } from './reqlan-module.js';
import { pathResolveContextFromServices } from './reqlan-path-resolve.js';

export class ReqlanDocumentLinkProvider implements DocumentLinkProvider {

    private readonly documents: ReqlanServices['shared']['workspace']['LangiumDocuments'];
    private readonly fileSystem: ReqlanServices['shared']['workspace']['FileSystemProvider'];
    private readonly services: ReqlanServices;

    constructor(services: ReqlanServices) {
        this.documents = services.shared.workspace.LangiumDocuments;
        this.fileSystem = services.shared.workspace.FileSystemProvider;
        this.services = services;
    }

    getDocumentLinks(document: LangiumDocument, _params: DocumentLinkParams): DocumentLink[] {
        const pathContext = pathResolveContextFromServices(this.services);
        const fileLinks = collectFileLinks(
            document,
            this.documents,
            this.fileSystem,
            pathContext
        ).flatMap(link => {
            if (link.resolution === 'folder') {
                return [LspDocumentLink.create(
                    link.sourceRange,
                    folderReferenceCommandTarget(link.targetUri)
                )];
            }
            if (link.resolution === 'missing') {
                return [];
            }
            if (link.resolution === 'wildcard' && link.wildcardArgs) {
                return [LspDocumentLink.create(
                    link.sourceRange,
                    wildcardReferenceCommandTarget(link.wildcardArgs)
                )];
            }
            const target = resolvedFileLinkTargetUri(link);
            if (!target) {
                return [];
            }
            return [LspDocumentLink.create(link.sourceRange, target)];
        });
        const commentLinks = presentCommentReferencesForDocument(
            document,
            this.documents,
            this.fileSystem,
            pathContext
        ).links.map(link => LspDocumentLink.create(
            link.range,
            link.targetUri ?? URI.file(link.targetPath).toString()
        ));
        return [...fileLinks, ...commentLinks];
    }
}
