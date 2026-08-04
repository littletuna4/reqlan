<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import type { GraphNodeView, GraphViewQuery } from '../../../src/webview_module/shared/messages.js';
    import { getApp } from '../state/context.js';
    import TableToolbar from './TableToolbar.svelte';
    import GraphControls from './GraphControls.svelte';
    import GraphKeyPanel from './GraphKeyPanel.svelte';
    import GraphControlPanel from './GraphControlPanel.svelte';
    import { GraphCyController } from '../lib/graph-cy-controller.js';
    import { graphLog } from '../lib/graph-debug.js';
    import {
        DEFAULT_LAYOUT_ID,
        GRAPH_COMPOUND_BASIS_OPTIONS,
        folderPathCompoundBasis,
        type CompoundBasis
    } from '../lib/graph-cytoscape.js';
    import {
        DEFAULT_PHYSICS_SETTINGS,
        type GraphPhysicsSettings
    } from '../lib/graph-physics.js';
    import { GRAPH_LEGEND_ITEMS, type GraphNodeTypeId } from '../lib/graph-theme.js';
    import {
        FILTER_NOT_PRESENT,
        statusFilterKey
    } from '@reqlan/analytical/filter-specials';
    import {
        bumpCount,
        GRAPH_FILTER_SPECIALS
    } from '../lib/searchable-checkbox-dropdown.js';

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
    let ui = $derived(app.graph.ui);

    const compoundBasisOptions = GRAPH_COMPOUND_BASIS_OPTIONS;

    // Mutable component state — $state so template and effects react to changes.
    let container: HTMLDivElement | undefined = $state();
    // controller being $state means the queueSync $effect reruns once onMount sets it,
    // which handles the "slice already cached" remount case.
    let controller: GraphCyController | undefined = $state();
    let selectedId: string | undefined = $state();

    // Key + Controls state lives in app.graph.ui (workspace-persisted).
    let showKey = $derived(ui.showKey);
    let showControls = $derived(ui.showControls);
    let hiddenNodeTypes = $derived(ui.hiddenNodeTypes as GraphNodeTypeId[]);
    let layoutId = $derived(ui.layoutId || DEFAULT_LAYOUT_ID);
    let useCompound = $derived(ui.useCompound);
    let compoundBasisId = $derived(ui.compoundBasisId);
    let animatePhysics = $derived(ui.animatePhysics);
    let labelMode = $derived(ui.labelMode);
    let physicsSettings = $derived<GraphPhysicsSettings>({
        ...DEFAULT_PHYSICS_SETTINGS,
        ...ui.physics
    });

    // Non-reactive sync guards — plain let keeps them out of signal tracking,
    // preventing reactive loops when queueSync writes pendingSyncKey.
    let lastSyncedKey = '';
    let pendingSyncKey = '';
    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    let maxNodesTimer: ReturnType<typeof setTimeout> | undefined;
    // Last values pushed to the controller — avoid setLayoutId on unrelated UI patches.
    let lastControllerLayout = '';
    let lastControllerAnimate: boolean | undefined;
    let lastControllerPhysicsKey = '';
    let lastControllerHiddenKey = '';
    let lastControllerLabelMode: string | undefined;

    const legendItems = GRAPH_LEGEND_ITEMS;

    let graphNodes = $derived(slice?.nodes ?? []);
    let nodeById = $derived(new Map(graphNodes.map(node => [node.id, node])));
    let centerId = $derived(slice?.centerId);
    let selectedNode = $derived(selectedId ? nodeById.get(selectedId) : undefined);
    // Specials first so Status/Tags triggers paint before the slice arrives.
    let statusOptions = $state<string[]>([...GRAPH_FILTER_SPECIALS]);
    let tagOptions = $state<string[]>([...GRAPH_FILTER_SPECIALS]);
    let statusOptionCounts = $state<Record<string, number>>({});
    let tagOptionCounts = $state<Record<string, number>>({});
    let filtersLoading = $derived(loading || !slice);
    let activeBasisOption = $derived(
        compoundBasisOptions.find(option => option.id === compoundBasisId)
    );
    let activeCompoundBasis = $derived(activeBasisOption?.compoundBasis ?? compoundBasis);
    let activeGroupBasis = $derived(activeBasisOption?.groupBasis);
    let maxNodes = $derived(query.maxNodes ?? ui.maxNodes);
    let truncationBasis = $derived(query.truncationBasis ?? ui.truncationBasis);
    let graphDataKey = $derived(slice
        ? [
            slice.nodes.map(node => node.id).join('\u0000'),
            slice.edges.map(edge => edge.id).join('\u0000'),
            centerId ?? '',
            useCompound ? '1' : '0',
            compoundBasisId
        ].join('\u0001')
        : '');

    function collectStatusFilter(
        nodes: GraphNodeView[],
        selected: string[] | undefined
    ): { values: string[]; counts: Record<string, number> } {
        const values = new Set<string>([...GRAPH_FILTER_SPECIALS, ...(selected ?? [])]);
        const counts = new Map<string, number>();
        for (const node of nodes) {
            if (node.isExternal) {
                continue;
            }
            const key = node.statusKey ?? statusFilterKey(node.status);
            values.add(key);
            bumpCount(counts, key);
        }
        return { values: [...values], counts: Object.fromEntries(counts) };
    }

    function collectTagFilter(
        nodes: GraphNodeView[],
        selected: string[] | undefined
    ): { values: string[]; counts: Record<string, number> } {
        const values = new Set<string>([...GRAPH_FILTER_SPECIALS, ...(selected ?? [])]);
        const counts = new Map<string, number>();
        for (const node of nodes) {
            if (node.isExternal) {
                continue;
            }
            const keys = node.tagsKeys ?? [];
            if (keys.length === 0) {
                values.add(FILTER_NOT_PRESENT);
                bumpCount(counts, FILTER_NOT_PRESENT);
                continue;
            }
            for (const key of keys) {
                values.add(key);
                bumpCount(counts, key);
            }
        }
        return { values: [...values], counts: Object.fromEntries(counts) };
    }

    // Defer scanning nodes until after paint so Status/Tags placeholders stay responsive.
    $effect(() => {
        const nodes = graphNodes;
        const selectedStatus = query.statusFilter;
        const selectedTags = query.tagFilter;
        const sliceReady = Boolean(slice) && !loading;
        if (!sliceReady) {
            statusOptions = [...GRAPH_FILTER_SPECIALS, ...(selectedStatus ?? [])];
            tagOptions = [...GRAPH_FILTER_SPECIALS, ...(selectedTags ?? [])];
            statusOptionCounts = {};
            tagOptionCounts = {};
            return;
        }
        const timer = window.setTimeout(() => {
            const status = collectStatusFilter(nodes, selectedStatus);
            const tags = collectTagFilter(nodes, selectedTags);
            statusOptions = status.values;
            tagOptions = tags.values;
            statusOptionCounts = status.counts;
            tagOptionCounts = tags.counts;
        }, 0);
        return () => window.clearTimeout(timer);
    });

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

    // Apply workspace UI to the cytoscape controller when those fields change
    // (including the first restore after graphUiState). Unrelated patches (panel
    // open toggles) must not restart layout.
    $effect(() => {
        if (!controller) {
            return;
        }
        void app.graph.uiHydrated;
        const nextLayout = ui.layoutId;
        const nextAnimate = ui.animatePhysics;
        const nextPhysics = ui.physics;
        const nextHidden = ui.hiddenNodeTypes;
        const nextLabelMode = ui.labelMode;
        const physicsKey = [
            nextPhysics.gravity,
            nextPhysics.repulsion,
            nextPhysics.linkStrength,
            nextPhysics.linkDistance,
            nextPhysics.damping
        ].join('\u0000');
        const hiddenKey = nextHidden.join('\u0000');

        if (nextLayout !== lastControllerLayout) {
            lastControllerLayout = nextLayout;
            controller.setLayoutId(nextLayout);
        }
        if (nextAnimate !== lastControllerAnimate) {
            lastControllerAnimate = nextAnimate;
            controller.setAnimatePhysics(nextAnimate);
        }
        if (physicsKey !== lastControllerPhysicsKey) {
            lastControllerPhysicsKey = physicsKey;
            controller.setPhysicsSettings({ ...DEFAULT_PHYSICS_SETTINGS, ...nextPhysics });
        }
        if (hiddenKey !== lastControllerHiddenKey) {
            lastControllerHiddenKey = hiddenKey;
            controller.setHiddenNodeTypes(nextHidden);
        }
        if (nextLabelMode !== lastControllerLabelMode) {
            lastControllerLabelMode = nextLabelMode;
            controller.setLabelMode(nextLabelMode);
        }
    });

    let loadingStatus = $derived(
        loading ? 'Loading graph…' :
        error ? error :
        rendering ? 'Initialising graph…' :
        (!indexReady && !slice) ? 'Waiting for index…' :
        (!controller && !error) ? 'Initialising graph…' :
        ''
    );
    // Full-surface boot overlay for cold start / first layout only — keep the
    // previous canvas visible during filter refetches.
    let showGraphBoot = $derived(
        Boolean(error) ||
        !controller ||
        rendering ||
        (!slice && Boolean(loadingStatus))
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

    function handleFilterChange(field: 'pathFilter', value: string): void {
        const next = { ...query, [field]: value || undefined, centerId: undefined };
        app.graph.query = next;
        debouncedSearch(next);
    }

    function handleMultiFilterChange(field: 'statusFilter' | 'tagFilter', value: string[]): void {
        const next = {
            ...query,
            [field]: value.length > 0 ? value : undefined,
            centerId: undefined
        };
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
        app.patchGraphUi({ layoutId: layout });
    }

    function toggleCompound(): void {
        app.patchGraphUi({ useCompound: !ui.useCompound });
    }

    function handleCompoundBasisChange(basisId: string): void {
        app.patchGraphUi({ compoundBasisId: basisId });
    }

    function toggleAnimatePhysics(): void {
        app.patchGraphUi({ animatePhysics: !ui.animatePhysics });
    }

    function handleMaxNodesChange(value: number): void {
        app.patchGraphUi({ maxNodes: value });
        const next = { ...query, maxNodes: value };
        clearTimeout(maxNodesTimer);
        maxNodesTimer = setTimeout(() => emitQuery(next), 250);
    }

    function handleTruncationBasisChange(basis: 'path' | 'git-modified' | 'git-created'): void {
        app.patchGraphUi({ truncationBasis: basis });
        emitQuery({ ...query, truncationBasis: basis });
    }

    function handlePhysicsSettingsChange(partial: Partial<GraphPhysicsSettings>): void {
        app.patchGraphUi({
            physics: {
                gravity: partial.gravity ?? ui.physics.gravity,
                repulsion: partial.repulsion ?? ui.physics.repulsion,
                linkStrength: partial.linkStrength ?? ui.physics.linkStrength,
                linkDistance: partial.linkDistance ?? ui.physics.linkDistance,
                damping: partial.damping ?? ui.physics.damping
            }
        });
    }

    function resetPhysicsSettings(): void {
        const physics = {
            gravity: DEFAULT_PHYSICS_SETTINGS.gravity,
            repulsion: DEFAULT_PHYSICS_SETTINGS.repulsion,
            linkStrength: DEFAULT_PHYSICS_SETTINGS.linkStrength,
            linkDistance: DEFAULT_PHYSICS_SETTINGS.linkDistance,
            damping: DEFAULT_PHYSICS_SETTINGS.damping
        };
        app.patchGraphUi({ physics });
        lastControllerPhysicsKey = [
            physics.gravity,
            physics.repulsion,
            physics.linkStrength,
            physics.linkDistance,
            physics.damping
        ].join('\u0000');
        controller?.resetPhysicsSettings();
    }

    function toggleKey(): void {
        app.patchGraphUi({ showKey: !ui.showKey });
    }

    function toggleNodeType(typeId: GraphNodeTypeId): void {
        const next = ui.hiddenNodeTypes.includes(typeId)
            ? ui.hiddenNodeTypes.filter(id => id !== typeId)
            : [...ui.hiddenNodeTypes, typeId];
        app.patchGraphUi({ hiddenNodeTypes: next });
    }

    function toggleControls(): void {
        app.patchGraphUi({ showControls: !ui.showControls });
    }

    function cycleLabelMode(): void {
        const order = ['auto', 'on', 'off'] as const;
        const index = order.indexOf(ui.labelMode);
        const next = order[(index + 1) % order.length];
        app.patchGraphUi({ labelMode: next });
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
                : null,
            uiHydrated: app.graph.uiHydrated
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
        // Prefer AppState's graphUiState-driven requestGraph so restored maxNodes /
        // truncationBasis are applied first. Only force-retry errors here; cold loads
        // wait for uiHydrated unless the tab remounts with a slice already present.
        if (app.graph.error) {
            app.requestGraph({ force: true });
        } else if (app.graph.uiHydrated && !app.graph.slice && !app.graph.loading) {
            app.requestGraph();
        }
        queueMicrotask(() => queueSync('mount-microtask'));
        requestAnimationFrame(() => queueSync('mount-raf'));
    });

    onDestroy(() => {
        clearTimeout(searchTimer);
        clearTimeout(maxNodesTimer);
        controller?.destroy();
        controller = undefined;
        lastControllerLayout = '';
        lastControllerAnimate = undefined;
        lastControllerPhysicsKey = '';
        lastControllerHiddenKey = '';
        lastControllerLabelMode = undefined;
        graphLog('GraphView destroy');
    });
