<script lang="ts">
    import type { Snippet } from 'svelte';

    interface Props {
        title: string;
        count?: number;
        defaultExpanded?: boolean;
        scrollable?: boolean;
        children: Snippet;
    }

    let {
        title,
        count,
        defaultExpanded = false,
        scrollable = true,
        children
    }: Props = $props();

    let expanded = $state(defaultExpanded);

    function toggle(): void {
        expanded = !expanded;
    }
</script>

<div class="nested-section">
    <button
        type="button"
        class="nested-section-header"
        onclick={toggle}
        aria-expanded={expanded}
    >
        <span class="nested-section-title">{title}</span>
        {#if count !== undefined}
            <span class="nested-section-count muted">{count}</span>
        {/if}
        <span class="nested-section-chevron">{expanded ? '−' : '+'}</span>
    </button>
    {#if expanded}
        <div class="nested-section-body" class:scrollable>
            {@render children()}
        </div>
    {/if}
</div>
