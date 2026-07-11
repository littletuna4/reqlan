/**
 * Event-driven cytoscape controller for the Ideas Summary graph tab.
 *
 * Owns the cytoscape instance and inline lifecycle state. Element diffing lives in
 * ./graph-cy-elements, pointer wiring in ./graph-cy-interactions, and live physics is
 * delegated to cytoscape-cola's continuous (infinite) simulation.
 * per ["../../../../../reqlan rq/extension/module/graphical_graph.rq"] state_machines
 */
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import cola from 'cytoscape-cola';
import type { GraphViewSlice } from '../../../src/webview_module/shared/messages.js';
import {
    buildCytoscapeStylesheet,
    DEFAULT_LAYOUT_ID,
    getLayoutConfig,
    getPhysicsLayoutConfig,
    isForceDirectedLayout,
    type CompoundBasis,
    type LayoutFixedNode,
    type LayoutRunMode
} from './graph-cytoscape.js';
import { syncGraphElements } from './graph-cy-elements.js';
import { bindGraphInteractions } from './graph-cy-interactions.js';
import { graphLog, graphWarn } from './graph-debug.js';

cytoscape.use(fcose);
cytoscape.use(cola);

const MIN_ZOOM = 0.01;
const MAX_ZOOM = 100;
const RESIZE_DEBOUNCE_MS = 120;
const READY_RETRY_MS = 120;

