/**
 * Zustand store for analytical submodule state and lifecycle actions.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';

export type IndexState = 'uninitialized' | 'opening' | 'idle' | 'syncing' | 'ready' | 'error' | 'closing';
type IndexEvent = 'activate' | 'opened' | 'sync' | 'synced' | 'fail' | 'deactivate';

export type WorkspaceChange = 'created' | 'changed' | 'deleted';

export interface IndexError {
    message: string;
    cause?: unknown;
}

export interface DocumentUpdate {
    fileUri: string;
    ideaCount: number;
    at: number;
}

export interface WorkspaceFileChange {
    fileUri: string;
    change: WorkspaceChange;
    at: number;
}

export interface AnalysisRun {
    analyser: string;
    params: unknown;
    status: 'running' | 'completed' | 'failed';
    result?: unknown;
    error?: string;
    at: number;
}

export interface AnalyticalState {
    indexState: IndexState;
    previousIndexState?: IndexState;
    ideaCount: number;
    edgeCount: number;
    lastError?: IndexError;
    documentUpdates: DocumentUpdate[];
    workspaceChanges: WorkspaceFileChange[];
    analysisRuns: AnalysisRun[];
    currentAnalysis?: AnalysisRun;
}

export interface AnalyticalActions {
    canDispatchIndex: (event: IndexEvent) => boolean;
    dispatchIndex: (event: IndexEvent) => boolean;
    setIndexReady: (counts: { ideaCount: number; edgeCount: number }) => void;
    recordIndexError: (message: string, cause?: unknown) => void;
    recordDocumentUpdate: (fileUri: string, ideaCount: number) => void;
    recordWorkspaceChange: (fileUri: string, change: WorkspaceChange) => void;
    startAnalysis: (analyser: string, params: unknown) => void;
    completeAnalysis: (analyser: string, result: unknown) => void;
    failAnalysis: (analyser: string, error: string) => void;
    reset: () => void;
}

export type AnalyticalStoreState = AnalyticalState & AnalyticalActions;
export type AnalyticalStore = StoreApi<AnalyticalStoreState>;

const INDEX_TRANSITIONS: Record<IndexState, Partial<Record<IndexEvent, IndexState>>> = {
    uninitialized: { activate: 'opening' },
    opening: { opened: 'idle', fail: 'error' },
    idle: { sync: 'syncing', deactivate: 'closing' },
    ready: { sync: 'syncing', deactivate: 'closing' },
    syncing: { synced: 'ready', fail: 'error' },
    error: { deactivate: 'closing' },
    closing: {}
};

const INITIAL_STATE: AnalyticalState = {
    indexState: 'uninitialized',
    ideaCount: 0,
    edgeCount: 0,
    documentUpdates: [],
    workspaceChanges: [],
    analysisRuns: []
};

const MAX_ACTIVITY = 50;

function resolveTransition(state: IndexState, event: IndexEvent): IndexState | undefined {
    return INDEX_TRANSITIONS[state]?.[event];
}

function appendActivity<T>(items: T[], item: T): T[] {
    return [...items, item].slice(-MAX_ACTIVITY);
}

export function createAnalyticalStore(): AnalyticalStore {
    return createStore<AnalyticalStoreState>((set, get) => ({
        ...INITIAL_STATE,

        canDispatchIndex(event) {
            return resolveTransition(get().indexState, event) !== undefined;
        },

        dispatchIndex(event) {
            const current = get().indexState;
            const next = resolveTransition(current, event);
            if (!next) {
                return false;
            }
            set({
                previousIndexState: current,
                indexState: next
            });
            return true;
        },

        setIndexReady({ ideaCount, edgeCount }) {
            set({ ideaCount, edgeCount });
        },

        recordIndexError(message, cause) {
            set({ lastError: { message, cause } });
        },

        recordDocumentUpdate(fileUri, ideaCount) {
            set(state => ({
                documentUpdates: appendActivity(state.documentUpdates, {
                    fileUri,
                    ideaCount,
                    at: Date.now()
                })
            }));
        },

        recordWorkspaceChange(fileUri, change) {
            set(state => ({
                workspaceChanges: appendActivity(state.workspaceChanges, {
                    fileUri,
                    change,
                    at: Date.now()
                })
            }));
        },

        startAnalysis(analyser, params) {
            const run: AnalysisRun = {
                analyser,
                params,
                status: 'running',
                at: Date.now()
            };
            set({ currentAnalysis: run });
        },

        completeAnalysis(analyser, result) {
            const completed: AnalysisRun = {
                analyser,
                params: get().currentAnalysis?.params,
                status: 'completed',
                result,
                at: Date.now()
            };
            set(state => ({
                currentAnalysis: undefined,
                analysisRuns: appendActivity(state.analysisRuns, completed)
            }));
        },

        failAnalysis(analyser, error) {
            const failed: AnalysisRun = {
                analyser,
                params: get().currentAnalysis?.params,
                status: 'failed',
                error,
                at: Date.now()
            };
            set(state => ({
                currentAnalysis: undefined,
                analysisRuns: appendActivity(state.analysisRuns, failed)
            }));
        },

        reset() {
            set({ ...INITIAL_STATE });
        }
    }));
}
