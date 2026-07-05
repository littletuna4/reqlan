import type { IdeaAttributeMap } from '../core/types.js';
import { parseAttributes } from '../core/types.js';

export type SortDirection = 'asc' | 'desc';

export type IdeasSortColumn = 'title' | 'path' | 'body' | 'outRefs' | 'inRefs' | `attr:${string}`;

export interface ReferenceFilter {
    direction: 'inbound' | 'outbound';
    filterKey: string;
    label: string;
}

export interface IdeasTableQuery {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: IdeasSortColumn;
    sortDir?: SortDirection;
    attributeColumns: string[];
    referenceFilters: ReferenceFilter[];
}

export type IdeasetsSortColumn = 'name' | 'path' | 'kind' | 'members';

export interface IdeasetsTableQuery {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: IdeasetsSortColumn;
    sortDir?: SortDirection;
}

export type ReferencesSortColumn = 'source' | 'target' | 'inRq' | 'type';

export interface ReferencesTableQuery {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: ReferencesSortColumn;
    sortDir?: SortDirection;
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

    return { sql: clauses.join(' AND '), params };
}

export function buildIdeasOrderClause(query: IdeasTableQuery): string {
    const direction = query.sortDir === 'desc' ? 'DESC' : 'ASC';
    switch (query.sortBy) {
        case 'title':
            return `i.name ${direction}, i.file_uri ASC, i.line_start ASC`;
        case 'body':
            return `i.summary ${direction}, i.name ASC`;
        case 'outRefs':
            return `outbound_count ${direction}, i.name ASC`;
        case 'inRefs':
            return `inbound_count ${direction}, i.name ASC`;
        case 'path':
        default:
            if (query.sortBy?.startsWith('attr:')) {
                const key = query.sortBy.slice('attr:'.length);
                const path = attributeJsonPath(key);
                return `json_extract(i.attributes_json, '${path.replace(/'/g, "''")}') ${direction}, i.name ASC`;
            }
            return `i.file_uri ${direction}, i.line_start ASC`;
    }
}

export function buildIdeasetsWhereClause(query: IdeasetsTableQuery): { sql: string; params: unknown[] } {
    if (!query.search?.trim()) {
        return { sql: '1 = 1', params: [] };
    }
    const pattern = `%${query.search.trim()}%`;
    return {
        sql: '(COALESCE(name, file_uri) LIKE ? OR file_uri LIKE ? OR kind LIKE ?)',
        params: [pattern, pattern, pattern]
    };
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
    if (!query.search?.trim()) {
        return { sql: '1 = 1', params: [] };
    }
    const pattern = `%${query.search.trim()}%`;
    return {
        sql: `(
            si.name LIKE ? OR si.file_uri LIKE ?
            OR COALESCE(ti.name, '') LIKE ? OR COALESCE(ti.file_uri, '') LIKE ?
            OR COALESCE(e.target_file, '') LIKE ? OR COALESCE(e.label, '') LIKE ?
            OR e.kind LIKE ?
        )`,
        params: [pattern, pattern, pattern, pattern, pattern, pattern, pattern]
    };
}

export function buildReferencesOrderClause(query: ReferencesTableQuery): string {
    const direction = query.sortDir === 'desc' ? 'DESC' : 'ASC';
    switch (query.sortBy) {
        case 'target':
            return `COALESCE(ti.name, e.target_file, e.label, '') ${direction}, si.file_uri ASC`;
        case 'inRq':
            return `(CASE WHEN e.target_id IS NULL THEN 0 ELSE 1 END) ${direction}, si.file_uri ASC`;
        case 'type':
            return `e.kind ${direction}, si.file_uri ASC`;
        case 'source':
        default:
            return `si.file_uri ${direction}, si.line_start ASC, e.id ASC`;
    }
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
