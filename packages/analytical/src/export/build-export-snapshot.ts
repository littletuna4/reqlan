import type {
    IdeaAttributeMap,
    IdeaSummary
} from '../core/types.js';
import { parseAttributes } from '../core/types.js';
import { buildGraphViewSlice, type GraphEdgeView, type GraphNodeView, type GraphViewSlice } from '../index-store/webview-graph-queries.js';
import type { SqliteIndexStore } from '../index-store/sqlite-store.js';
import type {
    ExportClusterKind,
    ExportClusterRecord,
    ExportFileRecord,
    ExportIdeaRecord,
    ExportManifest,
    ExportPageInfo,
    ExportRequest,
    ExportSearchDocument,
    ExportSnapshot
} from './types.js';

export async function buildExportSnapshot(
    store: SqliteIndexStore,
    request: ExportRequest
): Promise<ExportSnapshot> {
    const title = buildExportTitle(request);
    const runtimeMode = request.runtimeMode ?? 'interactive';
    const clusterStrategy = request.clusterStrategy ?? 'hybrid';
    const pageOptions = {
        includeIdeaPages: request.includeIdeaPages !== false,
        includeFilePages: request.includeFilePages !== false,
        includeClusterPages: request.includeClusterPages !== false,
        includePrintPages: request.includePrintPages !== false,
        includeRequirementsPage: request.includeRequirementsPage,
        includeGraphPage: request.includeGraphPage
    };
    const manifest = buildManifest(request);
    const baseIdeas = request.scope === 'currentFile'
        ? await buildScopedIdeas(store, request)
        : await store.listAllIdeas();
    const byStatus = rollupStatuses(baseIdeas);
    const byTag = rollupTags(baseIdeas);
    const allFiles = [...new Set(baseIdeas.map(idea => idea.fileUri))].sort();
    const ideaRecords = await buildIdeaRecords(store, baseIdeas);
    const ideaById = new Map(ideaRecords.map(idea => [idea.id, idea]));
    const fileRecords = buildFileRecords(ideaRecords, request);
    const clusterRecords = buildClusterRecords(ideaRecords, fileRecords, clusterStrategy);
    finalizeClusterCounts(clusterRecords, ideaById);
    attachClusterMembership(ideaRecords, clusterRecords);
    const graphs = await buildGraphCatalog(store, request, ideaRecords, fileRecords, clusterRecords);
    const searchDocuments = buildSearchDocuments(ideaRecords, fileRecords, clusterRecords);
    const counts = await store.counts();

    return {
        title,
        generatedAt: new Date().toISOString(),
        workspaceRoot: request.workspaceRoot,
        templateId: request.templateId,
        scope: request.scope,
        sourceFileUri: request.sourceFileUri,
        runtimeMode,
        clusterStrategy,
        pageOptions,
        manifest,
        counts: {
            ideas: ideaRecords.length,
            edges: request.scope === 'currentFile' ? graphs.workspace.edges.length : counts.edges,
            files: fileRecords.length,
            clusters: clusterRecords.length
        },
        ideas: ideaRecords,
        ideaOrder: ideaRecords.map(idea => idea.id),
        ideasById: Object.fromEntries(ideaRecords.map(idea => [idea.id, idea])),
        files: fileRecords,
        filesById: Object.fromEntries(fileRecords.map(file => [file.id, file])),
        clusters: clusterRecords,
        clustersById: Object.fromEntries(clusterRecords.map(cluster => [cluster.id, cluster])),
        graphs,
        searchDocuments,
        byStatus,
        byTag,
        allFiles
    };
}

async function buildScopedIdeas(
    store: SqliteIndexStore,
    request: ExportRequest
): Promise<IdeaSummary[]> {
    if (!request.sourceFileUri) {
        return [];
    }
    return store.getIdeasInFile(request.sourceFileUri);
}

