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

    await index.activate(context);
    const submodule = { store, index, analysers };
    registerAnalyticalCommands(context, submodule);
    registerActivityBarModule(context, submodule);
    registerChatParticipantModule(context, submodule);
    registerWebviewModule(context, submodule);
    registerAiCommandsModule(context, submodule);

    context.subscriptions.push({
        dispose: () => {
            store.getState().reset();
            index.deactivate();
        }
    });

    return { store, index, analysers };
}
