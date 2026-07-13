/**
 * Compound folder group hover/selection highlighting.
 *
 * Hovering or selecting a compound container emphasises its idea nodes (childless
 * descendants) with a bright thick border. Flags live on element data; the
 * stylesheet uses mapper functions (not boolean selectors) and we call
 * updateStyle() after each change so the canvas renderer repaints reliably.
 * per ["../../../../../reqlan rq/extension/library/graph.rq"] graph_cy_controller
 */
import type cytoscape from 'cytoscape';

export const GROUP_HOVER_KEY = 'groupHover';
export const MEMBER_HOVER_KEY = 'groupMemberHover';
export const MEMBER_SELECTED_KEY = 'groupMemberSelected';

export interface CompoundHighlightHandlers {
    onCompoundTap?: (compoundId: string) => void;
}

/** Compound container under the pointer, or the innermost compound ancestor of a member node. */
function resolveHighlightCompound(node: cytoscape.NodeSingular): cytoscape.NodeSingular | undefined {
    if (node.data('isCompound')) {
        return node;
    }
    const compounds = node.ancestors('[?isCompound]');
    if (compounds.empty()) {
        return undefined;
    }
    return compounds.first() as cytoscape.NodeSingular;
}

function clearCompoundHoverState(cy: cytoscape.Core): void {
    cy.nodes(`[?${GROUP_HOVER_KEY}]`).removeData(GROUP_HOVER_KEY);
    cy.nodes(`[?${MEMBER_HOVER_KEY}]`).removeData(MEMBER_HOVER_KEY);
}

/** Force style mappers to re-run after transient emphasis flags change. */
function refreshCompoundEmphasisStyles(cy: cytoscape.Core): void {
    cy.style().update();
}

let activeHoverCompoundId: string | undefined;

function clearCompoundHover(cy: cytoscape.Core): void {
    if (activeHoverCompoundId === undefined && cy.nodes(`[?${MEMBER_HOVER_KEY}]`).length === 0) {
        return;
    }
    activeHoverCompoundId = undefined;
    cy.batch(() => {
        clearCompoundHoverState(cy);
    });
    refreshCompoundEmphasisStyles(cy);
}

function setCompoundHover(cy: cytoscape.Core, compound: cytoscape.NodeSingular | undefined): void {
    const nextId = compound?.id();
    if (nextId === activeHoverCompoundId) {
        return;
    }
    activeHoverCompoundId = nextId;

    cy.batch(() => {
        clearCompoundHoverState(cy);
        if (!compound) {
            return;
        }
        compound.data(GROUP_HOVER_KEY, true);
        compound.descendants(':childless').data(MEMBER_HOVER_KEY, true);
    });
    refreshCompoundEmphasisStyles(cy);
}

/** Sync child border flags to match which compound containers are selected. */
export function syncCompoundSelection(cy: cytoscape.Core): void {
    cy.batch(() => {
        cy.nodes(`[?${MEMBER_SELECTED_KEY}]`).removeData(MEMBER_SELECTED_KEY);
        cy.nodes('[?isCompound]:selected').forEach((compound) => {
            compound.descendants(':childless').data(MEMBER_SELECTED_KEY, true);
        });
    });
    refreshCompoundEmphasisStyles(cy);
}

/** Bind hover/selection emphasis for compound folder groups. Returns an unbind function. */
export function bindCompoundHighlight(
    cy: cytoscape.Core,
    handlers: CompoundHighlightHandlers = {}
): () => void {
    const onNodePointerOver = (event: cytoscape.EventObject): void => {
        const target = event.target;
        if (!('isNode' in target) || !target.isNode()) {
            return;
        }
        setCompoundHover(cy, resolveHighlightCompound(target as cytoscape.NodeSingular));
    };

    const onBackgroundOver = (event: cytoscape.EventObject): void => {
        if (event.target === cy) {
            clearCompoundHover(cy);
        }
    };

    const onPointerLeave = (): void => {
        clearCompoundHover(cy);
    };

    const onCompoundTap = (event: cytoscape.EventObject): void => {
        const node = event.target as cytoscape.NodeSingular;
        if (!node.data('isCompound')) {
            return;
        }
        handlers.onCompoundTap?.(node.id());
    };

    const onCompoundSelectChange = (): void => {
        syncCompoundSelection(cy);
    };

    cy.on('mouseover', 'node', onNodePointerOver);
    cy.on('mouseover', onBackgroundOver);
    cy.on('tap', 'node[?isCompound]', onCompoundTap);
    cy.on('select unselect', 'node[?isCompound]', onCompoundSelectChange);

    const container = cy.container();
    container?.addEventListener('mouseleave', onPointerLeave);

    return () => {
        cy.removeListener('mouseover', 'node', onNodePointerOver);
        cy.removeListener('mouseover', onBackgroundOver);
        cy.removeListener('tap', 'node[?isCompound]', onCompoundTap);
        cy.removeListener('select unselect', 'node[?isCompound]', onCompoundSelectChange);
        container?.removeEventListener('mouseleave', onPointerLeave);
        activeHoverCompoundId = undefined;
        clearCompoundHoverState(cy);
        cy.nodes(`[?${MEMBER_SELECTED_KEY}]`).removeData(MEMBER_SELECTED_KEY);
        refreshCompoundEmphasisStyles(cy);
    };
}
