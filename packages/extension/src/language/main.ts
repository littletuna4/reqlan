import './object-group-by-polyfill.js';
import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { createReqlanServices } from 'reqlan-language';

// Create a connection to the client
const connection = createConnection(ProposedFeatures.all);

// Inject the shared services and language-specific services
const { shared } = createReqlanServices({ connection, ...NodeFileSystem });

// Start the language server with the shared services
startLanguageServer(shared);
