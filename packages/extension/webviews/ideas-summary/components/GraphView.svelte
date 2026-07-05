<script lang="ts">
    import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
    import type { Simulation } from 'd3-force';
    import type { GraphEdgeView, GraphNodeView, GraphViewQuery, GraphViewSlice } from '../../../src/webview_module/shared/messages.js';
    import TableToolbar from './TableToolbar.svelte';
    import {
        buildSimulationLinks,
        buildSimulationNodes,
        createGraphSimulation,
        pinNode,
        releaseNode,
        type SimLink,
        type SimNode
    } from '../lib/graph-simulation.js';
    import { GRAPH_LEGEND_ITEMS, graphNodeFill } from '../lib/graph-theme.js';

    export let slice: GraphViewSlice | undefined;
    export let query: GraphViewQuery;
    export let loading = false;

    const dispatch = createEventDispatcher<{
        queryChange: GraphViewQuery;
        open: { fileUri: string; line: number };
        focus: { centerId: string };
    }>();

    let container: HTMLDivElement;
    let width = 800;
    let height = 520;
    let simNodes: SimNode[] = [];
    let simulation: Simulation<SimNode, SimLink> | undefined;
    let selectedId: string | undefined;
    let panX = 0;
    let panY = 0;
    let zoom = 1;
    let draggingNodeId: string | undefined;
    let panning = false;
    let lastPointer = { x: 0, y: 0 };
    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let frame = 0;
    let showKey = false;

    const legendItems = GRAPH_LEGEND_ITEMS;

    $: graphNodes = slice?.nodes ?? [];
    $: graphEdges = slice?.edges ?? [];
    $: nodeById = new Map(graphNodes.map(node => [node.id, node]));
    $: centerId = slice?.centerId;
    $: selectedNode = selectedId ? nodeById.get(selectedId) : undefined;
    $: simNodesById = new Map(simNodes.map(node => [node.id, node]));
    $: graphDataKey = slice
        ? [
            slice.nodes.map(node => node.id).join('\u0000'),
            slice.edges.map(edge => edge.id).join('\u0000'),
            centerId ?? '',
            width,
            height
        ].join('\u0001')
        : '';

    $: if (!loading && !slice?.waitingForIndex && graphDataKey) {
        restartSimulation(graphDataKey);
    }

    function emitQuery(next: GraphViewQuery): void {
        dispatch('queryChange', next);
    }

    function debouncedSearch(next: GraphViewQuery): void {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => emitQuery(next), 250);
    }

    function handleSearch(event: CustomEvent<string>): void {
        const next = { ...query, search: event.detail || undefined, centerId: undefined };
        query = next;
        debouncedSearch(next);
    }

    function handleFilterChange(field: 'pathFilter' | 'statusFilter' | 'tagFilter', value: string): void {
        const next = { ...query, [field]: value || undefined, centerId: undefined };
        query = next;
        debouncedSearch(next);
    }

    function handlePathFilter(event: Event): void {
        handleFilterChange('pathFilter', (event.currentTarget as HTMLInputElement).value);
    }

    function handleStatusFilter(event: Event): void {
        handleFilterChange('statusFilter', (event.currentTarget as HTMLInputElement).value);
    }

    function handleTagFilter(event: Event): void {
        handleFilterChange('tagFilter', (event.currentTarget as HTMLInputElement).value);
    }

    function toggleIndirect(): void {
        const next = { ...query, includeIndirect: !query.includeIndirect };
        query = next;
        emitQuery(next);
    }

    function clearCenter(): void {
        const next = { ...query, centerId: undefined };
        query = next;
        emitQuery(next);
    }

    function focusNode(node: GraphNodeView): void {
        if (node.isExternal) {
            dispatch('open', { fileUri: node.fileUri, line: node.lineStart });
            return;
        }
        const next = { ...query, centerId: node.id };
        query = next;
        dispatch('focus', { centerId: node.id });
        emitQuery(next);
    }

    function openNode(node: GraphNodeView): void {
        dispatch('open', { fileUri: node.fileUri, line: node.lineStart });
    }

    function stopSimulation(): void {
        simulation?.stop();
        simulation?.on('tick', null);
        simulation = undefined;
    }

    function restartSimulation(_key: string): void {
        stopSimulation();
        if (!slice || slice.nodes.length === 0 || width <= 0 || height <= 0) {
            simNodes = [];
            frame += 1;
            return;
        }

        const nodes = buildSimulationNodes(slice.nodes.map(node => node.id));
        const links = buildSimulationLinks(slice.edges);
        simulation = createGraphSimulation(nodes, links, { width, height, centerId });
        simNodes = nodes;
        simulation.on('tick', () => {
            frame += 1;
        });
    }

    function layoutNode(id: string): SimNode | undefined {
        return simNodesById.get(id);
    }

    function graphPoint(clientX: number, clientY: number): { x: number; y: number } {
        const rect = container.getBoundingClientRect();
        return {
            x: (clientX - rect.left - panX) / zoom,
            y: (clientY - rect.top - panY) / zoom
        };
    }

    function toggleKey(): void {
        showKey = !showKey;
    }

    function nodeFill(node: GraphNodeView): string {
        return graphNodeFill(node, centerId);
    }

    function truncate(value: string, max = 28): string {
        return value.length > max ? `${value.slice(0, max - 1)}…` : value;
    }

    function onNodePointerDown(event: PointerEvent, nodeId: string): void {
        event.stopPropagation();
        draggingNodeId = nodeId;
        selectedId = nodeId;
        const simNode = layoutNode(nodeId);
        if (simNode) {
            const point = graphPoint(event.clientX, event.clientY);
            pinNode(simNode, point.x, point.y);
            simulation?.alphaTarget(0.25).restart();
        }
        (event.currentTarget as Element).setPointerCapture(event.pointerId);
    }

    function onSurfacePointerDown(event: PointerEvent): void {
        if ((event.target as Element).closest('.graph-node')) {
            return;
        }
        panning = true;
        lastPointer = { x: event.clientX, y: event.clientY };
    }

    function onPointerMove(event: PointerEvent): void {
        if (draggingNodeId) {
            const simNode = layoutNode(draggingNodeId);
            if (simNode) {
                const point = graphPoint(event.clientX, event.clientY);
                pinNode(simNode, point.x, point.y);
                simulation?.alphaTarget(0.25).restart();
            }
            return;
        }
        if (panning) {
            panX += event.clientX - lastPointer.x;
            panY += event.clientY - lastPointer.y;
            lastPointer = { x: event.clientX, y: event.clientY };
        }
    }

    function onPointerUp(): void {
        if (draggingNodeId) {
            const simNode = layoutNode(draggingNodeId);
            if (simNode) {
                releaseNode(simNode, draggingNodeId === centerId);
            }
            simulation?.alphaTarget(0);
        }
        draggingNodeId = undefined;
        panning = false;
    }

    function onWheel(event: WheelEvent): void {
        event.preventDefault();
        const factor = event.deltaY > 0 ? 0.92 : 1.08;
        zoom = Math.min(2.5, Math.max(0.35, zoom * factor));
    }

    function resetView(): void {
        panX = 0;
        panY = 0;
        zoom = 1;
        restartSimulation(graphDataKey);
    }

    onMount(async () => {
        resizeObserver = new ResizeObserver(entries => {
            const entry = entries[0];
            if (!entry) {
                return;
            }
            width = Math.max(320, Math.floor(entry.contentRect.width));
            height = Math.max(360, Math.floor(entry.contentRect.height));
        });
        resizeObserver.observe(container);
        await tick();
        if (container) {
            width = Math.max(320, container.clientWidth);
            height = Math.max(360, container.clientHeight);
        }
    });

    onDestroy(() => {
        stopSimulation();
        resizeObserver?.disconnect();
        clearTimeout(searchTimer);
    });
