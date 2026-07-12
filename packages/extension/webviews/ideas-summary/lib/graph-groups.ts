/**
 * Group / compound-container constraint logic shared by batch layout (cola post-pass)
 * and live physics (graph-physics.ts).
 *
 * Each leaf node carries data('groupIds'): the containers it belongs to. Containers
 * that share no member are pushed apart; containers that share a member are allowed
 * to overlap — the shared node is pulled toward both centroids (cohesion in physics)
 * and acts as a bridge between boxes.
 *
 * Hierarchical folder grouping writes a single groupId per node; tag grouping can write
 * several, which is what enables intentional overlap.
 */
import type cytoscape from 'cytoscape';

/** Half-extent of a rendered idea node (matches stylesheet width/height 44). */
export const GROUP_NODE_HALF_EXTENT = 22;

export interface GraphGroupSettings {
    /** Padding around each group's member bounding box (px). */
    padding: number;
    /** Physics: pull each member toward its group centroid. */
    cohesion: number;
    /** Physics: linear push strength for overlapping disjoint groups (px/tick per px overlap). */
    separationStrength: number;
    /** Physics: push leaf nodes away from foreign group boxes (px/tick per px penetration). */
    containerRepulsion: number;
    /** Physics: minimum clearance between a leaf and a foreign group box edge (px). */
    containerMinGap: number;
    /** Batch: max iterations for the post-layout overlap resolver. */
    batchMaxIterations: number;
    /** Batch: fraction of overlap depth applied per iteration (0–1). */
    batchSeparationScale: number;
}

export const DEFAULT_GROUP_SETTINGS: GraphGroupSettings = {
    padding: 18,
    cohesion: 0.012,
    separationStrength: 0.05,
    containerRepulsion: 0.07,
    containerMinGap: 14,
    batchMaxIterations: 48,
    batchSeparationScale: 0.55
};

export interface GroupForceResult {
    /** True while disjoint group boxes still overlap each other. */
    disjointOverlap: boolean;
    /** True while any leaf sits inside or too close to a foreign group box. */
    containerConflict: boolean;
}

export interface LeafGroupSnapshot {
    nodes: cytoscape.NodeCollection;
    count: number;
    ids: string[];
    xs: Float64Array;
    ys: Float64Array;
    indexById: Map<string, number>;
    groupIdsByIndex: Array<readonly string[] | undefined>;
}

export interface GroupBounds {
    id: string;
    cx: number;
    cy: number;
    halfW: number;
    halfH: number;
    members: readonly number[];
}

/** Deterministic angle in [0, 2π) derived from a string. */
export function hashAngle(seed: string): number {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 31 + seed.charCodeAt(index)) | 0;
    }
    return ((hash >>> 0) % 6283) / 1000;
}

/** Deterministic unit vector when two group centroids coincide. */
export function hashUnitVector(seed: string): { x: number; y: number } {
    const angle = hashAngle(seed);
    return { x: Math.cos(angle), y: Math.sin(angle) };
}