</script>

<div class="graph-panel">
    <TableToolbar search={query.search ?? ''} placeholder="Search ideas, paths…" on:search={handleSearch}>
        <GraphControls
            {query}
            {showKey}
            {showControls}
            {labelMode}
            {statusOptions}
            {tagOptions}
            {statusOptionCounts}
            {tagOptionCounts}
            filtersLoading={filtersLoading}
            on:pathFilter={(event) => handleFilterChange('pathFilter', event.detail)}
            on:statusFilter={(event) => handleMultiFilterChange('statusFilter', event.detail)}
            on:tagFilter={(event) => handleMultiFilterChange('tagFilter', event.detail)}
            on:toggleIndirect={toggleIndirect}
            on:clearCenter={clearCenter}
            on:toggleKey={toggleKey}
            on:toggleControls={toggleControls}
            on:cycleLabelMode={cycleLabelMode}
            on:reframeView={() => controller?.reframeToViewport()}
        />
    </TableToolbar>

    <div class="graph-meta">
        {#if loadingStatus}
            {loadingStatus}
        {:else if slice}
            {slice.nodes.length} nodes, {slice.edges.length} edges
            {#if slice.truncated}
                · truncated to {maxNodes} nodes
            {/if}
            {#if slice.totalMatching !== undefined && !slice.centerId}
                · {slice.totalMatching} matching ideas
            {/if}
        {:else}
            No graph loaded
        {/if}
    </div>

    <div class="graph-surface-wrap" class:is-booting={showGraphBoot}>
        <div class="graph-surface" bind:this={container}></div>
        <GraphControlPanel
            open={showControls}
            {layoutId}
            {animatePhysics}
            {useCompound}
            {compoundBasisId}
            {maxNodes}
            {truncationBasis}
            {physicsSettings}
            on:close={() => app.patchGraphUi({ showControls: false })}
            on:layoutChange={(event) => handleLayoutChange(event.detail)}
            on:toggleAnimatePhysics={toggleAnimatePhysics}
            on:toggleCompound={toggleCompound}
            on:compoundBasisChange={(event) => handleCompoundBasisChange(event.detail)}
            on:maxNodesChange={(event) => handleMaxNodesChange(event.detail)}
            on:truncationBasisChange={(event) => handleTruncationBasisChange(event.detail)}
            on:physicsSettingsChange={(event) => handlePhysicsSettingsChange(event.detail)}
            on:resetPhysicsSettings={resetPhysicsSettings}
        />
        <GraphKeyPanel
            items={legendItems}
            open={showKey}
            hiddenTypes={hiddenNodeTypes}
            on:close={() => app.patchGraphUi({ showKey: false })}
            on:toggleType={(event) => toggleNodeType(event.detail)}
        />
        {#if showGraphBoot}
            <div
                class="graph-boot"
                class:is-error={Boolean(error)}
                role="status"
                aria-live="polite"
                aria-busy={!error}
            >
                {#if !error}
                    <span class="graph-boot-spinner" aria-hidden="true"></span>
                {/if}
                <p>{loadingStatus}</p>
            </div>
        {:else if !error && slice && slice.nodes.length === 0}
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