async function buildIdeaRecords(
    store: SqliteIndexStore,
    ideas: IdeaSummary[]
): Promise<ExportIdeaRecord[]> {
    const rawIdeas = await store.getAllIdeasRaw();
    const rawById = new Map(rawIdeas.map(idea => [idea.id, idea]));
    const records = await Promise.all(ideas.map(async idea => {
        const references = await buildReferenceGroups(store, idea.id);
        const ancestors = await store.buildAncestorChainResult(idea.id);
        const attributes = loadAttributes(rawById.get(idea.id)?.attributesJson);
        const fileSegments = idea.fileUri.split('/').filter(Boolean);
        return {
            ...idea,
            fileName: fileSegments.at(-1) ?? idea.fileUri,
            fileSegments,
            attributes,
            page: buildPageInfo(
                `${idea.name}`,
                `ideas/${slugify(idea.name)}--${slugify(idea.id)}.html`,
                `print/ideas/${slugify(idea.name)}--${slugify(idea.id)}.html`
            ),
            references,
            ancestors,
            clusterIds: []
        } satisfies ExportIdeaRecord;
    }));
    return records.sort(compareIdeas);
}

async function buildReferenceGroups(
    store: SqliteIndexStore,
    ideaId: string
): Promise<ExportIdeaRecord['references']> {
    const direct = await store.listReferencesForIdea(ideaId);
    const nearby = await store.listReferencesWithinHopDepth(ideaId, 2);
    return {
        inbound: direct.filter(row => row.direction === 'inbound' && row.isResolved),
        outbound: direct.filter(row => row.direction === 'outbound' && row.isResolved),
        unresolved: direct.filter(row => !row.isResolved),
        nearby
    };
}

function loadAttributes(attributesJson: string | undefined): IdeaAttributeMap {
    return attributesJson ? parseAttributes(attributesJson) : {};
}

function buildFileRecords(
    ideas: ExportIdeaRecord[],
    request: ExportRequest
): ExportFileRecord[] {
    const groups = new Map<string, ExportIdeaRecord[]>();
    for (const idea of ideas) {
        const bucket = groups.get(idea.fileUri);
        if (bucket) {
            bucket.push(idea);
        } else {
            groups.set(idea.fileUri, [idea]);
        }
    }

    return [...groups.entries()]
        .map(([fileUri, fileIdeas]) => {
            const segments = fileUri.split('/').filter(Boolean);
            const name = segments.at(-1) ?? fileUri;
            const directory = segments.slice(0, -1).join('/');
            return {
                id: fileRecordId(fileUri),
                fileUri,
                name,
                directory,
                page: buildPageInfo(
                    name,
                    `files/${slugify(fileUri)}.html`,
                    `print/files/${slugify(fileUri)}.html`
                ),
                printPage: buildPageInfo(
                    `${name} print`,
                    `print/files/${slugify(fileUri)}.html`
                ),
                ideas: [...fileIdeas].sort(compareIdeas),
                edgeCount: fileIdeas.reduce((sum, idea) =>
                    sum + idea.references.inbound.length + idea.references.outbound.length + idea.references.unresolved.length, 0),
                statuses: rollupStatuses(fileIdeas),
                tags: rollupTags(fileIdeas)
            } satisfies ExportFileRecord;
        })
        .sort((left, right) => left.fileUri.localeCompare(right.fileUri));
}

function buildClusterRecords(
    ideas: ExportIdeaRecord[],
    files: ExportFileRecord[],
    strategy: ExportRequest['clusterStrategy']
): ExportClusterRecord[] {
    const clusters: ExportClusterRecord[] = [];
    clusters.push(...buildFileClusters(files));
    clusters.push(...buildFolderClusters(ideas));
    clusters.push(...buildValueClusters(ideas, 'tag'));
    clusters.push(...buildValueClusters(ideas, 'status'));
    if ((strategy ?? 'hybrid') === 'hybrid') {
        clusters.push(...buildCommunityClusters(ideas));
    }
    return clusters
        .filter(cluster => cluster.ideaIds.length > 0)
        .sort((left, right) => left.label.localeCompare(right.label))
        .map(cluster => ({
            ...cluster,
            page: buildPageInfo(
                cluster.label,
                `clusters/${slugify(cluster.kind)}--${slugify(cluster.id)}.html`,
                `print/clusters/${slugify(cluster.kind)}--${slugify(cluster.id)}.html`
            )
        }));
}