type GraphLifecycle = 'uninitialized' | 'idle' | 'syncing' | 'layouting' | 'physics';

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

    private lifecycle: GraphLifecycle = 'uninitialized';
    private animatePhysics = false;
    private layoutId = DEFAULT_LAYOUT_ID;
    private syncGeneration = 0;

    constructor(private readonly options: GraphCyControllerOptions) {}

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
            pixelRatio: 1
            // Canvas 2D only: WebGL in VS Code webviews often draws nothing when
            // styles use unresolved colours, and "webgl rendering enabled" was the
            // only log users saw with an empty graph.
        });

        this.bindInteractions(this.cy);
        this.lifecycle = 'idle';
        graphLog('cytoscape init', {
            width: this.options.container.clientWidth,
            height: this.options.container.clientHeight
        });

        this.resizeObserver = new ResizeObserver(() => {
            this.scheduleResize();
            if (this.pendingSync) {
                graphLog('resize while pending sync', {
                    width: this.options.container.clientWidth,
                    height: this.options.container.clientHeight
                });
                this.scheduleFlush();
            }
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
        this.cy?.destroy();
        this.cy = undefined;
        this.lifecycle = 'uninitialized';
        this.pendingSync = undefined;
    }

    setLayoutId(layoutId: string): void {
        this.layoutId = layoutId;
        this.stopPhysics();
        this.requestLayout();
    }

    setAnimatePhysics(enabled: boolean): void {
        this.animatePhysics = enabled;

        if (enabled) {
            if (isForceDirectedLayout(this.layoutId) && (this.lifecycle === 'idle' || this.lifecycle === 'layouting')) {
                if (this.lifecycle === 'layouting') {
                    this.stopLayout();
                }
                this.lifecycle = 'physics';
                this.startPhysics(this.activeSyncGeneration);
            }
            return;
        }

        this.stopPhysics();
        if (this.lifecycle === 'physics') {
            this.lifecycle = 'idle';
        }
    }

    syncSlice(slice: GraphViewSlice, options: GraphSyncOptions): void {
        if (!this.cy) {
            graphWarn('syncSlice called before init');
            return;
        }

        const generation = this.bumpSyncGeneration();
        this.activeSyncGeneration = generation;
        this.pendingSync = { generation, slice, options };
        graphLog('syncSlice queued', {
            generation,
            nodes: slice.nodes.length,
            edges: slice.edges.length,
            ready: this.isReadyToRender,
            size: {
                w: this.options.container.clientWidth,
                h: this.options.container.clientHeight
            }
        });
        this.scheduleFlush();
    }

    requestLayout(): void {
        if (!this.cy || this.cy.elements().length === 0) {
            return;
        }

        if (this.lifecycle === 'syncing') {
            return;
        }

        this.userPositionedNodes.clear();
        this.stopPhysics();
        this.stopLayout();

        if (this.lifecycle === 'physics') {
            this.lifecycle = 'layouting';
        } else {
            this.lifecycle = 'layouting';
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

    private bumpSyncGeneration(): number {
        this.syncGeneration += 1;
        return this.syncGeneration;
    }

    private scheduleFlush(): void {
        clearTimeout(this.readyRetryTimer);
        this.readyRetryTimer = undefined;

        if (!this.pendingSync) {
            return;
        }

        if (!this.isReadyToRender) {
            graphLog('flush deferred — container has no size', {
                w: this.options.container.clientWidth,
                h: this.options.container.clientHeight
            });
            this.readyRetryTimer = setTimeout(() => {
                this.readyRetryTimer = undefined;
                this.scheduleFlush();
            }, READY_RETRY_MS);
            return;
        }

        requestAnimationFrame(() => {
            this.flushPendingSync();
        });
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
                if (this.lifecycle !== 'physics') {
                    this.stopLayout();
                    if (this.lifecycle === 'layouting') {
                        this.lifecycle = 'idle';
                        this.finishRender(this.activeSyncGeneration);
                    }
                }
            },
            onNodeDrag: (nodeId, position) => {
                this.userPositionedNodes.set(nodeId, { x: position.x, y: position.y });
            },
            onNodeFree: (nodeId, position) => {
                this.userPositionedNodes.set(nodeId, { x: position.x, y: position.y });
                this.draggingCount = Math.max(0, this.draggingCount - 1);
                if (this.physicsLayout) {
                    this.pinNodeInCola(nodeId, position);
                }
            }
        });
    }

    private flushPendingSync(): void {
        const pending = this.pendingSync;
        if (!pending || !this.cy) {
            return;
        }

        if (!this.isReadyToRender) {
            this.scheduleFlush();
            return;
        }

        this.pendingSync = undefined;

        const { generation, slice, options } = pending;
        if (generation !== this.activeSyncGeneration) {
            graphLog('flush skipped — stale generation', { generation, active: this.activeSyncGeneration });
            return;
        }

        this.syncOptions = options;
        this.stopPhysics();
        this.stopLayout();
        this.pruneUserPositionedNodes(new Set(slice.nodes.map(node => node.id)));

        this.lifecycle = 'syncing';
        graphLog('flush start', { generation, nodes: slice.nodes.length, edges: slice.edges.length });

        try {
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
            this.lifecycle = 'layouting';

            graphLog('elements synced', {
                added: result.added,
                removed: result.removed,
                updated: result.updated,
                structuralChange: result.structuralChange,
                cyNodes: this.cy.nodes().length,
                cyEdges: this.cy.edges().length
            });

            if (result.structuralChange || this.cy.elements().length === 0) {
                this.runLayout(generation, 'initial');
            } else {
                this.settleAfterSync(generation);
            }
        } catch (error) {
            graphWarn('Graph sync failed', error);
            this.lifecycle = 'idle';
            this.finishRender(generation);
        }
    }

    private settleAfterSync(generation: number): void {
        if (this.animatePhysics && isForceDirectedLayout(this.layoutId)) {
            this.lifecycle = 'physics';
            this.finishRender(generation);
            this.startPhysics(generation);
            return;
        }
        this.lifecycle = 'idle';
        this.finishRender(generation);
    }

    private finishRender(generation: number): void {
        if (generation === this.activeSyncGeneration) {
            graphLog('render complete', {
                generation,
                nodes: this.cy?.nodes().length ?? 0,
                zoom: this.cy?.zoom(),
                extent: this.cy?.extent()
            });
            this.options.onRendered?.();
        }
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

    private runLayout(generation: number, mode: LayoutRunMode = 'relayout'): void {
        if (!this.cy || this.cy.elements().length === 0) {
            this.lifecycle = 'idle';
            this.finishRender(generation);
            return;
        }

        if (this.draggingCount > 0) {
            if (mode === 'initial') {
                this.lifecycle = 'idle';
                this.finishRender(generation);
            }
            return;
        }

        this.stopLayout();
        this.lifecycle = 'layouting';

        const runId = ++this.activeLayoutRunId;
        const nodeCount = this.cy.nodes(':childless').length;
        const fixedNodes = this.collectFixedNodes();
        graphLog('layout run', { generation, runId, mode, layoutId: this.layoutId, nodeCount });
        const layout = this.cy.layout(
            getLayoutConfig(this.layoutId, this.syncOptions.useCompound, mode, nodeCount, fixedNodes)
        );
        this.activeLayout = layout;

        layout.on('layoutstop', () => {
            if (generation !== this.activeSyncGeneration || runId !== this.activeLayoutRunId) {
                graphLog('layoutstop ignored (stale)', { generation, runId });
                return;
            }

            this.activeLayout = undefined;
            graphLog('layoutstop', { generation, runId, mode });

            const goPhysics = this.animatePhysics && isForceDirectedLayout(this.layoutId);
            if (goPhysics) {
                this.lifecycle = 'physics';
                if (mode === 'initial') {
                    this.finishRender(generation);
                }
                if (this.draggingCount === 0) {
                    this.startPhysics(generation);
                }
                return;
            }

            this.lifecycle = 'idle';
            this.finishRender(generation);
        });

        setTimeout(() => {
            if (generation !== this.activeSyncGeneration || this.draggingCount > 0 || runId !== this.activeLayoutRunId) {
                return;
            }
            try {
                layout.run();
            } catch (error) {
                graphWarn('Graph layout failed', error);
                this.activeLayout = undefined;
                if (generation === this.activeSyncGeneration && runId === this.activeLayoutRunId) {
                    this.lifecycle = 'idle';
                    this.finishRender(generation);
                }
            }
        }, 0);
    }

    private startPhysics(generation: number): void {
        if (!this.cy || this.cy.elements().length === 0 || generation !== this.activeSyncGeneration) {
            return;
        }

        if (!this.animatePhysics || !isForceDirectedLayout(this.layoutId) || this.draggingCount > 0) {
            return;
        }

        this.stopLayout();
        this.stopPhysics();

        const nodeCount = this.cy.nodes(':childless').length;
        const layout = this.cy.layout(getPhysicsLayoutConfig(this.syncOptions.useCompound, nodeCount));
        this.physicsLayout = layout;
        layout.run();
        this.applyColaPins();
    }

    private pinNodeInCola(nodeId: string, position: { x: number; y: number }): void {
        if (!this.cy) {
            return;
        }

        const node = this.cy.$id(nodeId);
        if (node.length === 0) {
            return;
        }

        const bb = this.cy.extent();
        const scrCola = { ...(node.scratch('cola') ?? {}) };
        scrCola.x = position.x - bb.x1;
        scrCola.y = position.y - bb.y1;
        scrCola.px = scrCola.x;
        scrCola.py = scrCola.y;
        scrCola.fixed = true;
        node.scratch('cola', scrCola);
    }

    private applyColaPins(): void {
        if (!this.cy) {
            return;
        }

        for (const [nodeId, position] of this.userPositionedNodes) {
            if (this.cy.$id(nodeId).length > 0) {
                this.pinNodeInCola(nodeId, position);
            }
        }
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
