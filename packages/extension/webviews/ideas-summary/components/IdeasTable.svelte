<script lang="ts">
    import type { IdeaReferenceChip, IdeaTableRow, IdeasTableQuery } from '../../../src/webview_module/shared/messages.js';
    import { createEventDispatcher } from 'svelte';
    import { attributeKeyFromChipItem } from '../lib/chip-labels.js';
    import ChipList from './ChipList.svelte';
    import IdeaBodyCell from './IdeaBodyCell.svelte';
    import Pager from './Pager.svelte';
    import SortableTh from './SortableTh.svelte';
    import TableToolbar from './TableToolbar.svelte';

    export let rows: IdeaTableRow[] = [];
    export let query: IdeasTableQuery;
    export let total = 0;

    const dispatch = createEventDispatcher<{
        open: { fileUri: string; line: number };
        openReference: { fileUri: string; line: number };
        queryChange: IdeasTableQuery;
        prev: void;
        next: void;
    }>();

    function emitQuery(next: IdeasTableQuery): void {
        dispatch('queryChange', next);
    }

    function openRow(row: IdeaTableRow): void {
        dispatch('open', { fileUri: row.fileUri, line: row.lineStart });
    }

    function handleSearch(event: CustomEvent<string>): void {
        emitQuery({ ...query, page: 0, search: event.detail || undefined });
    }

    function handleSort(event: CustomEvent<{ sortKey: string }>): void {
        const sortKey = event.detail.sortKey as IdeasTableQuery['sortBy'];
        const sortDir = query.sortBy === sortKey && query.sortDir === 'asc' ? 'desc' : 'asc';
        emitQuery({ ...query, page: 0, sortBy: sortKey, sortDir });
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
</script>

<TableToolbar search={query.search ?? ''} placeholder="Filter ideas…" on:search={handleSearch}>
    {#if query.attributeColumns.length > 0 || query.referenceFilters.length > 0}
        <div class="active-filters">
            {#each query.attributeColumns as key (key)}
                <button type="button" class="filter-chip" on:click={() => removeAttributeColumn(key)}>
                    {key} <span aria-hidden="true">×</span>
                </button>
            {/each}
            {#each query.referenceFilters as filter (filter.filterKey)}
                <button type="button" class="filter-chip" on:click={() => removeReferenceFilter(filter.filterKey)}>
                    {filter.label} <span aria-hidden="true">×</span>
                </button>
            {/each}
        </div>
    {/if}
</TableToolbar>

<table>
    <thead>
        <tr>
            <SortableTh label="Title" sortKey="title" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="16%" on:sort={handleSort} />
            <SortableTh label="Path" sortKey="path" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="16%" on:sort={handleSort} />
            <SortableTh label="Body" sortKey="body" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="12%" on:sort={handleSort} />
            <th style="width:16%">Other attributes</th>
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
            <SortableTh label="Out #" sortKey="outRefs" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="5%" on:sort={handleSort} />
            <SortableTh label="Out refs" sortKey="outRefs" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="12%" on:sort={handleSort} />
            <SortableTh label="In #" sortKey="inRefs" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="5%" on:sort={handleSort} />
            <SortableTh label="In refs" sortKey="inRefs" sortBy={query.sortBy} sortDir={query.sortDir ?? 'asc'} width="12%" on:sort={handleSort} />
        </tr>
    </thead>
    <tbody>
        {#each rows as row (row.id)}
            <tr class="clickable">
                <td on:click={() => openRow(row)}>{row.title}</td>
                <td on:click={() => openRow(row)}>{row.path}</td>
                <td class="body-cell" on:click|stopPropagation>
                    <IdeaBodyCell text={row.mainAttribute} />
                </td>
                <td on:click|stopPropagation>
                    <ChipList
                        items={row.otherAttributeItems}
                        filterable
                        clickable
                        activeKeys={query.attributeColumns}
                        on:select={(event) => toggleAttributeColumn(row.otherAttributeItems[event.detail.index])}
                    />
                </td>
                {#each query.attributeColumns as key (key)}
                    <td on:click={() => openRow(row)}>{row.attributeValues[key] ?? '—'}</td>
                {/each}
                <td class="ref-count" on:click={() => openRow(row)}>{row.outboundCount}</td>
                <td on:click|stopPropagation>
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
                <td class="ref-count" on:click={() => openRow(row)}>{row.inboundCount}</td>
                <td on:click|stopPropagation>
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
            </tr>
        {/each}
    </tbody>
</table>

<Pager page={query.page} {total} pageSize={query.pageSize} label="ideas" on:prev on:next />
