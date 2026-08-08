import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
    ExportProgressCallback,
    ExportRequest,
    ExportResult,
    ExportSnapshot
} from './types.js';

/** Write a structured JSON export for tooling and AI consumption. */
export async function writeJsonExport(
    snapshot: ExportSnapshot,
    request: ExportRequest,
    onProgress?: ExportProgressCallback
): Promise<ExportResult> {
    const outputDir = join(request.outputDir, request.exportName);
    await mkdir(outputDir, { recursive: true });
    const indexFilePath = join(outputDir, 'export.json');

    onProgress?.({
        phase: 'write',
        message: 'Writing export.json…',
        completed: 0,
        total: 1,
    });

    const payload = {
        format: 'json' as const,
        title: snapshot.title,
        generatedAt: snapshot.generatedAt,
        workspaceRoot: snapshot.workspaceRoot,
        scope: snapshot.scope,
        sourceFileUri: snapshot.sourceFileUri,
        counts: snapshot.counts,
        byStatus: snapshot.byStatus,
        byTag: snapshot.byTag,
        ideas: snapshot.ideas.map(idea => ({
            id: idea.id,
            name: idea.name,
            kind: idea.kind,
            fileUri: idea.fileUri,
            lineStart: idea.lineStart,
            summary: idea.summary,
            status: idea.status,
            tags: idea.tags,
            attributes: idea.attributes,
            references: {
                inbound: idea.references.inbound.map(compactRef),
                outbound: idea.references.outbound.map(compactRef),
                unresolved: idea.references.unresolved.map(compactRef),
            },
            clusterIds: idea.clusterIds,
        })),
        files: snapshot.files.map(file => ({
            fileUri: file.fileUri,
            ideaIds: file.ideas.map(idea => idea.id),
            ideaCount: file.ideas.length,
            statuses: file.statuses,
            tags: file.tags,
        })),
        clusters: snapshot.clusters.map(cluster => ({
            id: cluster.id,
            kind: cluster.kind,
            label: cluster.label,
            description: cluster.description,
            ideaIds: cluster.ideaIds,
            counts: cluster.counts,
        })),
        attributes: snapshot.attributes.map(attribute => ({
            key: attribute.key,
            ideaCount: attribute.ideaCount,
            values: attribute.values.map(value => ({
                value: value.value,
                count: value.count,
                ideaIds: value.ideaIds,
            })),
        })),
    };

    await writeFile(indexFilePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    onProgress?.({
        phase: 'write',
        message: 'Wrote export.json',
        completed: 1,
        total: 1,
    });

    return {
        outputDir,
        indexFilePath,
        printFilePath: indexFilePath,
        dataFilePath: indexFilePath,
    };
}

function compactRef(row: ExportSnapshot['ideas'][number]['references']['outbound'][number]) {
    return {
        kind: row.kind,
        label: row.label,
        targetName: row.targetName,
        targetPath: row.targetPath,
        targetIdeaId: row.targetIdeaId,
        sourceIdeaId: row.sourceIdeaId,
        isResolved: row.isResolved,
        snippet: row.snippet,
    };
}
