<script lang="ts">
    import { createEventDispatcher, onDestroy } from 'svelte';
    import {
        DEFAULT_LAYOUT_ID,
        GRAPH_LAYOUT_OPTIONS,
        GRAPH_COMPOUND_BASIS_OPTIONS
    } from '../lib/graph-cytoscape.js';
    import {
        DEFAULT_PHYSICS_SETTINGS,
        type GraphPhysicsSettings
    } from '../lib/graph-physics.js';
    import {
        clampPanelPosition,
        observeSurfaceResize,
        readSurfaceBounds
    } from '../lib/graph-float-panel.js';

    /** Mirrors GRAPH_NODES_HARD_CAP from @reqlan/analytical (webview cannot import that package). */
    const GRAPH_NODES_HARD_CAP = 1000;

    export let open = false;
    export let layoutId = DEFAULT_LAYOUT_ID;
    export let animatePhysics = false;
    export let useCompound = false;
    export let compoundBasisId = 'folder-path';
    export let maxNodes = 120;
    export let truncationBasis: 'path' | 'git-modified' | 'git-created' = 'path';
    export let physicsSettings: GraphPhysicsSettings = { ...DEFAULT_PHYSICS_SETTINGS };

    const dispatch = createEventDispatcher<{
        close: void;
        layoutChange: string;
        toggleAnimatePhysics: void;
        toggleCompound: void;
        compoundBasisChange: string;
        maxNodesChange: number;
        truncationBasisChange: 'path' | 'git-modified' | 'git-created';
        physicsSettingsChange: Partial<GraphPhysicsSettings>;
        resetPhysicsSettings: void;
    }>();

    const layoutOptions = GRAPH_LAYOUT_OPTIONS;
    const compoundBasisOptions = GRAPH_COMPOUND_BASIS_OPTIONS;
    const truncationBasisOptions: { id: 'path' | 'git-modified' | 'git-created'; label: string }[] = [
        { id: 'path', label: 'Path' },
        { id: 'git-modified', label: 'Last modified' },
        { id: 'git-created', label: 'Last created' }
    ];

    let panelEl: HTMLDivElement;
    let panelX: number | undefined;
    let panelY: number | undefined;
    let dragging = false;
    let dragPointerId: number | undefined;
    let dragOrigin = { x: 0, y: 0, panelX: 0, panelY: 0 };
    let disconnectResize: (() => void) | undefined;

    function ensurePosition(): void {
        if (!panelEl || panelX !== undefined) {
            return;
        }
        const bounds = readSurfaceBounds(panelEl);
        if (!bounds) {
            return;
        }
        const panelRect = panelEl.getBoundingClientRect();
        panelX = panelRect.left - bounds.left;
        panelY = panelRect.top - bounds.top;
    }

    function attachResizeObserver(): void {
        disconnectResize?.();
        disconnectResize = undefined;
        if (!panelEl) {
            return;
        }
        disconnectResize = observeSurfaceResize(
            panelEl,
            () => ({ x: panelX, y: panelY }),
            (x, y) => {
                panelX = x;
                panelY = y;
            }
        );
    }

    function onHandlePointerDown(event: PointerEvent): void {
        if (!open) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        ensurePosition();

        const bounds = readSurfaceBounds(panelEl);
        if (!bounds || panelX === undefined || panelY === undefined) {
            return;
        }

        dragging = true;
        dragPointerId = event.pointerId;
        dragOrigin = {
            x: event.clientX,
            y: event.clientY,
            panelX,
            panelY
        };
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }

    function onHandlePointerMove(event: PointerEvent): void {
        if (!dragging || event.pointerId !== dragPointerId) {
            return;
        }

        const bounds = readSurfaceBounds(panelEl);
        if (!bounds || !panelEl) {
            return;
        }

        const dx = event.clientX - dragOrigin.x;
        const dy = event.clientY - dragOrigin.y;
        const next = clampPanelPosition(
            panelEl,
            dragOrigin.panelX + dx,
            dragOrigin.panelY + dy,
            bounds
        );
        panelX = next.x;
        panelY = next.y;
    }

    function onHandlePointerUp(event: PointerEvent): void {
        if (event.pointerId !== dragPointerId) {
            return;
        }
        dragging = false;
        dragPointerId = undefined;
        if (event.currentTarget instanceof HTMLElement && event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }

    function handleLayoutChange(event: Event): void {
        dispatch('layoutChange', (event.currentTarget as HTMLSelectElement).value);
    }

    function handleCompoundBasisChange(event: Event): void {
        dispatch('compoundBasisChange', (event.currentTarget as HTMLSelectElement).value);
    }

    function handleTruncationBasisChange(event: Event): void {
        dispatch(
            'truncationBasisChange',
            (event.currentTarget as HTMLSelectElement).value as 'path' | 'git-modified' | 'git-created'
        );
    }

    function handleMaxNodesChange(event: Event): void {
        const raw = Number((event.currentTarget as HTMLInputElement).value);
        if (!Number.isFinite(raw)) {
            return;
        }
        dispatch('maxNodesChange', Math.min(GRAPH_NODES_HARD_CAP, Math.max(1, Math.round(raw))));
    }

    function emitPhysics(
        key: keyof Pick<
            GraphPhysicsSettings,
            'gravity' | 'repulsion' | 'linkStrength' | 'linkDistance' | 'damping'
        >,
        event: Event
    ): void {
        const value = Number((event.currentTarget as HTMLInputElement).value);
        if (!Number.isFinite(value)) {
            return;
        }
        dispatch('physicsSettingsChange', { [key]: value });
    }

    $: if (open && panelEl) {
        attachResizeObserver();
    } else {
        disconnectResize?.();
        disconnectResize = undefined;
    }

    onDestroy(() => {
        dragging = false;
        disconnectResize?.();
        disconnectResize = undefined;
    });
</script>

{#if open}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
        bind:this={panelEl}
        class="graph-control-panel"
        class:graph-control-panel-positioned={panelX !== undefined}
        class:graph-control-panel-dragging={dragging}
        style:--graph-control-panel-x={panelX !== undefined ? `${panelX}px` : null}
        style:--graph-control-panel-y={panelY !== undefined ? `${panelY}px` : null}
        onpointerdown={(event) => event.stopPropagation()}
    >
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
            class="graph-control-panel-header"
            onpointerdown={onHandlePointerDown}
            onpointermove={onHandlePointerMove}
            onpointerup={onHandlePointerUp}
            onpointercancel={onHandlePointerUp}
        >
            <span class="graph-control-panel-title">Controls</span>
            <button
                type="button"
                class="graph-control-panel-close"
                aria-label="Close controls"
                onclick={(event) => { event.stopPropagation(); dispatch('close'); }}
            >
                ×
            </button>
        </div>

        <div class="graph-control-panel-body">
            <section class="graph-control-panel-section" aria-label="Layout">
                <h3 class="graph-control-panel-heading">Layout</h3>
                <label class="graph-control-panel-field">
                    <span class="graph-control-panel-label">Algorithm</span>
                    <select class="graph-select" value={layoutId} onchange={handleLayoutChange}>
                        {#each layoutOptions as option (option.id)}
                            <option value={option.id}>{option.label}</option>
                        {/each}
                    </select>
                </label>
                <button
                    type="button"
                    class="graph-chip"
                    class:active={animatePhysics}
                    aria-pressed={animatePhysics}
                    title="Keep force-directed layout animating continuously"
                    onclick={() => dispatch('toggleAnimatePhysics')}
                >
                    Live physics
                </button>
                <button
                    type="button"
                    class="graph-chip"
                    class:active={useCompound}
                    aria-pressed={useCompound}
                    onclick={() => dispatch('toggleCompound')}
                >
                    Compound
                </button>
                {#if useCompound}
                    <label class="graph-control-panel-field">
                        <span class="graph-control-panel-label">Group by</span>
                        <select class="graph-select" value={compoundBasisId} onchange={handleCompoundBasisChange}>
                            {#each compoundBasisOptions as option (option.id)}
                                <option value={option.id}>{option.label}</option>
                            {/each}
                        </select>
                    </label>
                {/if}
            </section>

            <section class="graph-control-panel-section" aria-label="Node budget">
                <h3 class="graph-control-panel-heading">Node budget</h3>
                <label class="graph-control-panel-field">
                    <span class="graph-control-panel-label">Max nodes</span>
                    <input
                        class="graph-control-panel-number"
                        type="number"
                        min="1"
                        max={GRAPH_NODES_HARD_CAP}
                        step="1"
                        value={maxNodes}
                        onchange={handleMaxNodesChange}
                    />
                </label>
                <label class="graph-control-panel-field">
                    <span class="graph-control-panel-label">Keep by</span>
                    <select class="graph-select" value={truncationBasis} onchange={handleTruncationBasisChange}>
                        {#each truncationBasisOptions as option (option.id)}
                            <option value={option.id}>{option.label}</option>
                        {/each}
                    </select>
                </label>
            </section>

            <section class="graph-control-panel-section" aria-label="Physics">
                <div class="graph-control-panel-heading-row">
                    <h3 class="graph-control-panel-heading">Physics</h3>
                    <button
                        type="button"
                        class="graph-control-panel-reset"
                        onclick={() => dispatch('resetPhysicsSettings')}
                    >
                        Reset
                    </button>
                </div>
                <label class="graph-control-panel-slider">
                    <span class="graph-control-panel-label">
                        Gravity <span class="graph-control-panel-value">{physicsSettings.gravity.toFixed(4)}</span>
                    </span>
                    <input
                        type="range"
                        min="0"
                        max="0.01"
                        step="0.0001"
                        value={physicsSettings.gravity}
                        oninput={(event) => emitPhysics('gravity', event)}
                    />
                </label>
                <label class="graph-control-panel-slider">
                    <span class="graph-control-panel-label">
                        Repulsion <span class="graph-control-panel-value">{Math.round(physicsSettings.repulsion)}</span>
                    </span>
                    <input
                        type="range"
                        min="0"
                        max="50000"
                        step="500"
                        value={physicsSettings.repulsion}
                        oninput={(event) => emitPhysics('repulsion', event)}
                    />
                </label>
                <label class="graph-control-panel-slider">
                    <span class="graph-control-panel-label">
                        Link strength <span class="graph-control-panel-value">{physicsSettings.linkStrength.toFixed(3)}</span>
                    </span>
                    <input
                        type="range"
                        min="0"
                        max="0.1"
                        step="0.001"
                        value={physicsSettings.linkStrength}
                        oninput={(event) => emitPhysics('linkStrength', event)}
                    />
                </label>
                <label class="graph-control-panel-slider">
                    <span class="graph-control-panel-label">
                        Link distance <span class="graph-control-panel-value">{Math.round(physicsSettings.linkDistance)}</span>
                    </span>
                    <input
                        type="range"
                        min="20"
                        max="300"
                        step="5"
                        value={physicsSettings.linkDistance}
                        oninput={(event) => emitPhysics('linkDistance', event)}
                    />
                </label>
                <label class="graph-control-panel-slider">
                    <span class="graph-control-panel-label">
                        Damping <span class="graph-control-panel-value">{physicsSettings.damping.toFixed(2)}</span>
                    </span>
                    <input
                        type="range"
                        min="0.1"
                        max="0.95"
                        step="0.05"
                        value={physicsSettings.damping}
                        oninput={(event) => emitPhysics('damping', event)}
                    />
                </label>
            </section>
        </div>
    </div>
{/if}