export function pairKey(a: string, b: string): string {
    return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/** Read current leaf positions and groupIds from cytoscape. Returns null when no groups exist. */
export function collectLeafGroupSnapshot(cy: cytoscape.Core): LeafGroupSnapshot | null {
    const nodes = cy.nodes(':childless');
    const count = nodes.length;
    if (count === 0) {
        return null;
    }

    const ids = new Array<string>(count);
    const xs = new Float64Array(count);
    const ys = new Float64Array(count);
    const indexById = new Map<string, number>();
    const groupIdsByIndex = new Array<readonly string[] | undefined>(count);
    let hasGroups = false;

    nodes.forEach((node, index) => {
        const position = node.position();
        ids[index] = node.id();
        xs[index] = position.x;
        ys[index] = position.y;
        indexById.set(node.id(), index);
        const groupIds = node.data('groupIds') as string[] | undefined;
        groupIdsByIndex[index] = groupIds;
        if (groupIds && groupIds.length > 0) {
            hasGroups = true;
        }
    });

    if (!hasGroups) {
        return null;
    }

    return { nodes, count, ids, xs, ys, indexById, groupIdsByIndex };
}

/**
 * Build group → member indices and the set of group pairs that share a member.
 * Shared pairs must NOT be separated — overlap around the shared node is expected.
 */
export function buildGroupMembership(
    count: number,
    groupIdsByIndex: ReadonlyArray<readonly string[] | undefined>
): { membership: Map<string, number[]>; sharedPairs: Set<string> } {
    const membership = new Map<string, number[]>();
    const sharedPairs = new Set<string>();

    for (let i = 0; i < count; i += 1) {
        const groups = groupIdsByIndex[i];
        if (!groups || groups.length === 0) {
            continue;
        }
        for (const groupId of groups) {
            const bucket = membership.get(groupId);
            if (bucket) {
                bucket.push(i);
            } else {
                membership.set(groupId, [i]);
            }
        }
        for (let a = 0; a < groups.length; a += 1) {
            for (let b = a + 1; b < groups.length; b += 1) {
                sharedPairs.add(pairKey(groups[a], groups[b]));
            }
        }
    }

    return { membership, sharedPairs };
}

export function measureGroupBounds(
    id: string,
    members: readonly number[],
    xs: Float64Array,
    ys: Float64Array,
    padding: number
): GroupBounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const index of members) {
        minX = Math.min(minX, xs[index]);
        minY = Math.min(minY, ys[index]);
        maxX = Math.max(maxX, xs[index]);
        maxY = Math.max(maxY, ys[index]);
    }
    const pad = padding + GROUP_NODE_HALF_EXTENT;
    return {
        id,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
        halfW: (maxX - minX) / 2 + pad,
        halfH: (maxY - minY) / 2 + pad,
        members
    };
}

/** Axis-aligned push to separate two overlapping group boxes. Null when disjoint. */
export function computeGroupBoxSeparation(
    left: GroupBounds,
    right: GroupBounds,
    strength: number
): { pushX: number; pushY: number } | null {
    const dx = right.cx - left.cx;
    const dy = right.cy - left.cy;
    const overlapX = left.halfW + right.halfW - Math.abs(dx);
    const overlapY = left.halfH + right.halfH - Math.abs(dy);
    if (overlapX <= 0 || overlapY <= 0) {
        return null;
    }

    if (overlapX <= overlapY) {
        const sign = Math.abs(dx) < 1e-3 ? hashUnitVector(left.id + right.id).x : Math.sign(dx);
        return { pushX: sign * strength * overlapX, pushY: 0 };
    }
    const sign = Math.abs(dy) < 1e-3 ? hashUnitVector(left.id + right.id).y : Math.sign(dy);
    return { pushX: 0, pushY: sign * strength * overlapY };
}

function distributeToMembers(
    members: readonly number[],
    totalFx: number,
    totalFy: number,
    fxs: Float64Array,
    fys: Float64Array
): void {
    if (members.length === 0) {
        return;
    }
    const fxEach = totalFx / members.length;
    const fyEach = totalFy / members.length;
    for (const index of members) {
        fxs[index] += fxEach;
        fys[index] += fyEach;
    }
}

function distributeToMembersPositions(
    members: readonly number[],
    totalDx: number,
    totalDy: number,
    xs: Float64Array,
    ys: Float64Array
): void {
    if (members.length === 0) {
        return;
    }
    const dxEach = totalDx / members.length;
    const dyEach = totalDy / members.length;
    for (const index of members) {
        xs[index] += dxEach;
        ys[index] += dyEach;
    }
}

/** Closest point on an axis-aligned box to (px, py). */
function closestPointOnBox(
    px: number,
    py: number,
    box: GroupBounds
): { x: number; y: number } {
    return {
        x: Math.max(box.cx - box.halfW, Math.min(px, box.cx + box.halfW)),
        y: Math.max(box.cy - box.halfH, Math.min(py, box.cy + box.halfH))
    };
}

/**
 * Repulsion push for a leaf against a foreign group box. Null when clearance is OK.
 */
