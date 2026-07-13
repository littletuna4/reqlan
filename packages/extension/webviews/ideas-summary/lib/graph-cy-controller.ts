/**
 * Event-driven cytoscape controller for the Ideas Summary graph tab.
 *
 * Owns the cytoscape instance and inline lifecycle state. Element diffing lives in
 * ./graph-cy-elements, pointer wiring in ./graph-cy-interactions, and live physics is
 * the custom continuous simulation in ./graph-physics (central gravity + link
 * attraction + node repulsion).
 * per rq:["../../../../../reqlan rq/extension/library/graph.rq"] graph_cy_controller
 */
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import cola from 'cytoscape-cola';
import type { GraphViewSlice } from '../../../src/webview_module/shared/messages.js';
import {
    buildCytoscapeStylesheet,
    DEFAULT_LAYOUT_ID,
    getLayoutConfig,
    isForceDirectedLayout,
    type CompoundBasis,
    type GroupBasis,
    type LayoutFixedNode,
    type LayoutRunMode
} from './graph-cytoscape.js';
import { GraphPhysicsSimulation } from './graph-physics.js';
import { graphHasGroupConstraints, resolveGroupContainerOverlaps } from './graph-groups.js';
import { bindCompoundHighlight, syncCompoundSelection } from './graph-cy-highlight.js';
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
    /** When set, flat multi-membership grouping (e.g. tags) replaces compoundBasis. */
    groupBasis?: GroupBasis;
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
    private physics: GraphPhysicsSimulation | undefined;
    private activeLayoutRunId = 0;
    private resizeTimer: ReturnType<typeof setTimeout> | undefined;
    private readyRetryTimer: ReturnType<typeof setTimeout> | undefined;
    private resizeObserver: ResizeObserver | undefined;
    private unbindInteractions: (() => void) | undefined;
    private unbindCompoundHighlight: (() => void) | undefined;
    private activeSyncGeneration = 0;
    private pendingSync: { generation: number; slice: GraphViewSlice; options: GraphSyncOptions } | undefined;
    private syncOptions: GraphSyncOptions = {
        useCompound: false,
        compoundBasis: () => []
    };
    private draggingCount = 0;
    // Tracks nodes for which at least one onNodeDrag event fired, so that a bare
    // click (grab + free with no movement) is not treated as a drag. Clicks must
    // never disturb the simulation.
    private readonly nodesActuallyMoved = new Set<string>();
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
        this.unbindCompoundHighlight = bindCompoundHighlight(this.cy, {
            onCompoundTap: (compoundId) => {
                this.selectCompound(compoundId);
            }
        });
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
        this.unbindCompoundHighlight?.();
        this.unbindCompoundHighlight = undefined;
        this.stopPhysics();
        this.physics = undefined;
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

        // Pause only — simulation state (velocities, pins) is kept, so toggling
        // Animate back on continues the exact same trajectory toward the same
        // attractor instead of restarting a fresh simulation.
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
        this.lifecycle = 'layouting';

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
        this.cy.$(':selected').unselect();
        this.cy.$id(nodeId).select();
        syncCompoundSelection(this.cy);
        this.options.onSelect?.(nodeId);
    }

    selectCompound(compoundId: string): void {
        if (!this.cy) {
            return;
        }
        this.cy.$(':selected').unselect();
        const compound = this.cy.$id(compoundId);
        if (compound.length === 0 || !compound.data('isCompound')) {
            return;
        }
        compound.select();
        syncCompoundSelection(this.cy);
        this.options.onSelect?.(undefined);
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
            },
            onNodeDblTap: (nodeId) => {
                this.selectNode(nodeId);
                this.options.onOpen?.(nodeId);
            },
            onBackgroundTap: () => {
                this.cy?.$(':selected').unselect();
                syncCompoundSelection(this.cy!);
                this.options.onSelect?.(undefined);
            },
            onNodeGrab: (nodeId) => {
                this.draggingCount += 1;
                this.nodesActuallyMoved.delete(nodeId); // reset for this interaction
                if (this.lifecycle === 'physics') {
                    // Pin the held node: the simulation stops integrating it but keeps
                    // running, so its live drag position repels/attracts everyone else
                    // continuously. The sim is never stopped or restarted for a drag.
                    this.physics?.pin(nodeId);
                } else {
                    this.stopLayout();
                    if (this.lifecycle === 'layouting') {
                        this.lifecycle = 'idle';
                        this.finishRender(this.activeSyncGeneration);
                    }
                }
            },
            onNodeDrag: (nodeId, position) => {
                this.nodesActuallyMoved.add(nodeId);
                if (this.lifecycle === 'physics') {
                    // Cytoscape already moves the node with the pointer; the pinned
                    // node's live position feeds into the running simulation each tick,
                    // so nothing else is needed here.
                    return;
                }
                this.userPositionedNodes.set(nodeId, { x: position.x, y: position.y });
            },
            onNodeFree: (nodeId, position) => {
                const wasMoved = this.nodesActuallyMoved.has(nodeId);
                this.nodesActuallyMoved.delete(nodeId);
                this.draggingCount = Math.max(0, this.draggingCount - 1);

                if (this.lifecycle === 'physics') {
                    // Release with no snap and no restart: the node rejoins the live
                    // simulation exactly where the user left it (at rest after a real
                    // drag; with its untouched velocity after a bare click), and every
                    // other node keeps converging with its current momentum.
                    this.physics?.unpin(nodeId, wasMoved);
                } else if (wasMoved) {
                    this.userPositionedNodes.set(nodeId, { x: position.x, y: position.y });
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
        const validNodeIds = new Set(slice.nodes.map(node => node.id));
        this.pruneUserPositionedNodes(validNodeIds);
        this.physics?.prune(validNodeIds);

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
                    groupBasis: options.groupBasis,
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

        this.cy.$(':selected').unselect();
        if (selectedId && this.cy.$id(selectedId).length > 0) {
            this.cy.$id(selectedId).select();
        }
        syncCompoundSelection(this.cy);
        if (!selectedId || this.cy.$id(selectedId).length === 0) {
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
            getLayoutConfig(
                this.layoutId,
                this.syncOptions.useCompound,
                mode,
                nodeCount,
                fixedNodes,
                this.animatePhysics
            )
        );
        this.activeLayout = layout;

        layout.on('layoutstop', () => {
            if (generation !== this.activeSyncGeneration || runId !== this.activeLayoutRunId) {
                graphLog('layoutstop ignored (stale)', { generation, runId });
                return;
            }

            this.activeLayout = undefined;
            graphLog('layoutstop', { generation, runId, mode });

            this.resolveGroupContainersAfterLayout();

            const goPhysics = this.animatePhysics && isForceDirectedLayout(this.layoutId);
            if (goPhysics) {
                this.lifecycle = 'physics';
                if (mode === 'initial') {
                    this.finishRender(generation);
                }
                // A batch layout just moved every node, so old momentum is stale.
                this.startPhysics(generation, true);
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

    /**
     * Cola (and other batch layouts) separate leaf nodes but not compound rectangles.
     * After every batch layout in compound mode, run the shared group constraint pass:
     * push disjoint containers apart; allow overlap when a node is shared (groupIds).
     */
    private resolveGroupContainersAfterLayout(): void {
        if (!this.cy || !this.syncOptions.useCompound || !graphHasGroupConstraints(this.cy)) {
            return;
        }
        const result = resolveGroupContainerOverlaps(this.cy);
        graphLog('group containers resolved', result);
    }

    /**
     * Start (or resume) the continuous simulation. The simulation instance lives as
     * long as the cytoscape instance: it is only paused/resumed, never rebuilt, so
     * positions and velocities carry across Animate toggles, drags, and clicks.
     * `freshPositions` zeroes velocities — set it only when a batch layout has just
     * teleported nodes, where carried-over momentum would be meaningless.
     */
    private startPhysics(generation: number, freshPositions = false): void {
        if (!this.cy || this.cy.elements().length === 0 || generation !== this.activeSyncGeneration) {
            return;
        }

        if (!this.animatePhysics || !isForceDirectedLayout(this.layoutId)) {
            return;
        }

        this.stopLayout();

        if (!this.physics) {
            this.physics = new GraphPhysicsSimulation(this.cy);
        }
        if (freshPositions) {
            this.physics.resetVelocities();
        }
        graphLog('physics start', { generation, freshPositions });
        this.physics.start();
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

    /** Pause the simulation; velocities and pins survive for the next start. */
    private stopPhysics(): void {
        this.physics?.stop();
    }
}
