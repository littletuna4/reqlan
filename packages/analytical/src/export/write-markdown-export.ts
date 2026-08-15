import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
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

/** Write a multi-file markdown export from an export snapshot. */
export async function writeMarkdownExport(
    snapshot: ExportSnapshot,
    request: ExportRequest,
    onProgress?: ExportProgressCallback
): Promise<ExportResult> {
    const outputDir = join(request.outputDir, request.exportName);
    await mkdir(outputDir, { recursive: true });

    const indexFilePath = join(outputDir, 'README.md');
    const ideasDir = join(outputDir, 'ideas');
    if (snapshot.pageOptions.includeIdeaPages) {
        await mkdir(ideasDir, { recursive: true });
    }

    const writes: Array<() => Promise<void>> = [
        () => writeFile(indexFilePath, renderReadme(snapshot), 'utf8'),
    ];

    if (snapshot.pageOptions.includeIdeaPages) {
        for (const idea of snapshot.ideas) {
            const path = join(outputDir, ideaMarkdownRelPath(idea));
            writes.push(() => writeFile(path, renderIdeaMarkdown(snapshot, idea), 'utf8'));
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
        indexFilePath,
        printFilePath: indexFilePath,
        dataFilePath: indexFilePath,
        ideasIndexFilePath: indexFilePath,
    };
}

function ideaMarkdownRelPath(idea: ExportIdeaRecord): string {
    return toMarkdownPath(idea.page.path);
}

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

    return `${lines.join('\n').trimEnd()}\n`;
}

function renderIdeaMarkdown(
    snapshot: ExportSnapshot,
    idea: ExportIdeaRecord,
    options?: { headingLevel?: number; omitBackLink?: boolean }
): string {
    const level = options?.headingLevel ?? 1;
    const heading = `${'#'.repeat(level)} ${escapeMd(idea.name)}`;
    const lines: string[] = [heading, ''];

    if (!options?.omitBackLink) {
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

    appendRefSection(lines, snapshot, 'Outbound', idea.references.outbound);
    appendRefSection(lines, snapshot, 'Inbound', idea.references.inbound);
    if (idea.references.unresolved.length > 0) {
        lines.push('## Unresolved references', '');
        for (const row of idea.references.unresolved) {
            lines.push(`- ${escapeMd(row.label || row.targetName || row.targetPath || 'unresolved')}`);
        }
        lines.push('');
    }

    return `${lines.join('\n').trimEnd()}\n`;
}

function appendRefSection(
    lines: string[],
    snapshot: ExportSnapshot,
    title: string,
    rows: ExportIdeaRecord['references']['outbound']
): void {
    if (rows.length === 0) {
        return;
    }
    lines.push(`## ${title}`, '');
    for (const row of rows) {
        const target = row.targetIdeaId ? snapshot.ideasById[row.targetIdeaId] : undefined;
        if (target && snapshot.pageOptions.includeIdeaPages) {
            const fileName = ideaMarkdownRelPath(target).replace(/^ideas\//, '');
            lines.push(`- [${escapeMdLinkText(target.name)}](./${fileName})`);
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

function oneLine(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function escapeMd(value: string): string {
    return value.replace(/([\\`*_{}[\]()#+\-.!|>])/g, '\\$1');
}

function escapeMdLinkText(value: string): string {
    return value.replace(/([\\\[\]])/g, '\\$1');
}
