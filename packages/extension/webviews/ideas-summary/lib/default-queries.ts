import type {
    GraphViewQuery,
    IdeasTableQuery,
    IdeasetsTableQuery,
    ReferencesTableQuery
} from '../../../src/webview_module/shared/messages.js';
import {
    IDEAS_PAGE_SIZE,
    IDEASETS_PAGE_SIZE,
    REFERENCES_PAGE_SIZE
} from '../../../src/webview_module/shared/messages.js';

export function defaultIdeasQuery(): IdeasTableQuery {
    return {
        page: 0,
        pageSize: IDEAS_PAGE_SIZE,
        sortBy: 'path',
        sortDir: 'asc',
        attributeColumns: [],
        referenceFilters: []
    };
}

export function defaultIdeasetsQuery(): IdeasetsTableQuery {
    return {
        page: 0,
        pageSize: IDEASETS_PAGE_SIZE,
        sortBy: 'path',
        sortDir: 'asc'
    };
}

export function defaultReferencesQuery(): ReferencesTableQuery {
    return {
        page: 0,
        pageSize: REFERENCES_PAGE_SIZE,
        sortBy: 'source',
        sortDir: 'asc'
    };
}

export function defaultGraphQuery(): GraphViewQuery {
    return {
        includeIndirect: false
    };
}
