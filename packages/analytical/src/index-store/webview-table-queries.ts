/**
 * UI-SQL helpers for Ideas Summary table queries.
 * per ["../../../../reqlan rq/extension/module/ideas_summary/webview.rq".table_column_filters]
 * per ["../../../../reqlan rq/extension/module/ideas_summary/webview.rq".group_by_type]
 * per ["../../../../reqlan rq/extension/module/ideas_summary/webview.rq".attributes_tab]
 */
import type { IdeaAttributeMap } from '../core/types.js';
import { parseAttributes } from '../core/types.js';

export type SortDirection = 'asc' | 'desc';

export type IdeasSortColumn = 'title' | 'path' | 'body' | 'kind' | 'outRefs' | 'inRefs' | `attr:${string}`;

export interface ReferenceFilter {
    direction: 'inbound' | 'outbound';
    filterKey: string;
    label: string;
}

/** Per-column filter: text substring and/or selected enum values. */
export interface ColumnFilter {
    column: string;
    text?: string;
    selected?: string[];
}

export type IdeasGroupBy = 'kind';
export type ReferencesGroupBy = 'type';

export interface IdeasTableQuery {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: IdeasSortColumn;
    sortDir?: SortDirection;
    attributeColumns: string[];
    referenceFilters: ReferenceFilter[];
    columnFilters?: ColumnFilter[];
    groupBy?: IdeasGroupBy;
}

export type IdeasetsSortColumn = 'name' | 'path' | 'kind' | 'members';

export interface IdeasetsTableQuery {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: IdeasetsSortColumn;
    sortDir?: SortDirection;
    columnFilters?: ColumnFilter[];
}

export type ReferencesSortColumn = 'source' | 'target' | 'inRq' | 'type';

export interface ReferencesTableQuery {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: ReferencesSortColumn;
    sortDir?: SortDirection;
    columnFilters?: ColumnFilter[];
    groupBy?: ReferencesGroupBy;
}

export type AttributesSortColumn = 'key' | 'ideaCount' | 'valueCount';

export interface AttributesTableQuery {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: AttributesSortColumn;
    sortDir?: SortDirection;
    columnFilters?: ColumnFilter[];
}

export interface AttributeTableRow {
    key: string;
    ideaCount: number;
    valueCount: number;
    sampleValues: string[];
}

/** Indexed git-date event for Ideas Summary Timeline (idea evolution). */
export interface GitIdeaTimelineEvent {
    ideaId: string;
    name: string;
    fileUri: string;
    lineStart: number;
    at: string;
    kind: 'created' | 'modified';
    summary?: string;
    status?: string;
    ideaKind?: string;
    tags?: string[];
    gitCreatedAt?: string;
    gitModifiedAt?: string;
}

export interface AttributeAggregate {
    key: string;
    ideaIds: Set<string>;
    values: Map<string, number>;
}

export function attributeJsonPath(key: string): string {
    return `$.${JSON.stringify(key)}`;
}

export function attributeKeyFromChipItem(item: string): string {
    const separator = item.indexOf(': ');
    return separator >= 0 ? item.slice(0, separator) : item;
}

export function formatAttributeValue(value: string | string[] | boolean | undefined): string {
    if (value === undefined) {
        return '—';
    }
    if (value === true) {
        return '✓';
    }
    if (Array.isArray(value)) {
        return value.length > 0 ? value.join(', ') : '—';
    }
    return value || '—';
}

export function attributeValuesForKeys(
    attributesJson: string,
    keys: string[]
): Record<string, string> {
    const attributes = parseAttributes(attributesJson);
    return Object.fromEntries(
        keys.map(key => [key, formatAttributeValue(attributes[key])])
    );
}

export function hasMeaningfulAttribute(attributes: IdeaAttributeMap, key: string): boolean {
    const value = attributes[key];
    if (value === undefined) {
        return false;
    }
    if (value === true) {
        return true;
    }
    if (typeof value === 'string') {
        return value.length > 0;
    }
    if (Array.isArray(value)) {
        return value.length > 0;
    }
    return false;
}

function findColumnFilter(filters: ColumnFilter[] | undefined, column: string): ColumnFilter | undefined {
    return filters?.find(filter => filter.column === column);
}

function pushTextLike(
    clauses: string[],
    params: unknown[],
    expression: string,
    text: string | undefined
): void {
    if (!text?.trim()) {
        return;
    }
    clauses.push(`${expression} LIKE ?`);
    params.push(`%${text.trim()}%`);
}

