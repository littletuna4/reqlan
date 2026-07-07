/**
 * Event-driven cytoscape controller for the Ideas Summary graph tab.
 *
 * Owns the cytoscape instance and the GraphCyMachine lifecycle. Element diffing lives
 * in ./graph-cy-elements, pointer wiring in ./graph-cy-interactions, and live physics is
 * delegated to cytoscape-cola's continuous (infinite) simulation rather than a hand-rolled
 * pulse loop.
 * per ["../../../../../reqlan rq/extension/module/graphical_graph.rq"] state_machines
 */
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import cola from 'cytoscape-cola';
import type { GraphViewSlice } from '../../../src/webview_module/shared/messages.js';
import {
    buildCytoscapeStylesheet,
    getLayoutConfig,
    getPhysicsLayoutConfig,
    isForceDirectedLayout,
    type CompoundBasis,
    type LayoutFixedNode,
    type LayoutRunMode
} from './graph-cytoscape.js';
import { syncGraphElements } from './graph-cy-elements.js';
import { bindGraphInteractions } from './graph-cy-interactions.js';
import { createGraphCyMachine, type GraphCyEvent, type GraphCyMachine } from './graph-cy-state.js';

cytoscape.use(fcose);
cytoscape.use(cola);

const MIN_ZOOM = 0.01;
const MAX_ZOOM = 100;
const RESIZE_DEBOUNCE_MS = 120;
const READY_RETRY_MS = 120;

export interface GraphSyncOptions {
    useCompound: boolean;
    compoundBasis: CompoundBasis;
    centerId?: string;
    selectedId?: string;
}

export interface GraphCyControllerOptions {
    container: HTMLElement;
    onSelect?: (nodeId: string | undefined) => void;
    onOpen?: (nodeId: string) => void;
    onFocus?: (nodeId: string) => void;
    onRendered?: () => void;
    getNodeById?: (nodeId: string) => { isExternal?: boolean } | undefined;
}

export class GraphCyController {
    private readonly machine: GraphCyMachine;
    private cy: cytoscape.Core | undefined;
    private activeLayout: cytoscape.Layouts | undefined;
    private physicsLayout: cytoscape.Layouts | undefined;
    private activeLayoutRunId = 0;
    private resizeTimer: ReturnType<typeof setTimeout> | undefined;
    private readyRetryTimer: ReturnType<typeof setTimeout> | undefined;
    private resizeObserver: ResizeObserver | undefined;
    private unbindInteractions: (() => void) | undefined;
    private activeSyncGeneration = 0;
    private pendingSync: { generation: number; slice: GraphViewSlice; options: GraphSyncOptions } | undefined;
    private syncOptions: GraphSyncOptions = {
        useCompound: false,
        compoundBasis: () => []
    };
    private draggingCount = 0;
    private readonly userPositionedNodes = new Map<string, { x: number; y: number }>();

    constructor(private readonly options: GraphCyControllerOptions) {
        this.machine = createGraphCyMachine();
    }

    get store(): GraphCyMachine {
        return this.machine;
    }

    get instance(): cytoscape.Core | undefined {
        return this.cy;
    }

    get isReadyToRender(): boolean {
        return this.options.container.clientWidth > 0 && this.options.container.clientHeight > 0;
    }

    init(): void {
        if (this.cy) {
            return;
        }

        this.cy = cytoscape({
            container: this.options.container,
            style: buildCytoscapeStylesheet(),
            wheelSensitivity: 0.2,
            minZoom: MIN_ZOOM,
            maxZoom: MAX_ZOOM,
            boxSelectionEnabled: false,
            pixelRatio: 1,
            renderer: {
                name: 'canvas',
                webgl: true
            }
        } as cytoscape.CytoscapeOptions);

        this.bindInteractions(this.cy);
        this.dispatch('init');

        this.resizeObserver = new ResizeObserver(() => {
            this.scheduleResize();
        });
        this.resizeObserver.observe(this.options.container);
    }

    destroy(): void {
        clearTimeout(this.resizeTimer);
        clearTimeout(this.readyRetryTimer);
        this.readyRetryTimer = undefined;
        this.resizeObserver?.disconnect();
        this.unbindInteractions?.();
        this.unbindInteractions = undefined;
        this.stopPhysics();
        this.stopLayout();
        this.dispatch('destroy');
        this.cy?.destroy();
        this.cy = undefined;
        this.machine.getState().reset();
        this.pendingSync = undefined;
    }

    setLayoutId(layoutId: string): void {
        this.machine.getState().setLayoutId(layoutId);
        this.stopPhysics();
        this.requestLayout();
    }

    setAnimatePhysics(enabled: boolean): void {
        const state = this.machine.getState();
        state.setAnimatePhysics(enabled);

        if (enabled) {
            const { lifecycle, layoutId } = this.machine.getState();
            if (isForceDirectedLayout(layoutId) && (lifecycle === 'idle' || lifecycle === 'layouting')) {
                if (lifecycle === 'layouting') {
                    this.stopLayout();
                }
                if (this.dispatch('physicsOn')) {
                    this.startPhysics(this.activeSyncGeneration);
                }
            }
            return;
        }

        this.stopPhysics();
        if (this.machine.getState().lifecycle === 'physics') {
            this.dispatch('physicsOff');
        }
    }

