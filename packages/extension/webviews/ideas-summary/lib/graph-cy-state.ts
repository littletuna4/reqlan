/**
 * Lifecycle state machine for the Ideas Summary cytoscape graph.
 * per ["../../../../../reqlan rq/extension/module/graphical_graph.rq"] state_machines
 */
import { createStore, type StoreApi } from 'zustand/vanilla';

/** Cytoscape graph lifecycle states. */
export type GraphCyState = 'uninitialized' | 'idle' | 'syncing' | 'layouting' | 'physics';

/** Events that drive cytoscape lifecycle transitions. */
export type GraphCyEvent = 'init' | 'sync' | 'synced' | 'layout' | 'layouted' | 'physicsOn' | 'physicsOff' | 'destroy';

export interface GraphCyMachineState {
    lifecycle: GraphCyState;
    previousLifecycle?: GraphCyState;
    animatePhysics: boolean;
    layoutId: string;
    /** Bumped on each sync so stale layout callbacks are ignored. */
    syncGeneration: number;
}

export interface GraphCyMachineActions {
    canDispatch: (event: GraphCyEvent) => boolean;
    dispatch: (event: GraphCyEvent) => boolean;
    setAnimatePhysics: (enabled: boolean) => void;
    setLayoutId: (layoutId: string) => void;
    bumpSyncGeneration: () => number;
    reset: () => void;
}

export type GraphCyMachine = StoreApi<GraphCyMachineState & GraphCyMachineActions>;

const TRANSITIONS: Record<GraphCyState, Partial<Record<GraphCyEvent, GraphCyState>>> = {
    uninitialized: { init: 'idle', destroy: 'uninitialized' },
    idle: { sync: 'syncing', layout: 'layouting', physicsOn: 'physics', destroy: 'uninitialized' },
    syncing: { synced: 'layouting', sync: 'syncing', destroy: 'uninitialized' },
    layouting: { layouted: 'idle', physicsOn: 'physics', sync: 'syncing', layout: 'layouting', destroy: 'uninitialized' },
    physics: { layout: 'layouting', physicsOff: 'idle', sync: 'syncing', destroy: 'uninitialized' }
};

const INITIAL_STATE: GraphCyMachineState = {
    lifecycle: 'uninitialized',
    animatePhysics: false,
    layoutId: 'fcose',
    syncGeneration: 0
};

function resolveTransition(state: GraphCyState, event: GraphCyEvent): GraphCyState | undefined {
    return TRANSITIONS[state]?.[event];
}

export function createGraphCyMachine(): GraphCyMachine {
    return createStore<GraphCyMachineState & GraphCyMachineActions>((set, get) => ({
        ...INITIAL_STATE,

        canDispatch(event) {
            return resolveTransition(get().lifecycle, event) !== undefined;
        },

        dispatch(event) {
            const current = get().lifecycle;
            const next = resolveTransition(current, event);
            if (!next) {
                return false;
            }
            set({
                previousLifecycle: current,
                lifecycle: next
            });
            return true;
        },

        setAnimatePhysics(enabled) {
            set({ animatePhysics: enabled });
        },

        setLayoutId(layoutId) {
            set({ layoutId });
        },

        bumpSyncGeneration() {
            const next = get().syncGeneration + 1;
            set({ syncGeneration: next });
            return next;
        },

        reset() {
            set({ ...INITIAL_STATE });
        }
    }));
}
