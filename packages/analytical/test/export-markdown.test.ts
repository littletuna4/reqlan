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
// rq:["../../../reqlan rq/core_analysis/export.rq".markdown_export]

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

describe('markdown export rich features', () => {
    test('writes file, cluster, attribute pages with rich links and backlinks', async () => {
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
            attributesJson: '{"status":"todo","tags":["export"],"priority":"high"}',
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
            attributesJson: '{"status":"done","priority":"low"}',
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

        const outputDir = mkdtempSync(join(tmpdir(), 'reqlan-md-rich-'));
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
            includeIdeaPages: true,
            includeFilePages: true,
            includeClusterPages: true,
            includeAttributePages: true
        });

        // README exists with overview sections
        const readme = await readFile(result.indexFilePath, 'utf8');
        expect(readme).toContain('## Status');
        expect(readme).toContain('## Tags');
        expect(readme).toContain('## Ideas');
        expect(readme).toContain('## Files');
        expect(readme).toContain('## Clusters');
        // Ideas link to their pages
        expect(readme).toMatch(/\[alpha\]\(ideas\/alpha--[^\)]+\.md\)/);
        expect(readme).toMatch(/\[beta\]\(ideas\/beta--[^\)]+\.md\)/);

        // Idea page has outbound link and attributes (no backlinks - no inbound refs)
        const alphaMdPath = join(outputDir, 'docs', 'ideas', readme.match(/ideas\/([^\)]+\.md)/)?.[1] ?? '');
        const alphaMd = await readFile(alphaMdPath, 'utf8');
        expect(alphaMd).toContain('# alpha');
        expect(alphaMd).toContain('## Outbound');
        expect(alphaMd).toMatch(/\[beta\]\(\.\/beta--[^\)]+\.md\)/);
        expect(alphaMd).not.toContain('## Backlinks'); // no inbound refs
        expect(alphaMd).toContain('## Attributes');
        expect(alphaMd).toContain('**priority:** high');

        // Idea B page shows backlink to A
        const betaMdPath = join(outputDir, 'docs', 'ideas', readme.match(/ideas\/([^\)]*beta[^\)]+\.md)/)?.[1] ?? '');
        const betaMd = await readFile(betaMdPath, 'utf8');
        expect(betaMd).toContain('## Backlinks');
        expect(betaMd).toMatch(/\[alpha\]\(\.\/alpha--[^\)]+\.md\)/);

        // File page exists and links to ideas
        const fileAPage = join(outputDir, 'docs', 'files', 'reqs-a-rq.md');
        const fileAMd = await readFile(fileAPage, 'utf8');
        expect(fileAMd).toContain('# a.rq');
        expect(fileAMd).toMatch(/\[alpha\]\(\.\.\/ideas\/alpha--[^\)]+\.md\)/);
        expect(fileAMd).toContain('## Clusters');

        // Attribute page exists for priority
        const attrPage = join(outputDir, 'docs', 'attributes', 'priority.md');
        const attrMd = await readFile(attrPage, 'utf8');
        expect(attrMd).toContain('# \`priority\` attribute');
        expect(attrMd).toContain('## Ideas');

        // Result points to correct paths
        expect(result.indexFilePath).toBe(join(outputDir, 'docs', 'README.md'));
    });
});
