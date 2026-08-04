<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    export let search = '';
    export let placeholder = 'Filter…';
    export let filtersOpen = false;
    export let groupByLabel: string | undefined = undefined;
    export let groupByActive = false;

    const dispatch = createEventDispatcher<{
        search: string;
        toggleFilters: void;
        toggleGroupBy: void;
    }>();

    function handleInput(event: Event): void {
        dispatch('search', (event.currentTarget as HTMLInputElement).value);
    }
</script>

<div class="table-toolbar">
    <input
        class="table-filter"
        type="search"
        {placeholder}
        value={search}
        oninput={handleInput}
    />
    <button
        type="button"
        class="secondary"
        class:has-filters={filtersOpen}
        onclick={() => dispatch('toggleFilters')}
    >
        {filtersOpen ? 'Hide column filters' : 'Column filters'}
    </button>
    {#if groupByLabel}
        <button
            type="button"
            class="secondary"
            class:has-filters={groupByActive}
            onclick={() => dispatch('toggleGroupBy')}
        >
            {groupByActive ? `Ungroup` : `Group by ${groupByLabel}`}
        </button>
    {/if}
    <slot name="actions" />
    <slot />
</div>
