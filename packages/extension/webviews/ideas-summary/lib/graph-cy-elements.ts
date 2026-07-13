/**
 * Element diffing for the Ideas Summary graph.
 *
 * Rather than remove-all/add-all on every sync (which discards positions and forces
 * a full relayout), this computes the delta between the live cytoscape graph and the
 * desired slice: surviving nodes keep their positions, only new/removed elements move.
 * per ["../../../../../reqlan rq/extension/library/graph.rq"] graph_cy_elements
 */
import type cytoscape from 'cytoscape';
import type { ElementDefinition } from 'cytoscape';
import type { GraphViewSlice } from '../../../src/webview_module/shared/messages.js';
import {
    buildCytoscapeElements,
    seedNewNodePositions,
    type BuildElementsOptions
} from './graph-cytoscape.js';

export interface ElementDiffResult {
    added: number;
    removed: number;
    updated: number;
    /** True when nodes/edges were added or removed (i.e. a relayout is warranted). */
    structuralChange: boolean;
}

/** Data fields that can change without altering graph structure. */
const MUTABLE_DATA_KEYS = ['label', 'color', 'isCenter', 'isExternal', 'nodeKind'] as const;

function isEdgeDefinition(element: ElementDefinition): boolean {
    return element.data.source !== undefined && element.data.target !== undefined;
}

function sameStringArray(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
    if (a === b) {
        return true;
    }
    if (!a || !b || a.length !== b.length) {
        return false;
    }
    return a.every((value, index) => value === b[index]);
}

/**
 * Reconcile the cytoscape graph with `slice`, adding/removing/updating elements in place.
 * New nodes are seeded from `persistedPositions` (or a fallback circle) so physics/layout
 * starts from a sensible spot; existing nodes are left where they are.
 */
export function syncGraphElements(
    cy: cytoscape.Core,
    slice: GraphViewSlice,
    options: BuildElementsOptions,
    persistedPositions: ReadonlyMap<string, { x: number; y: number }>
): ElementDiffResult {
    const desired = buildCytoscapeElements(slice, options);
    const desiredById = new Map<string, ElementDefinition>();
    for (const element of desired) {
        if (element.data.id) {
            desiredById.set(element.data.id, element);
        }
    }

    let added = 0;
    let removed = 0;
    let updated = 0;
    const newNodeIds: string[] = [];

    cy.batch(() => {
        const stale = cy.elements().filter(element => !desiredById.has(element.id()));
        removed = stale.length;
        stale.remove();

        // Add compound parents before their children so `parent` references resolve.
        for (const element of desired) {
            const id = element.data.id;
            if (!id) {
                continue;
            }
            const existing = cy.getElementById(id);
            if (existing.length === 0) {
                cy.add(element);
                added += 1;
                if (!isEdgeDefinition(element)) {
                    newNodeIds.push(id);
                }
                continue;
            }
            if (updateElementData(existing, element)) {
                updated += 1;
            }
        }

        seedNewNodePositions(cy, newNodeIds, persistedPositions);
    });

    return {
        added,
        removed,
        updated,
        structuralChange: added > 0 || removed > 0
    };
}

function updateElementData(
    element: cytoscape.CollectionReturnValue,
    definition: ElementDefinition
): boolean {
    let changed = false;

    for (const key of MUTABLE_DATA_KEYS) {
        const next = definition.data[key];
        if (element.data(key) !== next) {
            element.data(key, next);
            changed = true;
        }
    }

    // groupIds is an array (multi-membership); compare by value so a grouping-basis
    // switch (e.g. folders → tags) updates physics membership without a full rebuild.
    const nextGroupIds = definition.data.groupIds as string[] | undefined;
    const currentGroupIds = element.data('groupIds') as string[] | undefined;
    if (!sameStringArray(currentGroupIds, nextGroupIds)) {
        element.data('groupIds', nextGroupIds);
        changed = true;
    }

    // Compound membership can only change via move(), not data().
    if (element.isNode()) {
        const node = element as unknown as cytoscape.NodeSingular;
        const desiredParent = definition.data.parent ?? null;
        const parentCollection = node.parent();
        const currentParent = parentCollection.nonempty() ? parentCollection.first().id() : null;
        if (desiredParent !== currentParent) {
            node.move({ parent: desiredParent });
            changed = true;
        }
    }

    return changed;
}
