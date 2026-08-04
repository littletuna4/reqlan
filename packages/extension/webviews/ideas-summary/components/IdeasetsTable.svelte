<script lang="ts">
    import type {
        ColumnFilter,
        IdeasetsTableQuery,
        IdeasetTableRow
    } from '../../../src/webview_module/shared/messages.js';
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

    const query = $derived(app.ideasets.query);
    const rows = $derived(app.ideasets.rows);
    const total = $derived(app.ideasets.total);
    const visibleColumns = $derived(app.tableUi.ideasets.visibleColumns);

    const columnOptions = [
        { id: 'name', label: 'Name' },
        { id: 'path', label: 'Path' },
        { id: 'kind', label: 'Kind' },
        { id: 'members', label: 'Members' }
    ];

    const filterColumns = [
        { column: 'name', label: 'Name', kind: 'text' as const },
        { column: 'path', label: 'Path', kind: 'text' as const },
        {
            column: 'kind',
            label: 'Kind',
            kind: 'select' as const,
            multiple: true,
            options: [
                { value: 'file', label: 'File (implicit)' },
                { value: 'explicit', label: 'Explicit' }
            ]
        },
        { column: 'members', label: 'Members', kind: 'none' as const }
    ];

    function emitQuery(next: IdeasetsTableQuery): void {
        app.onIdeasetsQueryChange(next);
    }

    function memberItems(row: IdeasetTableRow): string[] {
        return (row.members ?? []).map(member => member.name);
    }

    function openMember(row: IdeasetTableRow, index: number): void {
        const member = row.members?.[index];
        if (!member) {
            return;
        }
        app.openIdea(member.fileUri, member.lineStart);
    }

    function openSource(row: IdeasetTableRow): void {
        app.openIdea(row.fileUri, row.lineStart);
    }

    function handleSearch(event: CustomEvent<string>): void {
        emitQuery({ ...query, page: 0, search: event.detail || undefined });
    }

    function handleSort(event: CustomEvent<{ sortKey: string }>): void {
        const sortKey = event.detail.sortKey as IdeasetsTableQuery['sortBy'];
        const sortDir = query.sortBy === sortKey && query.sortDir === 'asc' ? 'desc' : 'asc';
        emitQuery({ ...query, page: 0, sortBy: sortKey, sortDir });
    }

    function handleColumnFilters(event: CustomEvent<ColumnFilter[]>): void {
        emitQuery({ ...query, page: 0, columnFilters: event.detail });
    }

    function show(id: string): boolean {
        return isColumnVisible(visibleColumns, id);
    }
</script>

<TableToolbar
    search={query.search ?? ''}
    placeholder="Filter ideasets…"
    {filtersOpen}
    on:search={handleSearch}
    on:toggleFilters={() => { filtersOpen = !filtersOpen; }}
>
    <svelte:fragment slot="actions">
        <TableOptionsMenu
            columns={columnOptions}
            {visibleColumns}
            on:change={(event) => app.patchTableUi({ ideasets: { visibleColumns: event.detail } })}
        />
    </svelte:fragment>
</TableToolbar>

<table>
    <thead>
        <tr>
            {#if show('name')}
                <SortableTh label="Name" sortKey="name" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="22%" on:sort={handleSort} />
            {/if}
            {#if show('path')}
                <SortableTh label="Path" sortKey="path" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="28%" on:sort={handleSort} />
            {/if}
            {#if show('kind')}
                <SortableTh label="Kind" sortKey="kind" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="14%" on:sort={handleSort} />
            {/if}
            {#if show('members')}
                <SortableTh label="Members" sortKey="members" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="36%" on:sort={handleSort} />
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
        {#each rows as row (row.id)}
            <tr>
                {#if show('name')}<td>{row.name}</td>{/if}
                {#if show('path')}
                    <td>
                        <button type="button" class="path-link" onclick={() => openSource(row)}>
                            {row.path}
                        </button>
                    </td>
                {/if}
                {#if show('kind')}<td>{row.kind === 'file' ? 'file (implicit)' : 'explicit'}</td>{/if}
                {#if show('members')}
                    <td>
                        <ChipList
                            items={memberItems(row)}
                            titles={memberItems(row)}
                            clickable
                            emptyLabel="No members"
                            on:select={(event) => openMember(row, event.detail.index)}
                        />
                    </td>
                {/if}
            </tr>
        {/each}
    </tbody>
</table>

<Pager
    page={query.page}
    {total}
    pageSize={query.pageSize}
    label="ideasets"
    on:prev={() => query.page > 0 && app.loadIdeasets({ ...query, page: query.page - 1 })}
    on:next={() => app.loadIdeasets({ ...query, page: query.page + 1 })}
/>
