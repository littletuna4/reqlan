import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';
import type * as vscode from 'vscode';
import * as path from 'node:path';
import { LanguageClient, State, TransportKind } from 'vscode-languageclient/node';
import { resolveLanguageServerRuntime } from './language-server-runtime.js';
import { registerFolderReferenceCommand, withFolderReferenceMiddleware } from './register-folder-reference-handling.js';
import {
    registerWildcardReferenceCommand,
    withWildcardReferenceMiddleware
} from './register-wildcard-reference-handling.js';
import { getActivityBarWebviewProvider } from '../activity_bar_module/activity-bar-webview-provider.js';
import { registerCommentReferenceDocumentLinks } from './register-comment-reference-links.js';
import { registerReferenceInlayHintsToggle } from './register-reference-inlay-hints.js';
import { registerReferenceCodeLens } from './register-reference-code-lens.js';
import { registerAttributeCatalogSync } from './register-attribute-catalog-sync.js';
import { registerNameCatalogSync } from './register-name-catalog-sync.js';
import { registerImportErrorCommands } from './register-import-error-commands.js';
import { openThanksForInstallingIfNeeded } from './open-thanks-for-installing.js';
import { registerOnboardingCommands } from './register-onboarding-commands.js';
import { StartupGate } from './startup-gate.js';
import { activateAnalyticalSubmodule, type AnalyticalSubmodule } from '../analytical_submodule/index.js';

let client: LanguageClient | undefined;
const LANGUAGE_CLIENT_FALLBACK_DELAY_MS = 1_000;
const INDEX_STARTUP_FALLBACK_DELAY_MS = 3_000;

// This function is called when the extension is activated.
//
// Activation is deliberately non-blocking: everything here registers
// synchronously and returns immediately. VS Code only resolves the activity bar
// webview view — and only makes contributed commands invocable — once this
// `activate()` promise has resolved and the view resolver has run. Awaiting any
// startup work (workspace indexing or the language server) would keep the
// extension in the "activating" state and leave the sidebar stuck on the
// built-in spinner with commands unavailable.
//
// The heavier startup work is therefore scheduled onto a later tick, after the
// UI is available, so the "Context" view paints first and indexing then runs
// visibly (it is incremental and reports progress via index status events).
export function activate(context: vscode.ExtensionContext): void {
    // Each step is isolated so a failure in one cannot abort activation and leave
    // the extension stuck (which would keep the activity bar view unresolved and
    // commands unavailable).
    runStep('reference inlay hints', () => registerReferenceInlayHintsToggle(context));
    runStep('reference code lens', () => registerReferenceCodeLens(context));
    runStep('onboarding commands', () => registerOnboardingCommands(context));

    const activityBarPainted = new StartupGate();
    let submodule: AnalyticalSubmodule | undefined;
    runStep('analytical submodule', () => {
        submodule = activateAnalyticalSubmodule(context, () => activityBarPainted.signal());
        registerImportErrorCommands(context, submodule.index);
        registerWildcardReferenceCommand(
            context,
            () => submodule?.index,
            () => getActivityBarWebviewProvider()
        );
    });

    if (submodule) {
        runStep('background startup scheduling', () =>
            scheduleBackgroundStartup(context, submodule as AnalyticalSubmodule, activityBarPainted)
        );
    }

    void openThanksForInstallingIfNeeded(context).catch(error => {
        console.error('[reqlan] Failed to open thanks-for-installing page:', error);
    });
}

/** Run one activation step synchronously, logging (never throwing) so later steps still run. */
function runStep(label: string, step: () => void): void {
    try {
        step();
    } catch (error) {
        console.error(`[reqlan] Activation step "${label}" failed:`, error);
    }
}

let backgroundStartupStarted = false;

/**
 * Start the workspace index and language server without blocking activation.
 *
 * This is the single entry point for all potentially non-trivial initialisation.
 * The language client starts on a later tick after `activate()` returns. Index
 * discovery waits for the webview's post-paint ready signal. When the sidebar
 * stays closed, bounded fallbacks preserve normal language/index startup.
 *
 * Idempotent: only the first call schedules startup.
 */
function scheduleBackgroundStartup(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule,
    activityBarPainted: StartupGate
): void {
    if (backgroundStartupStarted) {
        return;
    }
    backgroundStartupStarted = true;
    const languageClientStartGate = activityBarPainted.waitOrTimeout(
        LANGUAGE_CLIENT_FALLBACK_DELAY_MS
    );
    void languageClientStartGate.then(() => {
        void startLanguageClient(context, submodule)
            .then(started => {
                client = started;
                // Register catalog sync once the client exists. The initial push
                // covers an already-ready index; the subscription covers indexes
                // that become ready afterwards.
                registerAttributeCatalogSync(context, submodule.index, () => client);
                registerNameCatalogSync(context, submodule.index, () => client);
            })
            .catch(error => {
                console.error('[reqlan] Language client failed to start:', error);
            });
    });

    void activityBarPainted.waitOrTimeout(INDEX_STARTUP_FALLBACK_DELAY_MS).then(() => {
        setTimeout(() => {
            void submodule.index.activate(context).catch(error => {
                console.error('[reqlan] Index activation failed:', error);
            });
        }, 0);
    });
}

// This function is called when the extension is deactivated.
export function deactivate(): Thenable<void> | undefined {
    if (!client || client.state === State.Stopped) {
        return undefined;
    }
    return client.stop().catch(() => undefined);
}

async function startLanguageClient(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): Promise<LanguageClient> {
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
    const clientOptions: LanguageClientOptions = withWildcardReferenceMiddleware(
        withFolderReferenceMiddleware(
            { documentSelector: [{ scheme: '*', language: 'reqlan' }] },
            () => client
        ),
        () => client,
        () => submodule.index,
        () => getActivityBarWebviewProvider()
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
