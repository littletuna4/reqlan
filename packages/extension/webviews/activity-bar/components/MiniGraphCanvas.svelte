<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import type { GraphNodeView } from '../../../src/webview_module/shared/messages.js';
    import { GraphCyController } from '../../shared/graph/graph-cy-controller.js';
    import { folderPathCompoundBasis } from '../../shared/graph/graph-cytoscape.js';
    import { graphLog } from '../../shared/graph/graph-debug.js';
    import { getApp } from '../state/context.js';

    interface Props {
        slice: import('../../../src/webview_module/shared/messages.js').GraphViewSlice | undefined;
        loading: boolean;
        error?: string;
        rendering: boolean;
        onRendered: () => void;
        onFocusNode: (nodeId: string) => void;
    }

    let {
        slice,
        loading,
        error,
        rendering,
        onRendered,
        onFocusNode
    }: Props = $props();

    const app = getApp();

    let container: HTMLDivElement | undefined = $state();
    let controller: GraphCyController | undefined = $state();
    let initError = $state<string | undefined>(undefined);

    let lastSyncedKey = '';
    let pendingSyncKey = '';

    let graphNodes = $derived(slice?.nodes ?? []);
    let nodeById = $derived(new Map(graphNodes.map(node => [node.id, node])));
    let graphDataKey = $derived(slice
        ? [
            slice.nodes.map(node => node.id).join('\u0000'),
            slice.edges.map(edge => edge.id).join('\u0000'),
            slice.centerId ?? ''
        ].join('\u0001')
        : '');

    let displayError = $derived(error ?? initError);

    let statusText = $derived(
        loading ? 'Loading graph…' :
        displayError ? displayError :
        rendering ? 'Rendering graph…' :
        !slice ? 'Waiting for graph' :
        ''
    );

    function queueSync(reason: string): void {
        if (!controller) {
            return;
        }
        if (loading || displayError) {
            return;
        }
        if (!slice || !graphDataKey) {
            return;
        }
        if (graphDataKey === lastSyncedKey || graphDataKey === pendingSyncKey) {
            return;
        }

        pendingSyncKey = graphDataKey;
        graphLog('mini queueSync', { reason, nodes: slice.nodes.length, edges: slice.edges.length });
        controller.syncSlice(slice, {
            useCompound: false,
            compoundBasis: folderPathCompoundBasis,
            centerId: slice.centerId
        });
    }

    function handleGraphRendered(): void {
        if (pendingSyncKey) {
            lastSyncedKey = pendingSyncKey;
            pendingSyncKey = '';
        }
        onRendered();
    }

    function openNode(node: GraphNodeView): void {
        app.openIdea(node.fileUri, node.lineStart);
    }

    function reframeView(): void {
        controller?.reframeToViewport();
    }

    $effect(() => {
        queueSync(
            `reactive:${loading ? 'loading' : 'ready'}:${slice?.nodes.length ?? 0}:${graphDataKey.length}`
        );
    });

    onMount(() => {
        if (!container) {
            graphLog('mini mount skip — no container');
            return;
        }

        try {
            controller = new GraphCyController({
                container,
                interactionMode: 'sidebar',
                getNodeById: id => nodeById.get(id),
                onRendered: handleGraphRendered,
                onOpen: id => {
                    const node = nodeById.get(id);
                    if (node) {
                        openNode(node);
                    }
                },
                onFocus: id => onFocusNode(id)
            });
            controller.init();
            lastSyncedKey = '';
            pendingSyncKey = '';
            queueMicrotask(() => queueSync('mount-microtask'));
            requestAnimationFrame(() => queueSync('mount-raf'));
        } catch (mountError) {
            initError = mountError instanceof Error ? mountError.message : 'Failed to initialize graph.';
            graphLog('mini mount failed', { error: initError });
        }
    });

    onDestroy(() => {
        controller?.destroy();
        controller = undefined;
        graphLog('mini controller destroy');
    });
</script>

<div class="graph-meta" class:is-error={Boolean(displayError)}>
    {#if statusText}
        {statusText}
    {:else if slice}
        {slice.nodes.length} nodes, {slice.edges.length} edges
        {#if slice.truncated}
            · truncated
            <button class="toolbar-button" onclick={() => app.openIdeasSummary('graph')}>open full graph</button>
        {/if}
    {:else}
        No graph loaded
    {/if}
    {#if controller && slice && slice.nodes.length > 0 && !loading && !displayError}
        <button
            type="button"
            class="toolbar-button graph-reframe"
            title="Fit all nodes into the viewport and center the camera"
            onclick={reframeView}
        >
            Fit to view
        </button>
    {/if}
</div>

<div class="graph-surface" bind:this={container}>
    {#if !loading && !displayError && slice && slice.nodes.length === 0}
        <div class="graph-empty">No nodes in this neighbourhood.</div>
    {/if}
</div>
