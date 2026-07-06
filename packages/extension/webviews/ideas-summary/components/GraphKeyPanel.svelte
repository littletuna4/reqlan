<script lang="ts">
    import { createEventDispatcher, onDestroy } from 'svelte';
    import type { GraphLegendItem } from '../lib/graph-theme.js';

    export let items: GraphLegendItem[] = [];
    export let open = false;

    const dispatch = createEventDispatcher<{ close: void }>();

    let panelEl: HTMLDivElement;
    let panelX: number | undefined;
    let panelY: number | undefined;
    let dragging = false;
    let dragPointerId: number | undefined;
    let dragOrigin = { x: 0, y: 0, panelX: 0, panelY: 0 };

    function clamp(value: number, min: number, max: number): number {
        return Math.min(Math.max(value, min), max);
    }

    function surfaceBounds(): { width: number; height: number; left: number; top: number } | undefined {
        const surface = panelEl?.parentElement;
        if (!surface) {
            return undefined;
        }
        const rect = surface.getBoundingClientRect();
        return { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
    }

    function ensurePosition(): void {
        if (!panelEl || panelX !== undefined) {
            return;
        }
        const bounds = surfaceBounds();
        if (!bounds) {
            return;
        }
        const panelRect = panelEl.getBoundingClientRect();
        panelX = panelRect.left - bounds.left;
        panelY = panelRect.top - bounds.top;
    }

    function onHandlePointerDown(event: PointerEvent): void {
        if (!open) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        ensurePosition();

        const bounds = surfaceBounds();
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

        const bounds = surfaceBounds();
        if (!bounds || !panelEl) {
            return;
        }

        const panelRect = panelEl.getBoundingClientRect();
        const dx = event.clientX - dragOrigin.x;
        const dy = event.clientY - dragOrigin.y;
        panelX = clamp(
            dragOrigin.panelX + dx,
            0,
            Math.max(0, bounds.width - panelRect.width)
        );
        panelY = clamp(
            dragOrigin.panelY + dy,
            0,
            Math.max(0, bounds.height - panelRect.height)
        );
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

    onDestroy(() => {
        dragging = false;
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
