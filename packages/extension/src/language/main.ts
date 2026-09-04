import './object-group-by-polyfill.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import type { Position, Range } from 'vscode-languageserver';
import { DocumentState, URI } from 'langium';
import { addNativeEngineSearchDirs, hostNativeBindingSpec } from '@reqlan/analytical/core';
import {
    applyOutboundDiagnosticAuthority,
    createReqlanServices,
    createSourceTextDocument,
    fileReferenceAtRequestResult,
    findFileReferenceAtPosition,
    findWildcardReferenceAtPosition,
    pathResolveContextFromServices,
    REQLAN_ATTRIBUTE_CATALOG_NOTIFICATION,
    REQLAN_FILE_REFERENCE_AT_REQUEST,
    REQLAN_INBOUND_SNAPSHOT_NOTIFICATION,
    REQLAN_NAME_CATALOG_NOTIFICATION,
    REQLAN_REFERENCE_SEARCH_SITE_REQUEST,
    REQLAN_WILDCARD_REFERENCE_AT_REQUEST,
    resolveReferenceSearchSiteFromDocument,
    sharedAttributeCatalog,
    sharedInboundSnapshot,
    sharedNameCatalog,
    wildcardArgsFromReference,
    type AttributeCatalog,
    type InboundSnapshotBatch,
    type NameCatalog
} from '@reqlan/language';

declare const __dirname: string | undefined;

/**
 * The LSP process is separate from the extension host, so it must locate the
 * native addon on its own. `REQLAN_NATIVE_DIR` is set by the extension host.
 * rq:["../../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
 */
function languageServerDirectory(): string {
    if (typeof __dirname === 'string') {
        return __dirname;
    }
    return dirname(fileURLToPath(import.meta.url));
}

function registerNativeEngineForLanguageServer(): void {
    const here = languageServerDirectory();
    const envDir = process.env.REQLAN_NATIVE_DIR?.trim();
    if (envDir) {
        addNativeEngineSearchDirs(envDir);
    }
    addNativeEngineSearchDirs(join(here, '../../native'));
    const host = hostNativeBindingSpec();
    if (host) {
        addNativeEngineSearchDirs(
            join(here, '../../../../crates/target', host.rustTarget, 'release'),
            join(here, '../../../../crates/target/release'),
            join(here, '../../../../crates/target', host.rustTarget, 'debug'),
            join(here, '../../../../crates/target/debug')
        );
    }
}

registerNativeEngineForLanguageServer();

// Create a connection to the client
const connection = createConnection(ProposedFeatures.all);

// Inject the shared services and language-specific services
const { shared, Reqlan } = createReqlanServices({ connection, ...NodeFileSystem });

// After this buffer's Langium AST is populated or replaced (not after Linked).
// rq:["../../../../reqlan rq/extension/language-support/open-file-sequencing.rq".ast_lifecycle]
shared.workspace.DocumentBuilder.onDocumentPhase(DocumentState.Parsed, document => {
    applyOutboundDiagnosticAuthority(document, Reqlan);
    void connection.sendDiagnostics({
        uri: document.uri.toString(),
        diagnostics: document.diagnostics ?? []
    });
});

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
            shared.workspace.FileSystemProvider,
            pathResolveContextFromServices({ shared })
        );
        return link ? fileReferenceAtRequestResult(link) : null;
    }
);

connection.onRequest(
    REQLAN_WILDCARD_REFERENCE_AT_REQUEST,
    (params: { uri: string; text?: string; position: Position }) => {
        const document = getTextDocument(params);
        if (!document) {
            return null;
        }
        const offset = document.textDocument.offsetAt(params.position);
        const reference = findWildcardReferenceAtPosition(document, offset);
        return reference ? wildcardArgsFromReference(reference) : null;
    }
);

connection.onRequest(
    REQLAN_REFERENCE_SEARCH_SITE_REQUEST,
    (params: { uri: string; text?: string; range: Range }) => {
        const document = getParsedDocument(params);
        if (!document) {
            return null;
        }
        return resolveReferenceSearchSiteFromDocument(params.uri, document, params.range) ?? null;
    }
);

connection.onNotification(REQLAN_ATTRIBUTE_CATALOG_NOTIFICATION, (catalog: AttributeCatalog) => {
    sharedAttributeCatalog.update(catalog);
});

connection.onNotification(REQLAN_NAME_CATALOG_NOTIFICATION, (catalog: NameCatalog) => {
    sharedNameCatalog.update(catalog);
});

connection.onNotification(REQLAN_INBOUND_SNAPSHOT_NOTIFICATION, (batch: InboundSnapshotBatch) => {
    sharedInboundSnapshot.update(batch);
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

/** Parsed Langium document for AST/CST site resolution (not the plaintext stub). */
function getParsedDocument(params: { uri: string; text?: string }) {
    const uri = URI.parse(params.uri);
    const existing = shared.workspace.LangiumDocuments.getDocument(uri);
    if (existing?.parseResult) {
        return existing;
    }
    if (params.text === undefined) {
        return undefined;
    }
    return shared.workspace.LangiumDocumentFactory.fromString(params.text, uri);
}

// Path-local links, tokens, and outbound errors must not wait for workspace Linked.
// rq:["../../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".reference_document_links]
// rq:["../../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".reference_goto_definition_speed]
// rq:["../../../../reqlan rq/extension/language-support/open-file-sequencing.rq".open_file_algorithm]
// rq:["../../../../reqlan rq/language/syntax.rq".open_file_reference_sequencing]
startLanguageServer(shared, {
    DocumentLinkProvider: DocumentState.Parsed,
    HoverProvider: DocumentState.Parsed,
    DefinitionProvider: DocumentState.Parsed,
    DocumentHighlightProvider: DocumentState.Parsed,
    SemanticTokenProvider: DocumentState.Parsed
});
