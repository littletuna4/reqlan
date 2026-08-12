<script lang="ts">
    /**
     * Attributes index table for the active base.
     * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".attributes_tab]
     */
    import type { AttributesTableQuery, ColumnFilter } from '../../../src/webview_module/shared/messages.js';
    import { isColumnVisible } from '../lib/table-columns.js';
    import { getApp } from '../state/context.js';
    import ChipList from './ChipList.svelte';
    import ColumnFilterRow from './ColumnFilterRow.svelte';
    import Pager from './Pager.svelte';
    import SortableTh from './SortableTh.svelte';
    import TableOptionsMenu from './TableOptionsMenu.svelte';
    import TableToolbar from './TableToolbar.svelte';

    const app = getApp();

    // $derived tracks AppState $state updates from the extension message listener;
    // legacy $: does not (see GraphView.svelte).
    let filtersOpen = $state(false);

    const query = $derived(app.attributes.query);
    const rows = $derived(app.attributes.rows);
    const total = $derived(app.attributes.total);
    const visibleColumns = $derived(app.tableUi.attributes.visibleColumns);

    const columnOptions = [
        { id: 'key', label: 'Key' },
        { id: 'ideaCount', label: 'Ideas' },
        { id: 'valueCount', label: 'Values' },
        { id: 'sampleValues', label: 'Sample values' }
    ];

    const filterColumns = [
        { column: 'key', label: 'Key', kind: 'text' as const },
        { column: 'ideaCount', label: 'Ideas', kind: 'none' as const },
        { column: 'valueCount', label: 'Values', kind: 'none' as const },
        { column: 'sampleValues', label: 'Sample values', kind: 'none' as const }
    ];

    function emitQuery(next: AttributesTableQuery): void {
        app.onAttributesQueryChange(next);
    }

    function handleSearch(event: CustomEvent<string>): void {
        emitQuery({ ...query, page: 0, search: event.detail || undefined });
    }

    function handleSort(event: CustomEvent<{ sortKey: string }>): void {
        const sortKey = event.detail.sortKey as AttributesTableQuery['sortBy'];
        const sortDir = query.sortBy === sortKey && query.sortDir === 'asc' ? 'desc' : 'asc';
        emitQuery({ ...query, page: 0, sortBy: sortKey, sortDir });
    }

    function handleColumnFilters(event: CustomEvent<ColumnFilter[]>): void {
        emitQuery({ ...query, page: 0, columnFilters: event.detail });
    }

    function show(id: string): boolean {
        return isColumnVisible(visibleColumns, id);
    }

    function openInIdeas(key: string): void {
        app.openAttributeInIdeas(key);
    }
</script>

<TableToolbar
    search={query.search ?? ''}
    placeholder="Filter attributes…"
    {filtersOpen}
    on:search={handleSearch}
    on:toggleFilters={() => { filtersOpen = !filtersOpen; }}
>
    <svelte:fragment slot="actions">
        <TableOptionsMenu
            columns={columnOptions}
            {visibleColumns}
            on:change={(event) => app.patchTableUi({ attributes: { visibleColumns: event.detail } })}
        />
    </svelte:fragment>
</TableToolbar>

<div class="table-scroll">
<table>
    <thead>
        <tr>
            {#if show('key')}
                <SortableTh label="Key" sortKey="key" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="12rem" on:sort={handleSort} />
            {/if}
            {#if show('ideaCount')}
                <SortableTh label="Ideas" sortKey="ideaCount" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="5.5rem" on:sort={handleSort} />
            {/if}
            {#if show('valueCount')}
                <SortableTh label="Values" sortKey="valueCount" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="5.5rem" on:sort={handleSort} />
            {/if}
            {#if show('sampleValues')}
                <th style="width:18rem;min-width:18rem">Sample values</th>
            {/if}
        </tr>
        <ColumnFilterRow
            columns={filterColumns.filter(col => show(col.column))}
            filters={query.columnFilters ?? []}
            open={filtersOpen}
            on:change={handleColumnFilters}
        />
    </thead>
    <tbody>
        {#each rows as row (row.key)}
            <tr class="clickable" onclick={() => openInIdeas(row.key)}>
                {#if show('key')}<td>{row.key}</td>{/if}
                {#if show('ideaCount')}<td>{row.ideaCount}</td>{/if}
                {#if show('valueCount')}<td>{row.valueCount}</td>{/if}
                {#if show('sampleValues')}
                    <td onclick={(event) => event.stopPropagation()}>
                        <ChipList items={row.sampleValues} emptyLabel="—" />
                    </td>
                {/if}
            </tr>
        {:else}
            <tr>
                <td colspan="4" class="subtle">No attributes indexed yet.</td>
            </tr>
        {/each}
    </tbody>
</table>
</div>

<Pager
    page={query.page}
    {total}
    pageSize={query.pageSize}
    label="attributes"
    on:prev={() => query.page > 0 && app.loadAttributes({ ...query, page: query.page - 1 })}
    on:next={() => app.loadAttributes({ ...query, page: query.page + 1 })}
/>
