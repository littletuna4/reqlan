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
        // Keep exact typed text (including spaces). Only clear when the field is empty.
        if (text.length > 0) {
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
            const selected = [...select.selectedOptions]
                .map(option => option.value)
                .filter(Boolean);
            setSelected(column, selected);
            return;
        }
        const value = select.value;
        setSelected(column, value ? [value] : []);
    }

    function clearSelected(column: string): void {
        setSelected(column, []);
    }

    /** Controlled select value — prefer `value` over option `selected` so deselect syncs. */
    function selectValue(column: string, multiple: boolean): string | string[] {
        const selected = filterFor(column)?.selected ?? [];
        return multiple ? selected : (selected[0] ?? '');
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
                    <div class="column-filter-select-wrap">
                        <select
                            class="column-filter"
                            aria-label="Filter {col.label}"
                            multiple={col.multiple}
                            size={col.multiple ? Math.min(4, (col.options?.length ?? 0) + (col.multiple ? 0 : 1)) : undefined}
                            value={selectValue(col.column, Boolean(col.multiple))}
                            onchange={(event) => handleSelectChange(col.column, Boolean(col.multiple), event)}
                        >
                            {#if !col.multiple}
                                <option value="">All</option>
                            {/if}
                            {#each col.options ?? [] as option (option.value)}
                                <option value={option.value}>
                                    {option.label}
                                </option>
                            {/each}
                        </select>
                        {#if (filterFor(col.column)?.selected?.length ?? 0) > 0}
                            <button
                                type="button"
                                class="column-filter-clear"
                                aria-label="Clear {col.label} filter"
                                title="Clear"
                                onclick={() => clearSelected(col.column)}
                            >
                                ×
                            </button>
                        {/if}
                    </div>
                {/if}
            </th>
        {/each}
    </tr>
{/if}
