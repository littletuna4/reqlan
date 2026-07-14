import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';
import type * as vscode from 'vscode';
import * as path from 'node:path';
import { LanguageClient, State, TransportKind } from 'vscode-languageclient/node';
import { resolveLanguageServerRuntime } from './language-server-runtime.js';
import { registerFolderReferenceCommand, withFolderReferenceMiddleware } from './register-folder-reference-handling.js';
import { registerCommentReferenceDocumentLinks } from './register-comment-reference-links.js';
import { registerReferenceInlayHintsToggle } from './register-reference-inlay-hints.js';
import { registerAttributeCatalogSync } from './register-attribute-catalog-sync.js';
import { registerNameCatalogSync } from './register-name-catalog-sync.js';
import { registerImportErrorCommands } from './register-import-error-commands.js';
import { activateAnalyticalSubmodule } from '../analytical_submodule/index.js';

let client: LanguageClient | undefined;

// This function is called when the extension is activated.
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    registerReferenceInlayHintsToggle(context);
    try {
        client = await startLanguageClient(context);
    } catch (error) {
        console.error('[reqlan] Language client failed to start:', error);
    }
    try {
        const submodule = await activateAnalyticalSubmodule(context);
        registerImportErrorCommands(context, submodule.index);
        if (client) {
            registerAttributeCatalogSync(context, submodule.index, () => client);
            registerNameCatalogSync(context, submodule.index, () => client);
        }
    } catch (error) {
        console.error('[reqlan] Analytical submodule failed to activate:', error);
    }
}

// This function is called when the extension is deactivated.
export function deactivate(): Thenable<void> | undefined {
    if (!client || client.state === State.Stopped) {
        return undefined;
    }
    return client.stop().catch(() => undefined);
}

async function startLanguageClient(context: vscode.ExtensionContext): Promise<LanguageClient> {
    const serverModule = context.asAbsolutePath(path.join('out', 'language', 'main.cjs'));
    const runtime = resolveLanguageServerRuntime();
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging.
    // By setting `process.env.DEBUG_BREAK` to a truthy value, the language server will wait until a debugger is attached.
    const debugOptions = { execArgv: ['--nolazy', `--inspect${process.env.DEBUG_BREAK ? '-brk' : ''}=${process.env.DEBUG_SOCKET || '6009'}`] };

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc, runtime },
        debug: { module: serverModule, transport: TransportKind.ipc, runtime, options: debugOptions }
    };

    // Options to control the language client
    let client!: LanguageClient;
    const clientOptions: LanguageClientOptions = withFolderReferenceMiddleware(
        { documentSelector: [{ scheme: '*', language: 'reqlan' }] },
        () => client
    );

    // Create the language client and start the client.
    client = new LanguageClient(
        'reqlan',
        'reqlan',
        serverOptions,
        clientOptions
    );

    registerFolderReferenceCommand(context);
    registerCommentReferenceDocumentLinks(context);

    // Start the client. This will also launch the server
    await client.start();
    return client;
}