function pushSelectedIn(
    clauses: string[],
    params: unknown[],
    expression: string,
    selected: string[] | undefined
): void {
    if (!selected || selected.length === 0) {
        return;
    }
    clauses.push(`${expression} IN (${selected.map(() => '?').join(', ')})`);
    params.push(...selected);
}

/** Map References table view types back to edge kinds for SQL filters. */
export function edgeKindsForReferenceViewTypes(types: string[]): string[] {
    const kinds = new Set<string>();
    for (const type of types) {
        switch (type) {
            case 'file':
                kinds.add('file_reference');
                break;
            case 'comment':
                kinds.add('comment_link');
                break;
            case 'sub-idea':
                kinds.add('references');
                kinds.add('wildcard_reference');
                kinds.add('import');
                kinds.add('ideaset_member');
                break;
            default:
                kinds.add(type);
        }
    }
    return [...kinds];
}

export function buildIdeasWhereClause(query: IdeasTableQuery): { sql: string; params: unknown[] } {
    const clauses = ["i.kind != 'ideaset'"];
    const params: unknown[] = [];

    if (query.search?.trim()) {
        const pattern = `%${query.search.trim()}%`;
        clauses.push(`(
            i.name LIKE ? OR i.summary LIKE ? OR i.file_uri LIKE ?
            OR EXISTS (
                SELECT 1
                FROM edges e
                LEFT JOIN ideas ti ON ti.id = e.target_id
                LEFT JOIN ideas si ON si.id = e.source_id
                WHERE (e.source_id = i.id OR e.target_id = i.id)
                AND (
                    COALESCE(ti.name, '') LIKE ?
                    OR COALESCE(si.name, '') LIKE ?
                    OR COALESCE(e.target_file, '') LIKE ?
                    OR COALESCE(e.label, '') LIKE ?
                )
            )
        )`);
        params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
    }

    for (const filter of query.referenceFilters) {
        const referenceClause = buildReferenceFilterClause(filter.filterKey);
        clauses.push(referenceClause.sql);
        params.push(...referenceClause.params);
    }

    for (const key of query.attributeColumns) {
        const path = attributeJsonPath(key);
        clauses.push(`(
            json_type(json_extract(i.attributes_json, ?)) IS NOT NULL
            AND json_type(json_extract(i.attributes_json, ?)) != 'null'
            AND (
                json_type(json_extract(i.attributes_json, ?)) = 'true'
                OR (
                    json_type(json_extract(i.attributes_json, ?)) = 'text'
                    AND json_extract(i.attributes_json, ?) != ''
                )
                OR (
                    json_type(json_extract(i.attributes_json, ?)) = 'array'
                    AND json_array_length(json_extract(i.attributes_json, ?)) > 0
                )
            )
        )`);
        params.push(path, path, path, path, path, path, path);
    }

    const titleFilter = findColumnFilter(query.columnFilters, 'title');
    pushTextLike(clauses, params, 'i.name', titleFilter?.text);
    const pathFilter = findColumnFilter(query.columnFilters, 'path');
    pushTextLike(clauses, params, 'i.file_uri', pathFilter?.text);
    const bodyFilter = findColumnFilter(query.columnFilters, 'body');
    pushTextLike(clauses, params, 'i.summary', bodyFilter?.text);
    const kindFilter = findColumnFilter(query.columnFilters, 'kind');
    pushSelectedIn(clauses, params, 'i.kind', kindFilter?.selected);

    return { sql: clauses.join(' AND '), params };
}

export function buildIdeasOrderClause(query: IdeasTableQuery): string {
    const direction = query.sortDir === 'desc' ? 'DESC' : 'ASC';
    let primary: string;
    switch (query.sortBy) {
        case 'title':
            primary = `i.name ${direction}, i.file_uri ASC, i.line_start ASC`;
            break;
        case 'body':
            primary = `i.summary ${direction}, i.name ASC`;
            break;
        case 'kind':
            primary = `i.kind ${direction}, i.name ASC`;
            break;
        case 'outRefs':
            primary = `outbound_count ${direction}, i.name ASC`;
            break;
        case 'inRefs':
            primary = `inbound_count ${direction}, i.name ASC`;
            break;
        case 'path':
        default:
            if (query.sortBy?.startsWith('attr:')) {
                const key = query.sortBy.slice('attr:'.length);
                const path = attributeJsonPath(key);
                primary = `json_extract(i.attributes_json, '${path.replace(/'/g, "''")}') ${direction}, i.name ASC`;
            } else {
                primary = `i.file_uri ${direction}, i.line_start ASC`;
            }
    }
    if (query.groupBy === 'kind') {
        return `i.kind ASC, ${primary}`;
    }
    return primary;
}

