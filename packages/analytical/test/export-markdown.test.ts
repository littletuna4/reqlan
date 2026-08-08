import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
    SqliteIndexStore,
    exportMarkdown,
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
    return SqliteIndexStore.open(join(tmpdir(), `reqlan-md-export-${randomUUID()}.sqlite`));
}

describe('markdown export pipeline', () => {
    test('writes README and per-idea markdown pages with cross-links', async () => {
        const store = await openTestStore();
        const fileA = 'reqs/a.rq';
        const fileB = 'reqs/b.rq';
        const ideaA: IdeaRecord = {
            id: ideaId(fileA, 'alpha'),
            name: 'alpha',
            kind: 'block',
            fileUri: fileA,
            lineStart: 0,
            lineEnd: 2,
            summary: 'alpha links to [beta].',
            attributesJson: '{"status":"todo","tags":["export"]}',
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

        const outputDir = mkdtempSync(join(tmpdir(), 'reqlan-md-out-'));
        tempRoots.push(outputDir);

        const result = await exportMarkdown(store, {
            format: 'markdown',
            outputDir,
            exportName: 'docs',
            workspaceRoot: '/workspace',
            templateId: 'default',
            scope: 'workspace',
            includeRequirementsPage: false,
            includeGraphPage: false,
            printEntryFileName: 'print.html',
            includeIdeaPages: true
        });

        expect(result.indexFilePath).toBe(join(outputDir, 'docs', 'README.md'));
        const readme = await readFile(result.indexFilePath, 'utf8');
        expect(readme).toContain('# ');
        expect(readme).toContain('## Ideas');
        expect(readme).toMatch(/\[alpha\]\(ideas\/.+\.md\)/);

        const alphaPath = join(outputDir, 'docs', 'ideas', readme.match(/ideas\/([^\)]+\.md)/)?.[1] ?? '');
        const alphaMd = await readFile(alphaPath, 'utf8');
        expect(alphaMd).toContain('# alpha');
        expect(alphaMd).toContain('## Outbound');
        expect(alphaMd).toMatch(/\[beta\]\(\.\/.+\.md\)/);
    });

    test('inlines ideas into README when idea pages are disabled', async () => {
        const store = await openTestStore();
        const fileA = 'reqs/a.rq';
        const ideaA: IdeaRecord = {
            id: ideaId(fileA, 'solo'),
            name: 'solo',
            kind: 'block',
            fileUri: fileA,
            lineStart: 0,
            lineEnd: 1,
            summary: 'only idea',
            attributesJson: '{}',
            contentHash: 'a'
        };
        await store.upsertDocument(fileA, 'hash-a', [ideaA], []);

        const outputDir = mkdtempSync(join(tmpdir(), 'reqlan-md-inline-'));
        tempRoots.push(outputDir);

        const result = await exportMarkdown(store, {
            format: 'markdown',
            outputDir,
            exportName: 'inline',
            workspaceRoot: '/workspace',
            templateId: 'default',
            scope: 'workspace',
            includeRequirementsPage: false,
            includeGraphPage: false,
            printEntryFileName: 'print.html',
            includeIdeaPages: false
        });

        const readme = await readFile(result.indexFilePath, 'utf8');
        expect(readme).toContain('### solo');
        expect(readme).toContain('only idea');
        await expect(readFile(join(outputDir, 'inline', 'ideas', 'x.md'), 'utf8')).rejects.toThrow();
    });
});
