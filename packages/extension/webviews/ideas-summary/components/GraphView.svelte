<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import type { GraphNodeView, GraphViewQuery } from '../../../src/webview_module/shared/messages.js';
    import { getApp } from '../state/context.js';
    import TableToolbar from './TableToolbar.svelte';
    import GraphControls from './GraphControls.svelte';
    import GraphKeyPanel from './GraphKeyPanel.svelte';
    import { GraphCyController } from '../lib/graph-cy-controller.js';
    import { graphLog } from '../lib/graph-debug.js';
    import {
        DEFAULT_LAYOUT_ID,
        GRAPH_COMPOUND_BASIS_OPTIONS,
        folderPathCompoundBasis,
        type CompoundBasis
    } from '../lib/graph-cytoscape.js';
    import { GRAPH_LEGEND_ITEMS } from '../lib/graph-theme.js';

    interface Props {
        compoundBasis?: CompoundBasis;
    }
    let { compoundBasis = folderPathCompoundBasis }: Props = $props();

    const app = getApp();

    // $derived ensures Svelte 5 signal tracking works for $state properties set
    // from external contexts (e.g. window.message listeners), which $: does not.
    let query = $derived(app.graph.query);
    let slice = $derived(app.graph.slice);
    let loading = $derived(app.graph.loading);
    let rendering = $derived(app.graph.rendering);
    let error = $derived(app.graph.error);
    let indexReady = $derived(app.index.status?.ready ?? false);

    const compoundBasisOptions = GRAPH_COMPOUND_BASIS_OPTIONS;

    // Mutable component state — $state so template and effects react to changes.
    let container: HTMLDivElement | undefined = $state();
    // controller being $state means the queueSync $effect reruns once onMount sets it,
    // which handles the "slice already cached" remount case.
    let controller: GraphCyController | undefined = $state();
    let selectedId: string | undefined = $state();
    let showKey = $state(false);
    let layoutId = $state(DEFAULT_LAYOUT_ID);
    let useCompound = $state(false);
    let compoundBasisId = $state('folder-path');
    let animatePhysics = $state(false);

    // Non-reactive sync guards — plain let keeps them out of signal tracking,
    // preventing reactive loops when queueSync writes pendingSyncKey.
    let lastSyncedKey = '';
    let pendingSyncKey = '';
    let searchTimer: ReturnType<typeof setTimeout> | undefined;

    const legendItems = GRAPH_LEGEND_ITEMS;

    let graphNodes = $derived(slice?.nodes ?? []);
    let nodeById = $derived(new Map(graphNodes.map(node => [node.id, node])));
    let centerId = $derived(slice?.centerId);
    let selectedNode = $derived(selectedId ? nodeById.get(selectedId) : undefined);
    let activeBasisOption = $derived(
        compoundBasisOptions.find(option => option.id === compoundBasisId)
    );
    let activeCompoundBasis = $derived(activeBasisOption?.compoundBasis ?? compoundBasis);
    let activeGroupBasis = $derived(activeBasisOption?.groupBasis);
    let graphDataKey = $derived(slice
        ? [
            slice.nodes.map(node => node.id).join('\u0000'),
            slice.edges.map(edge => edge.id).join('\u0000'),
            centerId ?? '',
            useCompound ? '1' : '0',
            compoundBasisId
        ].join('\u0001')
        : '');

    function queueSync(reason: string): void {
        if (!controller) {
            graphLog('queueSync skip — no controller', { reason });
            return;
        }
        if (loading || error) {
            graphLog('queueSync skip — loading/error', { reason, loading, error });
            return;
        }
        if (!slice || !graphDataKey) {
            graphLog('queueSync skip — no slice', { reason });
            return;
        }
        if (graphDataKey === lastSyncedKey || graphDataKey === pendingSyncKey) {
            graphLog('queueSync skip — already synced/pending', {
                reason,
                nodes: slice.nodes.length
            });
            return;
        }

        pendingSyncKey = graphDataKey;
        graphLog('queueSync', {
            reason,
            nodes: slice.nodes.length,
            edges: slice.edges.length,
            centerId: slice.centerId
        });
        controller.syncSlice(slice, {
            useCompound,
            compoundBasis: activeCompoundBasis ?? compoundBasis,
            groupBasis: activeGroupBasis,
            centerId,
            selectedId
        });
    }

    // Reactive trigger for slice arrivals, filter/compound toggles, and controller ready.
    $effect(() => {
        queueSync(
            `reactive:${loading ? 'loading' : 'ready'}:${slice?.nodes.length ?? 0}:${graphDataKey.length}`
        );
    });

    let loadingStatus = $derived(
        loading ? 'Loading graph…' :
        error ? error :
        rendering ? 'Rendering graph' :
        (!indexReady && !slice) ? 'Waiting for index' :
        ''
    );

    function emitQuery(next: GraphViewQuery): void {
        app.loadGraph(next);
    }

    function debouncedSearch(next: GraphViewQuery): void {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => emitQuery(next), 250);
    }

    function handleSearch(event: CustomEvent<string>): void {
        const next = { ...query, search: event.detail || undefined, centerId: undefined };
        app.graph.query = next;
        debouncedSearch(next);
    }

    function handleFilterChange(field: 'pathFilter' | 'statusFilter' | 'tagFilter', value: string): void {
        const next = { ...query, [field]: value || undefined, centerId: undefined };
        app.graph.query = next;
        debouncedSearch(next);
    }

    function toggleIndirect(): void {
        emitQuery({ ...query, includeIndirect: !query.includeIndirect });
    }

    function clearCenter(): void {
        emitQuery({ ...query, centerId: undefined });
    }

    function focusNode(node: GraphNodeView): void {
        if (node.isExternal) {
            app.openIdea(node.fileUri, node.lineStart);
            return;
        }
        emitQuery({ ...query, centerId: node.id });
    }

    function openNode(node: GraphNodeView): void {
        app.openIdea(node.fileUri, node.lineStart);
    }

    function handleLayoutChange(layout: string): void {
        layoutId = layout;
        controller?.setLayoutId(layout);
    }

    function toggleCompound(): void {
        useCompound = !useCompound;
    }

    function handleCompoundBasisChange(basisId: string): void {
        compoundBasisId = basisId;
    }

    function toggleAnimatePhysics(): void {
        animatePhysics = !animatePhysics;
        controller?.setAnimatePhysics(animatePhysics);
    }

    function toggleKey(): void {
        showKey = !showKey;
    }

    function handleGraphRendered(): void {
        if (pendingSyncKey) {
            lastSyncedKey = pendingSyncKey;
            pendingSyncKey = '';
        }
        graphLog('onRendered — UI idle');
        app.onGraphRendered();
    }

    onMount(() => {
        graphLog('GraphView mount', {
            hasSlice: Boolean(app.graph.slice),
            loading: app.graph.loading,
            containerSize: container
                ? { w: container.clientWidth, h: container.clientHeight }
                : null
        });

        controller = new GraphCyController({
            container: container!,
            getNodeById: id => nodeById.get(id),
            onRendered: handleGraphRendered,
            onSelect: id => {
                selectedId = id;
            },
            onOpen: id => {
                const node = nodeById.get(id);
                if (node) {
                    openNode(node);
                }
            },
            onFocus: id => {
                const node = nodeById.get(id);
                if (node) {
                    focusNode(node);
                }
            }
        });
        controller.init();
        lastSyncedKey = '';
        pendingSyncKey = '';
        if (app.graph.error) {
            app.requestGraph({ force: true });
        } else if (!app.graph.slice && !app.graph.loading) {
            app.requestGraph();
        }
        queueMicrotask(() => queueSync('mount-microtask'));
        requestAnimationFrame(() => queueSync('mount-raf'));
    });

    onDestroy(() => {
        clearTimeout(searchTimer);
        controller?.destroy();
        controller = undefined;
        graphLog('GraphView destroy');
    });
