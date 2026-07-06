/**
 * Per-node lifecycle state machines for cytoscape graph elements.
 * per ["../../../../../reqlan rq/extension/module/graphical_graph.rq"] state_machines
 */
import { createStore, type StoreApi } from 'zustand/vanilla';

/** Lifecycle of a single graph node in the cytoscape canvas. */
export type GraphNodeState = 'absent' | 'mounting' | 'layouting' | 'placed' | 'selected' | 'dragging';

/** Events that drive per-node transitions. */
export type GraphNodeEvent = 'mount' | 'layout' | 'place' | 'select' | 'deselect' | 'dragStart' | 'dragEnd' | 'remove';

export interface GraphNodeMachineState {
    nodeId: string;
    lifecycle: GraphNodeState;
}

export interface GraphNodeMachineActions {
    canDispatch: (event: GraphNodeEvent) => boolean;
    dispatch: (event: GraphNodeEvent) => boolean;
    reset: () => void;
}

export type GraphNodeMachine = StoreApi<GraphNodeMachineState & GraphNodeMachineActions>;

const TRANSITIONS: Record<GraphNodeState, Partial<Record<GraphNodeEvent, GraphNodeState>>> = {
    absent: { mount: 'mounting', remove: 'absent' },
    mounting: { layout: 'layouting', remove: 'absent' },
    layouting: { place: 'placed', remove: 'absent' },
    placed: { select: 'selected', dragStart: 'dragging', layout: 'layouting', remove: 'absent' },
    selected: { deselect: 'placed', dragStart: 'dragging', layout: 'layouting', remove: 'absent' },
    dragging: { dragEnd: 'placed', select: 'selected', remove: 'absent' }
};

function resolveTransition(state: GraphNodeState, event: GraphNodeEvent): GraphNodeState | undefined {
    return TRANSITIONS[state]?.[event];
}

export function createGraphNodeMachine(nodeId: string): GraphNodeMachine {
    return createStore<GraphNodeMachineState & GraphNodeMachineActions>((set, get) => ({
        nodeId,
        lifecycle: 'absent',

        canDispatch(event) {
            return resolveTransition(get().lifecycle, event) !== undefined;
        },

        dispatch(event) {
            const current = get().lifecycle;
            const next = resolveTransition(current, event);
            if (!next) {
                return false;
            }
            set({ lifecycle: next });
            return true;
        },

        reset() {
            set({ lifecycle: 'absent' });
        }
    }));
}

/** Registry of per-node machines; reconciled on each slice sync. */
export class GraphNodeRegistry {
    private readonly machines = new Map<string, GraphNodeMachine>();

    reconcile(nodeIds: readonly string[]): void {
        const nextIds = new Set(nodeIds);
        for (const id of [...this.machines.keys()]) {
            if (!nextIds.has(id)) {
                this.machines.get(id)?.getState().dispatch('remove');
                this.machines.delete(id);
            }
        }
        for (const id of nodeIds) {
            if (!this.machines.has(id)) {
                this.machines.set(id, createGraphNodeMachine(id));
            }
        }
    }

    mountAll(): void {
        for (const machine of this.machines.values()) {
            const state = machine.getState();
            if (state.lifecycle === 'absent') {
                state.dispatch('mount');
            }
        }
    }

    beginLayout(): void {
        for (const machine of this.machines.values()) {
            const state = machine.getState();
            if (state.lifecycle === 'mounting' || state.lifecycle === 'placed' || state.lifecycle === 'selected') {
                state.dispatch('layout');
            }
        }
    }

    placeAll(): void {
        for (const machine of this.machines.values()) {
            const state = machine.getState();
            if (state.lifecycle === 'layouting') {
                state.dispatch('place');
            }
        }
    }

    select(nodeId: string | undefined): void {
        for (const [id, machine] of this.machines) {
            const state = machine.getState();
            if (id === nodeId) {
                if (state.lifecycle === 'placed') {
                    state.dispatch('select');
                }
                continue;
            }
            if (state.lifecycle === 'selected') {
                state.dispatch('deselect');
            }
        }
    }

    dragStart(nodeId: string): void {
        const machine = this.machines.get(nodeId);
        machine?.getState().dispatch('dragStart');
    }

    dragEnd(nodeId: string): void {
        const machine = this.machines.get(nodeId);
        const state = machine?.getState();
        if (!state) {
            return;
        }
        if (state.lifecycle === 'dragging') {
            state.dispatch('dragEnd');
        }
        if (state.lifecycle === 'placed') {
            state.dispatch('select');
        }
    }

    get(nodeId: string): GraphNodeMachine | undefined {
        return this.machines.get(nodeId);
    }
}
