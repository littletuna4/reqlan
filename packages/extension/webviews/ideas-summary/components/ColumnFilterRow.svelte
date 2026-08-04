<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { ColumnFilter } from '../../../src/webview_module/shared/messages.js';
    import type { ColumnFilterSpec } from '../lib/column-filters.js';

    export let columns: ColumnFilterSpec[] = [];
    export let filters: ColumnFilter[] = [];
    export let open = false;

    const dispatch = createEventDispatcher<{ change: ColumnFilter[] }>();

    function filterFor(column: string): ColumnFilter | undefined {
        return filters.find(filter => filter.column === column);
    }

    function setText(column: string, text: string): void {
        const next = filters.filter(filter => filter.column !== column);
        if (text.trim()) {
            next.push({ column, text });
        }
        dispatch('change', next);
    }

    function setSelected(column: string, selected: string[]): void {
        const next = filters.filter(filter => filter.column !== column);
        if (selected.length > 0) {
            next.push({ column, selected });
        }
        dispatch('change', next);
    }

    function handleSelectChange(column: string, multiple: boolean, event: Event): void {
        const select = event.currentTarget as HTMLSelectElement;
        if (multiple) {
            const selected = [...select.selectedOptions].map(option => option.value).filter(Boolean);
            setSelected(column, selected);
            return;
        }
        const value = select.value;
        setSelected(column, value ? [value] : []);
    }
</script>

{#if open}
    <tr class="column-filter-row">
        {#each columns as col (col.column)}
            <th>
                {#if col.kind === 'none'}
                    <span class="column-filter-spacer" aria-hidden="true"></span>
                {:else if col.kind === 'text'}
                    <input
                        class="column-filter"
                        type="search"
                        placeholder="Filter {col.label}…"
                        aria-label="Filter {col.label}"
                        value={filterFor(col.column)?.text ?? ''}
                        oninput={(event) => setText(col.column, (event.currentTarget as HTMLInputElement).value)}
                    />
                {:else}
                    <select
                        class="column-filter"
                        aria-label="Filter {col.label}"
                        multiple={col.multiple}
                        size={col.multiple ? Math.min(4, (col.options?.length ?? 0) + 1) : undefined}
                        onchange={(event) => handleSelectChange(col.column, Boolean(col.multiple), event)}
                    >
                        {#if !col.multiple}
                            <option value="">All</option>
                        {/if}
                        {#each col.options ?? [] as option (option.value)}
                            <option
                                value={option.value}
                                selected={(filterFor(col.column)?.selected ?? []).includes(option.value)}
                            >
                                {option.label}
                            </option>
                        {/each}
                    </select>
                {/if}
            </th>
        {/each}
    </tr>
{/if}
