/**
 * Continuous force-directed physics for the Ideas Summary graph ("Animate" toggle).
 *
 * Obsidian-style simulation: central gravity + link (spring) attraction + pairwise
 * node repulsion, integrated with damped semi-implicit Euler once per animation frame.
 * per ["../../../../../reqlan rq/extension/module/graphical_graph.rq"] layout_physics
 *
 * Design constraints:
 * - Deterministic: forces are pure functions of positions, iteration order is stable,
 *   and there is no randomness (coincident nodes separate along a hash-derived angle).
 *   Identical positions + velocities always produce identical future motion, and
 *   restarting from the same positions converges to the same attractor.
 * - Never restarted for interactions: dragging pins a node (the sim stops writing to
 *   it but keeps simulating everyone else against its live position); releasing just
 *   unpins it where it sits. No global reheat, so clicks and drags cannot jolt or
 *   snap the graph.
 * - Every childless node participates, connected or not: orphans feel gravity and
 *   repulsion exactly like linked nodes.
 * - Long, gentle convergence (tens of seconds): weak forces with light viscous
 *   damping. The loop sleeps once average speed stays below restSpeed for restTicks
 *   frames, and wakes on interaction or graph change — state is kept, never reset.
 */
import type cytoscape from 'cytoscape';
import { graphLog } from './graph-debug.js';

export interface GraphPhysicsSettings {
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

// Tuned for slow, obsidian-like convergence at ~60 fps. With damping d the
// steady-state velocity under a constant force F is F·d/(1−d), which is exactly F
// at d = 0.5 — so these force constants read directly as drift speed in px/tick.
// Springs relax with a ~1 s time constant (local structure forms quickly) while
// gravity has a ~8 s time constant, so global compaction keeps visibly drifting
// for tens of seconds before the sim sleeps. Linked pairs settle ~1.4× the rest
// length apart once repulsion is added.
export const DEFAULT_PHYSICS_SETTINGS: GraphPhysicsSettings = {
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

/** Deterministic angle in [0, 2π) derived from a string, for separating coincident nodes. */
function hashAngle(seed: string): number {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 31 + seed.charCodeAt(index)) | 0;
    }
    return ((hash >>> 0) % 6283) / 1000;
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

    /** Start (or resume) the simulation. Velocities persist across stop/start. */
    start(): void {
        if (this.active) {
            this.wake();
            return;
        }
        this.active = true;
        this.calmTicks = 0;
        this.scheduleTick();
    }

    /** Pause the loop. State (velocities, pins) is kept for a later start(). */
    stop(): void {
        this.active = false;
        if (this.frame !== undefined) {
            cancelAnimationFrame(this.frame);
            this.frame = undefined;
        }
    }

    /** Resume ticking after the loop went to sleep on convergence. */
    wake(): void {
        this.calmTicks = 0;
        if (this.active) {
            this.scheduleTick();
        }
    }

    /**
     * Stop integrating a node (grab/drag). Its live position still exerts gravity,
     * spring, and repulsion forces on every other node while the user holds it.
     * The node's velocity is kept so a bare click (pin + unpin with no movement)
     * leaves the simulation state exactly as it was.
     */
    pin(nodeId: string): void {
        this.pinnedNodes.add(nodeId);
        this.wake();
    }

    /**
     * Hand a node back to the simulation exactly where it is. No snap and no
     * restart: everyone else keeps converging with their current velocities.
     * `atRest` zeroes the node's own velocity — used after a real drag, where the
     * pre-drag velocity is stale; a bare click keeps it for perfect continuation.
     */
    unpin(nodeId: string, atRest: boolean): void {
        this.pinnedNodes.delete(nodeId);
        if (atRest) {
            this.velocities.delete(nodeId);
        }
        this.wake();
    }

    /**
     * Zero all velocities. Used after a batch layout teleports nodes, where carrying
     * over momentum from the old positions would be meaningless.
     */
    resetVelocities(): void {
        this.velocities.clear();
    }

    /** Drop state for nodes that no longer exist in the graph. */
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
            // Sleep; a later wake() (sync, interaction) re-arms the loop.
            return;
        }

        const { gravity, repulsion, linkStrength, linkDistance, damping, maxVelocity, minSeparation, restSpeed, restTicks } = this.settings;

        const ids = new Array<string>(count);
        const xs = new Float64Array(count);
        const ys = new Float64Array(count);
        const fxs = new Float64Array(count);
        const fys = new Float64Array(count);
        const indexById = new Map<string, number>();

        nodes.forEach((node, index) => {
            const position = node.position();
            ids[index] = node.id();
            xs[index] = position.x;
            ys[index] = position.y;
            indexById.set(node.id(), index);
        });

        // Central gravity: linear pull toward the current centroid. Using the
        // centroid (not a fixed point) makes gravity translation-invariant, so the
        // graph compacts without the whole cluster sliding across the canvas, and
        // the attractor is still a pure function of the current positions.
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

        // Pairwise inverse-square repulsion, coincident pairs separated deterministically.
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

        // Link attraction: linear springs toward the rest length.
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

        // Damped semi-implicit Euler; pinned nodes are read-only for the sim.
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

        // Sleep on convergence — but never while a node is held, so the graph keeps
        // responding (repulsion, springs) around the user's hand for the whole drag.
        const dragging = this.pinnedNodes.size > 0;
        const averageSpeed = movingCount > 0 ? speedSum / movingCount : 0;
        if (!dragging && averageSpeed < restSpeed) {
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