export function buildIdeasetsWhereClause(query: IdeasetsTableQuery): { sql: string; params: unknown[] } {
    const clauses: string[] = ['1 = 1'];
    const params: unknown[] = [];

    if (query.search?.trim()) {
        const pattern = `%${query.search.trim()}%`;
        clauses.push('(COALESCE(name, file_uri) LIKE ? OR file_uri LIKE ? OR kind LIKE ?)');
        params.push(pattern, pattern, pattern);
    }

    const nameFilter = findColumnFilter(query.columnFilters, 'name');
    pushTextLike(clauses, params, 'COALESCE(name, file_uri)', nameFilter?.text);
    const pathFilter = findColumnFilter(query.columnFilters, 'path');
    pushTextLike(clauses, params, 'file_uri', pathFilter?.text);
    const kindFilter = findColumnFilter(query.columnFilters, 'kind');
    pushSelectedIn(clauses, params, 'kind', kindFilter?.selected);

    return { sql: clauses.join(' AND '), params };
}

export function buildIdeasetsOrderClause(query: IdeasetsTableQuery): string {
    const direction = query.sortDir === 'desc' ? 'DESC' : 'ASC';
    switch (query.sortBy) {
        case 'name':
            return `COALESCE(name, file_uri) ${direction}, file_uri ASC`;
        case 'kind':
            return `kind ${direction}, file_uri ASC`;
        case 'members':
            return `member_count ${direction}, file_uri ASC`;
        case 'path':
        default:
            return `file_uri ${direction}, line_start ASC`;
    }
}

export function buildReferencesWhereClause(query: ReferencesTableQuery): { sql: string; params: unknown[] } {
    const clauses: string[] = ['1 = 1'];
    const params: unknown[] = [];

    if (query.search?.trim()) {
        const pattern = `%${query.search.trim()}%`;
        clauses.push(`(
            si.name LIKE ? OR si.file_uri LIKE ?
            OR COALESCE(ti.name, '') LIKE ? OR COALESCE(ti.file_uri, '') LIKE ?
            OR COALESCE(e.target_file, '') LIKE ? OR COALESCE(e.label, '') LIKE ?
            OR e.kind LIKE ?
        )`);
        params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
    }

    const sourceFilter = findColumnFilter(query.columnFilters, 'source');
    if (sourceFilter?.text?.trim()) {
        const pattern = `%${sourceFilter.text.trim()}%`;
        clauses.push('(si.name LIKE ? OR si.file_uri LIKE ?)');
        params.push(pattern, pattern);
    }
    const targetFilter = findColumnFilter(query.columnFilters, 'target');
    if (targetFilter?.text?.trim()) {
        const pattern = `%${targetFilter.text.trim()}%`;
        clauses.push('(COALESCE(ti.name, e.target_file, e.label, \'\') LIKE ? OR COALESCE(ti.file_uri, e.target_file, \'\') LIKE ?)');
        params.push(pattern, pattern);
    }
    const inRqFilter = findColumnFilter(query.columnFilters, 'inRq');
    if (inRqFilter?.selected?.length) {
        const wantsYes = inRqFilter.selected.includes('yes');
        const wantsNo = inRqFilter.selected.includes('no');
        if (wantsYes && !wantsNo) {
            clauses.push('e.target_id IS NOT NULL');
        } else if (wantsNo && !wantsYes) {
            clauses.push('e.target_id IS NULL');
        }
    }
    const typeFilter = findColumnFilter(query.columnFilters, 'type');
    if (typeFilter?.selected?.length) {
        const kinds = edgeKindsForReferenceViewTypes(typeFilter.selected);
        pushSelectedIn(clauses, params, 'e.kind', kinds);
    }

    return { sql: clauses.join(' AND '), params };
}