</script>

<div class="graph-panel">
    <TableToolbar search={query.search ?? ''} placeholder="Search ideas, paths…" on:search={handleSearch}>
        <input
            class="graph-filter"
            type="search"
            placeholder="Path filter…"
            value={query.pathFilter ?? ''}
            on:input={handlePathFilter}
        />
        <input
            class="graph-filter"
            type="search"
            placeholder="Status…"
            value={query.statusFilter ?? ''}
            on:input={handleStatusFilter}
        />
        <input
            class="graph-filter"
            type="search"
            placeholder="Tag…"
            value={query.tagFilter ?? ''}
            on:input={handleTagFilter}
        />
        <label class="graph-toggle">
            <input type="checkbox" checked={query.includeIndirect} on:change={toggleIndirect} />
            Indirect references
        </label>
        {#if query.centerId}
            <button class="secondary" on:click={clearCenter}>Clear focus</button>
        {/if}
        <button class="secondary" class:active={showKey} on:click={toggleKey}>Key</button>
        <button class="secondary" on:click={resetView}>Reset view</button>
    </TableToolbar>

    <div class="graph-meta">
        {#if loading}
            Loading graph…
        {:else if slice?.waitingForIndex}
            Waiting for index…
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

    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
        class="graph-surface"
        bind:this={container}
        on:pointerdown={onSurfacePointerDown}
        on:pointermove={onPointerMove}
        on:pointerup={onPointerUp}
        on:pointerleave={onPointerUp}
        on:wheel={onWheel}
    >
        {#if showKey}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="graph-key" on:pointerdown|stopPropagation>
                <div class="graph-key-title">Key</div>
                <ul class="graph-key-list">
                    {#each legendItems as item (item.label)}
                        <li class="graph-key-item">
                            {#if item.kind === 'node'}
                                <span class="graph-key-swatch" style:background={item.color}></span>
                                <span>{item.label}</span>
                            {:else}
                                <span class="graph-key-line {item.variant}"></span>
                                <span>{item.label}</span>
                            {/if}
                        </li>
                    {/each}
                </ul>
            </div>
        {/if}
        {#if !loading && !slice?.waitingForIndex && slice && slice.nodes.length === 0}
            <div class="graph-empty">
                No nodes match the current filters. Try clearing filters or open a .rq file to focus its local graph.
            </div>
        {:else}
            <svg {width} {height} class="graph-svg" data-frame={frame}>
                <g transform="translate({panX},{panY}) scale({zoom})">
                        {#each graphEdges as edge (edge.id)}
                            {@const source = layoutNode(edge.sourceId)}
                            {@const target = layoutNode(edge.targetId)}
                            {#if source && target && source.x !== undefined && source.y !== undefined && target.x !== undefined && target.y !== undefined}
                                <line
                                    class="graph-edge"
                                    class:external={Boolean(nodeById.get(edge.targetId)?.isExternal)}
                                    x1={source.x}
                                    y1={source.y}
                                    x2={target.x}
                                    y2={target.y}
                                />
                            {/if}
                        {/each}

                        {#each graphNodes as node (node.id)}
                            {@const layout = layoutNode(node.id)}
                            {#if layout && layout.x !== undefined && layout.y !== undefined}
                                <g
                                    class="graph-node"
                                    class:selected={selectedId === node.id}
                                    class:center={node.id === centerId}
                                    transform="translate({layout.x},{layout.y})"
                                    on:pointerdown={(event) => onNodePointerDown(event, node.id)}
                                    on:dblclick={() => focusNode(node)}
                                >
                                    <circle
                                        r="22"
                                        fill={nodeFill(node)}
                                        class:external={node.isExternal}
                                    />
                                    <text class="graph-label" y="36">{truncate(node.name)}</text>
                                    {#if node.status}
                                        <text class="graph-sublabel" y="50">{truncate(node.status, 18)}</text>
                                    {/if}
                                </g>
                            {/if}
                        {/each}
                    </g>
                </svg>
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

    <p class="graph-hint">Click a node to select · Double-click to focus · Drag nodes to reposition · Drag background to pan · Scroll to zoom</p>
</div>
