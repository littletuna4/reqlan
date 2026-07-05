import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAnalyticalStore, type AnalyticalStore } from './core/analytical-store.js';
import { AnalyserRegistry } from './analysis/analyser-registry.js';
import { listAllIdeasAnalyser } from './analysis/list-ideas-analyser.js';
import { fileRelatedAnalyser } from './analysis/file-related-analyser.js';
import { deprecationImpactAnalyser } from './analysis/deprecation-impact-analyser.js';
import { gitDatesAnalyser } from './analysis/git-dates-analyser.js';
import { completionTrackingAnalyser } from './analysis/completion-tracking-analyser.js';
import { localGraphAnalyser } from './analysis/local-graph-analyser.js';
import { semanticSearchAnalyser } from './analysis/semantic-search-analyser.js';
import { HeadlessIndexService } from './headless-index-service.js';

export interface AnalysisRuntimeOptions {
    workspaceRoot: string;
    storagePath?: string;
}

export interface AnalysisRuntime {
    store: AnalyticalStore;
    index: HeadlessIndexService;
    analysers: AnalyserRegistry;
    workspaceRoot: string;
    makeContext: () => {
        store: HeadlessIndexService['indexStore'];
        analytical: AnalyticalStore;
        workspaceRoot: string;
    };
}

export function createAnalysisRuntime(options: AnalysisRuntimeOptions): AnalysisRuntime {
    const store = createAnalyticalStore();
    const storagePath = options.storagePath ?? join(tmpdir(), 'reqlan-analytical');
    const index = new HeadlessIndexService(store, storagePath, options.workspaceRoot);
    const analysers = new AnalyserRegistry();

    analysers.register(listAllIdeasAnalyser);
    analysers.register(fileRelatedAnalyser);
    analysers.register(deprecationImpactAnalyser);
    analysers.register(gitDatesAnalyser);
    analysers.register(completionTrackingAnalyser);
    analysers.register(localGraphAnalyser);
    analysers.register(semanticSearchAnalyser);

    const makeContext = () => ({
        store: index.indexStore,
        analytical: store,
        workspaceRoot: options.workspaceRoot
    });

    return { store, index, analysers, workspaceRoot: options.workspaceRoot, makeContext };
}

export async function activateAnalysisRuntime(runtime: AnalysisRuntime): Promise<void> {
    await runtime.index.activate();
}

export async function deactivateAnalysisRuntime(runtime: AnalysisRuntime): Promise<void> {
    await runtime.index.deactivate();
    runtime.store.getState().reset();
}
