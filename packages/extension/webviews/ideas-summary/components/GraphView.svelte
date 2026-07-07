<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import type { GraphNodeView, GraphViewQuery } from '../../../src/webview_module/shared/messages.js';
    import { getApp } from '../state/context.js';
    import TableToolbar from './TableToolbar.svelte';
    import GraphControls from './GraphControls.svelte';
    import GraphKeyPanel from './GraphKeyPanel.svelte';
    import { GraphCyController } from '../lib/graph-cy-controller.js';
    import { graphLoadPhaseLabel } from '../lib/graph-load-status.js';
    import {
        DEFAULT_LAYOUT_ID,
        folderPathCompoundBasis,
        parentFolderCompoundBasis,
        type CompoundBasis
    } from '../lib/graph-cytoscape.js';
    import { GRAPH_LEGEND_ITEMS } from '../lib/graph-theme.js';

    export let compoundBasis: CompoundBasis = folderPathCompoundBasis;

    const app = getApp();

    $: query = app.graph.query;
    $: slice = app.graph.slice;
    $: loading = app.graph.loading;
    $: loadPhase = app.graph.loadPhase;
    $: loadDetail = app.graph.loadDetail;

    const compoundBasisOptions: Array<{ id: string; label: string; basis: CompoundBasis }> = [
        { id: 'folder-path', label: 'Folder path', basis: folderPathCompoundBasis },
        { id: 'parent-folder', label: 'Parent folder', basis: parentFolderCompoundBasis }
    ];

    let container: HTMLDivElement;
    let controller: GraphCyController | undefined;
    let selectedId: string | undefined;
    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    let showKey = false;
    let layoutId = DEFAULT_LAYOUT_ID;
    let useCompound = false;
    let compoundBasisId = 'folder-path';
    let animatePhysics = false;
    let lastSyncedKey = '';

    const legendItems = GRAPH_LEGEND_ITEMS;

    $: graphNodes = slice?.nodes ?? [];
    $: nodeById = new Map(graphNodes.map(node => [node.id, node]));
    $: centerId = slice?.centerId;
    $: selectedNode = selectedId ? nodeById.get(selectedId) : undefined;
    $: activeCompoundBasis = compoundBasisOptions.find(option => option.id === compoundBasisId)?.basis ?? compoundBasis;
    $: graphDataKey = slice
        ? [
            slice.nodes.map(node => node.id).join('\u0000'),
            slice.edges.map(edge => edge.id).join('\u0000'),
            centerId ?? '',
            useCompound ? '1' : '0',
            compoundBasisId
        ].join('\u0001')
        : '';

    // Only rebuild cytoscape when the underlying graph data actually changes.
    // selectedId is intentionally excluded here so node selection does not trigger
    // a full element swap + relayout (cytoscape handles selection highlight itself).
    $: if (!loading && !slice?.waitingForIndex && graphDataKey && controller && slice && graphDataKey !== lastSyncedKey) {
        lastSyncedKey = graphDataKey;
        controller.syncSlice(slice, {
            useCompound,
            compoundBasis: activeCompoundBasis ?? compoundBasis,
            centerId,
            selectedId
        });
    }

    $: loadingStatus = (() => {
        if (loading) {
            const phase = graphLoadPhaseLabel(loadPhase === 'idle' ? 'queued' : loadPhase);
            return phase ? `Loading graph — ${phase}` : 'Loading graph…';
        }
        if (loadPhase === 'rendering') {
            return 'Rendering graph';
        }
        if (loadPhase === 'failed') {
            return 'Graph load failed';
        }
        if (slice?.waitingForIndex) {
            return 'Waiting for index';
        }
        return '';
    })();

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

    onMount(() => {
        controller = new GraphCyController({
            container,
            getNodeById: id => nodeById.get(id),
            onRendered: () => app.onGraphRendered(),
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
        app.requestGraph();
    });

    onDestroy(() => {
        clearTimeout(searchTimer);
        controller?.destroy();
        controller = undefined;
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
            on:resetView={() => controller?.resetView()}
        />
    </TableToolbar>

    <div class="graph-meta">
        {#if loadingStatus}
            {loadingStatus}{#if loadDetail} · {loadDetail}{/if}
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
        {#if !loading && !slice?.waitingForIndex && slice && slice.nodes.length === 0}
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
                    <button on:click={() => openNode(selectedNode)}>Open</button>
                    <button class="secondary" on:click={() => focusNode(selectedNode)}>Focus graph</button>
                {:else}
                    <button on:click={() => openNode(selectedNode)}>Open file</button>
                {/if}
            </div>
        </div>
    {/if}

    <p class="graph-hint">Click a node to open · Double-click to focus · Drag nodes to reposition · Drag background to pan · Scroll to zoom freely</p>
</div>
