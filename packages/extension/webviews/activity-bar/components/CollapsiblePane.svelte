<script lang="ts">
    import type { Snippet } from 'svelte';

    interface Props {
        title: string;
        id: string;
        expanded?: boolean;
        onToggle?: (id: string, expanded: boolean) => void;
        children: Snippet;
        actions?: Snippet;
    }

    let {
        title,
        id,
        expanded = true,
        onToggle,
        children,
        actions
    }: Props = $props();

    function toggle(): void {
        const next = !expanded;
        onToggle?.(id, next);
    }
</script>

<section class="section">
    <div
        class="section-header"
        onclick={toggle}
        onkeydown={(event) => event.key === 'Enter' && toggle()}
        role="button"
        tabindex="0"
        aria-expanded={expanded}
    >
        <span>{title}</span>
        <span class="section-chevron">{expanded ? '−' : '+'}</span>
    </div>
    {#if expanded}
        <div class="section-body">
            {#if actions}
                <div class="section-actions">{@render actions()}</div>
            {/if}
            {@render children()}
        </div>
    {/if}
</section>
