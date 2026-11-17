import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type {
    ExportAttributeRecord,
    ExportClusterRecord,
    ExportFileRecord,
    ExportIdeaRecord,
    ExportProgressCallback,
    ExportRequest,
    ExportResult,
    ExportSnapshot
} from './types.js';
import { formatAttributeValue } from './export-utils.js';

/** Build markdown paths from HTML-oriented snapshot page paths. */
export function toMarkdownPath(htmlPath: string): string {
    return htmlPath.replace(/\.html$/i, '.md');
}

/** Get the relative markdown path from one idea's location to another. */
function relativeMarkdownPath(fromIdea: ExportIdeaRecord, toIdea: ExportIdeaRecord): string {
    const fromPath = toMarkdownPath(fromIdea.page.path);
    const toPath = toMarkdownPath(toIdea.page.path);
    const fromDir = fromPath.slice(0, fromPath.lastIndexOf('/'));
    const toDir = toPath.slice(0, toPath.lastIndexOf('/'));
    const fileName = toPath.slice(toPath.lastIndexOf('/') + 1);
    if (fromDir === toDir) {
        return `./${fileName}`;
    }
    return relative(fromPath, toPath).replace(/\\/g, '/');
}

/** Write a multi-file markdown export from an export snapshot. */
export async function writeMarkdownExport(
    snapshot: ExportSnapshot,
    request: ExportRequest,
    onProgress?: ExportProgressCallback
): Promise<ExportResult> {
    const outputDir = join(request.outputDir, request.exportName);
    await mkdir(outputDir, { recursive: true });

    const ideasDir = join(outputDir, 'ideas');
    const filesDir = join(outputDir, 'files');
    const clustersDir = join(outputDir, 'clusters');
    const attributesDir = join(outputDir, 'attributes');

    let ideasPageDirCreated = false;
    if (snapshot.pageOptions.includeIdeaPages) {
        await mkdir(ideasDir, { recursive: true });
        ideasPageDirCreated = true;
    }

    if (snapshot.pageOptions.includeFilePages) {
        await mkdir(filesDir, { recursive: true });
    }

    if (snapshot.pageOptions.includeClusterPages) {
        await mkdir(clustersDir, { recursive: true });
    }

    if (snapshot.pageOptions.includeAttributePages) {
        await mkdir(attributesDir, { recursive: true });
    }

    const writes: Array<() => Promise<void>> = [
        () => writeFile(join(outputDir, 'README.md'), renderReadme(snapshot), 'utf8'),
    ];

    if (ideasPageDirCreated) {
        for (const idea of snapshot.ideas) {
            const path = join(outputDir, ideaMarkdownRelPath(idea));
            writes.push(() => writeFile(path, renderIdeaMarkdown(snapshot, idea), 'utf8'));
        }
    }

    if (snapshot.pageOptions.includeFilePages) {
        for (const file of snapshot.files) {
            const path = join(filesDir, fileMarkdownRelPath(file));
            writes.push(() => writeFile(path, renderFileMarkdown(snapshot, file), 'utf8'));
        }
    }

    if (snapshot.pageOptions.includeClusterPages) {
        for (const cluster of snapshot.clusters) {
            const path = join(clustersDir, clusterMarkdownRelPath(cluster));
            writes.push(() => writeFile(path, renderClusterMarkdown(snapshot, cluster), 'utf8'));
        }
    }

    if (snapshot.pageOptions.includeAttributePages) {
        for (const attribute of snapshot.attributes) {
            const path = join(attributesDir, attributeMarkdownRelPath(attribute));
            writes.push(() => writeFile(path, renderAttributeMarkdown(snapshot, attribute), 'utf8'));
        }
    }

    const total = writes.length;
    let completed = 0;
    onProgress?.({
        phase: 'write',
        message: `Writing markdown (${total} files)…`,
        completed: 0,
        total,
    });
    for (const write of writes) {
        await write();
        completed += 1;
        onProgress?.({
            phase: 'write',
            message: `Writing markdown (${completed}/${total})…`,
            completed,
            total,
        });
    }

    return {
        outputDir,
        indexFilePath: join(outputDir, 'README.md'),
        printFilePath: join(outputDir, 'README.md'),
        dataFilePath: join(outputDir, 'README.md'),
        ideasIndexFilePath: join(outputDir, 'README.md'),
        filesIndexFilePath: join(outputDir, 'README.md'),
        clustersIndexFilePath: join(outputDir, 'README.md'),
        attributesIndexFilePath: join(outputDir, 'README.md'),
    };
}

