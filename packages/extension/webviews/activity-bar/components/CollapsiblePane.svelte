<script lang="ts">
    import type { Snippet } from 'svelte';
    import { clampPaneHeight, MIN_PANE_HEIGHT } from '../lib/pane-layout.js';

    interface Props {
        title: string;
        id: string;
        expanded?: boolean;
        /** Expanded panes grow to fill the pane stack (always on when open). */
        fill?: boolean;
        /** Relative flex weight / resize units for this pane. */
        height?: number;
        /** Show drag handle (hidden when a single pane fills alone). */
        resizable?: boolean;
        onToggle?: (id: string, expanded: boolean) => void;
        onResize?: (id: string, height: number) => void;
        children: Snippet;
        actions?: Snippet;
        /** Compact controls in the section header (do not toggle the pane). */
        headerActions?: Snippet;
    }

    let {
        title,
        id,
        expanded = true,
        fill = false,
        height,
        resizable = false,
        onToggle,
        onResize,
        children,
        actions,
        headerActions
    }: Props = $props();

    let resizing = $state(false);

    function toggle(): void {
        const next = !expanded;
        onToggle?.(id, next);
    }

    function onResizePointerDown(event: PointerEvent): void {
        if (!expanded || !resizable || !onResize) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const handle = event.currentTarget as HTMLElement;
        handle.setPointerCapture(event.pointerId);
        resizing = true;
        const startY = event.clientY;
        const startHeight = height ?? MIN_PANE_HEIGHT;

        function onMove(moveEvent: PointerEvent): void {
            onResize?.(id, clampPaneHeight(startHeight + (moveEvent.clientY - startY)));
        }

        function onUp(upEvent: PointerEvent): void {
            resizing = false;
            handle.releasePointerCapture(upEvent.pointerId);
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            handle.removeEventListener('pointercancel', onUp);
        }

        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onUp);
    }

    let sectionStyle = $derived(
        expanded && fill && height !== undefined
            ? `flex: ${height} 1 ${MIN_PANE_HEIGHT}px`
            : undefined
    );
</script>

<section
    class="section"
    class:section-expanded={expanded}
    class:section-fill={expanded && fill}
    class:section-resizing={resizing}
    style={sectionStyle}
>
    <div
        class="section-header"
        onclick={toggle}
        onkeydown={(event) => event.key === 'Enter' && toggle()}
        role="button"
        tabindex="0"
        aria-expanded={expanded}
    >
        <span class="section-title">{title}</span>
        {#if headerActions}
            <div class="section-header-actions">
                {@render headerActions()}
            </div>
        {/if}
        <span class="section-chevron">{expanded ? '−' : '+'}</span>
    </div>
    {#if expanded}
        <div class="section-body">
            {#if actions}
                <div class="section-actions">{@render actions()}</div>
            {/if}
            {@render children()}
        </div>
        {#if resizable && onResize}
            <div
                class="section-resize-handle"
                role="separator"
                aria-orientation="horizontal"
                aria-label={`Resize ${title}`}
                aria-valuemin={MIN_PANE_HEIGHT}
                aria-valuenow={height}
                onpointerdown={onResizePointerDown}
            ></div>
        {/if}
    {/if}
</section>
