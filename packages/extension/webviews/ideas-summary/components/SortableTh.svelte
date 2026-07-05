<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { SortDirection } from '../../../src/webview_module/shared/messages.js';

    export let label: string;
    export let sortKey: string;
    export let sortBy: string | undefined = undefined;
    export let sortDir: SortDirection = 'asc';
    export let width: string | undefined = undefined;

    const dispatch = createEventDispatcher<{ sort: { sortKey: string } }>();

    $: active = sortBy === sortKey;
    $: indicator = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

    function handleSort(): void {
        dispatch('sort', { sortKey });
    }
</script>

<th class:sort-active={active} style:width={width} on:click={handleSort}>
    {label}{indicator}
</th>
