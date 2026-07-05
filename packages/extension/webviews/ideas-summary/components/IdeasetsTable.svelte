<script lang="ts">
    import type { IdeasetsTableQuery, IdeasetTableRow } from '../../../src/webview_module/shared/messages.js';
    import { createEventDispatcher } from 'svelte';
    import ChipList from './ChipList.svelte';
    import Pager from './Pager.svelte';
    import SortableTh from './SortableTh.svelte';
    import TableToolbar from './TableToolbar.svelte';

    export let rows: IdeasetTableRow[] = [];
    export let query: IdeasetsTableQuery;
    export let total = 0;

    const dispatch = createEventDispatcher<{
        openMember: { fileUri: string; line: number };
        openSource: { fileUri: string; line: number };
        queryChange: IdeasetsTableQuery;
        prev: void;
        next: void;
    }>();

    function emitQuery(next: IdeasetsTableQuery): void {
        dispatch('queryChange', next);
    }

    function memberItems(row: IdeasetTableRow): string[] {
        return (row.members ?? []).map(member => member.name);
    }

    function openMember(row: IdeasetTableRow, index: number): void {
        const member = row.members?.[index];
        if (!member) {
            return;
        }
        dispatch('openMember', { fileUri: member.fileUri, line: member.lineStart });
    }

    function openSource(row: IdeasetTableRow): void {
        dispatch('openSource', { fileUri: row.fileUri, line: row.lineStart });
    }

    function handleSearch(event: CustomEvent<string>): void {
        emitQuery({ ...query, page: 0, search: event.detail || undefined });
    }

    function handleSort(event: CustomEvent<{ sortKey: string }>): void {
        const sortKey = event.detail.sortKey as IdeasetsTableQuery['sortBy'];
        const sortDir = query.sortBy === sortKey && query.sortDir === 'asc' ? 'desc' : 'asc';
        emitQuery({ ...query, page: 0, sortBy: sortKey, sortDir });
    }
</script>

<TableToolbar search={query.search ?? ''} placeholder="Filter ideasets…" on:search={handleSearch} />

<table>
    <thead>
        <tr>
            <SortableTh label="Name" sortKey="name" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="22%" on:sort={handleSort} />
            <SortableTh label="Path" sortKey="path" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="28%" on:sort={handleSort} />
            <SortableTh label="Kind" sortKey="kind" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="14%" on:sort={handleSort} />
            <SortableTh label="Members" sortKey="members" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="36%" on:sort={handleSort} />
        </tr>
    </thead>
    <tbody>
        {#each rows as row (row.id)}
            <tr>
                <td>{row.name}</td>
                <td>
                    <button type="button" class="path-link" on:click={() => openSource(row)}>
                        {row.path}
                    </button>
                </td>
                <td>{row.kind === 'file' ? 'file (implicit)' : 'explicit'}</td>
                <td>
                    <ChipList
                        items={memberItems(row)}
                        titles={memberItems(row)}
                        clickable
                        emptyLabel="No members"
                        on:select={(event) => openMember(row, event.detail.index)}
                    />
                </td>
            </tr>
        {/each}
    </tbody>
</table>

<Pager page={query.page} {total} pageSize={query.pageSize} label="ideasets" on:prev on:next />
