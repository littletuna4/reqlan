<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    export let search = '';
    export let placeholder = 'Filter…';

    const dispatch = createEventDispatcher<{ search: string }>();

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
        on:input={handleInput}
    />
    <slot />
</div>
