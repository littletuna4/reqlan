/**
 * Shared Obsidian-style force step for Ideas Summary live physics and HTML export.
 * Gravity + edge springs + inverse-square repulsion; spatial grid for large n.
 * Plain ESM so the HTML export can embed it by stripping `export` keywords.
 */

/** @typedef {{
 *   gravity: number,
 *   repulsion: number,
 *   linkStrength: number,
 *   linkDistance: number,
 *   damping: number,
 *   maxVelocity: number,
 *   minSeparation: number,
 *   restSpeed: number,
 *   restTicks: number,
 *   repulsionCutoff?: number
 * }} PhysicsCoreSettings */

/** @typedef {{
 *   ids: string[],
 *   xs: Float64Array,
 *   ys: Float64Array,
 *   fxs: Float64Array,
 *   fys: Float64Array,
 *   velocities: Map<string, { vx: number, vy: number }>,
 *   pinnedIds: ReadonlySet<string>,
 *   edges: ReadonlyArray<{ sourceId: string, targetId: string }>
 * }} PhysicsStepState */

/**
 * Deterministic angle in [0, 2π) derived from a string.
 * @param {string} seed
 */
function hashAngleImpl(seed) {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 31 + seed.charCodeAt(index)) | 0;
    }
    return ((hash >>> 0) % 6283) / 1000;
}

/**
 * @param {number} i
 * @param {number} j
 * @param {string[]} ids
 * @param {Float64Array} xs
 * @param {Float64Array} ys
 * @param {Float64Array} fxs
 * @param {Float64Array} fys
 * @param {number} repulsion
 * @param {number} minSeparationSq
 * @param {number} cutoffSq
 */
function applyRepulsion(i, j, ids, xs, ys, fxs, fys, repulsion, minSeparationSq, cutoffSq) {
    let dx = xs[j] - xs[i];
    let dy = ys[j] - ys[i];
    let distSq = dx * dx + dy * dy;
    if (distSq > cutoffSq) {
        return;
    }
    if (distSq < 1e-6) {
        const angle = hashAngleImpl(ids[i] + ids[j]);
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

/**
 * Zero fxs/fys then add gravity, repulsion, and edge springs.
 * Callers may add extra forces (e.g. group constraints) before integrateFromForces.
 * @param {PhysicsStepState} state
 * @param {PhysicsCoreSettings} settings
 */
function accumulateForcesImpl(state, settings) {
    const { ids, xs, ys, fxs, fys, edges } = state;
    const count = ids.length;
    fxs.fill(0);
    fys.fill(0);
    if (count === 0) {
        return;
    }

    const {
        gravity,
        repulsion,
        linkStrength,
        linkDistance,
        minSeparation,
        repulsionCutoff = 420
    } = settings;

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
    const cutoff = Math.max(minSeparation * 2, repulsionCutoff);
    const cutoffSq = cutoff * cutoff;

    if (count <= 80) {
        for (let i = 0; i < count; i += 1) {
            for (let j = i + 1; j < count; j += 1) {
                applyRepulsion(i, j, ids, xs, ys, fxs, fys, repulsion, minSeparationSq, cutoffSq);
            }
        }
    } else {
        const cellSize = cutoff;
        /** @type {Map<string, number[]>} */
        const grid = new Map();
        for (let i = 0; i < count; i += 1) {
            const key = `${Math.floor(xs[i] / cellSize)},${Math.floor(ys[i] / cellSize)}`;
            let bucket = grid.get(key);
            if (!bucket) {
                bucket = [];
                grid.set(key, bucket);
            }
            bucket.push(i);
        }
        for (let i = 0; i < count; i += 1) {
            const cx = Math.floor(xs[i] / cellSize);
            const cy = Math.floor(ys[i] / cellSize);
            for (let ox = -1; ox <= 1; ox += 1) {
                for (let oy = -1; oy <= 1; oy += 1) {
                    const bucket = grid.get(`${cx + ox},${cy + oy}`);
                    if (!bucket) continue;
                    for (let b = 0; b < bucket.length; b += 1) {
                        const j = bucket[b];
                        if (j <= i) continue;
                        applyRepulsion(i, j, ids, xs, ys, fxs, fys, repulsion, minSeparationSq, cutoffSq);
                    }
                }
            }
        }
    }

    const indexById = new Map();
    for (let i = 0; i < count; i += 1) {
        indexById.set(ids[i], i);
    }
    for (let e = 0; e < edges.length; e += 1) {
        const edge = edges[e];
        const sourceIndex = indexById.get(edge.sourceId);
        const targetIndex = indexById.get(edge.targetId);
        if (sourceIndex === undefined || targetIndex === undefined || sourceIndex === targetIndex) {
            continue;
        }
        const dx = xs[targetIndex] - xs[sourceIndex];
        const dy = ys[targetIndex] - ys[sourceIndex];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1e-3) {
            continue;
        }
        const force = linkStrength * (dist - linkDistance);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        fxs[sourceIndex] += fx;
        fys[sourceIndex] += fy;
        fxs[targetIndex] -= fx;
        fys[targetIndex] -= fy;
    }
}

/**
 * Semi-implicit Euler with damping; mutates xs/ys and velocities. Returns average speed.
 * @param {PhysicsStepState} state
 * @param {PhysicsCoreSettings} settings
 * @returns {number}
 */
function integrateFromForcesImpl(state, settings) {
    const { ids, xs, ys, fxs, fys, velocities, pinnedIds } = state;
    const { damping, maxVelocity } = settings;
    const count = ids.length;
    let speedSum = 0;
    let movingCount = 0;
    for (let i = 0; i < count; i += 1) {
        const id = ids[i];
        if (pinnedIds.has(id)) {
            continue;
        }
        const velocity = velocities.get(id) || { vx: 0, vy: 0 };
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
        velocities.set(id, velocity);
        xs[i] += vx;
        ys[i] += vy;
        speedSum += Math.min(speed, maxVelocity);
        movingCount += 1;
    }
    return movingCount > 0 ? speedSum / movingCount : 0;
}

/**
 * @param {PhysicsStepState} state
 * @param {PhysicsCoreSettings} settings
 * @returns {number}
 */
function stepPhysicsImpl(state, settings) {
    accumulateForcesImpl(state, settings);
    return integrateFromForcesImpl(state, settings);
}

export const ReqlanGraphPhysics = {
    /** @type {PhysicsCoreSettings} */
    DEFAULT_PHYSICS_SETTINGS: {
        gravity: 0.002,
        repulsion: 20000,
        linkStrength: 0.015,
        linkDistance: 120,
        damping: 0.5,
        maxVelocity: 10,
        minSeparation: 24,
        restSpeed: 0.02,
        restTicks: 90,
        repulsionCutoff: 420
    },
    hashAngle: hashAngleImpl,
    accumulateForces: accumulateForcesImpl,
    integrateFromForces: integrateFromForcesImpl,
    stepPhysics: stepPhysicsImpl
};

export const DEFAULT_PHYSICS_SETTINGS = ReqlanGraphPhysics.DEFAULT_PHYSICS_SETTINGS;
export const hashAngle = hashAngleImpl;
export const accumulateForces = accumulateForcesImpl;
export const integrateFromForces = integrateFromForcesImpl;
export const stepPhysics = stepPhysicsImpl;
