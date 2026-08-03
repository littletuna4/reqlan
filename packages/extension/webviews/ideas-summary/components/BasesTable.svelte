<script lang="ts">
    /**
     * Bases table — discovered workspace bases; row selects active base.
     * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".bases_tab]
     */
    import type { BaseStatusView, ColumnFilter } from '../../../src/webview_module/shared/messages.js';
    import { isColumnVisible } from '../lib/table-columns.js';
    import { getApp } from '../state/context.js';
    import ColumnFilterRow from './ColumnFilterRow.svelte';
    import TableOptionsMenu from './TableOptionsMenu.svelte';
    import TableToolbar from './TableToolbar.svelte';

    const app = getApp();

    let search = '';
    let filtersOpen = false;
    let columnFilters: ColumnFilter[] = [];

    $: visibleColumns = app.tableUi.bases.visibleColumns;
    $: bases = app.index.status?.bases ?? [];
    $: activeBaseId = app.index.status?.activeBaseId ?? '';

    const columnOptions = [
        { id: 'label', label: 'Label' },
        { id: 'root', label: 'Path' },
        { id: 'ready', label: 'Ready' },
        { id: 'ideaCount', label: 'Ideas' },
        { id: 'edgeCount', label: 'Edges' },
        { id: 'fileIssueCount', label: 'Issues' },
        { id: 'state', label: 'State' }
    ];

    const filterColumns = [
        { column: 'label', label: 'Label', kind: 'text' as const },
        { column: 'root', label: 'Path', kind: 'text' as const },
        { column: 'ready', label: 'Ready', kind: 'select' as const, options: [
            { value: 'yes', label: 'Ready' },
            { value: 'no', label: 'Not ready' }
        ], multiple: true },
        { column: 'ideaCount', label: 'Ideas', kind: 'none' as const },
        { column: 'edgeCount', label: 'Edges', kind: 'none' as const },
        { column: 'fileIssueCount', label: 'Issues', kind: 'none' as const },
        { column: 'state', label: 'State', kind: 'text' as const }
    ];

    function matches(base: BaseStatusView): boolean {
        const haystack = `${base.label} ${base.root} ${base.state}`.toLowerCase();
        if (search.trim() && !haystack.includes(search.trim().toLowerCase())) {
            return false;
        }
        for (const filter of columnFilters) {
            if (filter.column === 'label' && filter.text?.trim()) {
                if (!base.label.toLowerCase().includes(filter.text.trim().toLowerCase())) {
                    return false;
                }
            }
            if (filter.column === 'root' && filter.text?.trim()) {
                if (!base.root.toLowerCase().includes(filter.text.trim().toLowerCase())) {
                    return false;
                }
            }
            if (filter.column === 'state' && filter.text?.trim()) {
                if (!base.state.toLowerCase().includes(filter.text.trim().toLowerCase())) {
                    return false;
                }
            }
            if (filter.column === 'ready' && filter.selected?.length) {
                const readyKey = base.ready ? 'yes' : 'no';
                if (!filter.selected.includes(readyKey)) {
                    return false;
                }
            }
        }
        return true;
    }

    $: rows = bases.filter(matches);

    function selectBase(base: BaseStatusView): void {
        app.selectBase(base.id);
    }

    function show(id: string): boolean {
        return isColumnVisible(visibleColumns, id);
    }
</script>

<TableToolbar
    {search}
    placeholder="Filter bases…"
    {filtersOpen}
    on:search={(event) => { search = event.detail; }}
    on:toggleFilters={() => { filtersOpen = !filtersOpen; }}
>
    <svelte:fragment slot="actions">
        <TableOptionsMenu
            columns={columnOptions}
            {visibleColumns}
            on:change={(event) => app.patchTableUi({ bases: { visibleColumns: event.detail } })}
        />
    </svelte:fragment>
</TableToolbar>

<table>
    <thead>
        <tr>
            {#if show('label')}<th style="width:18%">Label</th>{/if}
            {#if show('root')}<th style="width:28%">Path</th>{/if}
            {#if show('ready')}<th style="width:10%">Ready</th>{/if}
            {#if show('ideaCount')}<th style="width:10%">Ideas</th>{/if}
            {#if show('edgeCount')}<th style="width:10%">Edges</th>{/if}
            {#if show('fileIssueCount')}<th style="width:10%">Issues</th>{/if}
            {#if show('state')}<th style="width:14%">State</th>{/if}
        </tr>
        <ColumnFilterRow
            columns={filterColumns.filter(col => show(col.column))}
            filters={columnFilters}
            open={filtersOpen}
            on:change={(event) => { columnFilters = event.detail; }}
        />
    </thead>
    <tbody>
        {#each rows as row (row.id)}
            <tr
                class="clickable"
                class:member-chip-active={row.id === activeBaseId}
                on:click={() => selectBase(row)}
            >
                {#if show('label')}<td>{row.label}{row.id === activeBaseId ? ' · active' : ''}</td>{/if}
                {#if show('root')}<td>{row.root}</td>{/if}
                {#if show('ready')}<td>{row.ready ? 'yes' : 'no'}</td>{/if}
                {#if show('ideaCount')}<td>{row.ideaCount}</td>{/if}
                {#if show('edgeCount')}<td>{row.edgeCount}</td>{/if}
                {#if show('fileIssueCount')}<td>{row.fileIssueCount}</td>{/if}
                {#if show('state')}<td>{row.state}</td>{/if}
            </tr>
        {:else}
            <tr>
                <td colspan="7" class="subtle">No bases discovered. Create a base from the header switcher.</td>
            </tr>
        {/each}
    </tbody>
</table>
