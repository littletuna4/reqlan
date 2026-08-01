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
            summary: 'alpha links to [beta] and keeps reading.',
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
            snippet: '[beta]',
            isResolved: true
        }, {
            id: 'edge-file',
            sourceId: ideaA.id,
            targetFile: 'src/app.ts',
            kind: 'file_reference',
            label: 'app.ts',
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
            printEntryFileName: 'print.html',
            runtimeMode: 'interactive' as const,
            clusterStrategy: 'hybrid' as const,
            includeIdeaPages: true,
            includeFilePages: true,
            includeCodeFilePages: true,
            includeClusterPages: true,
            includePrintPages: true
        };
        const snapshot = await buildExportSnapshot(store, request);
        expect(snapshot.counts.ideas).toBe(2);
        expect(snapshot.byStatus).toEqual({ done: 1, todo: 1 });
        expect(snapshot.byTag.export).toBe(2);
        expect(snapshot.counts.clusters).toBeGreaterThan(0);
        expect(snapshot.codeFiles).toHaveLength(1);
        expect(snapshot.codeFiles[0]?.fileUri).toBe('reqs/src/app.ts');
        expect(snapshot.pageOptions.includeCodeFilePages).toBe(true);

        const result = await writeHtmlExport(snapshot, request);
        const indexHtml = await readFile(result.indexFilePath, 'utf8');
        const ideasIndexHtml = await readFile(result.ideasIndexFilePath!, 'utf8');
        const filesIndexHtml = await readFile(result.filesIndexFilePath!, 'utf8');
        const codeFilesIndexHtml = await readFile(result.codeFilesIndexFilePath!, 'utf8');
        const clustersIndexHtml = await readFile(result.clustersIndexFilePath!, 'utf8');
        const attributesIndexHtml = await readFile(result.attributesIndexFilePath!, 'utf8');
        const requirementsHtml = await readFile(result.requirementsFilePath!, 'utf8');
        const graphHtml = await readFile(result.graphFilePath!, 'utf8');
        const exportJson = await readFile(result.dataFilePath, 'utf8');
        const alphaIdeaHtml = await readFile(join(result.outputDir, snapshot.ideasById[ideaA.id]!.page.path), 'utf8');
        const alphaPrintHtml = await readFile(join(result.outputDir, snapshot.ideasById[ideaA.id]!.page.printablePath!), 'utf8');
        const codeFileHtml = await readFile(join(result.outputDir, snapshot.codeFiles[0]!.page.path), 'utf8');
        const firstCluster = snapshot.clusters[0]!;
        const clusterPrintHtml = await readFile(join(result.outputDir, firstCluster.page.printablePath!), 'utf8');

        const stylesCss = await readFile(join(result.outputDir, 'assets/styles.css'), 'utf8');
        const appJs = await readFile(join(result.outputDir, 'assets/app.js'), 'utf8');
        const searchIndexJs = await readFile(join(result.outputDir, 'assets/search-index.js'), 'utf8');

        expect(indexHtml).toContain('workspace-report');
        expect(indexHtml).toContain('Highlighted Clusters');
        expect(indexHtml).toContain('assets/search-index.js');
        expect(indexHtml).not.toContain('type="module"');
        expect(indexHtml).toContain('Code files');
        expect(ideasIndexHtml).toContain('Filter ideas');
        expect(filesIndexHtml).toContain('List view by source file');
        expect(codeFilesIndexHtml).toContain('Code reference index');
        expect(codeFilesIndexHtml).toContain('app.ts');
        expect(clustersIndexHtml).toContain('Deterministic and computed groupings');
        expect(attributesIndexHtml).toContain('Filter attributes');
        expect(attributesIndexHtml).toContain('status');
        expect(attributesIndexHtml).toContain('tags');
        expect(snapshot.attributes.some(attribute => attribute.key === 'status')).toBe(true);
        expect(requirementsHtml).toContain('alpha links to [beta]');
        expect(graphHtml).toContain('graph-data');
        expect(graphHtml).toContain('data-graph-fit');
        expect(alphaIdeaHtml).toContain('Outbound references');
        expect(alphaIdeaHtml).toContain('class="idea-ref idea-ref--idea"');
        expect(alphaIdeaHtml).toContain('title="reqs/b.rq · beta"');
        expect(alphaIdeaHtml).toMatch(/class="idea-ref idea-ref--idea"[^>]*href="[^"]*"[^>]*>beta</);
        expect(alphaIdeaHtml).toContain('Printable page');
        expect(alphaIdeaHtml).toContain('../assets/search-index.js');
        expect(alphaIdeaHtml).toContain('Browse all attributes');
        expect(alphaIdeaHtml).toMatch(/"pageUrl": "\.\/ideas\/[^"]+"/);
        expect(alphaIdeaHtml).toContain('"isSubject": true');
        expect(alphaIdeaHtml).toContain('"attributeKeys"');
        expect(alphaIdeaHtml).toContain('code-files/');
        expect(codeFileHtml).toContain('Code reference detail');
        expect(codeFileHtml).toContain('alpha');
        expect(appJs).toContain('wireTables');
        expect(appJs).toContain('column-filter');
        expect(appJs).toContain('sort-button');
        expect(appJs).toContain('compareSortValues');
        expect(stylesCss).toContain('.column-filter');
        expect(stylesCss).toContain('.sort-button');
        expect(stylesCss).toContain('.sortable-th');
        expect(stylesCss).toContain('.idea-ref');
        expect(appJs).toContain('resolveGraphNodeUrl');
        expect(appJs).toContain('EXPORT_PHYSICS_SETTINGS');
        expect(appJs).toContain('data-graph-toggle-physics');
        expect(appJs).toContain('physicsStep');
        expect(appJs).toContain('wireViewport');
        expect(appJs).toContain('formatNodeAttrs');
        expect(appJs).not.toContain('truncateLabel');
        expect(stylesCss).toContain('.graph-root .subject');
        expect(stylesCss).toContain('subject-pulse');
        expect(stylesCss).toContain('.graph-label');
        expect(graphHtml).toContain('data-graph-toggle-physics');
        expect(alphaPrintHtml).toContain('class="idea-ref');
        expect(alphaPrintHtml).toContain('Printable idea sheet');
        expect(clusterPrintHtml).toContain('Printable cluster sheet');
        expect(exportJson).toContain('"scope": "workspace"');
        expect(exportJson).toContain('"clustersById"');
        expect(exportJson).toContain('"pageOptions"');
        expect(exportJson).toContain('"attributes"');
        expect(exportJson).toContain('"codeFiles"');
        expect(exportJson).toContain('"includeCodeFilePages"');
        expect(stylesCss).toContain('--rust:');
        expect(stylesCss).toContain('--accent:');
        expect(stylesCss).not.toContain('radial-gradient');
        expect(appJs).toContain('__REQLAN_SEARCH_INDEX__');
        expect(searchIndexJs).toContain('__REQLAN_SEARCH_INDEX__');
        expect(searchIndexJs).toContain('alpha');
        expect(searchIndexJs).toContain('code-file');

        await store.close();
    });
});