    syncSlice(slice: GraphViewSlice, options: GraphSyncOptions): void {
        if (!this.cy) {
            return;
        }

        const generation = this.machine.getState().bumpSyncGeneration();
        this.activeSyncGeneration = generation;
        this.pendingSync = { generation, slice, options };
        // Double rAF: the first callback runs before paint, so deferring to the
        // second guarantees the "Rendering graph" loading state actually paints
        // before the synchronous element swap + layout blocks the main thread.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.flushPendingSync();
            });
        });
    }

    requestLayout(): void {
        if (!this.cy || this.cy.elements().length === 0) {
            return;
        }

        const { lifecycle } = this.machine.getState();
        if (lifecycle === 'syncing') {
            return;
        }

        this.stopPhysics();
        this.stopLayout();

        if (lifecycle === 'physics') {
            this.dispatch('layout');
        } else if (this.canDispatch('layout')) {
            this.dispatch('layout');
        }

        this.runLayout(this.activeSyncGeneration, 'relayout');
    }

    resetView(): void {
        if (!this.cy) {
            return;
        }
        this.cy.fit(undefined, 36);
        this.cy.center();
    }

    selectNode(nodeId: string): void {
        if (!this.cy) {
            return;
        }
        this.cy.$id(nodeId).select();
        this.options.onSelect?.(nodeId);
    }

    private bindInteractions(instance: cytoscape.Core): void {
        this.unbindInteractions = bindGraphInteractions(instance, {
            onNodeTap: (nodeId) => {
                this.selectNode(nodeId);
                this.options.onOpen?.(nodeId);
            },
            onNodeDblTap: (nodeId) => {
                const graphNode = this.options.getNodeById?.(nodeId);
                if (!graphNode || graphNode.isExternal) {
                    return;
                }
                this.selectNode(nodeId);
                this.options.onFocus?.(nodeId);
            },
            onBackgroundTap: () => {
                this.cy?.$(':selected').unselect();
                this.options.onSelect?.(undefined);
            },
            onNodeGrab: () => {
                this.draggingCount += 1;
                // A live cola simulation handles grabbed nodes natively; only a
                // batch layout needs to be stopped so it doesn't fight the drag.
                if (this.machine.getState().lifecycle !== 'physics') {
                    this.stopLayout();
                }
            },
            onNodeDrag: (nodeId, position) => {
                this.userPositionedNodes.set(nodeId, { x: position.x, y: position.y });
            },
            onNodeFree: (nodeId, position) => {
                this.userPositionedNodes.set(nodeId, { x: position.x, y: position.y });
                this.draggingCount = Math.max(0, this.draggingCount - 1);
            }
        });
    }

    private flushPendingSync(): void {
        clearTimeout(this.readyRetryTimer);
        this.readyRetryTimer = undefined;

        const pending = this.pendingSync;
        if (!pending || !this.cy) {
            return;
        }

        if (!this.isReadyToRender) {
            // The container has no size yet (panel hidden or mid-layout). rAF is
            // suspended while a webview is hidden, so retry on a timer instead —
            // otherwise the sync would wedge on "Rendering graph" until something
            // else forced a repaint.
            this.readyRetryTimer = setTimeout(() => {
                this.readyRetryTimer = undefined;
                this.flushPendingSync();
            }, READY_RETRY_MS);
            return;
        }

        this.pendingSync = undefined;

        const { generation, slice, options } = pending;
        if (generation !== this.activeSyncGeneration) {
            return;
        }

        this.syncOptions = options;
        this.stopPhysics();
        this.stopLayout();
        this.pruneUserPositionedNodes(new Set(slice.nodes.map(node => node.id)));

        if (!this.dispatch('sync')) {
            return;
        }

        const persistedPositions = this.capturePersistedPositions();
        const result = syncGraphElements(
            this.cy,
            slice,
            {
                useCompound: options.useCompound,
                compoundBasis: options.compoundBasis,
                centerId: options.centerId
            },
            persistedPositions
        );

        this.cy.resize();
        this.applySelection(options.selectedId);
        this.dispatch('synced');

        if (result.structuralChange || this.cy.elements().length === 0) {
            this.runLayout(generation, 'initial');
        } else {
            // Same node/edge set (e.g. only highlight/data changed): keep positions
            // and skip the relayout entirely.
            this.settleAfterSync(generation);
        }
    }

    private settleAfterSync(generation: number): void {
        const state = this.machine.getState();
        if (state.animatePhysics && isForceDirectedLayout(state.layoutId)) {
            if (state.lifecycle === 'layouting') {
                this.dispatch('physicsOn');
            }
            this.options.onRendered?.();
            this.startPhysics(generation);
            return;
        }
        if (state.lifecycle === 'layouting') {
            this.dispatch('layouted');
        }
        this.options.onRendered?.();
    }

    private dispatch(event: GraphCyEvent): boolean {
        return this.machine.getState().dispatch(event);
    }

    private canDispatch(event: GraphCyEvent): boolean {
        return this.machine.getState().canDispatch(event);
    }

    private applySelection(selectedId: string | undefined): void {
        if (!this.cy) {
            return;
        }

        if (selectedId && this.cy.$id(selectedId).length > 0) {
            this.cy.$id(selectedId).select();
        } else {
            this.cy.$(':selected').unselect();
            this.options.onSelect?.(undefined);
        }
    }

    /** Run the selected batch layout (fcose/cose/grid/…). Live physics is separate. */
    private runLayout(generation: number, mode: LayoutRunMode = 'relayout'): void {
        if (!this.cy || this.cy.elements().length === 0) {
            this.dispatch('layouted');
            this.options.onRendered?.();
            return;
        }

        if (this.draggingCount > 0) {
            // Don't fight an in-progress drag, but the initial render still has to
            // resolve its loading phase or the UI stays stuck on "Rendering graph".
            if (mode === 'initial') {
                this.dispatch('layouted');
                this.options.onRendered?.();
            }
            return;
        }

        const { layoutId } = this.machine.getState();
        this.stopLayout();

        const runId = ++this.activeLayoutRunId;
        const nodeCount = this.cy.nodes(':childless').length;
        const fixedNodes = this.collectFixedNodes();
        const layout = this.cy.layout(
            getLayoutConfig(layoutId, this.syncOptions.useCompound, mode, nodeCount, fixedNodes)
        );
        this.activeLayout = layout;

        layout.on('layoutstop', () => {
            if (generation !== this.activeSyncGeneration || runId !== this.activeLayoutRunId) {
                return;
            }

            this.activeLayout = undefined;

            const state = this.machine.getState();
            const goPhysics = state.animatePhysics && isForceDirectedLayout(state.layoutId);
            if (goPhysics) {
                if (state.lifecycle === 'layouting') {
                    this.dispatch('physicsOn');
                }
                if (mode === 'initial') {
                    this.options.onRendered?.();
                }
                if (this.draggingCount === 0) {
                    this.startPhysics(generation);
                }
                return;
            }

            if (state.lifecycle === 'layouting') {
                this.dispatch('layouted');
            }
            this.options.onRendered?.();
        });

        setTimeout(() => {
            if (generation !== this.activeSyncGeneration || this.draggingCount > 0 || runId !== this.activeLayoutRunId) {
                return;
            }
            layout.run();
        }, 0);
    }

    /** Start continuous cola physics. Runs inside cytoscape's own animation loop (non-blocking). */
    private startPhysics(generation: number): void {
        if (!this.cy || this.cy.elements().length === 0 || generation !== this.activeSyncGeneration) {
            return;
        }

        const state = this.machine.getState();
        if (!state.animatePhysics || !isForceDirectedLayout(state.layoutId) || this.draggingCount > 0) {
            return;
        }

        this.stopLayout();
        this.stopPhysics();

        const nodeCount = this.cy.nodes(':childless').length;
        const layout = this.cy.layout(getPhysicsLayoutConfig(this.syncOptions.useCompound, nodeCount));
        this.physicsLayout = layout;
        layout.run();
    }

    private collectFixedNodes(): LayoutFixedNode[] {
        if (!this.cy) {
            return [];
        }

        const fixed: LayoutFixedNode[] = [];
        for (const [nodeId, position] of this.userPositionedNodes) {
            if (this.cy.$id(nodeId).length > 0) {
                fixed.push({ nodeId, position: { ...position } });
            }
        }
        return fixed;
    }

    private capturePersistedPositions(): Map<string, { x: number; y: number }> {
        if (!this.cy) {
            return new Map();
        }

        const persisted = new Map<string, { x: number; y: number }>();
        this.cy.nodes(':childless').forEach((node) => {
            const position = node.position();
            persisted.set(node.id(), { x: position.x, y: position.y });
        });
        for (const [nodeId, position] of this.userPositionedNodes) {
            persisted.set(nodeId, { ...position });
        }
        return persisted;
    }

    private pruneUserPositionedNodes(validNodeIds: Set<string>): void {
        for (const nodeId of this.userPositionedNodes.keys()) {
            if (!validNodeIds.has(nodeId)) {
                this.userPositionedNodes.delete(nodeId);
            }
        }
    }

    private scheduleResize(): void {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
            this.cy?.resize();
        }, RESIZE_DEBOUNCE_MS);
    }

    private stopLayout(): void {
        if (!this.activeLayout) {
            return;
        }
        this.activeLayoutRunId += 1;
        this.activeLayout.stop();
        this.activeLayout = undefined;
    }

    private stopPhysics(): void {
        if (!this.physicsLayout) {
            return;
        }
        this.physicsLayout.stop();
        this.physicsLayout = undefined;
    }
}
