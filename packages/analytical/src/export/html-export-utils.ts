import type {
    ExportClusterRecord,
    ExportFileRecord,
    ExportIdeaRecord,
    ExportPageInfo,
    ExportSnapshot
} from './types.js';

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function formatDate(value: string): string {
    return new Date(value).toLocaleString('en-AU', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function stringifyJson(value: unknown): string {
    return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}

export function hrefFor(currentPath: string, targetPath: string): string {
    const fromSegments = currentPath.split('/').filter(Boolean);
    const toSegments = targetPath.split('/').filter(Boolean);
    const fromDir = fromSegments.slice(0, -1);
    while (fromDir.length > 0 && toSegments.length > 0 && fromDir[0] === toSegments[0]) {
        fromDir.shift();
        toSegments.shift();
    }
    const prefix = fromDir.map(() => '..');
    return [...prefix, ...toSegments].join('/') || '.';
}

export function pageHref(currentPath: string, page: ExportPageInfo): string {
    return hrefFor(currentPath, page.path);
}

export function renderDefinitionList(values: Record<string, number>): string {
    const entries = Object.entries(values);
    if (entries.length === 0) {
        return '<p class="subtle">No data available.</p>';
    }
    return `
        <dl class="rollup-list">
            ${entries.map(([key, value]) => `
                <div>
                    <dt>${escapeHtml(key)}</dt>
                    <dd>${escapeHtml(String(value))}</dd>
                </div>
            `).join('')}
        </dl>
    `;
}

export function renderMetric(label: string, value: string, href?: string): string {
    const inner = `
        <span class="metric-label">${escapeHtml(label)}</span>
        <strong class="metric-value">${escapeHtml(value)}</strong>
    `;
    return `
        <article class="metric">
            ${href ? `<a class="metric-link" href="${escapeHtml(href)}">${inner}</a>` : inner}
        </article>
    `;
}

export function relatedClusters(snapshot: ExportSnapshot, idea: ExportIdeaRecord): ExportClusterRecord[] {
    return idea.clusterIds
        .map(clusterId => snapshot.clustersById[clusterId])
        .filter((cluster): cluster is ExportClusterRecord => Boolean(cluster));
}

export function fileByIdea(snapshot: ExportSnapshot, idea: ExportIdeaRecord): ExportFileRecord | undefined {
    return snapshot.files.find(file => file.fileUri === idea.fileUri);
}
