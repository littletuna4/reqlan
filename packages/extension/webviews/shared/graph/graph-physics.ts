/**
 * Continuous force-directed physics for the Ideas Summary graph ("Animate" toggle).
 *
 * Obsidian-style simulation: central gravity + link (spring) attraction + pairwise
 * node repulsion, integrated with damped semi-implicit Euler once per animation frame.
 * Group container constraints (shared-node overlap rules) live in graph-groups.ts.
 * per ["../../../../../reqlan rq/extension/library/graph.rq"] layout_physics
 */
import type cytoscape from 'cytoscape';
import {
    applyGroupForces,
    DEFAULT_GROUP_SETTINGS,
    hashAngle,
    type GraphGroupSettings
} from './graph-groups.js';
import { graphLog } from './graph-debug.js';

export interface GraphPhysicsSettings extends GraphGroupSettings {
    /** Linear pull toward the graph centroid, per px of distance. */
    gravity: number;
    /** Inverse-square pairwise repulsion constant. */
    repulsion: number;
    /** Spring stiffness for edges, per px of extension. */
    linkStrength: number;
    /** Rest length for edge springs, in model px. */
    linkDistance: number;
    /** Fraction of velocity kept each tick (viscous damping). */
    damping: number;
    /** Velocity clamp in px/tick so cold starts stay stable. */
    maxVelocity: number;
    /** Minimum pair distance used for repulsion, to avoid force blow-ups. */
    minSeparation: number;
    /** Average speed (px/tick) below which the sim counts as calm. */
    restSpeed: number;
    /** Consecutive calm ticks before the loop goes to sleep. */
    restTicks: number;
}

export const DEFAULT_PHYSICS_SETTINGS: GraphPhysicsSettings = {
    ...DEFAULT_GROUP_SETTINGS,
    gravity: 0.002,
    repulsion: 20000,
    linkStrength: 0.015,
    linkDistance: 120,
    damping: 0.5,
    maxVelocity: 10,
    minSeparation: 24,
    restSpeed: 0.02,
    restTicks: 90
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
        private readonly settings: GraphPhysicsSettings = DEFAULT_PHYSICS_SETTINGS
    ) {}

    get isActive(): boolean {
        return this.active;
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

        const {
            gravity,
            repulsion,
            linkStrength,
            linkDistance,
            damping,
            maxVelocity,
            minSeparation,
            restSpeed,
            restTicks
        } = this.settings;

        const ids = new Array<string>(count);
        const xs = new Float64Array(count);
        const ys = new Float64Array(count);
        const fxs = new Float64Array(count);
        const fys = new Float64Array(count);
        const indexById = new Map<string, number>();
        const groupIdsByIndex = new Array<readonly string[] | undefined>(count);

        nodes.forEach((node, index) => {
            const position = node.position();
            ids[index] = node.id();
            xs[index] = position.x;
            ys[index] = position.y;
            indexById.set(node.id(), index);
            groupIdsByIndex[index] = node.data('groupIds') as string[] | undefined;
        });

        let centroidX = 0;
        let centroidY = 0;
        for (let i = 0; i < count; i += 1) {
            centroidX += xs[i];
            centroidY += ys[i];
        }
        centroidX /= count;
        centroidY /= count;
        for (let i = 0; i < count; i += 1) {
            fxs[i] -= gravity * (xs[i] - centroidX);
            fys[i] -= gravity * (ys[i] - centroidY);
        }

        const minSeparationSq = minSeparation * minSeparation;
        for (let i = 0; i < count; i += 1) {
            for (let j = i + 1; j < count; j += 1) {
                let dx = xs[j] - xs[i];
                let dy = ys[j] - ys[i];
                let distSq = dx * dx + dy * dy;
                if (distSq < 1e-6) {
                    const angle = hashAngle(ids[i] + ids[j]);
                    dx = Math.cos(angle);
                    dy = Math.sin(angle);
                    distSq = 1;
                }
                const clampedSq = Math.max(distSq, minSeparationSq);
                const dist = Math.sqrt(distSq);
                const force = repulsion / clampedSq;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                fxs[i] -= fx;
                fys[i] -= fy;
                fxs[j] += fx;
                fys[j] += fy;
            }
        }

        this.cy.edges().forEach((edge) => {
            const sourceIndex = indexById.get(edge.source().id());
            const targetIndex = indexById.get(edge.target().id());
            if (sourceIndex === undefined || targetIndex === undefined || sourceIndex === targetIndex) {
                return;
            }
            const dx = xs[targetIndex] - xs[sourceIndex];
            const dy = ys[targetIndex] - ys[sourceIndex];
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 1e-3) {
                return;
            }
            const force = linkStrength * (dist - linkDistance);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            fxs[sourceIndex] += fx;
            fys[sourceIndex] += fy;
            fxs[targetIndex] -= fx;
            fys[targetIndex] -= fy;
        });

        const groupForces = applyGroupForces(
            count,
            xs,
            ys,
            groupIdsByIndex,
            fxs,
            fys,
            this.settings
        );

        let speedSum = 0;
        let movingCount = 0;
        this.cy.batch(() => {
            for (let i = 0; i < count; i += 1) {
                const id = ids[i];
                if (this.pinnedNodes.has(id)) {
                    continue;
                }
                const velocity = this.velocities.get(id) ?? { vx: 0, vy: 0 };
                let vx = (velocity.vx + fxs[i]) * damping;
                let vy = (velocity.vy + fys[i]) * damping;
                const speed = Math.sqrt(vx * vx + vy * vy);
                if (speed > maxVelocity) {
                    const scale = maxVelocity / speed;
                    vx *= scale;
                    vy *= scale;
                }
                velocity.vx = vx;
                velocity.vy = vy;
                this.velocities.set(id, velocity);
                nodes[i].position({ x: xs[i] + vx, y: ys[i] + vy });
                speedSum += Math.min(speed, maxVelocity);
                movingCount += 1;
            }
        });

        const dragging = this.pinnedNodes.size > 0;
        const averageSpeed = movingCount > 0 ? speedSum / movingCount : 0;
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