function computeForeignContainerPush(
    px: number,
    py: number,
    box: GroupBounds,
    minGap: number,
    strength: number,
    seed: string
): { pushX: number; pushY: number } | null {
    const insideX = Math.abs(px - box.cx) < box.halfW;
    const insideY = Math.abs(py - box.cy) < box.halfH;

    if (insideX && insideY) {
        const penX = box.halfW - Math.abs(px - box.cx);
        const penY = box.halfH - Math.abs(py - box.cy);
        if (penX <= penY) {
            const sign = Math.abs(px - box.cx) < 1e-3 ? hashUnitVector(seed).x : Math.sign(px - box.cx);
            return { pushX: sign * strength * (penX + minGap), pushY: 0 };
        }
        const sign = Math.abs(py - box.cy) < 1e-3 ? hashUnitVector(seed).y : Math.sign(py - box.cy);
        return { pushX: 0, pushY: sign * strength * (penY + minGap) };
    }

    const closest = closestPointOnBox(px, py, box);
    let dx = px - closest.x;
    let dy = py - closest.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= minGap) {
        return null;
    }
    if (dist < 1e-3) {
        const unit = hashUnitVector(seed);
        dx = unit.x;
        dy = unit.y;
    } else {
        dx /= dist;
        dy /= dist;
    }
    const penetration = minGap - dist;
    return { pushX: dx * strength * penetration, pushY: dy * strength * penetration };
}

function applyForeignContainerRepulsion(
    nodeIndex: number,
    px: number,
    py: number,
    box: GroupBounds,
    minGap: number,
    strength: number,
    fxs: Float64Array,
    fys: Float64Array
): boolean {
    const push = computeForeignContainerPush(px, py, box, minGap, strength, `${nodeIndex}:${box.id}`);
    if (!push) {
        return false;
    }
    fxs[nodeIndex] += push.pushX;
    fys[nodeIndex] += push.pushY;
    distributeToMembers(box.members, -push.pushX, -push.pushY, fxs, fys);
    return true;
}

/**
 * Physics tick: cohesion, disjoint-group separation, and node↔foreign-container
 * repulsion. Returns flags used to keep the sim awake while constraints are active.
 */
export function applyGroupForces(
    count: number,
    xs: Float64Array,
    ys: Float64Array,
    groupIdsByIndex: ReadonlyArray<readonly string[] | undefined>,
    fxs: Float64Array,
    fys: Float64Array,
    settings: GraphGroupSettings
): GroupForceResult {
    const { cohesion, separationStrength, padding, containerRepulsion, containerMinGap } = settings;
    const { membership, sharedPairs } = buildGroupMembership(count, groupIdsByIndex);
    const result: GroupForceResult = { disjointOverlap: false, containerConflict: false };
    if (membership.size === 0) {
        return result;
    }

    const groupIds = [...membership.keys()].sort();
    const bounds = groupIds.map(id => measureGroupBounds(id, membership.get(id)!, xs, ys, padding));

    if (cohesion > 0) {
        for (const group of bounds) {
            for (const index of group.members) {
                fxs[index] += cohesion * (group.cx - xs[index]);
                fys[index] += cohesion * (group.cy - ys[index]);
            }
        }
    }

    for (let i = 0; i < bounds.length; i += 1) {
        for (let j = i + 1; j < bounds.length; j += 1) {
            const left = bounds[i];
            const right = bounds[j];
            if (sharedPairs.has(pairKey(left.id, right.id))) {
                continue;
            }
            const separation = computeGroupBoxSeparation(left, right, separationStrength);
            if (!separation) {
                continue;
            }
            distributeToMembers(left.members, -separation.pushX, -separation.pushY, fxs, fys);
            distributeToMembers(right.members, separation.pushX, separation.pushY, fxs, fys);
            result.disjointOverlap = true;
        }
    }

    for (let nodeIndex = 0; nodeIndex < count; nodeIndex += 1) {
        const memberOf = new Set(groupIdsByIndex[nodeIndex] ?? []);
        for (const box of bounds) {
            if (memberOf.has(box.id)) {
                continue;
            }
            if (applyForeignContainerRepulsion(
                nodeIndex,
                xs[nodeIndex],
                ys[nodeIndex],
                box,
                containerMinGap,
                containerRepulsion,
                fxs,
                fys
            )) {
                result.containerConflict = true;
            }
        }
    }

    return result;
}

