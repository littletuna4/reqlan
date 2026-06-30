/**
 * Analytical submodule: idea graph index and analysers for the reqlan extension.
 */
import type * as vscode from 'vscode';
import { createAnalyticalStore, type AnalyticalStore } from './core/analytical-store.js';
import { AnalyserRegistry } from './analysis/analyser-registry.js';
import { listAllIdeasAnalyser } from './analysis/list-ideas-analyser.js';
import { fileRelatedAnalyser } from './analysis/file-related-analyser.js';
import { deprecationImpactAnalyser } from './analysis/deprecation-impact-analyser.js';
import { gitDatesAnalyser } from './analysis/git-dates-analyser.js';
import { completionTrackingAnalyser } from './analysis/completion-tracking-analyser.js';
import { localGraphAnalyser } from './analysis/local-graph-analyser.js';
import { semanticSearchAnalyser } from './analysis/semantic-search-analyser.js';
import { IndexService } from './index-store/index-service.js';
import { registerAnalyticalCommands } from './commands/register-commands.js';
import { registerActivityBarModule } from '../activity_bar_module/index.js';

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
} from './core/analytical-store.js';
export type { Analyser, AnalyserContext } from './analysis/analyser-registry.js';
export * from './core/types.js';

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

    context.subscriptions.push({
        dispose: () => {
            store.getState().reset();
            index.deactivate();
        }
    });

    return { store, index, analysers };
}