</script>

<div class="graph-panel">
    <TableToolbar search={query.search ?? ''} placeholder="Search ideas, paths…" on:search={handleSearch}>
        <GraphControls
            {query}
            {layoutId}
            {animatePhysics}
            {useCompound}
            {compoundBasisId}
            {showKey}
            on:pathFilter={(event) => handleFilterChange('pathFilter', event.detail)}
            on:statusFilter={(event) => handleFilterChange('statusFilter', event.detail)}
            on:tagFilter={(event) => handleFilterChange('tagFilter', event.detail)}
            on:toggleIndirect={toggleIndirect}
            on:layoutChange={(event) => handleLayoutChange(event.detail)}
            on:toggleAnimatePhysics={toggleAnimatePhysics}
            on:toggleCompound={toggleCompound}
            on:compoundBasisChange={(event) => handleCompoundBasisChange(event.detail)}
            on:clearCenter={clearCenter}
            on:toggleKey={toggleKey}
            on:reframeView={() => controller?.reframeToViewport()}
        />
    </TableToolbar>

    <div class="graph-meta">
        {#if loadingStatus}
            {loadingStatus}
        {:else if slice}
            {slice.nodes.length} nodes, {slice.edges.length} edges
            {#if slice.truncated}
                · truncated to {query.maxNodes ?? 120} nodes
            {/if}
            {#if slice.totalMatching !== undefined && !slice.centerId}
                · {slice.totalMatching} matching ideas
            {/if}
        {:else}
            No graph loaded
        {/if}
    </div>

    <div class="graph-surface" bind:this={container}>
        <GraphKeyPanel items={legendItems} open={showKey} on:close={() => (showKey = false)} />
        {#if !loading && !error && slice && slice.nodes.length === 0}
            <div class="graph-empty">
                No nodes match the current filters. Try clearing filters or open a .rq file to focus its local graph.
            </div>
        {/if}
    </div>

    {#if selectedNode}
        <div class="graph-selection">
            <strong>{selectedNode.name}</strong>
            <span class="graph-selection-path">{selectedNode.path}</span>
            {#if selectedNode.tags.length > 0}
                <span class="graph-selection-tags">{selectedNode.tags.join(', ')}</span>
            {/if}
            <div class="graph-selection-actions">
                {#if !selectedNode.isExternal}
                    <button onclick={() => openNode(selectedNode)}>Open</button>
                    <button class="secondary" onclick={() => focusNode(selectedNode)}>Focus graph</button>
                {:else}
                    <button onclick={() => openNode(selectedNode)}>Open file</button>
                {/if}
            </div>
        </div>
    {/if}

    <p class="graph-hint">Click to select · Double-click to open · Drag nodes to reposition · Drag background to pan · Scroll to zoom freely</p>
</div>
