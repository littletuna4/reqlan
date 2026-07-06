<script lang="ts">
    import type { ReferencesTableQuery } from '../../../src/webview_module/shared/messages.js';
    import { getApp } from '../state/context.js';
    import Pager from './Pager.svelte';
    import SortableTh from './SortableTh.svelte';
    import TableToolbar from './TableToolbar.svelte';

    const app = getApp();

    $: query = app.references.query;
    $: rows = app.references.rows;
    $: total = app.references.total;

    function emitQuery(next: ReferencesTableQuery): void {
        app.onReferencesQueryChange(next);
    }

    function handleSearch(event: CustomEvent<string>): void {
        emitQuery({ ...query, page: 0, search: event.detail || undefined });
    }

    function handleSort(event: CustomEvent<{ sortKey: string }>): void {
        const sortKey = event.detail.sortKey as ReferencesTableQuery['sortBy'];
        const sortDir = query.sortBy === sortKey && query.sortDir === 'asc' ? 'desc' : 'asc';
        emitQuery({ ...query, page: 0, sortBy: sortKey, sortDir });
    }
</script>

<TableToolbar search={query.search ?? ''} placeholder="Filter references…" on:search={handleSearch} />

<table>
    <thead>
        <tr>
            <SortableTh label="Source" sortKey="source" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="24%" on:sort={handleSort} />
            <SortableTh label="Target" sortKey="target" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="24%" on:sort={handleSort} />
            <SortableTh label="In .rq" sortKey="inRq" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="10%" on:sort={handleSort} />
            <SortableTh label="Type" sortKey="type" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="14%" on:sort={handleSort} />
        </tr>
    </thead>
    <tbody>
        {#each rows as row (`${row.sourceFileUri}:${row.sourceLineStart}:${row.targetName}`)}
            <tr
                class="clickable"
                on:click={() => app.openIdea(row.sourceFileUri, row.sourceLineStart)}
            >
                <td>{row.sourcePath} · {row.sourceName}</td>
                <td>{row.targetPath} · {row.targetName}</td>
                <td>{row.isInRq ? 'yes' : 'no'}</td>
                <td>{row.referenceType}</td>
            </tr>
        {/each}
    </tbody>
</table>

<Pager
    page={query.page}
    {total}
    pageSize={query.pageSize}
    label="references"
    on:prev={() => query.page > 0 && app.loadReferences({ ...query, page: query.page - 1 })}
    on:next={() => app.loadReferences({ ...query, page: query.page + 1 })}
/>
