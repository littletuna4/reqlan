/**
 * Clickable document links for file references and import paths.
 */
import type { LangiumDocument } from 'langium';
import type { DocumentLinkProvider } from 'langium/lsp';
import type { DocumentLink, DocumentLinkParams } from 'vscode-languageserver';
import { DocumentLink as LspDocumentLink } from 'vscode-languageserver';
import { collectFileLinks, resolvedFileLinkTargetUri } from './reqlan-file-link-resolver.js';
import type { ReqlanServices } from './reqlan-module.js';

export class ReqlanDocumentLinkProvider implements DocumentLinkProvider {

    private readonly documents: ReqlanServices['shared']['workspace']['LangiumDocuments'];
    private readonly fileSystem: ReqlanServices['shared']['workspace']['FileSystemProvider'];

    constructor(services: ReqlanServices) {
        this.documents = services.shared.workspace.LangiumDocuments;
        this.fileSystem = services.shared.workspace.FileSystemProvider;
    }

    getDocumentLinks(document: LangiumDocument, _params: DocumentLinkParams): DocumentLink[] {
        return collectFileLinks(document, this.documents, this.fileSystem).map(link => LspDocumentLink.create(
            link.sourceRange,
            resolvedFileLinkTargetUri(link)
        ));
    }
}