/**
 * Batch post-pass after cola / fcose: iteratively nudge leaf nodes until disjoint
 * group boxes no longer overlap. Skips pairs that share a member. Used because cola's
 * avoidOverlap operates on nodes, not on rendered compound rectangles, and knows
 * nothing about multi-membership groupIds.
 */
export function resolveGroupContainerOverlaps(
    cy: cytoscape.Core,
    settings: GraphGroupSettings = DEFAULT_GROUP_SETTINGS
): { iterations: number; resolved: boolean } {
    const snapshot = collectLeafGroupSnapshot(cy);
    if (!snapshot) {
        return { iterations: 0, resolved: true };
    }

    const { count, xs, ys, groupIdsByIndex, nodes } = snapshot;
    const { membership, sharedPairs } = buildGroupMembership(count, groupIdsByIndex);
    if (membership.size < 2) {
        return { iterations: 0, resolved: true };
    }

    const { padding, batchMaxIterations, batchSeparationScale, containerMinGap, containerRepulsion } = settings;
    let resolved = true;
    let lastMovedIteration = -1;

    for (let iteration = 0; iteration < batchMaxIterations; iteration += 1) {
        const groupIds = [...membership.keys()].sort();
        const bounds = groupIds.map(id => measureGroupBounds(id, membership.get(id)!, xs, ys, padding));
        let moved = false;

        for (let i = 0; i < bounds.length; i += 1) {
            for (let j = i + 1; j < bounds.length; j += 1) {
                const left = bounds[i];
                const right = bounds[j];
                if (sharedPairs.has(pairKey(left.id, right.id))) {
                    continue;
                }
                const separation = computeGroupBoxSeparation(left, right, batchSeparationScale);
                if (!separation) {
                    continue;
                }
                distributeToMembersPositions(left.members, -separation.pushX, -separation.pushY, xs, ys);
                distributeToMembersPositions(right.members, separation.pushX, separation.pushY, xs, ys);
                moved = true;
                resolved = false;
            }
        }

        for (let nodeIndex = 0; nodeIndex < count; nodeIndex += 1) {
            const memberOf = new Set(groupIdsByIndex[nodeIndex] ?? []);
            for (const box of bounds) {
                if (memberOf.has(box.id)) {
                    continue;
                }
                const push = computeForeignContainerPush(
                    xs[nodeIndex],
                    ys[nodeIndex],
                    box,
                    containerMinGap,
                    containerRepulsion * batchSeparationScale,
                    `${nodeIndex}:${box.id}`
                );
                if (!push) {
                    continue;
                }
                xs[nodeIndex] += push.pushX;
                ys[nodeIndex] += push.pushY;
                distributeToMembersPositions(box.members, -push.pushX, -push.pushY, xs, ys);
                moved = true;
                resolved = false;
            }
        }

        if (moved) {
            lastMovedIteration = iteration;
        } else if (lastMovedIteration >= 0) {
            cy.batch(() => {
                for (let i = 0; i < count; i += 1) {
                    nodes[i].position({ x: xs[i], y: ys[i] });
                }
            });
            return { iterations: iteration, resolved: true };
        } else {
            return { iterations: 0, resolved: true };
        }
    }

    if (lastMovedIteration >= 0) {
        cy.batch(() => {
            for (let i = 0; i < count; i += 1) {
                nodes[i].position({ x: xs[i], y: ys[i] });
            }
        });
    }

    return { iterations: batchMaxIterations, resolved };
}

/** True when any leaf node has groupIds (compound / group mode active in data). */
export function graphHasGroupConstraints(cy: cytoscape.Core): boolean {
    return collectLeafGroupSnapshot(cy) !== null;
}
