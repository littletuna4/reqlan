<script lang="ts">
    /**
     * Ideas table — filters, group-by kind, column options.
     * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_table_filters]
     * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".group_by_type]
     */
    import type {
        ColumnFilter,
        IdeaReferenceChip,
        IdeaTableRow,
        IdeasTableQuery
    } from '../../../src/webview_module/shared/messages.js';
    import { attributeKeyFromChipItem } from '../lib/chip-labels.js';
    import { buildGroupHeaders, isColumnVisible } from '../lib/table-columns.js';
    import { getApp } from '../state/context.js';
    import ChipList from './ChipList.svelte';
    import ColumnFilterRow from './ColumnFilterRow.svelte';
    import type { ColumnFilterSpec } from '../lib/column-filters.js';
    import IdeaBodyCell from './IdeaBodyCell.svelte';
    import Pager from './Pager.svelte';
    import SortableTh from './SortableTh.svelte';
    import TableOptionsMenu from './TableOptionsMenu.svelte';
    import TableToolbar from './TableToolbar.svelte';

    const app = getApp();

    // $derived tracks AppState $state updates from the extension message listener;
    // legacy $: does not (see GraphView.svelte).
    let filtersOpen = $state(false);
    let collapsedGroups = $state(new Set<string>());

    const query = $derived(app.ideas.query);
    const rows = $derived(app.ideas.rows);
    const total = $derived(app.ideas.total);
    const visibleColumns = $derived(app.tableUi.ideas.visibleColumns);
    const groupBy = $derived(app.tableUi.ideas.groupBy ?? query.groupBy);
    const groupHeaders = $derived(groupBy === 'kind'
        ? buildGroupHeaders(rows, row => row.kind, key => key === 'oneliner' ? 'Oneliners' : 'Blocks')
        : []);

    const columnOptions = [
        { id: 'title', label: 'Title' },
        { id: 'path', label: 'Path' },
        { id: 'kind', label: 'Kind' },
        { id: 'body', label: 'Body' },
        { id: 'otherAttributes', label: 'Other attributes' },
        { id: 'outCount', label: 'Out #' },
        { id: 'outRefs', label: 'Out refs' },
        { id: 'inCount', label: 'In #' },
        { id: 'inRefs', label: 'In refs' }
    ];

    const filterSpecs = $derived(buildFilterSpecs(visibleColumns, query.attributeColumns));

    function buildFilterSpecs(visible: string[], attributeColumns: string[]): ColumnFilterSpec[] {
        const specs: ColumnFilterSpec[] = [];
        if (isColumnVisible(visible, 'title')) {
            specs.push({ column: 'title', label: 'Title', kind: 'text' });
        }
        if (isColumnVisible(visible, 'path')) {
            specs.push({ column: 'path', label: 'Path', kind: 'text' });
        }
        if (isColumnVisible(visible, 'kind')) {
            specs.push({
                column: 'kind',
                label: 'Kind',
                kind: 'select',
                multiple: true,
                options: [
                    { value: 'block', label: 'Block' },
                    { value: 'oneliner', label: 'Oneliner' }
                ]
            });
        }
        if (isColumnVisible(visible, 'body')) {
            specs.push({ column: 'body', label: 'Body', kind: 'text' });
        }
        if (isColumnVisible(visible, 'otherAttributes')) {
            specs.push({ column: 'otherAttributes', label: 'Other', kind: 'none' });
        }
        for (const key of attributeColumns) {
            specs.push({ column: `attr:${key}`, label: key, kind: 'none' });
        }
        if (isColumnVisible(visible, 'outCount')) {
            specs.push({ column: 'outCount', label: 'Out #', kind: 'none' });
        }
        if (isColumnVisible(visible, 'outRefs')) {
            specs.push({ column: 'outRefs', label: 'Out refs', kind: 'none' });
        }
        if (isColumnVisible(visible, 'inCount')) {
            specs.push({ column: 'inCount', label: 'In #', kind: 'none' });
        }
        if (isColumnVisible(visible, 'inRefs')) {
            specs.push({ column: 'inRefs', label: 'In refs', kind: 'none' });
        }
        return specs;
    }

    function emitQuery(next: IdeasTableQuery): void {
        app.onIdeasQueryChange(next);
    }

    function openRow(row: IdeaTableRow): void {
        app.openIdea(row.fileUri, row.lineStart);
    }

    function handleSearch(event: CustomEvent<string>): void {
        emitQuery({ ...query, page: 0, search: event.detail || undefined });
    }

    function handleSort(event: CustomEvent<{ sortKey: string }>): void {
        const sortKey = event.detail.sortKey as IdeasTableQuery['sortBy'];
        const sortDir = query.sortBy === sortKey && query.sortDir === 'asc' ? 'desc' : 'asc';
        emitQuery({ ...query, page: 0, sortBy: sortKey, sortDir });
    }

    function handleColumnFilters(event: CustomEvent<ColumnFilter[]>): void {
        // otherAttributes / ref text filters are client-side only; keep server ones.
        const serverFilters = event.detail.filter(filter =>
            ['title', 'path', 'body', 'kind'].includes(filter.column)
        );
        emitQuery({ ...query, page: 0, columnFilters: serverFilters });
    }

    function toggleGroupBy(): void {
        const next = groupBy === 'kind' ? undefined : 'kind';
        app.patchTableUi({ ideas: { visibleColumns, groupBy: next } });
        emitQuery({ ...query, page: 0, groupBy: next });
    }

    function toggleAttributeColumn(item: string): void {
        const key = attributeKeyFromChipItem(item);
        const active = query.attributeColumns.includes(key);
        const attributeColumns = active
            ? query.attributeColumns.filter(column => column !== key)
            : [...query.attributeColumns, key];
        const sortBy = active && query.sortBy === `attr:${key}`
            ? 'path'
            : (active ? query.sortBy : `attr:${key}`);
        emitQuery({
            ...query,
            page: 0,
            attributeColumns,
            sortBy,
            sortDir: active ? query.sortDir : 'asc'
        });
    }

    function removeAttributeColumn(key: string): void {
        emitQuery({
            ...query,
            page: 0,
            attributeColumns: query.attributeColumns.filter(column => column !== key),
            sortBy: query.sortBy === `attr:${key}` ? 'path' : query.sortBy
        });
    }

    function toggleReferenceFilter(chip: IdeaReferenceChip): void {
        const active = query.referenceFilters.some(filter => filter.filterKey === chip.filterKey);
        const referenceFilters = active
            ? query.referenceFilters.filter(filter => filter.filterKey !== chip.filterKey)
            : [...query.referenceFilters, {
                direction: chip.direction,
                filterKey: chip.filterKey,
                label: `${chip.direction === 'outbound' ? '→' : '←'} ${chip.label}`
            }];
        const sortBy = !active
            ? (chip.direction === 'outbound' ? 'outRefs' : 'inRefs')
            : query.sortBy;
        emitQuery({
            ...query,
            page: 0,
            referenceFilters,
            sortBy,
            sortDir: active ? query.sortDir : 'desc'
        });
    }

    function removeReferenceFilter(filterKey: string): void {
        emitQuery({
            ...query,
            page: 0,
            referenceFilters: query.referenceFilters.filter(filter => filter.filterKey !== filterKey)
        });
    }

    function referenceLabels(chips: IdeaReferenceChip[]): string[] {
        return chips.map(chip => chip.label);
    }

    function referenceFilterKeys(chips: IdeaReferenceChip[]): string[] {
        return chips.map(chip => chip.filterKey);
    }

    function show(id: string): boolean {
        return isColumnVisible(visibleColumns, id);
    }

    function isRowHidden(index: number): boolean {
        if (groupBy !== 'kind') {
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

    const colSpan = $derived(
        (show('title') ? 1 : 0) +
        (show('path') ? 1 : 0) +
        (show('kind') ? 1 : 0) +
        (show('body') ? 1 : 0) +
        (show('otherAttributes') ? 1 : 0) +
        query.attributeColumns.length +
        (show('outCount') ? 1 : 0) +
        (show('outRefs') ? 1 : 0) +
        (show('inCount') ? 1 : 0) +
        (show('inRefs') ? 1 : 0)
    );
</script>

<TableToolbar
    search={query.search ?? ''}
    placeholder="Filter ideas…"
    {filtersOpen}
    groupByLabel="kind"
    groupByActive={groupBy === 'kind'}
    on:search={handleSearch}
    on:toggleFilters={() => { filtersOpen = !filtersOpen; }}
    on:toggleGroupBy={toggleGroupBy}
>
    <svelte:fragment slot="actions">
        <TableOptionsMenu
            columns={columnOptions}
            {visibleColumns}
            on:change={(event) => app.patchTableUi({
                ideas: { visibleColumns: event.detail, groupBy }
            })}
        />
    </svelte:fragment>
    {#if query.attributeColumns.length > 0 || query.referenceFilters.length > 0}
        <div class="active-filters">
            {#each query.attributeColumns as key (key)}
                <button type="button" class="filter-chip" onclick={() => removeAttributeColumn(key)}>
                    {key} <span aria-hidden="true">×</span>
                </button>
            {/each}
            {#each query.referenceFilters as filter (filter.filterKey)}
                <button type="button" class="filter-chip" onclick={() => removeReferenceFilter(filter.filterKey)}>
                    {filter.label} <span aria-hidden="true">×</span>
                </button>
            {/each}
        </div>
    {/if}
</TableToolbar>

<table>
    <thead>
        <tr>
            {#if show('title')}
                <SortableTh label="Title" sortKey="title" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="14%" on:sort={handleSort} />
            {/if}
            {#if show('path')}
                <SortableTh label="Path" sortKey="path" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="14%" on:sort={handleSort} />
            {/if}
            {#if show('kind')}
                <SortableTh label="Kind" sortKey="kind" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="8%" on:sort={handleSort} />
            {/if}
            {#if show('body')}
                <SortableTh label="Body" sortKey="body" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="12%" on:sort={handleSort} />
            {/if}
            {#if show('otherAttributes')}
                <th style="width:12%">Other attributes</th>
            {/if}
            {#each query.attributeColumns as key (key)}
                <SortableTh
                    label={key}
                    sortKey={`attr:${key}`}
                    sortBy={query.sortBy}
                    sortDir={query.sortDir ?? 'asc'}
                    width="8%"
                    on:sort={handleSort}
                />
            {/each}
            {#if show('outCount')}
                <SortableTh label="Out #" sortKey="outRefs" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="5%" on:sort={handleSort} />
            {/if}
            {#if show('outRefs')}
                <SortableTh label="Out refs" sortKey="outRefs" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="10%" on:sort={handleSort} />
            {/if}
            {#if show('inCount')}
                <SortableTh label="In #" sortKey="inRefs" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="5%" on:sort={handleSort} />
            {/if}
            {#if show('inRefs')}
                <SortableTh label="In refs" sortKey="inRefs" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="10%" on:sort={handleSort} />
            {/if}
        </tr>
        <ColumnFilterRow
            columns={filterSpecs}
            filters={query.columnFilters ?? []}
            open={filtersOpen}
            on:change={handleColumnFilters}
        />
    </thead>
    <tbody>
        {#each rows as row, index (row.id)}
            {#if groupBy === 'kind' && groupHeaders.some(header => header.startIndex === index)}
                {@const header = groupHeaders.find(item => item.startIndex === index)}
                {#if header}
                    <tr class="group-header-row">
                        <td colspan={Math.max(1, colSpan)}>
                            <button type="button" class="group-header" onclick={() => toggleGroup(header.key)}>
                                {collapsedGroups.has(header.key) ? '▶' : '▼'} {header.label}
                            </button>
                        </td>
                    </tr>
                {/if}
            {/if}
            {#if !isRowHidden(index)}
                <tr class="clickable">
                    {#if show('title')}
                        <td onclick={() => openRow(row)}>
                            <div class="title-cell">
                                <span>{row.title}</span>
                                {#if row.stabilityLabel}
                                    <span
                                        class="stability-cue"
                                        title="Stability cue {Math.round((row.stabilityCue ?? 0) * 100)}% · {row.inboundCount} in · {row.outboundCount} out"
                                    >{row.stabilityLabel} · {Math.round((row.stabilityCue ?? 0) * 100)}%</span>
                                {/if}
                            </div>
                        </td>
                    {/if}
                    {#if show('path')}
                        <td onclick={() => openRow(row)}>{row.path}</td>
                    {/if}
                    {#if show('kind')}
                        <td onclick={() => openRow(row)}>{row.kind}</td>
                    {/if}
                    {#if show('body')}
                        <td class="body-cell" onclick={(event) => event.stopPropagation()}>
                            <IdeaBodyCell text={row.mainAttribute} />
                        </td>
                    {/if}
                    {#if show('otherAttributes')}
                        <td onclick={(event) => event.stopPropagation()}>
                            <ChipList
                                items={row.otherAttributeItems}
                                filterable
                                clickable
                                activeKeys={query.attributeColumns}
                                on:select={(event) => toggleAttributeColumn(row.otherAttributeItems[event.detail.index])}
                            />
                        </td>
                    {/if}
                    {#each query.attributeColumns as key (key)}
                        <td onclick={() => openRow(row)}>{row.attributeValues[key] ?? '—'}</td>
                    {/each}
                    {#if show('outCount')}
                        <td class="ref-count" onclick={() => openRow(row)}>{row.outboundCount}</td>
                    {/if}
                    {#if show('outRefs')}
                        <td onclick={(event) => event.stopPropagation()}>
                            <ChipList
                                items={referenceLabels(row.outboundReferences)}
                                titles={referenceLabels(row.outboundReferences)}
                                filterKeys={referenceFilterKeys(row.outboundReferences)}
                                filterable
                                activeFilterKeys={query.referenceFilters.map(filter => filter.filterKey)}
                                emptyLabel="0"
                                on:select={(event) => toggleReferenceFilter(row.outboundReferences[event.detail.index])}
                            />
                        </td>
                    {/if}
                    {#if show('inCount')}
                        <td class="ref-count" onclick={() => openRow(row)}>{row.inboundCount}</td>
                    {/if}
                    {#if show('inRefs')}
                        <td onclick={(event) => event.stopPropagation()}>
                            <ChipList
                                items={referenceLabels(row.inboundReferences)}
                                titles={referenceLabels(row.inboundReferences)}
                                filterKeys={referenceFilterKeys(row.inboundReferences)}
                                filterable
                                activeFilterKeys={query.referenceFilters.map(filter => filter.filterKey)}
                                emptyLabel="0"
                                on:select={(event) => toggleReferenceFilter(row.inboundReferences[event.detail.index])}
                            />
                        </td>
                    {/if}
                </tr>
            {/if}
        {/each}
    </tbody>
</table>

<Pager
    page={query.page}
    {total}
    pageSize={query.pageSize}
    label="ideas"
    on:prev={() => query.page > 0 && app.loadIdeas({ ...query, page: query.page - 1 })}
    on:next={() => app.loadIdeas({ ...query, page: query.page + 1 })}
/>
