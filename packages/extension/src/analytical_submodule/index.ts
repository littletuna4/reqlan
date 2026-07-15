/**
 * Analytical submodule: idea graph index and analysers for the reqlan extension.
 */
import type * as vscode from 'vscode';
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
} from 'reqlan-analytical';
import { IndexService } from './index-store/index-service.js';
import { registerAnalyticalCommands } from './commands/register-commands.js';
import { registerActivityBarModule } from '../activity_bar_module/index.js';
import { registerChatParticipantModule } from '../chat_participant_module/index.js';
import { registerWebviewModule } from '../webview_module/index.js';
import { registerAiCommandsModule } from '../ai_commands_module/index.js';
import { registerMutationHooksModule } from '../mutation_hooks_module/index.js';

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
} from 'reqlan-analytical';
export type { Analyser, AnalyserContext } from 'reqlan-analytical';
export * from 'reqlan-analytical';

export interface AnalyticalSubmodule {
    store: AnalyticalStore;
    index: IndexService;
    analysers: AnalyserRegistry;
}

export async function activateAnalyticalSubmodule(
    context: vscode.ExtensionContext
): Promise<AnalyticalSubmodule> {
    const store = createAnalyticalStore();
    const storagePath = context.globalStorageUri.fsPath;
    const index = new IndexService(store, storagePath);
    const analysers = new AnalyserRegistry();

    analysers.register(listAllIdeasAnalyser);
    analysers.register(fileRelatedAnalyser);
    analysers.register(deprecationImpactAnalyser);
    analysers.register(gitDatesAnalyser);
    analysers.register(completionTrackingAnalyser);
    analysers.register(localGraphAnalyser);
    analysers.register(semanticSearchAnalyser);

    const submodule = { store, index, analysers };

    // Register all VS Code contributions synchronously, BEFORE any async startup
    // work. This makes the activity bar webview view provider available
    // immediately so VS Code can resolve (and paint) the "Context" view even
    // while the index — and, in the caller, the language server — are still
    // starting. The provider tolerates a not-yet-ready index and reacts to
    // readiness via its status/catalog subscriptions. Previously these ran only
    // after `await index.activate()` (and the awaited language-client start in
    // the caller), so a slow or hanging startup left the sidebar permanently blank.
    registerAnalyticalCommands(context, submodule);
    registerActivityBarModule(context, submodule);
    registerChatParticipantModule(context, submodule);
    registerWebviewModule(context, submodule);
    registerAiCommandsModule(context, submodule);
    registerMutationHooksModule(context, submodule);

    context.subscriptions.push({
        dispose: () => {
            store.getState().reset();
            index.deactivate();
        }
    });

    await index.activate(context);

    return submodule;
}
