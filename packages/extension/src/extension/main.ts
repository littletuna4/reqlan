/**
 * VS Code extension host entry.
 * rq:["../../../../reqlan rq/ontology.rq".extension]
 */
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { LanguageClient, State, TransportKind } from 'vscode-languageclient/node';
import { ideaContentTooltipEnabled, pushIdeaContentTooltip } from './idea-content-tooltip.js';
import { resolveLanguageServerLaunch } from './language-server-launch.js';
import { resolveLanguageServerRuntime } from './language-server-runtime.js';
import { registerFolderReferenceCommand } from './register-folder-reference-handling.js';
import { registerWildcardReferenceCommand } from './register-wildcard-reference-handling.js';
import { getActivityBarWebviewProvider } from '../activity_bar_module/activity-bar-webview-provider.js';
import { withEditorNavigationMiddleware } from './register-definition-navigation.js';
import { registerIgnoreErrorCodeActions } from './register-ignore-error-code-actions.js';
import { registerReferenceInlayHintsToggle } from './register-reference-inlay-hints.js';
import { registerReferenceCodeLens } from './register-reference-code-lens.js';
import { registerAttributeCatalogSync } from './register-attribute-catalog-sync.js';
import { registerBaseRootsSync } from './register-base-roots-sync.js';
import { registerNameCatalogSync } from './register-name-catalog-sync.js';
import { registerInboundSqliteSync } from './register-inbound-sqlite-sync.js';
import {
    FileInboundCodeLensProvider,
    registerFileInboundCodeLens
} from './register-file-inbound-code-lens.js';
import { registerImportErrorCommands } from './register-import-error-commands.js';
import { openThanksForInstallingIfNeeded } from './open-thanks-for-installing.js';
import { registerOnboardingCommands } from './register-onboarding-commands.js';
import { StartupGate } from './startup-gate.js';
import { activateAnalyticalSubmodule, type AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { registerExtensionContributions } from './register-contributions.js';

let client: LanguageClient | undefined;
const LANGUAGE_CLIENT_FALLBACK_DELAY_MS = 1_000;
const INDEX_STARTUP_FALLBACK_DELAY_MS = 3_000;
/** Keep first-run onboarding from racing the activity-bar iframe on Windows. */
const FIRST_RUN_ONBOARDING_DELAY_MS = 400;

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
    runStep('reference inlay hints', () =>
        registerReferenceInlayHintsToggle(context, () => client)
    );
    runStep('reference code lens', () => registerReferenceCodeLens(context));
    const fileInboundCodeLens = new FileInboundCodeLensProvider();
    runStep('file inbound code lens', () => registerFileInboundCodeLens(context, fileInboundCodeLens));
    runStep('onboarding commands', () => registerOnboardingCommands(context));

    const activityBarPainted = new StartupGate();
    let submodule: AnalyticalSubmodule | undefined;
    runStep('analytical submodule', () => {
        submodule = activateAnalyticalSubmodule(context);
        registerExtensionContributions(context, submodule, () => activityBarPainted.signal());
        registerImportErrorCommands(context, submodule.index, () => client);
        registerWildcardReferenceCommand(
            context,
            () => submodule?.index,
            () => getActivityBarWebviewProvider()
        );
    });

    if (submodule) {
        runStep('background startup scheduling', () =>
            scheduleBackgroundStartup(
                context,
                submodule as AnalyticalSubmodule,
                activityBarPainted,
                fileInboundCodeLens
            )
        );
    }

    let onboardingCancelled = false;
    context.subscriptions.push({ dispose: () => { onboardingCancelled = true; } });
    void activityBarPainted.waitOrTimeout(FIRST_RUN_ONBOARDING_DELAY_MS).then(() => {
        if (onboardingCancelled) {
            return;
        }
        void openThanksForInstallingIfNeeded(context).catch(error => {
            console.error('[reqlan] Failed to open thanks-for-installing page:', error);
        });
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
    activityBarPainted: StartupGate,
    fileInboundCodeLens: FileInboundCodeLensProvider
): void {
    if (backgroundStartupStarted) {
        return;
    }
    backgroundStartupStarted = true;
    const languageClientStartGate = activityBarPainted.waitOrTimeout(
        LANGUAGE_CLIENT_FALLBACK_DELAY_MS
    );
    // 1. Sequential native resource loading: language-server native process waits
    // for the workspace index to open its native store / SQLite handles first.
    // rq:["../../../../reqlan rq/extension/host/startup-performance.rq".deferred_startup_sequence]
    void Promise.all([
        submodule.index.indexOpened.ready,
        languageClientStartGate
    ]).then(() => {
        void startLanguageClient(context, submodule)
            .then(started => {
                client = started;
                // Register catalog sync once the client exists. The initial push
                // covers an already-ready index; the subscription covers indexes
                // that become ready afterwards.
                registerAttributeCatalogSync(context, submodule.index, () => client);
                registerNameCatalogSync(context, submodule.index, () => client);
                registerBaseRootsSync(context, submodule.index, () => client);
                registerInboundSqliteSync(context, submodule.index, () => client, fileInboundCodeLens);
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
    const nativeDir = path.join(context.extensionPath, 'native');
    // rq:["../../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
    const serverEnv = { ...process.env, REQLAN_NATIVE_DIR: nativeDir };
    const configured = vscode.workspace.getConfiguration('reqlan').get<string>('languageServer.engine', 'rust');
    const launch = resolveLanguageServerLaunch({
        engine: configured === 'node' ? 'node' : 'rust',
        extensionPath: context.extensionPath
    });
    const serverOptions: ServerOptions = launch.kind === 'rust'
        ? {
            run: { command: launch.command, transport: TransportKind.stdio, options: { env: serverEnv } },
            debug: { command: launch.command, transport: TransportKind.stdio, options: { env: serverEnv } }
        }
        : {
            run: { module: serverModule, transport: TransportKind.ipc, runtime, options: { env: serverEnv } },
            debug: {
                module: serverModule,
                transport: TransportKind.ipc,
                runtime,
                options: {
                    execArgv: ['--nolazy', `--inspect${process.env.DEBUG_BREAK ? '-brk' : ''}=${process.env.DEBUG_SOCKET || '6009'}`],
                    env: serverEnv
                }
            }
        };

    // Options to control the language client
    let client!: LanguageClient;
    const clientOptions: LanguageClientOptions = withEditorNavigationMiddleware({
                initializationOptions: {
                    ideaContentTooltip: ideaContentTooltipEnabled(
                        vscode.workspace.getConfiguration('reqlan')
                    ),
                    referenceInlayHints: vscode.workspace
                        .getConfiguration('reqlan')
                        .get<boolean>('referencesInlayHints.enabled', false)
                },
        documentSelector: [
            { scheme: '*', language: 'reqlan' },
            ...(launch.kind === 'rust' ? [{ scheme: 'file' as const }] : [])
        ]
    });

    // Create the language client and start the client.
    client = new LanguageClient(
        'reqlan',
        'reqlan',
        serverOptions,
        clientOptions
    );

    registerFolderReferenceCommand(context);
    if (launch.kind !== 'rust') {
        // Dynamic import keeps Langium out of the rust-host activation heap.
        // rq:["../../../../reqlan rq/extension/host/startup-performance.rq".lazy_runtime_dependencies]
        const { registerCommentReferenceDocumentLinks } = await import(
            './register-comment-reference-links.js'
        );
        registerCommentReferenceDocumentLinks(context);
    }
    registerIgnoreErrorCodeActions(context);

    // Start the client. This will also launch the server
    await client.start();
    const configuration = vscode.workspace.getConfiguration('reqlan');
    pushIdeaContentTooltip(client, configuration);
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
        if (
            event.affectsConfiguration('reqlan.ideaContentTooltip.enabled')
            || event.affectsConfiguration('reqlan.referencesInlayHints.enabled')
        ) {
            pushIdeaContentTooltip(client, vscode.workspace.getConfiguration('reqlan'));
        }
    }));
    return client;
}
