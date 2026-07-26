<script lang="ts">
    import { createEventDispatcher, onDestroy } from 'svelte';
    import {
        GRAPH_LEGEND_CSS_COLORS,
        type GraphLegendItem,
        type GraphNodeTypeId
    } from '../lib/graph-theme.js';
    import {
        clampPanelPosition,
        observeSurfaceResize,
        readSurfaceBounds
    } from '../lib/graph-float-panel.js';

    export let items: GraphLegendItem[] = [];
    export let open = false;
    /** Node types currently hidden in the graph; rows for these render dimmed. */
    export let hiddenTypes: readonly GraphNodeTypeId[] = [];

    const dispatch = createEventDispatcher<{ close: void; toggleType: GraphNodeTypeId }>();

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
        class="graph-key"
        class:graph-key-positioned={panelX !== undefined}
        class:graph-key-dragging={dragging}
        style:--graph-key-x={panelX !== undefined ? `${panelX}px` : null}
        style:--graph-key-y={panelY !== undefined ? `${panelY}px` : null}
        on:pointerdown|stopPropagation
    >
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
            class="graph-key-header"
            on:pointerdown={onHandlePointerDown}
            on:pointermove={onHandlePointerMove}
            on:pointerup={onHandlePointerUp}
            on:pointercancel={onHandlePointerUp}
        >
            <span class="graph-key-title">Key</span>
            <button
                type="button"
                class="graph-key-close"
                aria-label="Close key"
                on:click|stopPropagation={() => dispatch('close')}
            >
                ×
            </button>
        </div>
        <ul class="graph-key-list">
            {#each items as item (item.label)}
                <li class="graph-key-item">
                    {#if item.kind === 'node'}
                        <button
                            type="button"
                            class="graph-key-toggle"
                            class:graph-key-toggle-hidden={hiddenTypes.includes(item.typeId)}
                            aria-pressed={!hiddenTypes.includes(item.typeId)}
                            title="Toggle {item.label} visibility"
                            on:click|stopPropagation={() => dispatch('toggleType', item.typeId)}
                        >
                            <span class="graph-key-swatch" style:background={item.color}></span>
                            <span class="graph-key-toggle-label">{item.label}</span>
                        </button>
                    {:else if item.kind === 'compound'}
                        <span class="graph-key-compound"></span>
                        <span>{item.label}</span>
                    {:else if item.kind === 'group-emphasis'}
                        <span
                            class="graph-key-group-emphasis"
                            class:hover={item.variant === 'hover'}
                            class:selected={item.variant === 'selected'}
                            style:--graph-key-group-border={item.variant === 'hover'
                                ? GRAPH_LEGEND_CSS_COLORS.groupHover
                                : GRAPH_LEGEND_CSS_COLORS.groupSelected}
                        ></span>
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