function ideaMarkdownRelPath(idea: ExportIdeaRecord): string {
    return toMarkdownPath(idea.page.path);
}

function fileMarkdownRelPath(file: ExportFileRecord): string {
    return toMarkdownPath(file.page.path).replace(/^files\//, '');
}

function clusterMarkdownRelPath(cluster: ExportClusterRecord): string {
    return toMarkdownPath(cluster.page.path).replace(/^clusters\//, '');
}

function attributeMarkdownRelPath(attr: ExportAttributeRecord): string {
    return toMarkdownPath(attr.page.path).replace(/^attributes\//, '');
}

/** Compute a link path from one idea's markdown location to another, respecting urlBase. */
function linkPath(fromIdea: ExportIdeaRecord, toIdea: ExportIdeaRecord, urlBase: string | undefined): string {
    const rel = relativeMarkdownPath(fromIdea, toIdea);
    if (urlBase) {
        return `/${urlBase.replace(/^\/+/, '')}/${rel}`;
    }
    return rel.startsWith('./') || rel.startsWith('../') ? rel : `./${rel}`;
}

/** Render the README.md index, mirroring HTML export overview structure. */
function renderReadme(snapshot: ExportSnapshot): string {
    const lines: string[] = [
        `# ${snapshot.title}`,
        '',
        `Generated ${snapshot.generatedAt}`,
        '',
        `Ideas: **${snapshot.counts.ideas}** · Files: **${snapshot.counts.files}** · Clusters: **${snapshot.counts.clusters}**`,
        '',
    ];

    if (Object.keys(snapshot.byStatus).length > 0) {
        lines.push('## Status', '');
        for (const [status, count] of Object.entries(snapshot.byStatus).sort((a, b) => a[0].localeCompare(b[0]))) {
            lines.push(`- ${escapeMd(status)}: ${count}`);
        }
        lines.push('');
    }

    if (Object.keys(snapshot.byTag).length > 0) {
        lines.push('## Tags', '');
        for (const [tag, count] of Object.entries(snapshot.byTag).sort((a, b) => a[0].localeCompare(b[0]))) {
            lines.push(`- ${escapeMd(tag)}: ${count}`);
        }
        lines.push('');
    }

    lines.push('## Ideas', '');
    if (snapshot.ideas.length === 0) {
        lines.push('_No ideas in this export scope._', '');
    } else if (snapshot.pageOptions.includeIdeaPages) {
        for (const idea of snapshot.ideas) {
            const href = ideaMarkdownRelPath(idea);
            const status = idea.status ? ` · ${escapeMd(idea.status)}` : '';
            lines.push(`- [${escapeMdLinkText(idea.name)}](${href})${status}`);
            if (idea.summary?.trim()) {
                lines.push(`  - ${escapeMd(oneLine(idea.summary))}`);
            }
        }
        lines.push('');
    } else {
        for (const idea of snapshot.ideas) {
            lines.push(renderIdeaMarkdown(snapshot, idea, { headingLevel: 3, omitBackLink: true }));
            lines.push('');
        }
    }

    if (snapshot.files.length > 0) {
        lines.push('## Files', '');
        for (const file of snapshot.files) {
            lines.push(`- \`${escapeMd(file.fileUri)}\` (${file.ideas.length} ideas)`);
        }
        lines.push('');
    }

    if (snapshot.clusters.length > 0) {
        lines.push('## Clusters', '');
        // Build clusters count from snapshot
        const clusterCounts = snapshot.clusters.map(c => `${c.kind}: ${c.label} (${c.counts.ideas} ideas)`);
        for (const line of clusterCounts) {
            lines.push(`- ${escapeMd(line)}`);
        }
        lines.push('');
    }

    return `${lines.join('\n').trimEnd()}\n`;
}

/** Render a per-idea markdown page, mirroring HTML idea page structure. */
function renderIdeaMarkdown(
    snapshot: ExportSnapshot,
    idea: ExportIdeaRecord,
    options?: { headingLevel?: number; omitBackLink?: boolean }
): string {
    const level = options?.headingLevel ?? 1;
    const heading = `${'#'.repeat(level)} ${escapeMd(idea.name)}`;
    const urlBase = snapshot.urlBase ?? undefined;

    const lines: string[] = [heading, ''];

    if (!options?.omitBackLink) {
        // Back link to README from idea page: go up from ideas/<page>.md to output dir, then README.md
        lines.push('[← Back to index](../README.md)', '');
    }

    if (idea.summary?.trim()) {
        lines.push(idea.summary.trim(), '');
    }

    lines.push(`- **File:** \`${escapeMd(idea.fileUri)}\``);
    if (idea.status) {
        lines.push(`- **Status:** ${escapeMd(idea.status)}`);
    }
    if (idea.tags.length > 0) {
        lines.push(`- **Tags:** ${idea.tags.map(tag => `\`${escapeMd(tag)}\``).join(', ')}`);
    }
    lines.push('');

    const attrEntries = Object.entries(idea.attributes).filter(([key]) => key !== 'status' && key !== 'tags');
    if (attrEntries.length > 0) {
        lines.push('## Attributes', '');
        for (const [key, value] of attrEntries.sort((a, b) => a[0].localeCompare(b[0]))) {
            lines.push(`- **${escapeMd(key)}:** ${escapeMd(formatAttributeValue(value))}`);
        }
        lines.push('');
    }

    // Outbound references with rich links
    appendRefSection(lines, snapshot, 'Outbound', idea.references.outbound, idea, urlBase);
    // Inbound references (backlinks)
    appendRefSection(lines, snapshot, 'Backlinks', idea.references.inbound, idea, urlBase);
    if (idea.references.unresolved.length > 0) {
        lines.push('## Unresolved references', '');
        for (const row of idea.references.unresolved) {
            lines.push(`- ${escapeMd(row.label || row.targetName || row.targetPath || 'unresolved')}`);
        }
        lines.push('');
    }

    return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Render a reference section with rich markdown links.
 * @param lines - The output lines array
 * @param snapshot - The export snapshot
 * @param title - Section title (e.g. 'Outbound', 'Backlinks')
 * @param rows - Reference rows to render
 * @param fromIdea - The idea from which these references are evaluated (for relative paths)
 * @param urlBase - Optional URL base prefix for links
 */
function appendRefSection(
    lines: string[],
    snapshot: ExportSnapshot,
    title: string,
    rows: ExportIdeaRecord['references']['outbound'],
    fromIdea: ExportIdeaRecord,
    urlBase: string | undefined
): void {
    if (rows.length === 0) {
        return;
    }
    lines.push(`## ${title}`, '');
    for (const row of rows) {
        // Pick the other endpoint for each row direction: inbound rows target this idea; sourceIdeaId is the backlink origin.
        const rowIdeaId = row.direction === 'inbound' ? row.sourceIdeaId : row.targetIdeaId;
        const target = rowIdeaId ? snapshot.ideasById[rowIdeaId] : undefined;
        if (target && snapshot.pageOptions.includeIdeaPages) {
            const rel = linkPath(fromIdea, target, urlBase);
            lines.push(`- [${escapeMdLinkText(target.name)}](${rel})`);
        } else if (target) {
            lines.push(`- ${escapeMd(target.name)}`);
        } else if (row.targetPath) {
            lines.push(`- \`${escapeMd(row.targetPath)}\``);
        } else {
            lines.push(`- ${escapeMd(row.targetName || row.label || 'reference')}`);
        }
    }
    lines.push('');
}

/** Render a per-file markdown page. */
function renderFileMarkdown(snapshot: ExportSnapshot, file: ExportFileRecord): string {
    const lines: string[] = [
        `# ${file.name}`,
        '',
        `File: \`${escapeMd(file.fileUri)}\``,
        '',
        `Ideas: ${file.ideas.length}`,
        '',
        '## Ideas',
        '',
    ];

    for (const idea of file.ideas) {
        const href = `../${ideaMarkdownRelPath(idea)}`;
        lines.push(`- [${escapeMdLinkText(idea.name)}](${href})`);
        if (idea.summary?.trim()) {
            lines.push(`  - ${escapeMd(oneLine(idea.summary))}`);
        }
    }

    lines.push('');
    lines.push('## Clusters');
    // List cluster memberships for ideas in this file
    const fileClusterIds = file.ideas.flatMap(idea => idea.clusterIds);
    const uniqueClusterIds = [...new Set(fileClusterIds)];
    for (const clusterId of uniqueClusterIds) {
        const cluster = snapshot.clustersById[clusterId];
        if (cluster) {
            lines.push(`- ${escapeMd(cluster.label)} (${cluster.kind})`);
        }
    }
    lines.push('');

    if (file.edgeCount > 0) {
        for (const idea of file.ideas) {
            if (idea.references.outbound.length > 0) {
                appendRefSection(lines, snapshot, `Outbound — ${escapeMd(idea.name)}`, idea.references.outbound, idea, snapshot.urlBase);
            }
        }
    }
    lines.push('');

    return `${lines.join('\n').trimEnd()}\n`;
}

/** Render a per-cluster markdown page. */
function renderClusterMarkdown(snapshot: ExportSnapshot, cluster: ExportClusterRecord): string {
    const lines: string[] = [
        `# ${cluster.label}`,
        '',
        `Kind: ${cluster.kind}`,
        '',
        `Ideas: ${cluster.counts.ideas}`,
        '',
        '## Ideas',
        '',
    ];

    for (const ideaId of cluster.ideaIds) {
        const idea = snapshot.ideasById[ideaId];
        if (idea) {
            const href = `../${ideaMarkdownRelPath(idea)}`;
            lines.push(`- [${escapeMdLinkText(idea.name)}](${href})`);
        }
    }

    lines.push('');
    lines.push('## Attributes');
    // List attributes used by ideas in this cluster
    const clusterAttrKeys = new Set<string>();
    for (const ideaId of cluster.ideaIds) {
        const idea = snapshot.ideasById[ideaId];
        if (idea) {
            for (const key of Object.keys(idea.attributes)) {
                clusterAttrKeys.add(key);
            }
        }
    }
    for (const key of [...clusterAttrKeys].sort()) {
        const attr = snapshot.attributesByKey[key];
        if (attr) {
            lines.push(`- \`${escapeMd(key)}\`: ${attr.ideaCount} ideas`);
        }
    }
    lines.push('');

    return `${lines.join('\n').trimEnd()}\n`;
}

/** Render a per-attribute markdown page. */
function renderAttributeMarkdown(snapshot: ExportSnapshot, attribute: ExportAttributeRecord): string {
    const lines: string[] = [
        `# \`${escapeMd(attribute.key)}\` attribute`,
        '',
        `Ideas: ${attribute.ideaCount}`,
        '',
        '## Values',
        '',
    ];

    for (const { value, count } of attribute.values) {
        lines.push(`- \`${escapeMd(value)}\`: ${count} ideas`);
    }
    lines.push('');

    lines.push('## Ideas', '');
    for (const ideaId of attribute.ideaIds) {
        const idea = snapshot.ideasById[ideaId];
        if (idea) {
            const href = `../${ideaMarkdownRelPath(idea)}`;
            lines.push(`- [${escapeMdLinkText(idea.name)}](${href})`);
        }
    }
    lines.push('');

    return `${lines.join('\n').trimEnd()}\n`;
}

function oneLine(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function escapeMd(value: string): string {
    return value.replace(/([\\`*_{}[\]()#+\-.!|>])/g, '\\$1');
}

function escapeMdLinkText(value: string): string {
    return value.replace(/([\\\[\]])/g, '\\$1');
}