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

export function formatAttributeValue(value: unknown): string {
    if (value === true) {
        return 'true';
    }
    if (value === false) {
        return 'false';
    }
    if (Array.isArray(value)) {
        return value.map(String).join(', ');
    }
    if (value == null) {
        return '';
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}

export function slugAttributeKey(key: string): string {
    return key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'attribute';
}

/** Trimmed status when present; otherwise undefined (never invent "unspecified"). */
export function ideaStatus(idea: { status?: string | null }): string | undefined {
    const value = idea.status?.trim();
    return value ? value : undefined;
}

/** Non-empty tag list; empty/missing tags yield []. */
export function ideaTags(idea: { tags?: readonly string[] | null }): string[] {
    return (idea.tags ?? []).map(tag => String(tag).trim()).filter(Boolean);
}

export function renderOptionalStatusParagraph(idea: { status?: string | null }): string {
    const status = ideaStatus(idea);
    return status ? `<p><strong>Status:</strong> ${escapeHtml(status)}</p>` : '';
}

export function renderOptionalTagsParagraph(idea: { tags?: readonly string[] | null }): string {
    const tags = ideaTags(idea);
    return tags.length > 0 ? `<p><strong>Tags:</strong> ${escapeHtml(tags.join(', '))}</p>` : '';
}

export function renderOptionalStatusCell(idea: { status?: string | null }): string {
    const status = ideaStatus(idea);
    return status ? escapeHtml(status) : '';
}

export function renderOptionalTagsCell(idea: { tags?: readonly string[] | null }): string {
    const tags = ideaTags(idea);
    return tags.length > 0 ? escapeHtml(tags.join(', ')) : '';
}

export function pageHref(currentPath: string, page: ExportPageInfo): string {
    return hrefFor(currentPath, page.path);
}

/** Resolve a hosting .rq file or outbound code-file page for a path or graph node id. */
export function resolveExportFilePage(
    snapshot: ExportSnapshot,
    options: { id?: string; fileUri?: string }
): { page: ExportPageInfo; kind: 'file' | 'code-file' } | undefined {
    const byId = options.id
        ? (snapshot.filesById[options.id] ?? snapshot.codeFilesById[options.id])
        : undefined;
    if (byId) {
        const kind = snapshot.filesById[byId.id] ? 'file' : 'code-file';
        return { page: byId.page, kind };
    }
    const fileUri = options.fileUri?.trim();
    if (!fileUri) {
        return undefined;
    }
    const hosting = snapshot.files.find(file => file.fileUri === fileUri);
    if (hosting) {
        return { page: hosting.page, kind: 'file' };
    }
    const codeFile = snapshot.codeFiles.find(file => file.fileUri === fileUri);
    if (codeFile) {
        return { page: codeFile.page, kind: 'code-file' };
    }
    return undefined;
}

export function filePageEnabled(snapshot: ExportSnapshot, kind: 'file' | 'code-file'): boolean {
    return kind === 'file'
        ? snapshot.pageOptions.includeFilePages
        : snapshot.pageOptions.includeCodeFilePages;
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

/** Wiki `[[...]]` or bracket `[...]` tokens preserved in indexed summaries. */
const SUMMARY_REF_PATTERN = /\[\[([\s\S]+?)\]\]|\[([^\[\]]+)\]/g;

function fileBaseName(path: string): string {
    const cleaned = path.replace(/^["']|["']$/g, '').trim();
    const segments = cleaned.split(/[/\\]/).filter(Boolean);
    return segments[segments.length - 1] || cleaned;
}

function summaryRefDisplayName(raw: string): string {
    const isWiki = raw.startsWith('[[') && raw.endsWith(']]');
    const inner = isWiki ? raw.slice(2, -2) : raw.slice(1, -1);
    if (isWiki) {
        const pipe = inner.indexOf('|');
        if (pipe >= 0) {
            const alias = inner.slice(pipe + 1).trim();
            if (alias) {
                return alias;
            }
        }
    }
    const target = isWiki && inner.includes('|') ? inner.slice(0, inner.indexOf('|')).trim() : inner.trim();
    const quoted = /^["'](.+)["']$/.exec(target);
    if (quoted?.[1]) {
        return fileBaseName(quoted[1]);
    }
    const segments = target.split('.').filter(Boolean);
    return segments[segments.length - 1] || target || raw;
}

function matchOutboundRef(idea: ExportIdeaRecord, raw: string, displayName: string) {
    const outbound = idea.references.outbound;
    const bySnippet = outbound.find(row => row.snippet === raw);
    if (bySnippet) {
        return bySnippet;
    }
    const needle = displayName.toLowerCase();
    return outbound.find(row => {
        const labels = [row.label, row.targetName, fileBaseName(row.targetPath)]
            .filter(Boolean)
            .map(value => String(value).toLowerCase());
        return labels.includes(needle);
    });
}

function summaryRefTooltip(
    row: ReturnType<typeof matchOutboundRef>,
    displayName: string,
    linkedIdea?: ExportIdeaRecord
): string {
    if (linkedIdea) {
        return `${linkedIdea.fileUri} · ${linkedIdea.name}`;
    }
    if (row?.targetPath) {
        if (row.targetName && row.targetName !== row.targetPath) {
            return `${row.targetPath} · ${row.targetName}`;
        }
        return row.targetPath;
    }
    if (row && !row.isResolved) {
        return `Unresolved reference: ${displayName}`;
    }
    return displayName;
}

/**
 * Render an idea body/summary with styled inline refs: linked idea/file names and destination tooltips.
 */
export function renderIdeaSummaryHtml(
    snapshot: ExportSnapshot,
    currentPath: string,
    idea: ExportIdeaRecord,
    emptyMessage = 'No summary provided.'
): string {
    const summary = idea.summary?.trim();
    if (!summary) {
        return escapeHtml(emptyMessage);
    }

    const used = new WeakSet<object>();
    const renderLine = (line: string): string => {
        let html = '';
        let lastIndex = 0;
        SUMMARY_REF_PATTERN.lastIndex = 0;
        for (const match of line.matchAll(SUMMARY_REF_PATTERN)) {
            const raw = match[0]!;
            const index = match.index ?? 0;
            html += escapeHtml(line.slice(lastIndex, index));
            lastIndex = index + raw.length;

            const displayName = summaryRefDisplayName(raw);
            let row = matchOutboundRef(idea, raw, displayName);
            if (row && used.has(row)) {
                row = idea.references.outbound.find(candidate =>
                    !used.has(candidate)
                    && (candidate.snippet === raw
                        || [candidate.label, candidate.targetName].includes(displayName))
                ) ?? row;
            }
            if (row) {
                used.add(row);
            }

            const linkedIdea = row?.targetIdeaId ? snapshot.ideasById[row.targetIdeaId] : undefined;
            const fileTarget = !linkedIdea && row?.targetPath
                ? resolveExportFilePage(snapshot, { fileUri: row.targetPath })
                : undefined;
            const title = summaryRefTooltip(row, displayName, linkedIdea);
            const label = linkedIdea?.name
                ?? (fileTarget ? fileBaseName(row!.targetPath) : displayName);

            let href: string | undefined;
            if (linkedIdea && snapshot.pageOptions.includeIdeaPages) {
                href = pageHref(currentPath, linkedIdea.page);
            } else if (fileTarget && filePageEnabled(snapshot, fileTarget.kind)) {
                href = pageHref(currentPath, fileTarget.page);
            }

            const className = [
                'idea-ref',
                linkedIdea ? 'idea-ref--idea' : '',
                fileTarget ? 'idea-ref--file' : '',
                !href ? 'idea-ref--unresolved' : ''
            ].filter(Boolean).join(' ');

            if (href) {
                html += `<a class="${className}" href="${escapeHtml(href)}" title="${escapeHtml(title)}">${escapeHtml(label)}</a>`;
            } else {
                html += `<span class="${className}" title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
            }
        }
        html += escapeHtml(line.slice(lastIndex));
        return html;
    };

    return summary
        .split('\n')
        .map(line => renderLine(line))
        .join('<br>');
}