export function buildReferencesOrderClause(query: ReferencesTableQuery): string {
    const direction = query.sortDir === 'desc' ? 'DESC' : 'ASC';
    let primary: string;
    switch (query.sortBy) {
        case 'target':
            primary = `COALESCE(ti.name, e.target_file, e.label, '') ${direction}, si.file_uri ASC`;
            break;
        case 'inRq':
            primary = `(CASE WHEN e.target_id IS NULL THEN 0 ELSE 1 END) ${direction}, si.file_uri ASC`;
            break;
        case 'type':
            primary = `e.kind ${direction}, si.file_uri ASC`;
            break;
        case 'source':
        default:
            primary = `si.file_uri ${direction}, si.line_start ASC, e.id ASC`;
    }
    if (query.groupBy === 'type') {
        return `e.kind ASC, ${primary}`;
    }
    return primary;
}

export function buildReferenceFilterClause(filterKey: string): { sql: string; params: unknown[] } {
    if (filterKey.startsWith('outbound:idea:')) {
        const targetId = filterKey.slice('outbound:idea:'.length);
        return {
            sql: `EXISTS (
                SELECT 1 FROM edges e
                WHERE e.source_id = i.id AND e.target_id = ?
            )`,
            params: [targetId]
        };
    }
    if (filterKey.startsWith('outbound:file:')) {
        const targetFile = filterKey.slice('outbound:file:'.length);
        return {
            sql: `EXISTS (
                SELECT 1 FROM edges e
                WHERE e.source_id = i.id
                AND e.target_id IS NULL
                AND (e.target_file = ? OR e.label = ?)
            )`,
            params: [targetFile, targetFile]
        };
    }
    if (filterKey.startsWith('inbound:idea:')) {
        const sourceId = filterKey.slice('inbound:idea:'.length);
        return {
            sql: `EXISTS (
                SELECT 1 FROM edges e
                WHERE e.target_id = i.id AND e.source_id = ?
            )`,
            params: [sourceId]
        };
    }
    return { sql: '1 = 1', params: [] };
}

export function aggregateAttributesFromRows(
    rows: Array<{ id: string; attributes_json: string }>
): AttributeAggregate[] {
    const byKey = new Map<string, AttributeAggregate>();
    for (const row of rows) {
        const attributes = parseAttributes(row.attributes_json);
        for (const [key, rawValue] of Object.entries(attributes)) {
            if (!hasMeaningfulAttribute(attributes, key)) {
                continue;
            }
            const bucket = byKey.get(key) ?? {
                key,
                ideaIds: new Set<string>(),
                values: new Map<string, number>()
            };
            bucket.ideaIds.add(row.id);
            const formatted = formatAttributeValue(rawValue) || '(empty)';
            bucket.values.set(formatted, (bucket.values.get(formatted) ?? 0) + 1);
            byKey.set(key, bucket);
        }
    }
    return [...byKey.values()];
}

export function filterAndPageAttributes(
    aggregates: AttributeAggregate[],
    query: AttributesTableQuery
): { total: number; rows: AttributeTableRow[] } {
    const search = query.search?.trim().toLowerCase();
    const keyFilter = findColumnFilter(query.columnFilters, 'key')?.text?.trim().toLowerCase();

    let filtered = aggregates.map(aggregate => {
        const sampleValues = [...aggregate.values.entries()]
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
            .slice(0, 8)
            .map(([value]) => value);
        return {
            key: aggregate.key,
            ideaCount: aggregate.ideaIds.size,
            valueCount: aggregate.values.size,
            sampleValues
        } satisfies AttributeTableRow;
    });

    if (search) {
        filtered = filtered.filter(row =>
            row.key.toLowerCase().includes(search) ||
            row.sampleValues.some(value => value.toLowerCase().includes(search))
        );
    }
    if (keyFilter) {
        filtered = filtered.filter(row => row.key.toLowerCase().includes(keyFilter));
    }

    const direction = query.sortDir === 'desc' ? -1 : 1;
    filtered.sort((left, right) => {
        switch (query.sortBy) {
            case 'ideaCount':
                return (left.ideaCount - right.ideaCount) * direction || left.key.localeCompare(right.key);
            case 'valueCount':
                return (left.valueCount - right.valueCount) * direction || left.key.localeCompare(right.key);
            case 'key':
            default:
                return left.key.localeCompare(right.key) * direction;
        }
    });

    const total = filtered.length;
    const start = query.page * query.pageSize;
    return { total, rows: filtered.slice(start, start + query.pageSize) };
}
