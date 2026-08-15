import { createAnalyticalStore, type AnalyticalStore } from './core/analytical-store.js';
import { resolveApplicationMemoryPath } from './core/application-memory.js';
import {
    discoverBases,
    selectDefaultBase,
    type BaseDescriptor
} from './core/base-discovery.js';
import { AnalyserRegistry } from './analysis/analyser-registry.js';
import { listAllIdeasAnalyser } from './analysis/list-ideas-analyser.js';
import { fileRelatedAnalyser } from './analysis/file-related-analyser.js';
import { deprecationImpactAnalyser } from './analysis/deprecation-impact-analyser.js';
import { gitDatesAnalyser } from './analysis/git-dates-analyser.js';
import { completionTrackingAnalyser } from './analysis/completion-tracking-analyser.js';
import { localGraphAnalyser } from './analysis/local-graph-analyser.js';
import { semanticSearchAnalyser } from './analysis/semantic-search-analyser.js';
import { fuzzySearchAnalyser } from './analysis/fuzzy-search-analyser.js';
import { fileSearchAnalyser } from './analysis/file-search-analyser.js';
import { WorkspaceIndex } from './index-store/workspace-index.js';
import { loadNativeEngine } from './native/load-native.js';

export interface AnalysisRuntimeOptions {
    /**
     * Search root for base discovery (VS Code workspace folder / CLI resolved root).
     * Bases are directories under this root that own `.reqlan`.
     */
    workspaceRoot: string;
    /** Override application-memory directory for the selected base; default is `<base>/.reqlan`. */
    storagePath?: string;
    /**
     * Prefer this cwd when choosing among multiple bases (nearest containing base).
     * Defaults to `workspaceRoot`.
     */
    cwd?: string;
    /**
     * When set, skip discovery and use this absolute path as the single base root
     * (must own `.reqlan`, or `storagePath` override).
     */
    baseRoot?: string;
}

export interface AnalysisRuntime {
    store: AnalyticalStore;
    index: WorkspaceIndex;
    analysers: AnalyserRegistry;
    /** Selected base root (may differ from discovery search root). */
    workspaceRoot: string;
    /** All bases discovered under the search root (empty when forced via storagePath alone). */
    bases: BaseDescriptor[];
    /** Selected base descriptor when discovery found one. */
    base?: BaseDescriptor;
    makeContext: () => {
        store: WorkspaceIndex['indexStore'];
        analytical: AnalyticalStore;
        workspaceRoot: string;
    };
}

function registerDefaultAnalysers(analysers: AnalyserRegistry): void {
    analysers.register(listAllIdeasAnalyser);
    analysers.register(fileRelatedAnalyser);
    analysers.register(deprecationImpactAnalyser);
    analysers.register(gitDatesAnalyser);
    analysers.register(completionTrackingAnalyser);
    analysers.register(localGraphAnalyser);
    analysers.register(semanticSearchAnalyser);
    analysers.register(fuzzySearchAnalyser);
    analysers.register(fileSearchAnalyser);
}

/**
 * Create a headless analysis runtime bound to one base.
 * Discovers `.reqlan`-marked bases under `workspaceRoot` and selects the nearest to `cwd`.
 * Throws when no base exists and no `storagePath` / `baseRoot` override is provided.
 */
export function createAnalysisRuntime(options: AnalysisRuntimeOptions): AnalysisRuntime {
    loadNativeEngine();
    const searchRoot = options.workspaceRoot;
    const cwd = options.cwd ?? searchRoot;

    let baseRoot: string;
    let bases: BaseDescriptor[] = [];
    let base: BaseDescriptor | undefined;

    if (options.baseRoot) {
        baseRoot = options.baseRoot;
        bases = discoverBases([searchRoot]);
        base = bases.find(b => b.root === baseRoot);
    } else if (options.storagePath?.trim()) {
        // Explicit store override: treat workspaceRoot as the base root.
        baseRoot = searchRoot;
    } else {
        bases = discoverBases([searchRoot]);
        base = selectDefaultBase(bases, cwd);
        if (!base) {
            throw new Error(
                `No reqlan base found under ${searchRoot}. Create a .reqlan folder at the project root to initialize a base.`
            );
        }
        baseRoot = base.root;
    }

    const store = createAnalyticalStore();
    const storagePath = resolveApplicationMemoryPath(baseRoot, options.storagePath);
    const index = new WorkspaceIndex(store, storagePath, baseRoot);
    const analysers = new AnalyserRegistry();
    registerDefaultAnalysers(analysers);

    const makeContext = () => ({
        store: index.indexStore,
        analytical: store,
        workspaceRoot: baseRoot
    });

    return {
        store,
        index,
        analysers,
        workspaceRoot: baseRoot,
        bases,
        base,
        makeContext
    };
}

export async function activateAnalysisRuntime(runtime: AnalysisRuntime): Promise<void> {
    await runtime.index.activate();
}

export async function deactivateAnalysisRuntime(runtime: AnalysisRuntime): Promise<void> {
    await runtime.index.deactivate();
    runtime.store.getState().reset();
}
