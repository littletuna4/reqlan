import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
    ExportProgressCallback,
    ExportRequest,
    ExportResult,
    ExportSnapshot
} from './types.js';
import { APP_JS, SHARED_STYLES, buildSearchIndexScript } from './html-export-assets.js';
import {
    renderAttributeDetailPage,
    renderClusterDetailPage,
    renderClustersIndexPage,
    renderCodeFileDetailPage,
    renderCodeFilesIndexPage,
    renderFileDetailPage,
    renderFilesIndexPage,
    renderGraphPage,
    renderHomePage,
    renderIdeaDetailPage,
    renderIdeasIndexPage,
    renderAttributesIndexPage,
    renderPrintClusterPage,
    renderPrintCodeFilePage,
    renderPrintFilePage,
    renderPrintHomePage,
    renderPrintIdeaPage
} from './html-export-template.js';
import { stringifyJson } from './html-export-utils.js';

export async function writeHtmlExport(
    snapshot: ExportSnapshot,
    request: ExportRequest,
    onProgress?: ExportProgressCallback
): Promise<ExportResult> {
    const outputDir = join(request.outputDir, request.exportName);
    const assetsDir = join(outputDir, 'assets');
    const dataDir = join(outputDir, 'data');
    await mkdir(assetsDir, { recursive: true });
    await mkdir(dataDir, { recursive: true });

    const printFileName = ensureHtmlFileName(request.printEntryFileName);
    const indexFilePath = join(outputDir, snapshot.manifest.home.path);
    const ideasIndexFilePath = join(outputDir, snapshot.manifest.ideasIndex.path);
    const filesIndexFilePath = join(outputDir, snapshot.manifest.filesIndex.path);
    const codeFilesIndexFilePath = join(outputDir, snapshot.manifest.codeFilesIndex.path);
    const clustersIndexFilePath = join(outputDir, snapshot.manifest.clustersIndex.path);
    const attributesIndexFilePath = join(outputDir, snapshot.manifest.attributesIndex.path);
    const printFilePath = join(outputDir, printFileName);
    const requirementsFilePath = request.includeRequirementsPage
        ? join(outputDir, 'requirements.html')
        : undefined;
    const graphFilePath = request.includeGraphPage
        ? join(outputDir, 'graph.html')
        : undefined;
    const dataFilePath = join(dataDir, 'export.json');
    const manifestFilePath = join(outputDir, snapshot.manifest.dataManifest.path);

    await Promise.all([
        mkdir(join(outputDir, 'ideas'), { recursive: true }),
        mkdir(join(outputDir, 'files'), { recursive: true }),
        mkdir(join(outputDir, 'code-files'), { recursive: true }),
        mkdir(join(outputDir, 'clusters'), { recursive: true }),
        mkdir(join(outputDir, 'attributes'), { recursive: true }),
        mkdir(join(outputDir, 'print/ideas'), { recursive: true }),
        mkdir(join(outputDir, 'print/files'), { recursive: true }),
        mkdir(join(outputDir, 'print/code-files'), { recursive: true }),
        mkdir(join(outputDir, 'print/clusters'), { recursive: true })
    ]);

    const writes: Array<() => Promise<void>> = [
        () => writeFile(join(assetsDir, 'styles.css'), SHARED_STYLES, 'utf8'),
        () => writeFile(join(assetsDir, 'app.js'), APP_JS, 'utf8'),
        () => writeFile(join(assetsDir, 'search-index.js'), buildSearchIndexScript(snapshot.searchDocuments), 'utf8'),
        () => writeFile(dataFilePath, stringifyJson(snapshot), 'utf8'),
        () => writeFile(join(dataDir, 'graph.json'), stringifyJson(snapshot.graphs.workspace), 'utf8'),
        () => writeFile(join(dataDir, 'search.json'), stringifyJson(snapshot.searchDocuments), 'utf8'),
        () => writeFile(manifestFilePath, stringifyJson({
            ...snapshot.manifest,
            pageOptions: snapshot.pageOptions,
            runtimeMode: snapshot.runtimeMode,
            clusterStrategy: snapshot.clusterStrategy
        }), 'utf8')
    ];

    const isPrintMode = snapshot.runtimeMode === 'print';
    writes.push(() => writeFile(
        indexFilePath,
        isPrintMode ? renderPrintHomePage(snapshot) : renderHomePage(snapshot),
        'utf8'
    ));
    if (snapshot.pageOptions.includePrintPages) {
        writes.push(() => writeFile(printFilePath, renderPrintHomePage(snapshot), 'utf8'));
    }

    if (!isPrintMode && requirementsFilePath) {
        writes.push(() => writeFile(requirementsFilePath, renderIdeasIndexPage(snapshot), 'utf8'));
    }
    if (!isPrintMode && graphFilePath && snapshot.pageOptions.includeGraphPage) {
        writes.push(() => writeFile(graphFilePath, renderGraphPage(snapshot), 'utf8'));
    }
    if (!isPrintMode) {
        writes.push(() => writeFile(ideasIndexFilePath, renderIdeasIndexPage(snapshot), 'utf8'));
        if (snapshot.pageOptions.includeFilePages) {
            writes.push(() => writeFile(filesIndexFilePath, renderFilesIndexPage(snapshot), 'utf8'));
        }
        if (snapshot.pageOptions.includeCodeFilePages) {
            writes.push(() => writeFile(codeFilesIndexFilePath, renderCodeFilesIndexPage(snapshot), 'utf8'));
        }
        if (snapshot.pageOptions.includeClusterPages) {
            writes.push(() => writeFile(clustersIndexFilePath, renderClustersIndexPage(snapshot), 'utf8'));
        }
        writes.push(() => writeFile(attributesIndexFilePath, renderAttributesIndexPage(snapshot), 'utf8'));
    }

    if (!isPrintMode && snapshot.pageOptions.includeIdeaPages) {
        for (const idea of snapshot.ideas) {
            writes.push(() => writeFile(join(outputDir, idea.page.path), renderIdeaDetailPage(snapshot, idea), 'utf8'));
        }
    }
    if (snapshot.pageOptions.includePrintPages) {
        for (const idea of snapshot.ideas) {
            const printablePath = idea.page.printablePath;
            if (printablePath) {
                writes.push(() => writeFile(join(outputDir, printablePath), renderPrintIdeaPage(snapshot, idea), 'utf8'));
            }
        }
    }
    if (!isPrintMode && snapshot.pageOptions.includeFilePages) {
        for (const file of snapshot.files) {
            writes.push(() => writeFile(join(outputDir, file.page.path), renderFileDetailPage(snapshot, file), 'utf8'));
        }
    }
    if (snapshot.pageOptions.includePrintPages) {
        for (const file of snapshot.files) {
            writes.push(() => writeFile(join(outputDir, file.printPage.path), renderPrintFilePage(snapshot, file), 'utf8'));
        }
    }
    if (!isPrintMode && snapshot.pageOptions.includeCodeFilePages) {
        for (const file of snapshot.codeFiles) {
            writes.push(() => writeFile(join(outputDir, file.page.path), renderCodeFileDetailPage(snapshot, file), 'utf8'));
        }
    }
    if (snapshot.pageOptions.includePrintPages && snapshot.pageOptions.includeCodeFilePages) {
        for (const file of snapshot.codeFiles) {
            writes.push(() => writeFile(join(outputDir, file.printPage.path), renderPrintCodeFilePage(snapshot, file), 'utf8'));
        }
    }
    if (!isPrintMode && snapshot.pageOptions.includeClusterPages) {
        for (const cluster of snapshot.clusters) {
            writes.push(() => writeFile(join(outputDir, cluster.page.path), renderClusterDetailPage(snapshot, cluster), 'utf8'));
        }
    }
    if (snapshot.pageOptions.includePrintPages && snapshot.pageOptions.includeClusterPages) {
        for (const cluster of snapshot.clusters) {
            const printablePath = cluster.page.printablePath;
            if (printablePath) {
                writes.push(() => writeFile(join(outputDir, printablePath), renderPrintClusterPage(snapshot, cluster), 'utf8'));
            }
        }
    }
    if (!isPrintMode && snapshot.pageOptions.includeAttributePages) {
        for (const attribute of snapshot.attributes) {
            writes.push(() => writeFile(join(outputDir, attribute.page.path), renderAttributeDetailPage(snapshot, attribute), 'utf8'));
        }
    }

    const total = writes.length;
    const report = createWriteProgressReporter(onProgress, total);
    report(0);
    let completed = 0;
    await Promise.all(writes.map(async (write) => {
        await write();
        completed += 1;
        report(completed);
    }));

    return {
        outputDir,
        indexFilePath,
        printFilePath,
        requirementsFilePath,
        graphFilePath,
        dataFilePath,
        ideasIndexFilePath,
        filesIndexFilePath,
        codeFilesIndexFilePath: snapshot.pageOptions.includeCodeFilePages ? codeFilesIndexFilePath : undefined,
        clustersIndexFilePath,
        attributesIndexFilePath,
        manifestFilePath
    };
}

function createWriteProgressReporter(
    onProgress: ExportProgressCallback | undefined,
    total: number
): (completed: number) => void {
    if (!onProgress) {
        return () => undefined;
    }
    let lastReported = -1;
    const step = Math.max(1, Math.floor(total / 40));
    return (completed: number) => {
        const isBoundary = completed === 0 || completed === total || completed - lastReported >= step;
        if (!isBoundary) {
            return;
        }
        lastReported = completed;
        onProgress({
            phase: 'write',
            message: completed === 0
                ? `Writing ${total} files…`
                : `Writing files (${completed}/${total})…`,
            completed,
            total,
        });
    };
}

function ensureHtmlFileName(value: string): string {
    const trimmed = value.trim();
    if (trimmed.toLowerCase().endsWith('.html')) {
        return trimmed;
    }
    return `${trimmed}.html`;
}
