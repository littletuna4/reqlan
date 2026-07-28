import type { IdeaSummary } from '../core/types.js';
import { buildGraphViewSlice } from '../index-store/webview-graph-queries.js';
import type { SqliteIndexStore } from '../index-store/sqlite-store.js';
import type { ExportRequest, ExportSnapshot } from './types.js';

export async function buildExportSnapshot(
    store: SqliteIndexStore,
    request: ExportRequest
): Promise<ExportSnapshot> {
    const title = buildExportTitle(request);
    const counts = await store.counts();
    const ideas = request.scope === 'currentFile'
        ? await buildCurrentFileIdeas(store, request)
        : await store.listAllIdeas();
    const graph = request.scope === 'currentFile'
        ? await buildCurrentFileGraph(store, request)
        : await buildGraphViewSlice(store, {
            includeIndirect: true,
            maxNodes: request.maxGraphNodes
        });
    const files = [...new Set(ideas.map(idea => idea.fileUri))].sort();

    return {
        title,
        generatedAt: new Date().toISOString(),
        workspaceRoot: request.workspaceRoot,
        templateId: request.templateId,
        scope: request.scope,
        sourceFileUri: request.sourceFileUri,
        counts: {
            ideas: ideas.length,
            edges: request.scope === 'currentFile' ? graph.edges.length : counts.edges,
            files: files.length
        },
        ideas,
        graph,
        byStatus: rollupStatuses(ideas),
        byTag: rollupTags(ideas),
        files
    };
}

async function buildCurrentFileIdeas(
    store: SqliteIndexStore,
    request: ExportRequest
): Promise<IdeaSummary[]> {
    if (!request.sourceFileUri) {
        return [];
    }
    return store.getIdeasInFile(request.sourceFileUri);
}

async function buildCurrentFileGraph(
    store: SqliteIndexStore,
    request: ExportRequest
) {
    if (!request.sourceFileUri) {
        return buildGraphViewSlice(store, {
            includeIndirect: true,
            maxNodes: request.maxGraphNodes
        });
    }
    const ideas = await store.getIdeasInFile(request.sourceFileUri);
    const centerId = ideas[0]?.id;
    if (!centerId) {
        return {
            query: {
                centerId: undefined,
                includeIndirect: true,
                maxNodes: request.maxGraphNodes
            },
            depth: 2,
            truncated: false,
            totalMatching: 0,
            nodes: [],
            edges: []
        };
    }
    return buildGraphViewSlice(store, {
        centerId,
        includeIndirect: true,
        maxNodes: request.maxGraphNodes
    });
}

function buildExportTitle(request: ExportRequest): string {
    return request.scope === 'currentFile' && request.sourceFileUri
        ? `${request.exportName} (${request.sourceFileUri})`
        : request.exportName;
}

function rollupStatuses(ideas: IdeaSummary[]): Record<string, number> {
    const counts = new Map<string, number>();
    for (const idea of ideas) {
        const key = idea.status?.trim() || 'unspecified';
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function rollupTags(ideas: IdeaSummary[]): Record<string, number> {
    const counts = new Map<string, number>();
    for (const idea of ideas) {
        for (const tag of idea.tags) {
            counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
    }
    return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}
