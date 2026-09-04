/**
 * Tests for Ideas Summary table query builders and attribute aggregation.
 * per ["../../reqlan rq/extension/module/ideas_summary/webview.rq".table_column_filters]
 * per ["../../reqlan rq/extension/module/ideas_summary/webview.rq".attributes_tab]
 */
import { describe, expect, test } from 'vitest';
import {
    aggregateAttributesFromRows,
    buildIdeasOrderClause,
    buildIdeasWhereClause,
    buildIdeasetsWhereClause,
    buildReferencesWhereClause,
    edgeKindsForReferenceViewTypes,
    filterAndPageAttributes
} from '../src/index-store/webview-table-queries.js';

describe('ideas table column filters', () => {
    test('adds kind select and text column filters to WHERE', () => {
        const { sql, params } = buildIdeasWhereClause({
            page: 0,
            pageSize: 50,
            attributeColumns: [],
            referenceFilters: [],
            columnFilters: [
                { column: 'title', text: 'auth' },
                { column: 'kind', selected: ['block', 'oneliner'] }
            ]
        });
        expect(sql).toContain('i.name LIKE ?');
        expect(sql).toContain('i.kind IN (?, ?)');
        expect(params).toEqual(['%auth%', 'block', 'oneliner']);
    });

    test('global search filters name, summary, path, and edge labels', () => {
        const { sql, params } = buildIdeasWhereClause({
            page: 0,
            pageSize: 50,
            attributeColumns: [],
            referenceFilters: [],
            search: 'auth'
        });
        expect(sql).toContain('i.name LIKE ?');
        expect(sql).toContain('i.summary LIKE ?');
        expect(sql).toContain('i.file_uri LIKE ?');
        expect(params).toEqual([
            '%auth%', '%auth%', '%auth%',
            '%auth%', '%auth%', '%auth%', '%auth%'
        ]);
    });

    test('groupBy kind prefixes ORDER BY', () => {
        const order = buildIdeasOrderClause({
            page: 0,
            pageSize: 50,
            attributeColumns: [],
            referenceFilters: [],
            sortBy: 'path',
            groupBy: 'kind'
        });
        expect(order.startsWith('i.kind ASC')).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list]
    test('orders by git date and change count columns', () => {
        expect(buildIdeasOrderClause({
            page: 0,
            pageSize: 50,
            attributeColumns: [],
            referenceFilters: [],
            sortBy: 'gitCreatedAt',
            sortDir: 'desc'
        })).toContain('i.git_created_at DESC');
        expect(buildIdeasOrderClause({
            page: 0,
            pageSize: 50,
            attributeColumns: [],
            referenceFilters: [],
            sortBy: 'gitModifiedAt',
            sortDir: 'asc'
        })).toContain('i.git_modified_at ASC');
        expect(buildIdeasOrderClause({
            page: 0,
            pageSize: 50,
            attributeColumns: [],
            referenceFilters: [],
            sortBy: 'gitChangeCount',
            sortDir: 'desc'
        })).toContain('i.git_change_count DESC');
    });
});

describe('references table column filters', () => {
    test('maps view types to edge kinds', () => {
        expect(edgeKindsForReferenceViewTypes(['file', 'comment'])).toEqual([
            'file_reference',
            'url_reference',
            'comment_link'
        ]);
        expect(edgeKindsForReferenceViewTypes(['sub-idea'])).toEqual([
            'references',
            'wildcard_reference',
            'import',
            'ideaset_member'
        ]);
    });

    test('filters by type and inRq', () => {
        const { sql, params } = buildReferencesWhereClause({
            page: 0,
            pageSize: 50,
            columnFilters: [
                { column: 'type', selected: ['file'] },
                { column: 'inRq', selected: ['yes'] }
            ]
        });
        expect(sql).toContain('e.target_id IS NOT NULL');
        expect(sql).toContain('e.kind IN (?, ?)');
        expect(params).toEqual(['file_reference', 'url_reference']);
    });

    test('global search filters source, target, and labels', () => {
        const { sql, params } = buildReferencesWhereClause({
            page: 0,
            pageSize: 50,
            search: 'widget'
        });
        expect(sql).toContain('si.name LIKE ?');
        expect(sql).toContain('COALESCE(e.target_file, \'\') LIKE ?');
        expect(params).toEqual(Array(7).fill('%widget%'));
    });
});

describe('ideasets table search', () => {
    test('global search filters name, path, and kind', () => {
        const { sql, params } = buildIdeasetsWhereClause({
            page: 0,
            pageSize: 50,
            search: 'module'
        });
        expect(sql).toContain('COALESCE(name, file_uri) LIKE ?');
        expect(sql).toContain('file_uri LIKE ?');
        expect(sql).toContain('kind LIKE ?');
        expect(params).toEqual(['%module%', '%module%', '%module%']);
    });
});

describe('attributes aggregation', () => {
    test('aggregates keys, values, and pages results', () => {
        const aggregates = aggregateAttributesFromRows([
            { id: 'a', attributes_json: '{"status":"todo","tags":["ui"]}' },
            { id: 'b', attributes_json: '{"status":"done","tags":["ui","export"]}' },
            { id: 'c', attributes_json: '{"flag":true}' }
        ]);
        const keys = aggregates.map(row => row.key).sort();
        expect(keys).toEqual(['flag', 'status', 'tags']);

        const { total, rows } = filterAndPageAttributes(aggregates, {
            page: 0,
            pageSize: 2,
            sortBy: 'ideaCount',
            sortDir: 'desc'
        });
        expect(total).toBe(3);
        expect(rows).toHaveLength(2);
        expect(rows[0]?.key).toBe('status');
        expect(rows[0]?.ideaCount).toBe(2);
        expect(rows[0]?.valueCount).toBe(2);
    });

    test('search filters attribute keys and sample values', () => {
        const aggregates = aggregateAttributesFromRows([
            { id: 'a', attributes_json: '{"status":"todo"}' },
            { id: 'b', attributes_json: '{"owner":"alice"}' }
        ]);
        const { total, rows } = filterAndPageAttributes(aggregates, {
            page: 0,
            pageSize: 10,
            search: 'alic',
            sortBy: 'key',
            sortDir: 'asc'
        });
        expect(total).toBe(1);
        expect(rows[0]?.key).toBe('owner');
    });
});
