/**
 * Event-driven cytoscape controller for the Ideas Summary graph tab.
 * per ["../../../../../reqlan rq/extension/module/graphical_graph.rq"] state_machines
 */
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import layoutUtilities from 'cytoscape-layout-utilities';
import type { GraphViewSlice } from '../../../src/webview_module/shared/messages.js';
import {
    buildCytoscapeElements,
    buildCytoscapeStylesheet,
    getLayoutConfig,
    isForceDirectedLayout,
    seedNodePositions,
    type CompoundBasis,
    type LayoutFixedNode,
    type LayoutRunMode
} from './graph-cytoscape.js';
import { createGraphCyMachine, type GraphCyEvent, type GraphCyMachine } from './graph-cy-state.js';
import { GraphNodeRegistry } from './graph-node-state.js';

cytoscape.use(fcose);
cytoscape.use(layoutUtilities);

const MIN_ZOOM = 0.01;
const MAX_ZOOM = 100;
const PHYSICS_PULSE_MS = 350;
const RESIZE_DEBOUNCE_MS = 120;

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
    private readonly nodeRegistry = new GraphNodeRegistry();
    private cy: cytoscape.Core | undefined;
    private activeLayout: cytoscape.Layouts | undefined;
    private activeLayoutRunId = 0;
    private physicsTimer: ReturnType<typeof setTimeout> | undefined;
    private resizeTimer: ReturnType<typeof setTimeout> | undefined;
    private resizeObserver: ResizeObserver | undefined;
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
            boxSelectionEnabled: false
        });

        this.bindCyEvents(this.cy);
        this.dispatch('init');

        this.resizeObserver = new ResizeObserver(() => {
            this.scheduleResize();
        });
        this.resizeObserver.observe(this.options.container);
    }

    destroy(): void {
        this.clearPhysicsTimer();
        clearTimeout(this.resizeTimer);
        this.resizeObserver?.disconnect();
        this.stopLayout();
        this.dispatch('destroy');
        this.cy?.destroy();
        this.cy = undefined;
        this.machine.getState().reset();
        this.pendingSync = undefined;
    }

    setLayoutId(layoutId: string): void {
        this.machine.getState().setLayoutId(layoutId);
        this.requestLayout();
    }

    setAnimatePhysics(enabled: boolean): void {
        const { setAnimatePhysics, lifecycle } = this.machine.getState();
        setAnimatePhysics(enabled);

        if (enabled) {
            if (lifecycle === 'idle' || lifecycle === 'layouting') {
                this.dispatch('physicsOn');
            }
            this.schedulePhysicsPulse();
            return;
        }

        this.clearPhysicsTimer();
        if (lifecycle === 'physics') {
            this.dispatch('physicsOff');
        }
        this.stopLayout();
    }

    syncSlice(slice: GraphViewSlice, options: GraphSyncOptions): void {
        if (!this.cy) {
            return;
        }

        const generation = this.machine.getState().bumpSyncGeneration();
        this.activeSyncGeneration = generation;
        this.pendingSync = { generation, slice, options };
        requestAnimationFrame(() => {
            this.flushPendingSync();
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

        this.clearPhysicsTimer();
        this.stopLayout();

        if (lifecycle === 'physics') {
            this.dispatch('layout');
        } else if (this.canDispatch('layout')) {
            this.dispatch('layout');
        }

        this.nodeRegistry.beginLayout();
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
        this.nodeRegistry.select(nodeId);
        this.options.onSelect?.(nodeId);
    }

    private flushPendingSync(): void {
        const pending = this.pendingSync;
        if (!pending || !this.cy) {
            return;
        }
        this.pendingSync = undefined;

        const { generation, slice, options } = pending;
        if (generation !== this.activeSyncGeneration) {
            return;
        }

        this.syncOptions = options;
        this.clearPhysicsTimer();
        this.stopLayout();
        this.userPositionedNodes.clear();

        if (!this.dispatch('sync')) {
            return;
        }

        const nodeIds = slice.nodes.map(node => node.id);
        this.nodeRegistry.reconcile(nodeIds);
        this.nodeRegistry.mountAll();

        const elements = buildCytoscapeElements(slice, {
            useCompound: options.useCompound,
            compoundBasis: options.compoundBasis,
            centerId: options.centerId
        });

        this.cy.batch(() => {
            this.cy!.elements().remove();
            this.cy!.add(elements);
        });

        seedNodePositions(this.cy);
        this.applySelection(options.selectedId);
        this.dispatch('synced');
        this.nodeRegistry.beginLayout();
        this.runLayout(generation, 'initial');
    }

    private dispatch(event: GraphCyEvent): boolean {
        return this.machine.getState().dispatch(event);
    }

    private canDispatch(event: GraphCyEvent): boolean {
        return this.machine.getState().canDispatch(event);
    }

    private bindCyEvents(instance: cytoscape.Core): void {
        instance.on('tap', 'node', (event: cytoscape.EventObject) => {
            const node = event.target;
            if (node.data('isCompound')) {
                return;
            }
            const nodeId = node.id();
            this.selectNode(nodeId);
            this.options.onOpen?.(nodeId);
        });

        instance.on('dbltap', 'node', (event: cytoscape.EventObject) => {
            const node = event.target;
            if (node.data('isCompound')) {
                return;
            }
            const nodeId = node.id();
            const graphNode = this.options.getNodeById?.(nodeId);
            if (!graphNode || graphNode.isExternal) {
                return;
            }
            this.selectNode(nodeId);
            this.options.onFocus?.(nodeId);
        });

        instance.on('tap', (event: cytoscape.EventObject) => {
            if (event.target === instance) {
                instance.$(':selected').unselect();
                this.nodeRegistry.select(undefined);
                this.options.onSelect?.(undefined);
            }
        });

        instance.on('grab', 'node', (event: cytoscape.EventObject) => {
            const node = event.target;
            if (node.data('isCompound')) {
                return;
            }
            this.draggingCount += 1;
            this.stopLayout();
            this.clearPhysicsTimer();
            this.nodeRegistry.dragStart(node.id());
        });

        instance.on('drag', 'node', (event: cytoscape.EventObject) => {
            const node = event.target;
            if (node.data('isCompound')) {
                return;
            }
            const position = node.position();
            this.userPositionedNodes.set(node.id(), { x: position.x, y: position.y });
        });

        instance.on('free', 'node', (event: cytoscape.EventObject) => {
            const node = event.target;
            if (node.data('isCompound')) {
                return;
            }
            const position = node.position();
            this.userPositionedNodes.set(node.id(), { x: position.x, y: position.y });
            this.nodeRegistry.dragEnd(node.id());
            this.draggingCount = Math.max(0, this.draggingCount - 1);
            if (this.draggingCount === 0) {
                const { animatePhysics } = this.machine.getState();
                if (animatePhysics && isForceDirectedLayout(this.machine.getState().layoutId)) {
                    this.schedulePhysicsPulse();
                }
            }
        });
    }

    private applySelection(selectedId: string | undefined): void {
        if (!this.cy) {
            return;
        }

        if (selectedId && this.cy.$id(selectedId).length > 0) {
            this.cy.$id(selectedId).select();
            this.nodeRegistry.select(selectedId);
        } else {
            this.cy.$(':selected').unselect();
            this.nodeRegistry.select(undefined);
            this.options.onSelect?.(undefined);
        }
    }

    private runLayout(generation: number, mode: LayoutRunMode = 'relayout'): void {
        if (!this.cy || this.cy.elements().length === 0) {
            this.dispatch('layouted');
            this.nodeRegistry.placeAll();
            this.options.onRendered?.();
            return;
        }

        if (this.draggingCount > 0) {
            return;
        }

        const { layoutId, animatePhysics } = this.machine.getState();
        const layoutMode = mode === 'relayout' && animatePhysics ? 'physics' : mode;
        this.stopLayout();

        const runId = ++this.activeLayoutRunId;
        const nodeCount = this.cy.nodes(':childless').length;
        const fixedNodes = this.collectFixedNodes();
        const layout = this.cy.layout(
            getLayoutConfig(layoutId, this.syncOptions.useCompound, layoutMode, nodeCount, fixedNodes)
        );
        this.activeLayout = layout;

        layout.on('layoutstop', () => {
            if (generation !== this.activeSyncGeneration || runId !== this.activeLayoutRunId) {
                return;
            }

            this.activeLayout = undefined;
            this.nodeRegistry.placeAll();

            const state = this.machine.getState();
            if (state.animatePhysics && isForceDirectedLayout(state.layoutId)) {
                if (state.lifecycle === 'layouting') {
                    this.dispatch('physicsOn');
                    if (layoutMode === 'initial') {
                        this.options.onRendered?.();
                    }
                }
                if (this.draggingCount === 0) {
                    this.schedulePhysicsPulse();
                }
                return;
            }

            if (state.lifecycle === 'layouting') {
                this.dispatch('layouted');
                this.options.onRendered?.();
            } else if (state.lifecycle === 'physics' && this.draggingCount === 0) {
                this.schedulePhysicsPulse();
            }
        });

        setTimeout(() => {
            if (generation !== this.activeSyncGeneration || this.draggingCount > 0 || runId !== this.activeLayoutRunId) {
                return;
            }
            layout.run();
        }, 0);
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

    private schedulePhysicsPulse(): void {
        const { animatePhysics, layoutId, lifecycle } = this.machine.getState();
        if (
            !animatePhysics ||
            !isForceDirectedLayout(layoutId) ||
            lifecycle === 'syncing' ||
            lifecycle === 'uninitialized' ||
            this.draggingCount > 0
        ) {
            return;
        }

        this.clearPhysicsTimer();
        this.physicsTimer = setTimeout(() => {
            this.physicsTimer = undefined;
            if (!this.cy || this.cy.elements().length === 0 || this.draggingCount > 0) {
                return;
            }

            const state = this.machine.getState();
            if (!state.animatePhysics || !isForceDirectedLayout(state.layoutId)) {
                return;
            }

            if (state.lifecycle === 'physics' && this.dispatch('layout')) {
                this.nodeRegistry.beginLayout();
                this.runLayout(this.activeSyncGeneration, 'physics');
            }
        }, PHYSICS_PULSE_MS);
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

    private clearPhysicsTimer(): void {
        if (this.physicsTimer !== undefined) {
            clearTimeout(this.physicsTimer);
            this.physicsTimer = undefined;
        }
    }
}