function attachClusterMembership(
    ideas: ExportIdeaRecord[],
    clusters: ExportClusterRecord[]
): void {
    const byIdeaId = new Map(ideas.map(idea => [idea.id, idea]));
    for (const cluster of clusters) {
        for (const ideaId of cluster.ideaIds) {
            const idea = byIdeaId.get(ideaId);
            if (idea) {
                idea.clusterIds.push(cluster.id);
            }
        }
    }
    for (const idea of ideas) {
        idea.clusterIds.sort((left, right) => left.localeCompare(right));
    }
}

function finalizeClusterCounts(
    clusters: ExportClusterRecord[],
    ideasById: Map<string, ExportIdeaRecord>
): void {
    for (const cluster of clusters) {
        let inbound = 0;
        let outbound = 0;
        for (const ideaId of cluster.ideaIds) {
            const idea = ideasById.get(ideaId);
            if (!idea) {
                continue;
            }
            inbound += idea.references.inbound.length;
            outbound += idea.references.outbound.length;
        }
        cluster.counts.inbound = inbound;
        cluster.counts.outbound = outbound;
    }
}

async function buildGraphCatalog(
    store: SqliteIndexStore,
    request: ExportRequest,
    ideas: ExportIdeaRecord[],
    files: ExportFileRecord[],
    clusters: ExportClusterRecord[]
) {
    const workspace = request.scope === 'currentFile'
        ? await buildGraphSliceForIdeas(store, request, ideas.map(idea => idea.id))
        : await buildGraphViewSlice(store, {
            includeIndirect: true,
            maxNodes: request.maxGraphNodes
        });
    const byIdeaId = Object.fromEntries(await Promise.all(ideas.map(async idea => [
        idea.id,
        await buildGraphViewSlice(store, {
            centerId: idea.id,
            includeIndirect: true,
            maxNodes: request.maxGraphNodes
        })
    ])));
    const byFileId = Object.fromEntries(await Promise.all(files.map(async file => [
        file.id,
        await buildGraphSliceForIdeas(store, request, file.ideas.map(idea => idea.id))
    ])));
    const byClusterId = Object.fromEntries(await Promise.all(clusters.map(async cluster => [
        cluster.id,
        await buildGraphSliceForIdeas(store, request, cluster.ideaIds)
    ])));
    return { workspace, byIdeaId, byFileId, byClusterId };
}

function buildExportTitle(request: ExportRequest): string {
    return request.scope === 'currentFile' && request.sourceFileUri
        ? `${request.exportName} (${request.sourceFileUri})`
        : request.exportName;
}

async function buildGraphSliceForIdeas(
    store: SqliteIndexStore,
    request: ExportRequest,
    ideaIds: string[]
): Promise<GraphViewSlice> {
    const slices = await Promise.all(ideaIds.map(ideaId => buildGraphViewSlice(store, {
        centerId: ideaId,
        includeIndirect: true,
        maxNodes: request.maxGraphNodes
    })));
    return mergeGraphSlices(slices, request.maxGraphNodes);
}

function mergeGraphSlices(
    slices: GraphViewSlice[],
    maxNodes = 120
): GraphViewSlice {
    const nodes = new Map<string, GraphNodeView>();
    const edges = new Map<string, GraphEdgeView>();
    let depth = 0;
    let truncated = false;
    for (const slice of slices) {
        depth = Math.max(depth, slice.depth);
        truncated = truncated || slice.truncated;
        for (const node of slice.nodes) {
            if (nodes.size < maxNodes || nodes.has(node.id)) {
                nodes.set(node.id, node);
            } else {
                truncated = true;
            }
        }
        for (const edge of slice.edges) {
            if (nodes.has(edge.sourceId) && nodes.has(edge.targetId)) {
                edges.set(edge.id, edge);
            }
        }
    }
    return {
        query: {
            includeIndirect: true,
            maxNodes
        },
        depth: depth || 2,
        truncated,
        totalMatching: nodes.size,
        nodes: [...nodes.values()].sort((left, right) => left.fileUri.localeCompare(right.fileUri) || left.lineStart - right.lineStart),
        edges: [...edges.values()].sort((left, right) => left.id.localeCompare(right.id))
    };
}

