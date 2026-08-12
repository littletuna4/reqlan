/**
 * Workspace-persisted Ideas Summary table column visibility + grouping.
 * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".table_column_options]
 */
export type IdeasGroupBy = 'kind' | undefined;
export type ReferencesGroupBy = 'type' | undefined;

export interface TableColumnVisibility {
    visibleColumns: string[];
}

export interface IdeasTableUiState extends TableColumnVisibility {
    groupBy?: IdeasGroupBy;
}

export interface ReferencesTableUiState extends TableColumnVisibility {
    groupBy?: ReferencesGroupBy;
}

export interface TableUiPersistedState {
    ideas: IdeasTableUiState;
    ideasets: TableColumnVisibility;
    attributes: TableColumnVisibility;
    references: ReferencesTableUiState;
    bases: TableColumnVisibility;
}

export const TABLE_UI_WORKSPACE_STATE_KEY = 'reqlan.ideasSummary.tableUi';

export const DEFAULT_IDEAS_COLUMNS = [
    'title',
    'path',
    'kind',
    'body',
    'gitCreatedAt',
    'gitModifiedAt',
    'gitChangeCount',
    'otherAttributes',
    'outCount',
    'outRefs',
    'inCount',
    'inRefs'
] as const;

export const DEFAULT_IDEASETS_COLUMNS = ['name', 'path', 'kind', 'members'] as const;

export const DEFAULT_ATTRIBUTES_COLUMNS = [
    'key',
    'ideaCount',
    'valueCount',
    'sampleValues'
] as const;

export const DEFAULT_REFERENCES_COLUMNS = [
    'source',
    'target',
    'inRq',
    'type'
] as const;

export const DEFAULT_BASES_COLUMNS = [
    'label',
    'root',
    'ready',
    'ideaCount',
    'edgeCount',
    'fileIssueCount',
    'state'
] as const;

export const DEFAULT_TABLE_UI_STATE: TableUiPersistedState = {
    ideas: { visibleColumns: [...DEFAULT_IDEAS_COLUMNS], groupBy: undefined },
    ideasets: { visibleColumns: [...DEFAULT_IDEASETS_COLUMNS] },
    attributes: { visibleColumns: [...DEFAULT_ATTRIBUTES_COLUMNS] },
    references: { visibleColumns: [...DEFAULT_REFERENCES_COLUMNS], groupBy: undefined },
    bases: { visibleColumns: [...DEFAULT_BASES_COLUMNS] }
};

function normalizeColumns(raw: unknown, fallback: readonly string[]): string[] {
    if (!Array.isArray(raw)) {
        return [...fallback];
    }
    const columns = raw.filter((value): value is string => typeof value === 'string' && value.length > 0);
    return columns.length > 0 ? [...new Set(columns)] : [...fallback];
}

export function normalizeTableUiState(raw: unknown): TableUiPersistedState {
    const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const ideasRaw = source.ideas && typeof source.ideas === 'object'
        ? (source.ideas as Record<string, unknown>)
        : {};
    const ideasetsRaw = source.ideasets && typeof source.ideasets === 'object'
        ? (source.ideasets as Record<string, unknown>)
        : {};
    const attributesRaw = source.attributes && typeof source.attributes === 'object'
        ? (source.attributes as Record<string, unknown>)
        : {};
    const referencesRaw = source.references && typeof source.references === 'object'
        ? (source.references as Record<string, unknown>)
        : {};
    const basesRaw = source.bases && typeof source.bases === 'object'
        ? (source.bases as Record<string, unknown>)
        : {};

    return {
        ideas: {
            visibleColumns: normalizeColumns(ideasRaw.visibleColumns, DEFAULT_IDEAS_COLUMNS),
            groupBy: ideasRaw.groupBy === 'kind' ? 'kind' : undefined
        },
        ideasets: {
            visibleColumns: normalizeColumns(ideasetsRaw.visibleColumns, DEFAULT_IDEASETS_COLUMNS)
        },
        attributes: {
            visibleColumns: normalizeColumns(attributesRaw.visibleColumns, DEFAULT_ATTRIBUTES_COLUMNS)
        },
        references: {
            visibleColumns: normalizeColumns(referencesRaw.visibleColumns, DEFAULT_REFERENCES_COLUMNS),
            groupBy: referencesRaw.groupBy === 'type' ? 'type' : undefined
        },
        bases: {
            visibleColumns: normalizeColumns(basesRaw.visibleColumns, DEFAULT_BASES_COLUMNS)
        }
    };
}
