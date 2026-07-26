<script lang="ts">
    import type { Snippet } from 'svelte';

    interface Props {
        loading?: boolean;
        error?: string;
        empty?: boolean;
        loadingText?: string;
        emptyText?: string;
        children?: Snippet;
    }

    let {
        loading = false,
        error,
        empty = false,
        loadingText = 'Loading…',
        emptyText = 'Nothing here yet.',
        children
    }: Props = $props();
</script>

{#if error}
    <p class="error-text" role="alert">{error}</p>
{:else if loading}
    <p class="muted pane-status" role="status" aria-live="polite">{loadingText}</p>
{:else if empty}
    <p class="muted pane-status">{emptyText}</p>
{:else if children}
    {@render children()}
{/if}