function buildManifest(request: ExportRequest): ExportManifest {
    const printFileName = ensureHtmlFileName(request.printEntryFileName);
    return {
        home: buildPageInfo('Overview', 'index.html'),
        ideasIndex: buildPageInfo('Ideas', 'ideas.html'),
        filesIndex: buildPageInfo('Files', 'files.html'),
        clustersIndex: buildPageInfo('Clusters', 'clusters.html'),
        graph: buildPageInfo('Graph', 'graph.html'),
        printHome: buildPageInfo('Print', printFileName),
        dataExport: buildPageInfo('Export data', 'data/export.json'),
        dataGraph: buildPageInfo('Graph data', 'data/graph.json'),
        dataSearch: buildPageInfo('Search data', 'data/search.json'),
        dataManifest: buildPageInfo('Manifest data', 'data/site-manifest.json')
    };
}

function buildPageInfo(
    title: string,
    path: string,
    printablePath?: string
): ExportPageInfo {
    return {
        title,
        path,
        url: `./${path}`,
        printablePath,
        printableUrl: printablePath ? `./${printablePath}` : undefined
    };
}

function buildSearchDocuments(
    ideas: ExportIdeaRecord[],
    files: ExportFileRecord[],
    clusters: ExportClusterRecord[]
): ExportSearchDocument[] {
    const documents: ExportSearchDocument[] = [];
    for (const idea of ideas) {
        documents.push({
            id: idea.id,
            title: idea.name,
            kind: 'idea',
            summary: idea.summary,
            url: idea.page.url,
            tags: idea.tags,
            status: idea.status,
            pathTokens: idea.fileSegments,
            keywords: [...collectAttributeKeywords(idea.attributes), ...idea.clusterIds]
        });
    }
    for (const file of files) {
        documents.push({
            id: file.id,
            title: file.name,
            kind: 'file',
            summary: `${file.ideas.length} ideas, ${file.edgeCount} references`,
            url: file.page.url,
            tags: Object.keys(file.tags),
            pathTokens: file.fileUri.split('/').filter(Boolean),
            keywords: file.ideas.map(idea => idea.name)
        });
    }
    for (const cluster of clusters) {
        documents.push({
            id: cluster.id,
            title: cluster.label,
            kind: 'cluster',
            summary: cluster.description,
            url: cluster.page.url,
            tags: [cluster.kind],
            pathTokens: cluster.fileUris.flatMap(path => path.split('/').filter(Boolean)).slice(0, 12),
            keywords: cluster.ideaIds
        });
    }
    return documents.sort((left, right) => left.title.localeCompare(right.title));
}

function collectAttributeKeywords(attributes: IdeaAttributeMap): string[] {
    const keywords: string[] = [];
    for (const [key, value] of Object.entries(attributes)) {
        keywords.push(key);
        if (typeof value === 'string') {
            keywords.push(value);
        } else if (Array.isArray(value)) {
            keywords.push(...value.map(String));
        } else if (value === true) {
            keywords.push(`has:${key}`);
        }
    }
    return keywords;
}

function buildFileClusters(files: ExportFileRecord[]): ExportClusterRecord[] {
    return files.map(file => createClusterRecord(
        `file:${file.fileUri}`,
        'file',
        file.name,
        `Ideas defined in ${file.fileUri}.`,
        file.ideas.map(idea => idea.id),
        [file.fileUri]
    ));
}

function buildFolderClusters(ideas: ExportIdeaRecord[]): ExportClusterRecord[] {
    const groups = new Map<string, ExportIdeaRecord[]>();
    for (const idea of ideas) {
        const folder = idea.fileSegments.slice(0, -1).join('/') || '.';
        const bucket = groups.get(folder);
        if (bucket) {
            bucket.push(idea);
        } else {
            groups.set(folder, [idea]);
        }
    }
    return [...groups.entries()].map(([folder, members]) => createClusterRecord(
        `folder:${folder}`,
        'folder',
        folder,
        `Ideas located under folder ${folder}.`,
        members.map(idea => idea.id),
        uniqueFileUris(members)
    ));
}

