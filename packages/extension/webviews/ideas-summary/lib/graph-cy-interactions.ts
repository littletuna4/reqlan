/**
 * Pointer/selection event wiring for the Ideas Summary graph.
 *
 * Kept separate from the controller so the controller owns lifecycle/physics only.
 * Handlers receive node ids (compound container nodes are filtered out here); the
 * controller decides what selection/open/focus/drag mean.
 * per ["../../../../../reqlan rq/extension/module/graphical_graph.rq"] state_machines
 */
import type cytoscape from 'cytoscape';

export interface GraphInteractionHandlers {
    onNodeTap: (nodeId: string) => void;
    onNodeDblTap: (nodeId: string) => void;
    onBackgroundTap: () => void;
    onNodeGrab: (nodeId: string) => void;
    onNodeDrag: (nodeId: string, position: { x: number; y: number }) => void;
    onNodeFree: (nodeId: string, position: { x: number; y: number }) => void;
}

function isRealNode(node: cytoscape.NodeSingular): boolean {
    return !node.data('isCompound');
}

/** Bind graph interaction events. Returns an unbind function. */
export function bindGraphInteractions(
    cy: cytoscape.Core,
    handlers: GraphInteractionHandlers
): () => void {
    const onTapNode = (event: cytoscape.EventObject): void => {
        const node = event.target as cytoscape.NodeSingular;
        if (!isRealNode(node)) {
            return;
        }
        handlers.onNodeTap(node.id());
    };

    const onDblTapNode = (event: cytoscape.EventObject): void => {
        const node = event.target as cytoscape.NodeSingular;
        if (!isRealNode(node)) {
            return;
        }
        handlers.onNodeDblTap(node.id());
    };

    const onTapBackground = (event: cytoscape.EventObject): void => {
        if (event.target === cy) {
            handlers.onBackgroundTap();
        }
    };

    const onGrabNode = (event: cytoscape.EventObject): void => {
        const node = event.target as cytoscape.NodeSingular;
        if (!isRealNode(node)) {
            return;
        }
        handlers.onNodeGrab(node.id());
    };

    const onDragNode = (event: cytoscape.EventObject): void => {
        const node = event.target as cytoscape.NodeSingular;
        if (!isRealNode(node)) {
            return;
        }
        handlers.onNodeDrag(node.id(), node.position());
    };

    const onFreeNode = (event: cytoscape.EventObject): void => {
        const node = event.target as cytoscape.NodeSingular;
        if (!isRealNode(node)) {
            return;
        }
        handlers.onNodeFree(node.id(), node.position());
    };

    cy.on('tap', 'node', onTapNode);
    cy.on('dbltap', 'node', onDblTapNode);
    cy.on('tap', onTapBackground);
    cy.on('grab', 'node', onGrabNode);
    cy.on('drag', 'node', onDragNode);
    cy.on('free', 'node', onFreeNode);

    return () => {
        cy.removeListener('tap', 'node', onTapNode);
        cy.removeListener('dbltap', 'node', onDblTapNode);
        cy.removeListener('tap', onTapBackground);
        cy.removeListener('grab', 'node', onGrabNode);
        cy.removeListener('drag', 'node', onDragNode);
        cy.removeListener('free', 'node', onFreeNode);
    };
}
