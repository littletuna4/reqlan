/**
 * Analytical submodule: idea graph index and analysers for the reqlan extension.
 */
import * as vscode from 'vscode';
import {
    AnalyserRegistry,
    createAnalyticalStore,
    completionTrackingAnalyser,
    deprecationImpactAnalyser,
    fileRelatedAnalyser,
    gitDatesAnalyser,
    listAllIdeasAnalyser,
    localGraphAnalyser,
    semanticSearchAnalyser,
    type AnalyticalStore
} from '@reqlan/analytical';
import { IndexService } from './index-store/index-service.js';
import { registerAnalyticalCommands } from './commands/register-commands.js';
import { registerActivityBarModule } from '../activity_bar_module/index.js';
import { registerChatParticipantModule } from '../chat_participant_module/index.js';
import { registerWebviewModule } from '../webview_module/index.js';
import { registerAiCommandsModule } from '../ai_commands_module/index.js';
import { registerMutationHooksModule } from '../mutation_hooks_module/index.js';
import { registerIndexDiagnosticsModule } from '../diagnostics_module/index.js';

export type {
    AnalyticalState,
    AnalyticalStore,
    AnalyticalStoreState,
    AnalysisRun,
    DocumentUpdate,
    IndexError,
    IndexState,
    WorkspaceChange,
    WorkspaceFileChange
} from '@reqlan/analytical';
export type { Analyser, AnalyserContext } from '@reqlan/analytical';
export * from '@reqlan/analytical';

export interface AnalyticalSubmodule {
    /** Fallback / legacy shared store; prefer `index.store` for the active base. */
    store: AnalyticalStore;
    index: IndexService;
    analysers: AnalyserRegistry;
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
    context: vscode.ExtensionContext
): AnalyticalSubmodule {
    const store = createAnalyticalStore();
    const index = new IndexService(store);
    const analysers = new AnalyserRegistry();

    analysers.register(listAllIdeasAnalyser);
    analysers.register(fileRelatedAnalyser);
    analysers.register(deprecationImpactAnalyser);
    analysers.register(gitDatesAnalyser);
    analysers.register(completionTrackingAnalyser);
    analysers.register(localGraphAnalyser);
    analysers.register(semanticSearchAnalyser);

    const submodule = { store, index, analysers };

    // Register all VS Code contributions synchronously. This makes the activity
    // bar webview view provider available immediately so VS Code can resolve
    // (and paint) the "Context" view, and makes contributed commands invocable,
    // without waiting on any startup work.
    registerAnalyticalCommands(context, submodule);
    registerActivityBarModule(context, submodule);
    registerChatParticipantModule(context, submodule);
    registerWebviewModule(context, submodule);
    registerAiCommandsModule(context, submodule);
    registerMutationHooksModule(context, submodule);
    registerIndexDiagnosticsModule(context, submodule);

    context.subscriptions.push({
        dispose: () => {
            store.getState().reset();
            index.deactivate();
        }
    });

    return submodule;
}
