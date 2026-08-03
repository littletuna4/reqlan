<script lang="ts">
    /**
     * References table — filters, group-by type, column options.
     * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".group_by_type]
     */
    import type { ColumnFilter, ReferencesTableQuery } from '../../../src/webview_module/shared/messages.js';
    import { buildGroupHeaders, isColumnVisible } from '../lib/table-columns.js';
    import { getApp } from '../state/context.js';
    import ColumnFilterRow from './ColumnFilterRow.svelte';
    import Pager from './Pager.svelte';
    import SortableTh from './SortableTh.svelte';
    import TableOptionsMenu from './TableOptionsMenu.svelte';
    import TableToolbar from './TableToolbar.svelte';

    const app = getApp();

    let filtersOpen = false;
    let collapsedGroups = new Set<string>();

    $: query = app.references.query;
    $: rows = app.references.rows;
    $: total = app.references.total;
    $: visibleColumns = app.tableUi.references.visibleColumns;
    $: groupBy = app.tableUi.references.groupBy ?? query.groupBy;
    $: groupHeaders = groupBy === 'type'
        ? buildGroupHeaders(rows, row => row.referenceType)
        : [];

    const columnOptions = [
        { id: 'source', label: 'Source' },
        { id: 'target', label: 'Target' },
        { id: 'inRq', label: 'In .rq' },
        { id: 'type', label: 'Type' }
    ];

    const filterColumns = [
        { column: 'source', label: 'Source', kind: 'text' as const },
        { column: 'target', label: 'Target', kind: 'text' as const },
        {
            column: 'inRq',
            label: 'In .rq',
            kind: 'select' as const,
            multiple: true,
            options: [
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' }
            ]
        },
        {
            column: 'type',
            label: 'Type',
            kind: 'select' as const,
            multiple: true,
            options: [
                { value: 'file', label: 'File' },
                { value: 'comment', label: 'Comment' },
                { value: 'sub-idea', label: 'Sub-idea' }
            ]
        }
    ];

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

    function handleColumnFilters(event: CustomEvent<ColumnFilter[]>): void {
        emitQuery({ ...query, page: 0, columnFilters: event.detail });
    }

    function toggleGroupBy(): void {
        const next = groupBy === 'type' ? undefined : 'type';
        app.patchTableUi({ references: { visibleColumns, groupBy: next } });
        emitQuery({ ...query, page: 0, groupBy: next });
    }

    function show(id: string): boolean {
        return isColumnVisible(visibleColumns, id);
    }

    function isRowHidden(index: number): boolean {
        if (groupBy !== 'type') {
            return false;
        }
        const header = [...groupHeaders].reverse().find(item => item.startIndex <= index);
        return header ? collapsedGroups.has(header.key) : false;
    }

    function toggleGroup(key: string): void {
        const next = new Set(collapsedGroups);
        if (next.has(key)) {
            next.delete(key);
        } else {
            next.add(key);
        }
        collapsedGroups = next;
    }

    $: colSpan =
        (show('source') ? 1 : 0) +
        (show('target') ? 1 : 0) +
        (show('inRq') ? 1 : 0) +
        (show('type') ? 1 : 0);
</script>

<TableToolbar
    search={query.search ?? ''}
    placeholder="Filter references…"
    {filtersOpen}
    groupByLabel="type"
    groupByActive={groupBy === 'type'}
    on:search={handleSearch}
    on:toggleFilters={() => { filtersOpen = !filtersOpen; }}
    on:toggleGroupBy={toggleGroupBy}
>
    <svelte:fragment slot="actions">
        <TableOptionsMenu
            columns={columnOptions}
            {visibleColumns}
            on:change={(event) => app.patchTableUi({
                references: { visibleColumns: event.detail, groupBy }
            })}
        />
    </svelte:fragment>
</TableToolbar>

<table>
    <thead>
        <tr>
            {#if show('source')}
                <SortableTh label="Source" sortKey="source" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="24%" on:sort={handleSort} />
            {/if}
            {#if show('target')}
                <SortableTh label="Target" sortKey="target" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="24%" on:sort={handleSort} />
            {/if}
            {#if show('inRq')}
                <SortableTh label="In .rq" sortKey="inRq" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="10%" on:sort={handleSort} />
            {/if}
            {#if show('type')}
                <SortableTh label="Type" sortKey="type" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="14%" on:sort={handleSort} />
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
        {#each rows as row, index (`${row.sourceFileUri}:${row.sourceLineStart}:${row.targetName}:${row.referenceType}`)}
            {#if groupBy === 'type' && groupHeaders.some(header => header.startIndex === index)}
                {@const header = groupHeaders.find(item => item.startIndex === index)}
                {#if header}
                    <tr class="group-header-row">
                        <td colspan={Math.max(1, colSpan)}>
                            <button type="button" class="group-header" on:click={() => toggleGroup(header.key)}>
                                {collapsedGroups.has(header.key) ? '▶' : '▼'} {header.label}
                            </button>
                        </td>
                    </tr>
                {/if}
            {/if}
            {#if !isRowHidden(index)}
                <tr
                    class="clickable"
                    on:click={() => app.openIdea(row.sourceFileUri, row.sourceLineStart)}
                >
                    {#if show('source')}<td>{row.sourcePath} · {row.sourceName}</td>{/if}
                    {#if show('target')}<td>{row.targetPath} · {row.targetName}</td>{/if}
                    {#if show('inRq')}<td>{row.isInRq ? 'yes' : 'no'}</td>{/if}
                    {#if show('type')}<td>{row.referenceType}</td>{/if}
                </tr>
            {/if}
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
