import type {
    AttributesTableQuery,
    IdeasTableQuery,
    IdeasetsTableQuery,
    ReferencesTableQuery
} from '../../../src/webview_module/shared/messages.js';
import {
    ATTRIBUTES_PAGE_SIZE,
    IDEAS_PAGE_SIZE,
    IDEASETS_PAGE_SIZE,
    REFERENCES_PAGE_SIZE
} from '../../../src/webview_module/shared/messages.js';
import type { GraphViewQuery } from '../../../src/webview_module/shared/messages.js';

export function defaultIdeasQuery(): IdeasTableQuery {
    return {
        page: 0,
        pageSize: IDEAS_PAGE_SIZE,
        sortBy: 'path',
        sortDir: 'asc',
        attributeColumns: [],
        referenceFilters: [],
        columnFilters: []
    };
}

export function defaultIdeasetsQuery(): IdeasetsTableQuery {
    return {
        page: 0,
        pageSize: IDEASETS_PAGE_SIZE,
        sortBy: 'path',
        sortDir: 'asc',
        columnFilters: []
    };
}

export function defaultReferencesQuery(): ReferencesTableQuery {
    return {
        page: 0,
        pageSize: REFERENCES_PAGE_SIZE,
        sortBy: 'source',
        sortDir: 'asc',
        columnFilters: []
    };
}

export function defaultAttributesQuery(): AttributesTableQuery {
    return {
        page: 0,
        pageSize: ATTRIBUTES_PAGE_SIZE,
        sortBy: 'ideaCount',
        sortDir: 'desc',
        columnFilters: []
    };
}

export function defaultGraphQuery(): GraphViewQuery {
    return {
        includeIndirect: false,
        maxNodes: 120,
        truncationBasis: 'path'
    };
}
