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

/** Normalize an export mount prefix to a leading-slash path without a trailing slash. */
export function normalizeUrlBase(urlBase?: string): string | undefined {
    const trimmed = urlBase?.trim();
    if (!trimmed) {
        return undefined;
    }
    const withoutTrailing = trimmed.replace(/\/+$/, '');
    if (withoutTrailing.length === 0) {
        return undefined;
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(withoutTrailing) || withoutTrailing.startsWith('/')) {
        return withoutTrailing;
    }
    return `/${withoutTrailing}`;
}

export function hrefFor(currentPath: string, targetPath: string, urlBase?: string): string {
    const base = normalizeUrlBase(urlBase);
    const cleanedTarget = targetPath.replace(/^\.\//, '').replace(/^\/+/, '');
    if (base) {
        return cleanedTarget ? `${base}/${cleanedTarget}` : `${base}/`;
    }
    const fromSegments = currentPath.split('/').filter(Boolean);
    const toSegments = cleanedTarget.split('/').filter(Boolean);
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

export function pageHref(currentPath: string, page: ExportPageInfo, urlBase?: string): string {
    return hrefFor(currentPath, page.path, urlBase);
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
    const normalized = fileUri.replace(/\\/g, '/');
    const bySuffix = [...snapshot.files, ...snapshot.codeFiles].find(file => {
        const candidate = file.fileUri.replace(/\\/g, '/');
        return candidate === normalized
            || candidate.endsWith(`/${normalized}`)
            || candidate.endsWith(normalized)
            || normalized.endsWith(`/${candidate}`)
            || normalized.endsWith(candidate);
    });
    if (bySuffix) {
        const kind = snapshot.filesById[bySuffix.id] ? 'file' : 'code-file';
        return { page: bySuffix.page, kind };
    }
    const base = fileBaseName(fileUri).toLowerCase();
    if (base) {
        const byName = [...snapshot.files, ...snapshot.codeFiles].filter(file =>
            fileBaseName(file.fileUri).toLowerCase() === base
        );
        if (byName.length === 1) {
            const match = byName[0]!;
            const kind = snapshot.filesById[match.id] ? 'file' : 'code-file';
            return { page: match.page, kind };
        }
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

function summaryRefInner(raw: string): { isWiki: boolean; inner: string; target: string } {
    const isWiki = raw.startsWith('[[') && raw.endsWith(']]');
    const inner = isWiki ? raw.slice(2, -2) : raw.slice(1, -1);
    let target = inner.trim();
    if (isWiki) {
        const pipe = inner.indexOf('|');
        if (pipe >= 0) {
            target = inner.slice(0, pipe).trim();
        }
    }
    return { isWiki, inner, target };
}

function summaryRefDisplayName(raw: string): string {
    const { isWiki, inner, target } = summaryRefInner(raw);
    if (isWiki) {
        const pipe = inner.indexOf('|');
        if (pipe >= 0) {
            const alias = inner.slice(pipe + 1).trim();
            if (alias) {
                return alias;
            }
        }
    }
    const quoted = /^["'](.+)["']$/.exec(target);
    if (quoted?.[1]) {
        return fileBaseName(quoted[1]);
    }
    const segments = target.split('.').filter(Boolean);
    return segments[segments.length - 1] || target || raw;
}

function summaryRefFilePath(raw: string): string | undefined {
    const { target } = summaryRefInner(raw);
    const quoted = /^["'](.+)["']$/.exec(target);
    return quoted?.[1]?.trim() || undefined;
}

type ExportRefRow = ExportIdeaRecord['references']['outbound'][number];

function findIdeaByRefName(snapshot: ExportSnapshot, raw: string, displayName: string): ExportIdeaRecord | undefined {
    const { target } = summaryRefInner(raw);
    const qualified = target.split('.').map(part => part.trim()).filter(Boolean);
    const ideaName = (qualified.at(-1) || displayName).toLowerCase();
    if (!ideaName) {
        return undefined;
    }
    const matches = snapshot.ideas.filter(candidate => candidate.name.toLowerCase() === ideaName);
    if (matches.length === 1) {
        return matches[0];
    }
    if (matches.length > 1 && qualified.length > 1) {
        const qualifier = qualified.slice(0, -1).join('.').toLowerCase();
        const narrowed = matches.filter(candidate => {
            const path = candidate.fileUri.toLowerCase();
            return path.includes(qualifier) || path.includes(qualifier.replace(/\./g, '/'));
        });
        if (narrowed.length === 1) {
            return narrowed[0];
        }
    }
    return undefined;
}

/**
 * Render text that may contain wiki/bracket refs as styled links to export pages.
 */
export function renderTextWithRefsHtml(
    snapshot: ExportSnapshot,
    currentPath: string,
    text: string,
    options?: {
        idea?: ExportIdeaRecord;
        emptyMessage?: string;
    }
): string {
    const source = text?.trim();
    if (!source) {
        return escapeHtml(options?.emptyMessage ?? '');
    }

    const used = new WeakSet<object>();
    const takeRow = (raw: string, displayName: string): ExportRefRow | undefined => {
        if (!options?.idea) {
            return undefined;
        }
        const matches = [
            ...options.idea.references.outbound,
            ...options.idea.references.unresolved,
            ...options.idea.references.inbound
        ].filter(row =>
            row.snippet === raw
            || [row.label, row.targetName, fileBaseName(row.targetPath)]
                .filter(Boolean)
                .map(value => String(value).toLowerCase())
                .includes(displayName.toLowerCase())
        );
        const unused = matches.find(row => !used.has(row));
        const row = unused ?? matches[0];
        if (row) {
            used.add(row);
        }
        return row;
    };

    const ideaFromRow = (row: ExportRefRow | undefined): ExportIdeaRecord | undefined => {
        if (!row) {
            return undefined;
        }
        if (row.targetIdeaId && snapshot.ideasById[row.targetIdeaId]) {
            return snapshot.ideasById[row.targetIdeaId];
        }
        if (row.direction === 'inbound' && snapshot.ideasById[row.sourceIdeaId]) {
            return snapshot.ideasById[row.sourceIdeaId];
        }
        return undefined;
    };

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
            const row = takeRow(raw, displayName);
            const linkedIdea = ideaFromRow(row) ?? findIdeaByRefName(snapshot, raw, displayName);
            const filePath = summaryRefFilePath(raw) ?? (!linkedIdea ? row?.targetPath : undefined);
            const fileTarget = !linkedIdea && filePath
                ? resolveExportFilePage(snapshot, { fileUri: filePath })
                : undefined;

            const label = linkedIdea?.name
                ?? (fileTarget ? fileBaseName(filePath ?? displayName) : displayName);
            const title = linkedIdea
                ? `${linkedIdea.fileUri} · ${linkedIdea.name}`
                : filePath || row?.targetPath || (
                    row && !row.isResolved ? `Unresolved reference: ${displayName}` : displayName
                );

            let href: string | undefined;
            if (linkedIdea && snapshot.pageOptions.includeIdeaPages) {
                href = pageHref(currentPath, linkedIdea.page, snapshot.urlBase);
            } else if (fileTarget && filePageEnabled(snapshot, fileTarget.kind)) {
                href = pageHref(currentPath, fileTarget.page, snapshot.urlBase);
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

    return source
        .split('\n')
        .map(line => renderLine(line))
        .join('<br>');
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
    return renderTextWithRefsHtml(snapshot, currentPath, idea.summary ?? '', {
        idea,
        emptyMessage
    });
}

/** Render an attribute value, linking any embedded idea/file refs to export pages. */
export function renderAttributeValueHtml(
    snapshot: ExportSnapshot,
    currentPath: string,
    value: unknown,
    idea?: ExportIdeaRecord
): string {
    if (value === true) {
        return 'true';
    }
    if (value === false) {
        return 'false';
    }
    if (value == null) {
        return '—';
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return '—';
        }
        return value
            .map(item => renderTextWithRefsHtml(snapshot, currentPath, String(item), { idea }))
            .join(', ');
    }
    if (typeof value === 'object') {
        return escapeHtml(JSON.stringify(value));
    }
    const text = String(value);
    if (!text.trim()) {
        return '—';
    }
    return renderTextWithRefsHtml(snapshot, currentPath, text, { idea });
}
