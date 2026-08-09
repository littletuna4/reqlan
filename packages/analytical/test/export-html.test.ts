import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
            includeAttributePages: true,
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
        expect(snapshot.pageOptions.includeAttributePages).toBe(true);

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
        const printHomeHtml = await readFile(join(result.outputDir, snapshot.manifest.printHome.path), 'utf8');
        const codeFileHtml = await readFile(join(result.outputDir, snapshot.codeFiles[0]!.page.path), 'utf8');
        const statusAttribute = snapshot.attributesByKey.status!;
        const statusAttributeHtml = await readFile(join(result.outputDir, statusAttribute.page.path), 'utf8');
        const firstCluster = snapshot.clusters[0]!;
        const clusterPrintHtml = await readFile(join(result.outputDir, firstCluster.page.printablePath!), 'utf8');

        const stylesCss = await readFile(join(result.outputDir, 'assets/styles.css'), 'utf8');
        const appJs = await readFile(join(result.outputDir, 'assets/app.js'), 'utf8');
        const searchIndexJs = await readFile(join(result.outputDir, 'assets/search-index.js'), 'utf8');

        const alphaAnchorId = `idea-${ideaA.id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
        const betaAnchorId = `idea-${ideaB.id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
        expect(indexHtml).toContain('workspace-report');
        expect(indexHtml).toContain('Highlighted Clusters');
        expect(indexHtml).toContain('assets/search-index.js');
        expect(indexHtml).not.toContain('type="module"');
        expect(indexHtml).toContain('Code files');
        expect(indexHtml).toContain('Status Rollup');
        expect(indexHtml).toContain('class="rollup-link"');
        const todoStatusCluster = snapshot.clusters.find(cluster => cluster.kind === 'status' && cluster.id === 'status:todo');
        const exportTagCluster = snapshot.clusters.find(cluster => cluster.kind === 'tag' && cluster.id === 'tag:export');
        expect(todoStatusCluster).toBeTruthy();
        expect(exportTagCluster).toBeTruthy();
        expect(indexHtml).toContain(todoStatusCluster!.page.path);
        expect(indexHtml).toContain(exportTagCluster!.page.path);
        expect(indexHtml).toContain(snapshot.clusters[0]!.page.path);
        expect(ideasIndexHtml).toContain('Filter ideas');
        expect(ideasIndexHtml).toContain('data-filter-key="status"');
        expect(ideasIndexHtml).toContain('data-filter-key="tags"');
        expect(ideasIndexHtml).toContain(todoStatusCluster!.page.path);
        expect(ideasIndexHtml).toContain(exportTagCluster!.page.path);
        expect(appJs).toContain('dataset.filterKey');
        expect(appJs).toContain('URLSearchParams');
        expect(stylesCss).toContain('.rollup-link');
        expect(filesIndexHtml).toContain('List view by source file');
        expect(codeFilesIndexHtml).toContain('Code reference index');
        expect(codeFilesIndexHtml).toContain('app.ts');
        expect(clustersIndexHtml).toContain('Deterministic and computed groupings');
        expect(attributesIndexHtml).toContain('Filter attributes');
        expect(attributesIndexHtml).toContain('status');
        expect(attributesIndexHtml).toContain('tags');
        expect(attributesIndexHtml).toContain('attributes/status.html');
        expect(snapshot.attributes.some(attribute => attribute.key === 'status')).toBe(true);
        expect(statusAttribute.page.path).toBe('attributes/status.html');
        expect(statusAttributeHtml).toContain('Attribute detail');
        expect(statusAttributeHtml).toContain('Value distribution');
        expect(statusAttributeHtml).toContain('distribution-fill');
        expect(statusAttributeHtml).toContain('Ideas with this attribute');
        expect(statusAttributeHtml).toContain('todo');
        expect(statusAttributeHtml).toContain('done');
        expect(statusAttributeHtml).toContain('50%');
        expect(statusAttributeHtml).toContain('alpha');
        expect(statusAttributeHtml).toContain('beta');
        expect(stylesCss).toContain('.distribution-fill');
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
        expect(alphaIdeaHtml).toContain('../attributes/status.html');
        expect(alphaIdeaHtml).toMatch(/"pageUrl": "\.\/ideas\/[^"]+"/);
        expect(alphaIdeaHtml).toContain('"isSubject": true');
        expect(alphaIdeaHtml).toContain('"attributeKeys"');
        expect(alphaIdeaHtml).toContain('code-files/');
        expect(codeFileHtml).toContain('Code reference detail');
        expect(codeFileHtml).toContain('alpha');
        expect(appJs).toContain('wireTables');
        expect(appJs).toContain('column-filter');
        expect(appJs).toContain('table-filter-toggle');
        expect(appJs).toContain('sort-button');
        expect(appJs).toContain('compareSortValues');
        expect(stylesCss).toContain('.column-filter');
        expect(stylesCss).toContain('.table-filter-toggle');
        expect(stylesCss).toContain('.sort-button');
        expect(stylesCss).toContain('.sortable-th');
        expect(stylesCss).toContain('.idea-ref');
        expect(appJs).toContain('resolveGraphNodeUrl');
        expect(appJs).toContain('EXPORT_PHYSICS_SETTINGS');
        expect(appJs).toContain('ReqlanGraphPhysics');
        expect(appJs).toContain('data-graph-toggle-physics');
        expect(appJs).toContain("querySelector('[data-graph-toggle-labels]')");
        expect(appJs).toContain('labelMode');
        expect(appJs).toContain('GRAPH_LABEL_FADE_START');
        expect(appJs).toContain('GRAPH_LABEL_FADE_END');
        expect(appJs).toContain('labelOpacityAtScale');
        expect(appJs).toContain('physicsStep');
        expect(appJs).toContain('wireViewport');
        expect(appJs).toContain('formatNodeAttrs');
        expect(appJs).toContain('createElement(\'canvas\')');
        expect(appJs).toContain('GRAPH_NODE_RADIUS');
        expect(appJs).not.toContain('truncateLabel');
        expect(appJs).not.toContain('createElementNS');
        expect(stylesCss).toContain('.graph-root canvas');
        expect(stylesCss).not.toContain('.graph-root svg');
        expect(graphHtml).toContain('data-graph-toggle-physics');
        expect(graphHtml).toContain('data-graph-toggle-labels');
        expect(graphHtml).toContain('Labels: auto');
        expect(graphHtml).toContain('data-label-mode="auto"');
        expect(graphHtml).toContain('data-graph-status-scd');
        expect(graphHtml).toContain('data-graph-tag-scd');
        expect(graphHtml).toContain('__not_present__');
        expect(graphHtml).toContain('__empty__');
        expect(appJs).toContain('mountSearchableCheckboxDropdown');
        expect(appJs).toContain('__not_present__');
        expect(stylesCss).toContain('.scd-panel[hidden]');
        expect(stylesCss).toContain('.graph-boot-spinner');
        expect(graphHtml).toContain('Initialising graph');
        expect(graphHtml).toContain('is-booting');
        expect(alphaIdeaHtml).toContain('data-graph-toggle-labels');
        expect(alphaIdeaHtml).toContain('Labels: auto');
        expect(alphaPrintHtml).toContain('class="idea-ref');
        expect(alphaPrintHtml).toContain('Printable idea sheet');
        expect(alphaPrintHtml).toContain('class="print-attrs"');
        expect(alphaPrintHtml).toContain('<dt>status</dt>');
        expect(alphaPrintHtml).toContain('<dt>tags</dt>');
        expect(alphaPrintHtml).toContain('onclick="window.print()"');
        expect(printHomeHtml).toContain(`id="${alphaAnchorId}"`);
        expect(printHomeHtml).toContain(`id="${betaAnchorId}"`);
        expect(printHomeHtml).toContain(`href="#${alphaAnchorId}"`);
        expect(printHomeHtml).toContain(`href="#${betaAnchorId}"`);
        expect(printHomeHtml).toMatch(new RegExp(`class="idea-ref idea-ref--idea"[^>]*href="#${betaAnchorId}"`));
        expect(printHomeHtml).not.toMatch(/class="idea-ref idea-ref--idea"[^>]*href="ideas\//);
        expect(printHomeHtml).toContain('class="print-attrs"');
        expect(printHomeHtml).toContain('<dt>status</dt>');
        expect(printHomeHtml).toContain('<dt>tags</dt>');
        expect(printHomeHtml).toContain('onclick="window.print()"');
        expect(printHomeHtml).toContain('class="print-button hide-on-print"');
        expect(clusterPrintHtml).toContain('Printable cluster sheet');
        expect(stylesCss).toContain('.entity-list');
        expect(stylesCss).toContain('grid-template-columns: minmax(0, 1fr)');
        expect(stylesCss).toContain('.print-card');
        expect(stylesCss).toContain('overflow-wrap: anywhere');
        expect(stylesCss).toContain('scroll-padding-top');
        expect(stylesCss).toContain('scroll-margin-top');
        expect(stylesCss).toContain('.print-button');
        expect(stylesCss).toContain('.print-attrs');
        expect(exportJson).toContain('"scope": "workspace"');
        expect(exportJson).toContain('"clustersById"');
        expect(exportJson).toContain('"pageOptions"');
        expect(exportJson).toContain('"attributes"');
        expect(exportJson).toContain('"attributesByKey"');
        expect(exportJson).toContain('"codeFiles"');
        expect(exportJson).toContain('"includeCodeFilePages"');
        expect(exportJson).toContain('"includeAttributePages"');
        expect(stylesCss).toContain('--rust:');
        expect(stylesCss).toContain('--accent:');
        expect(stylesCss).not.toContain('radial-gradient');
        expect(stylesCss).toContain('.scroll-window');
        expect(stylesCss).toContain('body[data-runtime-mode="interactive"] .scroll-window');
        expect(stylesCss).toContain('--scroll-window-max');
        expect(indexHtml).toContain('data-runtime-mode="interactive"');
        expect(indexHtml).toContain('class="scroll-window"');
        expect(alphaIdeaHtml).toContain('class="scroll-window"');
        expect(statusAttributeHtml).toContain('class="scroll-window"');
        expect(appJs).toContain('__REQLAN_SEARCH_INDEX__');
        expect(searchIndexJs).toContain('__REQLAN_SEARCH_INDEX__');
        expect(searchIndexJs).toContain('alpha');
        expect(searchIndexJs).toContain('code-file');
        expect(searchIndexJs).toContain('attributes/status.html');

        await store.close();
    });

    test('overview status and tag rollups link with filters', async () => {
        const store = await openTestStore();
        const fileA = 'reqs/a.rq';
        const ideaA: IdeaRecord = {
            id: ideaId(fileA, 'alpha'),
            name: 'alpha',
            kind: 'block',
            fileUri: fileA,
            lineStart: 0,
            lineEnd: 2,
            summary: 'alpha summary',
            attributesJson: '{"status":"todo","tags":["export"]}',
            contentHash: 'a'
        };
        await store.upsertDocument(fileA, 'hash-a', [ideaA], []);

        const request = {
            format: 'html' as const,
            outputDir: join(tmpdir(), `reqlan-export-out-${randomUUID()}`),
            exportName: 'overview-links',
            workspaceRoot: '/workspace/reqlan',
            templateId: 'default',
            scope: 'workspace' as const,
            includeRequirementsPage: false,
            includeGraphPage: false,
            printEntryFileName: 'print.html',
            runtimeMode: 'interactive' as const,
            includeIdeaPages: true,
            includeFilePages: true,
            includeCodeFilePages: false,
            includeClusterPages: false,
            includeAttributePages: true,
            includePrintPages: false,
            clusterStrategy: 'deterministic' as const
        };
        const snapshot = await buildExportSnapshot(store, request);
        const result = await writeHtmlExport(snapshot, request);
        const indexHtml = await readFile(result.indexFilePath, 'utf8');
        const ideasIndexHtml = await readFile(result.ideasIndexFilePath!, 'utf8');
        const appJs = await readFile(join(result.outputDir, 'assets/app.js'), 'utf8');

        expect(indexHtml).toContain('ideas.html?status=todo');
        expect(indexHtml).toContain('ideas.html?tags=export');
        expect(indexHtml).toContain('clusters.html?kind=');
        expect(ideasIndexHtml).toContain('data-filter-key="status"');
        expect(ideasIndexHtml).toContain('ideas.html?status=todo');
        expect(appJs).toContain('URLSearchParams');
        expect(appJs).toContain('dataset.filterKey');

        await store.close();
    });

    test('document runtime mode keeps scroll windows unconstrained by interactive max-height selectors', async () => {
        const store = await openTestStore();
        const fileA = 'reqs/a.rq';
        const ideaA: IdeaRecord = {
            id: ideaId(fileA, 'alpha'),
            name: 'alpha',
            kind: 'block',
            fileUri: fileA,
            lineStart: 0,
            lineEnd: 2,
            summary: 'alpha summary',
            attributesJson: '{"status":"todo","tags":["export"]}',
            contentHash: 'a'
        };
        await store.upsertDocument(fileA, 'hash-a', [ideaA], []);

        const request = {
            format: 'html' as const,
            outputDir: join(tmpdir(), `reqlan-export-out-${randomUUID()}`),
            exportName: 'document-report',
            workspaceRoot: '/workspace/reqlan',
            templateId: 'default',
            scope: 'workspace' as const,
            includeRequirementsPage: true,
            includeGraphPage: true,
            printEntryFileName: 'print.html',
            runtimeMode: 'document' as const,
            includeIdeaPages: true,
            includeFilePages: true,
            includeCodeFilePages: true,
            includeClusterPages: true,
            includeAttributePages: true,
            includePrintPages: true
        };
        const snapshot = await buildExportSnapshot(store, request);
        const result = await writeHtmlExport(snapshot, request);
        const indexHtml = await readFile(result.indexFilePath, 'utf8');
        const stylesCss = await readFile(join(result.outputDir, 'assets/styles.css'), 'utf8');
        const ideaHtml = await readFile(join(result.outputDir, snapshot.ideasById[ideaA.id]!.page.path), 'utf8');

        expect(indexHtml).toContain('data-runtime-mode="document"');
        expect(ideaHtml).toContain('class="scroll-window"');
        expect(stylesCss).toContain('body[data-runtime-mode="interactive"] .scroll-window');
        expect(stylesCss).not.toMatch(/body\[data-runtime-mode="document"\]\s*\.scroll-window\s*\{[^}]*max-height/);

        await store.close();
    });

    test('links summary refs by idea name and renders string attribute values', async () => {
        const store = await openTestStore();
        const fileA = 'reqs/a.rq';
        const fileB = 'reqs/b.rq';
        const ideaA: IdeaRecord = {
            id: ideaId(fileA, 'alpha'),
            name: 'alpha',
            kind: 'block',
            fileUri: fileA,
            lineStart: 0,
            lineEnd: 4,
            summary: 'See [beta] and also [missing_ref] here.',
            attributesJson: JSON.stringify({
                status: 'pending',
                tags: ['ui', 'export'],
                notes: 'hello world',
                plan: 'do the thing',
                tests: ['["./app.ts"]']
            }),
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
            attributesJson: '{}',
            contentHash: 'b'
        };
        // No edges — export must still link [beta] by name lookup.
        await store.upsertDocument(fileA, 'hash-a', [ideaA], []);
        await store.upsertDocument(fileB, 'hash-b', [ideaB], []);

        const request = {
            format: 'html' as const,
            outputDir: join(tmpdir(), `reqlan-export-out-${randomUUID()}`),
            exportName: 'attr-ref-report',
            workspaceRoot: '/workspace/reqlan',
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
            includeAttributePages: true,
            includePrintPages: true
        };
        const snapshot = await buildExportSnapshot(store, request);
        const result = await writeHtmlExport(snapshot, request);
        const alphaIdeaHtml = await readFile(join(result.outputDir, snapshot.ideasById[ideaA.id]!.page.path), 'utf8');

        expect(alphaIdeaHtml).toMatch(/<a class="idea-ref idea-ref--idea"[^>]*href="[^"]*"[^>]*>beta<\/a>/);
        expect(alphaIdeaHtml).toContain('class="idea-ref idea-ref--unresolved"');
        expect(alphaIdeaHtml).toContain('pending');
        expect(alphaIdeaHtml).toContain('hello world');
        expect(alphaIdeaHtml).toContain('do the thing');
        expect(alphaIdeaHtml).toContain('ui, export');
        expect(alphaIdeaHtml).not.toMatch(/<td>notes<\/td>\s*<td>(true|—|false)<\/td>/);
        expect(snapshot.ideasById[ideaA.id]!.attributes.notes).toBe('hello world');
        expect(snapshot.ideasById[ideaA.id]!.attributes.tags).toEqual(['ui', 'export']);

        await store.close();
    });

    // rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export_graph_page]
    // rq:["../../../reqlan rq/extension/module/ideas_summary/graphical_graph.rq".wildcard_refs_toggle]
    // rq:["../../../reqlan rq/extension/module/ideas_summary/graphical_graph.rq".webview_export_graph_parity]
    test('workspace graph includes every idea even when maxGraphNodes is below idea count', async () => {
        const store = await openTestStore();
        const ideaCount = 150;
        const fileUri = 'reqs/many.rq';
        const ideas: IdeaRecord[] = Array.from({ length: ideaCount }, (_, index) => ({
            id: ideaId(fileUri, `idea_${index}`),
            name: `idea_${index}`,
            kind: 'block',
            fileUri,
            lineStart: index * 3,
            lineEnd: index * 3 + 2,
            summary: `summary ${index}`,
            attributesJson: '{}',
            contentHash: `h${index}`
        }));
        const ideaset: IdeaRecord = {
            id: ideaId(fileUri, 'group_set'),
            name: 'group_set',
            kind: 'ideaset',
            fileUri,
            lineStart: ideaCount * 3,
            lineEnd: ideaCount * 3 + 4,
            summary: 'contains members',
            attributesJson: '{}',
            contentHash: 'ideaset'
        };
        const edges: EdgeRecord[] = [{
            id: 'member-0',
            sourceId: ideaset.id,
            targetId: ideas[0]!.id,
            kind: 'ideaset_member',
            isResolved: true
        }];
        await store.upsertDocument(fileUri, 'hash-many', [...ideas, ideaset], edges);

        const request = {
            format: 'html' as const,
            outputDir: join(tmpdir(), `reqlan-export-out-${randomUUID()}`),
            exportName: 'large-graph-report',
            workspaceRoot: '/workspace/reqlan',
            templateId: 'default',
            scope: 'workspace' as const,
            includeRequirementsPage: true,
            includeGraphPage: true,
            printEntryFileName: 'print.html',
            maxGraphNodes: 120,
            runtimeMode: 'interactive' as const,
            clusterStrategy: 'deterministic' as const,
            includeIdeaPages: false,
            includeFilePages: false,
            includeCodeFilePages: false,
            includeClusterPages: false,
            includeAttributePages: false,
            includePrintPages: false
        };
        const snapshot = await buildExportSnapshot(store, request);
        const result = await writeHtmlExport(snapshot, request);
        const graphHtml = await readFile(result.graphFilePath!, 'utf8');
        const appJs = await readFile(join(result.outputDir, 'assets/app.js'), 'utf8');
        const ideaNodes = snapshot.graphs.workspace.nodes.filter(node => !node.isExternal);
        const ideasetNodes = ideaNodes.filter(node => node.kind === 'ideaset');

        expect(snapshot.counts.ideas).toBe(ideaCount + 1);
        expect(ideaNodes).toHaveLength(ideaCount + 1);
        expect(ideasetNodes).toHaveLength(1);
        expect(ideasetNodes[0]?.name).toBe('group_set');
        expect(snapshot.graphs.workspace.truncated).toBe(false);
        expect(graphHtml).toContain('data-graph-toggle-ideasets');
        expect(graphHtml).toContain('Hide ideasets');
        expect(graphHtml).toContain('data-graph-toggle-wildcard');
        expect(graphHtml).toContain('Wildcard refs');
        expect(appJs).toContain("querySelector('[data-graph-toggle-ideasets]')");
        expect(appJs).toContain('hideIdeasets');
        expect(appJs).toContain('Show ideasets');
        expect(appJs).toContain("querySelector('[data-graph-toggle-wildcard]')");
        expect(appJs).toContain('includeWildcardRefs');
        expect(appJs).toContain("edge.kind === 'wildcard_reference'");
        expect(appJs).toContain('setLineDash');
        expect(new Set(ideaNodes.map(node => node.name))).toEqual(
            new Set([...ideas.map(idea => idea.name), ideaset.name])
        );

        await store.close();
    });

    test('excludeSecretFiles omits ideas hosted in *.secret.rq', async () => {
        const store = await openTestStore();
        const publicFile = 'reqs/public.rq';
        const secretFile = 'reqs/private.secret.rq';
        const publicIdea: IdeaRecord = {
            id: ideaId(publicFile, 'visible'),
            name: 'visible',
            kind: 'block',
            fileUri: publicFile,
            lineStart: 0,
            lineEnd: 1,
            summary: 'public idea',
            attributesJson: '{}',
            contentHash: 'p'
        };
        const secretIdea: IdeaRecord = {
            id: ideaId(secretFile, 'hidden'),
            name: 'hidden',
            kind: 'block',
            fileUri: secretFile,
            lineStart: 0,
            lineEnd: 1,
            summary: 'secret idea',
            attributesJson: '{}',
            contentHash: 's'
        };
        await store.upsertDocument(publicFile, 'hash-p', [publicIdea], []);
        await store.upsertDocument(secretFile, 'hash-s', [secretIdea], []);

        const request = {
            format: 'html' as const,
            outputDir: join(tmpdir(), `reqlan-export-out-${randomUUID()}`),
            exportName: 'public-only',
            workspaceRoot: '/workspace/reqlan',
            templateId: 'default',
            scope: 'workspace' as const,
            includeRequirementsPage: true,
            includeGraphPage: true,
            printEntryFileName: 'print.html',
            excludeSecretFiles: true,
            includeIdeaPages: false,
            includeFilePages: false,
            includeCodeFilePages: false,
            includeClusterPages: false,
            includeAttributePages: false,
            includePrintPages: false
        };
        const snapshot = await buildExportSnapshot(store, request);
        expect(snapshot.counts.ideas).toBe(1);
        expect(snapshot.ideas.map(idea => idea.name)).toEqual(['visible']);
        expect(snapshot.graphs.workspace.nodes.some(node => node.name === 'hidden')).toBe(false);

        await store.close();
    });

    test('excludeIgnoredFiles omits ideas hosted under .rqignore patterns', async () => {
        const workspaceRoot = mkdtempSync(join(tmpdir(), 'reqlan-export-ignore-'));
        mkdirSync(join(workspaceRoot, '.reqlan'), { recursive: true });
        writeFileSync(join(workspaceRoot, '.reqlan', '.rqignore'), 'drop/\n', 'utf8');

        const store = await openTestStore();
        const keptFile = 'reqs/kept.rq';
        const ignoredFile = 'drop/hidden.rq';
        const keptIdea: IdeaRecord = {
            id: ideaId(keptFile, 'kept'),
            name: 'kept',
            kind: 'block',
            fileUri: keptFile,
            lineStart: 0,
            lineEnd: 1,
            summary: 'kept idea',
            attributesJson: '{}',
            contentHash: 'k'
        };
        const ignoredIdea: IdeaRecord = {
            id: ideaId(ignoredFile, 'dropped'),
            name: 'dropped',
            kind: 'block',
            fileUri: ignoredFile,
            lineStart: 0,
            lineEnd: 1,
            summary: 'ignored idea',
            attributesJson: '{}',
            contentHash: 'd'
        };
        await store.upsertDocument(keptFile, 'hash-k', [keptIdea], []);
        await store.upsertDocument(ignoredFile, 'hash-d', [ignoredIdea], []);

        const request = {
            format: 'html' as const,
            outputDir: join(tmpdir(), `reqlan-export-out-${randomUUID()}`),
            exportName: 'ignore-filter',
            workspaceRoot,
            templateId: 'default',
            scope: 'workspace' as const,
            includeRequirementsPage: true,
            includeGraphPage: true,
            printEntryFileName: 'print.html',
            excludeIgnoredFiles: true,
            includeIdeaPages: false,
            includeFilePages: false,
            includeCodeFilePages: false,
            includeClusterPages: false,
            includeAttributePages: false,
            includePrintPages: false
        };
        const snapshot = await buildExportSnapshot(store, request);
        expect(snapshot.counts.ideas).toBe(1);
        expect(snapshot.ideas.map(idea => idea.name)).toEqual(['kept']);
        expect(snapshot.graphs.workspace.nodes.some(node => node.name === 'dropped')).toBe(false);

        await store.close();
        rmSync(workspaceRoot, { recursive: true, force: true });
    });

    test('urlBase and headerLink produce root-relative hrefs and topbar home link', async () => {
        const store = await openTestStore();
        const fileA = 'reqs/a.rq';
        const ideaA: IdeaRecord = {
            id: ideaId(fileA, 'alpha'),
            name: 'alpha',
            kind: 'block',
            fileUri: fileA,
            lineStart: 0,
            lineEnd: 1,
            summary: 'alpha summary',
            attributesJson: '{}',
            contentHash: 'a'
        };
        await store.upsertDocument(fileA, 'hash-a', [ideaA], []);

        const request = {
            format: 'html' as const,
            outputDir: join(tmpdir(), `reqlan-export-out-${randomUUID()}`),
            exportName: 'mounted-report',
            workspaceRoot: '/workspace/reqlan',
            templateId: 'default',
            scope: 'workspace' as const,
            includeRequirementsPage: true,
            includeGraphPage: true,
            printEntryFileName: 'print.html',
            runtimeMode: 'interactive' as const,
            clusterStrategy: 'deterministic' as const,
            includeIdeaPages: true,
            includeFilePages: true,
            includeCodeFilePages: true,
            includeClusterPages: true,
            includeAttributePages: true,
            includePrintPages: true,
            urlBase: '/reqlan/spec',
            headerLink: { href: '/reqlan/', label: 'reqlan' }
        };
        const snapshot = await buildExportSnapshot(store, request);
        const result = await writeHtmlExport(snapshot, request);
        const indexHtml = await readFile(result.indexFilePath, 'utf8');
        const ideaHtml = await readFile(join(result.outputDir, snapshot.ideas[0]!.page.path), 'utf8');

        expect(snapshot.urlBase).toBe('/reqlan/spec');
        expect(snapshot.headerLink).toEqual({ href: '/reqlan/', label: 'reqlan' });
        expect(indexHtml).toContain('class="brand-link" href="/reqlan/"');
        expect(indexHtml).toContain('>reqlan</a>');
        expect(indexHtml).toContain('href="/reqlan/spec/assets/styles.css"');
        expect(indexHtml).toContain('src="/reqlan/spec/assets/app.js"');
        expect(indexHtml).toContain('src="/reqlan/spec/assets/search-index.js"');
        expect(indexHtml).toContain('data-search-index="/reqlan/spec/data/search.json"');
        expect(indexHtml).toContain('href="/reqlan/spec/ideas.html"');
        expect(ideaHtml).toContain('href="/reqlan/spec/assets/styles.css"');
        expect(ideaHtml).toContain('href="/reqlan/spec/ideas.html"');
        expect(ideaHtml).toContain('class="brand-link" href="/reqlan/"');
        expect(await readFile(join(result.outputDir, 'assets/styles.css'), 'utf8')).toContain('.brand-link');

        await store.close();
    });

    test('reports snapshot and write progress while building html', async () => {
        const store = await openTestStore();
        const fileUri = 'reqs/progress.rq';
        const idea: IdeaRecord = {
            id: ideaId(fileUri, 'progress_idea'),
            name: 'progress_idea',
            kind: 'block',
            fileUri,
            lineStart: 0,
            lineEnd: 1,
            summary: 'progress test idea',
            attributesJson: '{"status":"todo"}',
            contentHash: 'p'
        };
        await store.upsertDocument(fileUri, 'hash-p', [idea], []);

        const request = {
            format: 'html' as const,
            outputDir: join(tmpdir(), `reqlan-export-progress-${randomUUID()}`),
            exportName: 'progress-report',
            workspaceRoot: '/workspace/reqlan',
            templateId: 'default',
            scope: 'workspace' as const,
            includeRequirementsPage: true,
            includeGraphPage: true,
            printEntryFileName: 'print.html',
            runtimeMode: 'interactive' as const,
            clusterStrategy: 'deterministic' as const,
            includeIdeaPages: true,
            includeFilePages: true,
            includeCodeFilePages: true,
            includeClusterPages: true,
            includeAttributePages: true,
            includePrintPages: true
        };

        const events: Array<{ phase: string; message: string; completed?: number; total?: number }> = [];
        const onProgress = (progress: {
            phase: string;
            message: string;
            completed?: number;
            total?: number;
        }) => {
            events.push(progress);
        };

        const snapshot = await buildExportSnapshot(store, request, onProgress);
        await writeHtmlExport(snapshot, request, onProgress);

        expect(events.some((event) => event.phase === 'snapshot')).toBe(true);
        const writeEvents = events.filter((event) => event.phase === 'write');
        expect(writeEvents.length).toBeGreaterThan(0);
        const lastWrite = writeEvents.at(-1)!;
        expect(lastWrite.completed).toBe(lastWrite.total);
        expect(lastWrite.total).toBeGreaterThan(0);

        await store.close();
    });
});
