import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
    ExportIdeaRecord,
    ExportProgressCallback,
    ExportRequest,
    ExportResult,
    ExportSnapshot
} from './types.js';
import { formatAttributeValue } from './html-export-utils.js';

/** Write CSV export(s): ideas.csv with flattened tags/attributes, plus references.csv. */
export async function writeCsvExport(
    snapshot: ExportSnapshot,
    request: ExportRequest,
    onProgress?: ExportProgressCallback
): Promise<ExportResult> {
    const outputDir = join(request.outputDir, request.exportName);
    await mkdir(outputDir, { recursive: true });

    const ideasPath = join(outputDir, 'ideas.csv');
    const referencesPath = join(outputDir, 'references.csv');
    const total = 2;
    let completed = 0;

    onProgress?.({
        phase: 'write',
        message: 'Writing ideas.csv…',
        completed,
        total,
    });
    await writeFile(ideasPath, renderIdeasCsv(snapshot), 'utf8');
    completed += 1;

    onProgress?.({
        phase: 'write',
        message: 'Writing references.csv…',
        completed,
        total,
    });
    await writeFile(referencesPath, renderReferencesCsv(snapshot), 'utf8');
    completed += 1;
    onProgress?.({
        phase: 'write',
        message: `Wrote ${total} CSV files`,
        completed,
        total,
    });

    return {
        outputDir,
        indexFilePath: ideasPath,
        printFilePath: ideasPath,
        dataFilePath: referencesPath,
    };
}

function renderIdeasCsv(snapshot: ExportSnapshot): string {
    const attributeKeys = collectAttributeKeys(snapshot.ideas);
    const headers = [
        'id',
        'name',
        'kind',
        'fileUri',
        'lineStart',
        'status',
        'tags',
        'summary',
        ...attributeKeys.map(key => `attr:${key}`),
    ];
    const rows = snapshot.ideas.map(idea => {
        const cells = [
            idea.id,
            idea.name,
            idea.kind,
            idea.fileUri,
            String(idea.lineStart),
            idea.status ?? '',
            idea.tags.join(';'),
            idea.summary,
            ...attributeKeys.map(key => {
                if (!(key in idea.attributes)) {
                    return '';
                }
                return formatAttributeValue(idea.attributes[key]);
            }),
        ];
        return cells.map(csvEscape).join(',');
    });
    return `${headers.map(csvEscape).join(',')}\n${rows.join('\n')}${rows.length > 0 ? '\n' : ''}`;
}

function renderReferencesCsv(snapshot: ExportSnapshot): string {
    const headers = [
        'sourceIdeaId',
        'sourceName',
        'direction',
        'kind',
        'label',
        'targetIdeaId',
        'targetName',
        'targetPath',
        'isResolved',
        'snippet',
    ];
    const rows: string[] = [];
    for (const idea of snapshot.ideas) {
        for (const group of [
            { direction: 'outbound', rows: idea.references.outbound },
            { direction: 'inbound', rows: idea.references.inbound },
            { direction: 'unresolved', rows: idea.references.unresolved },
        ] as const) {
            for (const row of group.rows) {
                rows.push([
                    idea.id,
                    idea.name,
                    group.direction,
                    row.kind,
                    row.label,
                    row.targetIdeaId ?? '',
                    row.targetName,
                    row.targetPath,
                    row.isResolved ? 'true' : 'false',
                    row.snippet ?? '',
                ].map(csvEscape).join(','));
            }
        }
    }
    return `${headers.map(csvEscape).join(',')}\n${rows.join('\n')}${rows.length > 0 ? '\n' : ''}`;
}

function collectAttributeKeys(ideas: ExportIdeaRecord[]): string[] {
    const keys = new Set<string>();
    for (const idea of ideas) {
        for (const key of Object.keys(idea.attributes)) {
            if (key === 'status' || key === 'tags') {
                continue;
            }
            keys.add(key);
        }
    }
    return [...keys].sort((a, b) => a.localeCompare(b));
}

/** RFC 4180-ish CSV cell escaping. */
export function csvEscape(value: string): string {
    if (/[",\n\r]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
