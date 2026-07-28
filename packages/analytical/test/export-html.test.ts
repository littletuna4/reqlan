import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { SqliteIndexStore, buildExportSnapshot, writeHtmlExport, ideaId, type IdeaRecord, type EdgeRecord } from '../src/index.js';

async function openTestStore(): Promise<SqliteIndexStore> {
    return SqliteIndexStore.open(join(tmpdir(), `reqlan-export-${randomUUID()}.sqlite`));
}

describe('html export pipeline', () => {
    test('builds workspace snapshot and writes multi-file html export', async () => {
        const store = await openTestStore();
        const workspaceRoot = '/workspace/reqlan';
        const fileA = 'reqs/a.rq';
        const fileB = 'reqs/b.rq';
        const ideaA: IdeaRecord = {
            id: ideaId(fileA, 'alpha'),
            name: 'alpha',
            kind: 'block',
            fileUri: fileA,
            lineStart: 0,
            lineEnd: 2,
            summary: 'alpha summary',
            attributesJson: '{"status":"todo","tags":["ui","export"]}',
            contentHash: 'a'
        };
        const ideaB: IdeaRecord = {
            id: ideaId(fileB, 'beta'),
            name: 'beta',
            kind: 'block',
            fileUri: fileB,
            lineStart: 0,
            lineEnd: 2,
            summary: 'beta summary',
            attributesJson: '{"status":"done","tags":["export"]}',
            contentHash: 'b'
        };
        const edges: EdgeRecord[] = [{
            id: 'edge-1',
            sourceId: ideaA.id,
            targetId: ideaB.id,
            kind: 'references',
            label: 'beta',
            isResolved: true
        }];
        await store.upsertDocument(fileA, 'hash-a', [ideaA], edges);
        await store.upsertDocument(fileB, 'hash-b', [ideaB], []);

        const request = {
            format: 'html' as const,
            outputDir: join(tmpdir(), `reqlan-export-out-${randomUUID()}`),
            exportName: 'workspace-report',
            workspaceRoot,
            templateId: 'default',
            scope: 'workspace' as const,
            includeRequirementsPage: true,
            includeGraphPage: true,
            printEntryFileName: 'print.html'
        };
        const snapshot = await buildExportSnapshot(store, request);
        expect(snapshot.counts.ideas).toBe(2);
        expect(snapshot.byStatus).toEqual({ done: 1, todo: 1 });
        expect(snapshot.byTag.export).toBe(2);

        const result = await writeHtmlExport(snapshot, request);
        const indexHtml = await readFile(result.indexFilePath, 'utf8');
        const requirementsHtml = await readFile(result.requirementsFilePath!, 'utf8');
        const graphHtml = await readFile(result.graphFilePath!, 'utf8');
        const exportJson = await readFile(result.dataFilePath, 'utf8');

        expect(indexHtml).toContain('workspace-report');
        expect(indexHtml).toContain('./requirements.html');
        expect(requirementsHtml).toContain('alpha summary');
        expect(graphHtml).toContain('graph-data');
        expect(exportJson).toContain('"scope": "workspace"');

        await store.close();
    });
});
