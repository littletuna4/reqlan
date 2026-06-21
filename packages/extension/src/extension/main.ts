import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';
import type * as vscode from 'vscode';
import * as path from 'node:path';
import { LanguageClient, State, TransportKind } from 'vscode-languageclient/node';
import { resolveLanguageServerRuntime } from './language-server-runtime.js';

let client: LanguageClient | undefined;

// This function is called when the extension is activated.
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    client = await startLanguageClient(context);
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
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: '*', language: 'reqlan' }]
    };

    // Create the language client and start the client.
    const client = new LanguageClient(
        'reqlan',
        'reqlan',
        serverOptions,
        clientOptions
    );

    // Start the client. This will also launch the server
    await client.start();
    return client;
}
