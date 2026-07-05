<script lang="ts">
    export let page = 0;
    export let total = 0;
    export let pageSize = 50;
    export let label = 'items';

    $: totalPages = Math.max(1, Math.ceil(total / pageSize));
    $: pageLabel = `Page ${page + 1} of ${totalPages} (${total} ${label})`;

    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher<{ prev: void; next: void }>();
</script>

<div class="pager">
    <button disabled={page <= 0} on:click={() => dispatch('prev')}>Previous</button>
    <span>{pageLabel}</span>
    <button disabled={page + 1 >= totalPages} on:click={() => dispatch('next')}>Next</button>
</div>
