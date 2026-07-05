import './object-group-by-polyfill.js';
import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import type { Position } from 'vscode-languageserver';
import { URI } from 'langium';
import {
    createReqlanServices,
    createSourceTextDocument,
    fileReferenceAtRequestResult,
    findFileReferenceAtPosition,
    REQLAN_ATTRIBUTE_CATALOG_NOTIFICATION,
    REQLAN_FILE_REFERENCE_AT_REQUEST,
    sharedAttributeCatalog,
    type AttributeCatalog
} from 'reqlan-language';

// Create a connection to the client
const connection = createConnection(ProposedFeatures.all);

// Inject the shared services and language-specific services
const { shared } = createReqlanServices({ connection, ...NodeFileSystem });

connection.onRequest(
    REQLAN_FILE_REFERENCE_AT_REQUEST,
    (params: { uri: string; text?: string; position: Position }) => {
        const document = getTextDocument(params);
        if (!document) {
            return null;
        }
        const link = findFileReferenceAtPosition(
            document,
            params.position,
            shared.workspace.LangiumDocuments,
            shared.workspace.FileSystemProvider
        );
        return link ? fileReferenceAtRequestResult(link) : null;
    }
);

connection.onNotification(REQLAN_ATTRIBUTE_CATALOG_NOTIFICATION, (catalog: AttributeCatalog) => {
    sharedAttributeCatalog.update(catalog);
});

function getTextDocument(params: { uri: string; text?: string }) {
    const uri = URI.parse(params.uri);
    const existing = shared.workspace.LangiumDocuments.getDocument(uri);
    if (existing) {
        return existing;
    }
    if (params.text === undefined) {
        return undefined;
    }
    return createSourceTextDocument(params.uri, params.text);
}

// Start the language server with the shared services
startLanguageServer(shared);
