/**
 * Analytical submodule: idea graph index and analysers for the reqlan extension.
 */
import * as vscode from 'vscode';
import * as path from 'node:path';
import {
    addNativeEngineSearchDirs,
    hostNativeBindingSpec,
    loadNativeEngine,
    resetNativeEngineCache
} from '@reqlan/analytical';
import { IndexService } from './index-store/index-service.js';
import { registerAnalyticalCommands } from './commands/register-commands.js';
import { registerActivityBarModule } from '../activity_bar_module/index.js';
import { registerChatParticipantModule } from '../chat_participant_module/index.js';
import { registerWebviewModule } from '../webview_module/index.js';
import { registerAiCommandsModule } from '../ai_commands_module/index.js';
import { registerMutationHooksModule } from '../mutation_hooks_module/index.js';
import { registerIndexDiagnosticsModule } from '../diagnostics_module/index.js';
import { registerGitDatesBackgroundIndexing } from '../extension/register-git-dates-background.js';

export type {
    DocumentUpdate,
    IndexError,
    IndexState,
    WorkspaceChange,
    WorkspaceFileChange
} from '@reqlan/analytical';
export * from '@reqlan/analytical';

export interface AnalyticalSubmodule {
    index: IndexService;
}

/**
 * Register every analytical VS Code contribution synchronously and return the
 * submodule immediately. This is intentionally **not** async and does **not**
 * start indexing: the caller must kick off {@link IndexService.activate} in the
 * background once the UI is available.
 *
 * VS Code does not resolve a webview view (or finish activating an extension so
 * its commands become invocable) until the `activate()` promise resolves and
 * the view resolver has run. Awaiting any startup work here — index sync or the
 * language server — keeps the extension in the "activating" state and leaves the
 * activity bar stuck on the built-in spinner. Registration must therefore stay
 * synchronous and the heavier work deferred to a background task.
 */
export function activateAnalyticalSubmodule(
    context: vscode.ExtensionContext,
    onActivityBarPainted: () => void
): AnalyticalSubmodule {
    // Host-matching core engine `.node` is staged under native/ by the extension build
    // (F5) and by per-target VSIX packaging.
    // rq:["../../../reqlan rq/distribution/distribution.rq".extension_host_target]
    // rq:["../../../reqlan rq/distribution/distribution.rq".vsix_export]
    // rq:["../../../reqlan rq/development/build.rq".incremental_extension_build]
    addNativeEngineSearchDirs(path.join(context.extensionPath, 'native'));
    const host = hostNativeBindingSpec();
    // Local F5 / monorepo checkout: also probe cargo outputs next to the extension package.
    if (host) {
        addNativeEngineSearchDirs(
            path.join(context.extensionPath, '../../crates/target', host.rustTarget, 'release'),
            path.join(context.extensionPath, '../../crates/target/release'),
            path.join(context.extensionPath, '../../crates/target', host.rustTarget, 'debug'),
            path.join(context.extensionPath, '../../crates/target/debug')
        );
    } else {
        addNativeEngineSearchDirs(
            path.join(context.extensionPath, '../../crates/target/release'),
            path.join(context.extensionPath, '../../crates/target/debug')
        );
    }
    resetNativeEngineCache();
    try {
        loadNativeEngine();
        const hostLabel = host?.vsCodeTarget ?? `${process.platform}-${process.arch}`;
        console.log(`[reqlan] Native analytical engine loaded for extension host ${hostLabel}`);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Native analytical engine is required but was not found';
        console.error(`[reqlan] ${message}`);
        void vscode.window.showErrorMessage(
            'reqlan: the bundled native analytical engine failed to load for this extension host.'
        );
        throw error;
    }

    const index = new IndexService();
    const submodule = { index };

    // Register all VS Code contributions synchronously. This makes the activity
    // bar webview view provider available immediately so VS Code can resolve
    // (and paint) the "Context" view, and makes contributed commands invocable,
    // without waiting on any startup work.
    //
    // Each registration is isolated: a failure in one subsystem must not stop the
    // others from registering. The activity bar view provider is registered first
    // so the sidebar can always resolve, even if a sibling contribution throws.
    registerStep('activity bar', () =>
        registerActivityBarModule(context, submodule, onActivityBarPainted)
    );
    registerStep('analytical commands', () => registerAnalyticalCommands(context, submodule));
    registerStep('chat participant', () => registerChatParticipantModule(context, submodule));
    registerStep('webview module', () => registerWebviewModule(context, submodule));
    registerStep('AI commands', () => registerAiCommandsModule(context, submodule));
    registerStep('mutation hooks', () => registerMutationHooksModule(context, submodule));
    registerStep('index diagnostics', () => registerIndexDiagnosticsModule(context, submodule));
    registerStep('git dates background', () => registerGitDatesBackgroundIndexing(context, submodule));

    context.subscriptions.push({
        dispose: () => {
            index.deactivate();
        }
    });

    return submodule;
}

/** Run one registration step, logging (never throwing) so siblings still register. */
function registerStep(label: string, register: () => void): void {
    try {
        register();
    } catch (error) {
        console.error(`[reqlan] Failed to register ${label}:`, error);
    }
}
