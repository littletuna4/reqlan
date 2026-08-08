import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
    SqliteIndexStore,
    csvEscape,
    exportCsv,
    exportJson,
    ideaId,
    type EdgeRecord,
    type IdeaRecord
} from '../src/index.js';

const tempRoots: string[] = [];

afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

async function openTestStore(): Promise<SqliteIndexStore> {
    return SqliteIndexStore.open(join(tmpdir(), `reqlan-data-export-${randomUUID()}.sqlite`));
}

async function seedGraph(store: SqliteIndexStore): Promise<void> {
    const fileA = 'reqs/a.rq';
    const fileB = 'reqs/b.rq';
    const ideaA: IdeaRecord = {
        id: ideaId(fileA, 'alpha'),
        name: 'alpha',
        kind: 'block',
        fileUri: fileA,
        lineStart: 0,
        lineEnd: 2,
        summary: 'alpha links to [beta], says "hi".',
        attributesJson: '{"status":"todo","tags":["export","csv"],"owner":"tony"}',
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
        attributesJson: '{"status":"done"}',
        contentHash: 'b'
    };
    const edges: EdgeRecord[] = [{
        id: 'edge-1',
        sourceId: ideaA.id,
        targetId: ideaB.id,
        kind: 'references',
        label: 'beta',
        snippet: '[beta]',
        isResolved: true
    }];
    await store.upsertDocument(fileA, 'hash-a', [ideaA], edges);
    await store.upsertDocument(fileB, 'hash-b', [ideaB], []);
}

describe('json and csv export pipelines', () => {
    test('writes structured export.json with ideas and references', async () => {
        const store = await openTestStore();
        await seedGraph(store);
        const outputDir = mkdtempSync(join(tmpdir(), 'reqlan-json-out-'));
        tempRoots.push(outputDir);

        const result = await exportJson(store, {
            format: 'json',
            outputDir,
            exportName: 'dump',
            workspaceRoot: '/workspace',
            templateId: 'default',
            scope: 'workspace',
            includeRequirementsPage: false,
            includeGraphPage: false,
            printEntryFileName: 'print.html'
        });

        expect(result.indexFilePath).toBe(join(outputDir, 'dump', 'export.json'));
        const raw = JSON.parse(await readFile(result.indexFilePath, 'utf8')) as {
            format: string;
            ideas: Array<{ name: string; attributes: Record<string, unknown>; references: { outbound: unknown[] } }>;
            files: unknown[];
        };
        expect(raw.format).toBe('json');
        expect(raw.ideas).toHaveLength(2);
        expect(raw.files).toHaveLength(2);
        const alpha = raw.ideas.find(idea => idea.name === 'alpha');
        expect(alpha?.attributes.owner).toBe('tony');
        expect(alpha?.references.outbound).toHaveLength(1);
    });

    test('writes ideas.csv with flattened attributes and references.csv', async () => {
        const store = await openTestStore();
        await seedGraph(store);
        const outputDir = mkdtempSync(join(tmpdir(), 'reqlan-csv-out-'));
        tempRoots.push(outputDir);

        const result = await exportCsv(store, {
            format: 'csv',
            outputDir,
            exportName: 'tables',
            workspaceRoot: '/workspace',
            templateId: 'default',
            scope: 'workspace',
            includeRequirementsPage: false,
            includeGraphPage: false,
            printEntryFileName: 'print.html'
        });

        expect(result.indexFilePath).toBe(join(outputDir, 'tables', 'ideas.csv'));
        const ideasCsv = await readFile(result.indexFilePath, 'utf8');
        expect(ideasCsv).toContain('id,name,kind,fileUri,lineStart,status,tags,summary,attr:owner');
        expect(ideasCsv).toContain('export;csv');
        expect(ideasCsv).toContain('tony');
        expect(ideasCsv).toContain(csvEscape('alpha links to [beta], says "hi".'));

        const refsCsv = await readFile(join(outputDir, 'tables', 'references.csv'), 'utf8');
        expect(refsCsv).toContain('sourceIdeaId,sourceName,direction,kind');
        expect(refsCsv).toContain('outbound');
        expect(refsCsv).toContain('beta');
    });
});
