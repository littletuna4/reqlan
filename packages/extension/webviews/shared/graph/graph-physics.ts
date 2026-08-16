/**
 * Continuous force-directed physics for the Ideas Summary graph ("Animate" toggle).
 *
 * Obsidian-style simulation: shared physics-core plus
 * group container constraints from graph-groups.ts.
 * per ["../../../../../reqlan rq/extension/library/graph.rq"] layout_physics
 */
import type cytoscape from 'cytoscape';
import {
    accumulateForces,
    DEFAULT_PHYSICS_SETTINGS as CORE_PHYSICS_SETTINGS,
    integrateFromForces,
    type PhysicsCoreSettings,
    type PhysicsStepState
} from './physics-core.js';
import {
    applyGroupForces,
    DEFAULT_GROUP_SETTINGS,
    type GraphGroupSettings
} from './graph-groups.js';
import { graphLog } from './graph-debug.js';

export interface GraphPhysicsSettings extends GraphGroupSettings, PhysicsCoreSettings {}

export const DEFAULT_PHYSICS_SETTINGS: GraphPhysicsSettings = {
    ...DEFAULT_GROUP_SETTINGS,
    ...CORE_PHYSICS_SETTINGS
};

interface NodeVelocity {
    vx: number;
    vy: number;
}

export class GraphPhysicsSimulation {
    private readonly velocities = new Map<string, NodeVelocity>();
    private readonly pinnedNodes = new Set<string>();
    private frame: number | undefined;
    private active = false;
    private calmTicks = 0;

    constructor(
        private readonly cy: cytoscape.Core,
        private readonly settings: GraphPhysicsSettings = { ...DEFAULT_PHYSICS_SETTINGS }
    ) {}

    get isActive(): boolean {
        return this.active;
    }

    /** Mutate live force parameters; wakes a running sim so changes take effect immediately. */
    updateSettings(partial: Partial<GraphPhysicsSettings>): void {
        Object.assign(this.settings, partial);
        this.wake();
    }

    getSettings(): GraphPhysicsSettings {
        return { ...this.settings };
    }

    start(): void {
        if (this.active) {
            this.wake();
            return;
        }
        this.active = true;
        this.calmTicks = 0;
        this.scheduleTick();
    }

    stop(): void {
        this.active = false;
        if (this.frame !== undefined) {
            cancelAnimationFrame(this.frame);
            this.frame = undefined;
        }
    }

    wake(): void {
        this.calmTicks = 0;
        if (this.active) {
            this.scheduleTick();
        }
    }

    pin(nodeId: string): void {
        this.pinnedNodes.add(nodeId);
        this.wake();
    }

    unpin(nodeId: string, atRest: boolean): void {
        this.pinnedNodes.delete(nodeId);
        if (atRest) {
            this.velocities.delete(nodeId);
        }
        this.wake();
    }

    resetVelocities(): void {
        this.velocities.clear();
    }

    prune(validNodeIds: ReadonlySet<string>): void {
        for (const nodeId of [...this.velocities.keys()]) {
            if (!validNodeIds.has(nodeId)) {
                this.velocities.delete(nodeId);
            }
        }
        for (const nodeId of [...this.pinnedNodes]) {
            if (!validNodeIds.has(nodeId)) {
                this.pinnedNodes.delete(nodeId);
            }
        }
    }

    private scheduleTick(): void {
        if (this.frame !== undefined) {
            return;
        }
        this.frame = requestAnimationFrame(() => {
            this.frame = undefined;
            this.tick();
        });
    }

    private tick(): void {
        if (!this.active) {
            return;
        }

        const nodes = this.cy.nodes(':childless');
        const count = nodes.length;
        if (count === 0) {
            return;
        }

        const { restSpeed, restTicks } = this.settings;

        const ids = new Array<string>(count);
        const xs = new Float64Array(count);
        const ys = new Float64Array(count);
        const fxs = new Float64Array(count);
        const fys = new Float64Array(count);
        const groupIdsByIndex = new Array<readonly string[] | undefined>(count);
        const edges: Array<{ sourceId: string; targetId: string }> = [];

        nodes.forEach((node, index) => {
            const position = node.position();
            ids[index] = node.id();
            xs[index] = position.x;
            ys[index] = position.y;
            groupIdsByIndex[index] = node.data('groupIds') as string[] | undefined;
        });

        this.cy.edges().forEach((edge) => {
            edges.push({ sourceId: edge.source().id(), targetId: edge.target().id() });
        });

        const state: PhysicsStepState = {
            ids,
            xs,
            ys,
            fxs,
            fys,
            velocities: this.velocities,
            pinnedIds: this.pinnedNodes,
            edges
        };

        accumulateForces(state, this.settings);
        const groupForces = applyGroupForces(
            count,
            xs,
            ys,
            groupIdsByIndex,
            fxs,
            fys,
            this.settings
        );

        let averageSpeed = 0;
        this.cy.batch(() => {
            averageSpeed = integrateFromForces(state, this.settings);
            for (let i = 0; i < count; i += 1) {
                if (this.pinnedNodes.has(ids[i])) {
                    continue;
                }
                nodes[i].position({ x: xs[i], y: ys[i] });
            }
        });

        const dragging = this.pinnedNodes.size > 0;
        const groupActive = groupForces.disjointOverlap || groupForces.containerConflict;
        if (!dragging && !groupActive && averageSpeed < restSpeed) {
            this.calmTicks += 1;
            if (this.calmTicks >= restTicks) {
                graphLog('physics sleeping', { nodes: count, averageSpeed });
                return;
            }
        } else {
            this.calmTicks = 0;
        }

        this.scheduleTick();
    }
}