function buildValueClusters(
    ideas: ExportIdeaRecord[],
    kind: 'tag' | 'status'
): ExportClusterRecord[] {
    const groups = new Map<string, ExportIdeaRecord[]>();
    for (const idea of ideas) {
        const values = kind === 'tag'
            ? idea.tags
            : [idea.status?.trim() || 'unspecified'];
        for (const value of values) {
            const key = value || 'unspecified';
            const bucket = groups.get(key);
            if (bucket) {
                bucket.push(idea);
            } else {
                groups.set(key, [idea]);
            }
        }
    }
    return [...groups.entries()].map(([value, members]) => createClusterRecord(
        `${kind}:${value}`,
        kind,
        `${kind}: ${value}`,
        `${kind === 'tag' ? 'Tag' : 'Status'} cluster for ${value}.`,
        members.map(idea => idea.id),
        uniqueFileUris(members)
    ));
}

function buildCommunityClusters(ideas: ExportIdeaRecord[]): ExportClusterRecord[] {
    const neighbors = new Map<string, Set<string>>();
    for (const idea of ideas) {
        neighbors.set(idea.id, new Set());
    }
    for (const idea of ideas) {
        for (const ref of [...idea.references.inbound, ...idea.references.outbound]) {
            if (!ref.targetIdeaId || !neighbors.has(ref.targetIdeaId)) {
                continue;
            }
            neighbors.get(idea.id)?.add(ref.targetIdeaId);
            neighbors.get(ref.targetIdeaId)?.add(idea.id);
        }
    }

    const ideaById = new Map(ideas.map(idea => [idea.id, idea]));
    const visited = new Set<string>();
    const clusters: ExportClusterRecord[] = [];
    for (const idea of ideas) {
        if (visited.has(idea.id)) {
            continue;
        }
        const queue = [idea.id];
        const members: string[] = [];
        visited.add(idea.id);
        while (queue.length > 0) {
            const current = queue.shift()!;
            members.push(current);
            for (const next of neighbors.get(current) ?? []) {
                if (!visited.has(next)) {
                    visited.add(next);
                    queue.push(next);
                }
            }
        }
        if (members.length < 2) {
            continue;
        }
        const memberIdeas = members
            .map(id => ideaById.get(id))
            .filter((value): value is ExportIdeaRecord => Boolean(value));
        clusters.push(createClusterRecord(
            `community:${members.map(slugify).join('-').slice(0, 80)}`,
            'community',
            `community ${clusters.length + 1}`,
            'Computed connectivity cluster from the reference graph.',
            members,
            uniqueFileUris(memberIdeas)
        ));
    }
    return clusters;
}

function createClusterRecord(
    id: string,
    kind: ExportClusterKind,
    label: string,
    description: string,
    ideaIds: string[],
    fileUris: string[]
): ExportClusterRecord {
    return {
        id,
        kind,
        label,
        description,
        page: buildPageInfo(label, `clusters/${slugify(kind)}--${slugify(id)}.html`),
        ideaIds: [...new Set(ideaIds)].sort(),
        fileUris: [...new Set(fileUris)].sort(),
        counts: {
            ideas: new Set(ideaIds).size,
            files: new Set(fileUris).size,
            inbound: 0,
            outbound: 0
        }
    };
}

function uniqueFileUris(ideas: ExportIdeaRecord[]): string[] {
    return [...new Set(ideas.map(idea => idea.fileUri))];
}

function compareIdeas(left: IdeaSummary, right: IdeaSummary): number {
    return left.fileUri.localeCompare(right.fileUri) || left.lineStart - right.lineStart || left.name.localeCompare(right.name);
}

function fileRecordId(fileUri: string): string {
    return `file:${fileUri}`;
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

function slugify(value: string): string {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return slug || 'item';
}

function ensureHtmlFileName(value: string): string {
    const trimmed = value.trim();
    return trimmed.toLowerCase().endsWith('.html') ? trimmed : `${trimmed}.html`;
}
