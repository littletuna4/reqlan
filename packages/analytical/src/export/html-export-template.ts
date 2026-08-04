import type {
    ExportAttributeRecord,
    ExportClusterRecord,
    ExportCodeFileRecord,
    ExportFileRecord,
    ExportIdeaRecord,
    ExportPageInfo,
    ExportSnapshot
} from './types.js';
import {
    escapeHtml,
    fileByIdea,
    filePageEnabled,
    formatAttributeValue,
    formatDate,
    hrefFor,
    ideaStatus,
    ideaTags,
    pageHref,
    relatedClusters,
    renderAttributeValueHtml,
    renderDefinitionList,
    renderIdeaSummaryHtml,
    renderMetric,
    renderOptionalStatusCell,
    renderOptionalStatusParagraph,
    renderOptionalTagsCell,
    renderOptionalTagsParagraph,
    renderTextWithRefsHtml,
    resolveExportFilePage,
    slugAttributeKey,
    stringifyJson
} from './html-export-utils.js';
import {
    FILTER_EMPTY,
    FILTER_NOT_PRESENT,
    filterDisplayLabel,
    isFilterEmpty,
    isFilterNotPresent,
    isFilterUnspecified
} from '../core/filter-specials.js';

function renderMultiFilterSelect(
    attr: 'status' | 'tag',
    countsByValue: Record<string, number>,
    emptyLabel: string
): string {
    const valueSet = new Set(Object.keys(countsByValue));
    valueSet.add(FILTER_NOT_PRESENT);
    valueSet.add(FILTER_EMPTY);

    const options = [...valueSet].map(value => ({
        value,
        label: filterDisplayLabel(value),
        special: isFilterNotPresent(value) || isFilterEmpty(value) || isFilterUnspecified(value),
        kind: isFilterNotPresent(value)
            ? 'not-present'
            : isFilterEmpty(value)
                ? 'empty'
                : isFilterUnspecified(value)
                    ? 'unspecified'
                    : 'concrete',
        count: countsByValue[value] ?? 0
    }));
    options.sort((left, right) => {
        const rank = (kind: string) =>
            kind === 'not-present' ? 0 : kind === 'empty' ? 1 : kind === 'unspecified' ? 2 : 3;
        return rank(left.kind) - rank(right.kind) || left.label.localeCompare(right.label);
    });

    return `
        <div
            class="scd is-loading"
            data-graph-${attr}-scd
            data-placeholder="${escapeHtml(emptyLabel)}"
            data-label="${attr === 'status' ? 'Status' : 'Tags'}"
            data-options="${escapeHtml(JSON.stringify(options))}"
        >
            <button type="button" class="scd-trigger" aria-haspopup="listbox" aria-expanded="false" aria-busy="true">
                <span class="scd-trigger-label">${attr === 'status' ? 'Status…' : 'Tags…'}</span>
                <span class="scd-chevron" aria-hidden="true"></span>
            </button>
        </div>
    `;
}


function exportHref(snapshot: ExportSnapshot, currentPath: string, targetPath: string): string {
    return hrefFor(currentPath, targetPath, snapshot.urlBase);
}

function exportPageHref(snapshot: ExportSnapshot, currentPath: string, pageInfo: ExportPageInfo): string {
    return pageHref(currentPath, pageInfo, snapshot.urlBase);
}

interface RenderOptions {
    currentPath: string;
    activeNav: 'overview' | 'ideas' | 'files' | 'code-files' | 'clusters' | 'attributes' | 'graph' | 'print';
    title: string;
    body: string;
    snapshot: ExportSnapshot;
    breadcrumbs?: Array<{ label: string; href?: string }>;
    includeGlobalSearch?: boolean;
}

export function renderHomePage(snapshot: ExportSnapshot): string {
    const currentPath = snapshot.manifest.home.path;
    const highlightClusters = snapshot.clusters.slice(0, 8).map(cluster => `
        <a class="entity-card" href="${escapeHtml(exportPageHref(snapshot, currentPath, cluster.page))}">
            <div class="pill-row">
                <span class="pill">${escapeHtml(cluster.kind)}</span>
                <span class="pill">${cluster.counts.ideas} ideas</span>
            </div>
            <h3>${escapeHtml(cluster.label)}</h3>
            <p class="subtle">${escapeHtml(cluster.description)}</p>
        </a>
    `).join('');

    const body = `
        <header class="hero">
            <div class="panel">
                <p class="eyebrow">Reqlan export</p>
                <h1>${escapeHtml(snapshot.title)}</h1>
                <p class="subtle">Template: ${escapeHtml(snapshot.templateId)} | Scope: ${escapeHtml(snapshot.scope)} | Mode: ${escapeHtml(snapshot.runtimeMode)}</p>
                <p class="prose">Documentation-grade export with idea pages, clusters, links, search, and printable views.</p>
            </div>
            <div class="card">
                <p><strong>Generated</strong></p>
                <p>${escapeHtml(formatDate(snapshot.generatedAt))}</p>
                <p><strong>Workspace</strong></p>
                <p>${escapeHtml(snapshot.workspaceRoot)}</p>
            </div>
        </header>
        <section class="grid">
            ${renderMetric('Ideas', String(snapshot.counts.ideas), exportPageHref(snapshot, currentPath, snapshot.manifest.ideasIndex))}
            ${renderMetric('References', String(snapshot.counts.edges), exportPageHref(snapshot, currentPath, snapshot.manifest.graph))}
            ${renderMetric('Files', String(snapshot.counts.files), exportPageHref(snapshot, currentPath, snapshot.manifest.filesIndex))}
            ${renderMetric('Code files', String(snapshot.codeFiles.length), exportPageHref(snapshot, currentPath, snapshot.manifest.codeFilesIndex))}
            ${renderMetric('Clusters', String(snapshot.counts.clusters), exportPageHref(snapshot, currentPath, snapshot.manifest.clustersIndex))}
            ${renderMetric('Attributes', String(snapshot.attributes.length), exportPageHref(snapshot, currentPath, snapshot.manifest.attributesIndex))}
        </section>
        <section class="split">
            <div class="panel">
                <h2>Status Rollup</h2>
                <div class="scroll-window">${renderDefinitionList(snapshot.byStatus)}</div>
            </div>
            <div class="panel">
                <h2>Tags</h2>
                <div class="scroll-window">${renderDefinitionList(snapshot.byTag)}</div>
            </div>
        </section>
        <section class="panel">
            <div class="toolbar">
                <h2>Highlighted Clusters</h2>
                <div class="actions">
                    <a class="pill" href="${escapeHtml(exportPageHref(snapshot, currentPath, snapshot.manifest.printHome))}">Printable report</a>
                    <a class="pill" href="${escapeHtml(exportPageHref(snapshot, currentPath, snapshot.manifest.dataExport))}">Snapshot JSON</a>
                </div>
            </div>
            <div class="entity-list">${highlightClusters}</div>
        </section>
    `;
    return renderShell({
        currentPath,
        activeNav: 'overview',
        title: snapshot.title,
        body,
        snapshot,
        includeGlobalSearch: true
    });
}

export function renderIdeasIndexPage(snapshot: ExportSnapshot): string {
    const currentPath = snapshot.manifest.ideasIndex.path;
    const rows = snapshot.ideas.map(idea => `
        <tr data-filter-row="ideas" data-filter-text="${escapeHtml([idea.name, idea.summary, ideaStatus(idea) ?? '', ideaTags(idea).join(' '), idea.fileUri].join(' '))}">
            <td><strong>${renderIdeaAnchor(snapshot, currentPath, idea, idea.name)}</strong></td>
            <td>${escapeHtml(idea.fileUri)}</td>
            <td>${renderOptionalStatusCell(idea)}</td>
            <td>${renderOptionalTagsCell(idea)}</td>
            <td>${renderIdeaSummaryHtml(snapshot, currentPath, idea, '—')}</td>
            <td>${idea.references.inbound.length}/${idea.references.outbound.length}</td>
        </tr>
    `).join('');
    return renderShell({
        currentPath,
        activeNav: 'ideas',
        title: `${snapshot.title} - Ideas`,
        snapshot,
        includeGlobalSearch: true,
        body: `
            <header class="page-header">
                <p class="eyebrow">Ideas index</p>
                <h1>${escapeHtml(snapshot.title)}</h1>
                <p class="subtle">Searchable list view for all exported ideas.</p>
            </header>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Ideas</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter ideas by name, path, status, tags, or summary" data-filter-input="ideas" />
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Path</th>
                            <th>Status</th>
                            <th>Tags</th>
                            <th>Summary</th>
                            <th>Refs in/out</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </section>
        `
    });
}

export function renderFilesIndexPage(snapshot: ExportSnapshot): string {
    const currentPath = snapshot.manifest.filesIndex.path;
    const rows = snapshot.files.map(file => `
        <tr data-filter-row="files" data-filter-text="${escapeHtml([file.name, file.fileUri, Object.keys(file.tags).join(' ')].join(' '))}">
            <td><strong>${snapshot.pageOptions.includeFilePages ? `<a href="${escapeHtml(exportPageHref(snapshot, currentPath, file.page))}">${escapeHtml(file.name)}</a>` : escapeHtml(file.name)}</strong></td>
            <td>${escapeHtml(file.directory || '.')}</td>
            <td>${file.ideas.length}</td>
            <td>${file.edgeCount}</td>
            <td>${escapeHtml(Object.keys(file.tags).join(', ') || '—')}</td>
        </tr>
    `).join('');
    return renderShell({
        currentPath,
        activeNav: 'files',
        title: `${snapshot.title} - Files`,
        snapshot,
        includeGlobalSearch: true,
        body: `
            <header class="page-header">
                <p class="eyebrow">Files index</p>
                <h1>${escapeHtml(snapshot.title)}</h1>
                <p class="subtle">List view by source file with local counts and drill-down pages.</p>
            </header>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Files</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter files by path or tags" data-filter-input="files" />
                    </div>
                </div>
                <table>
                    <thead>
                        <tr><th>File</th><th>Directory</th><th>Ideas</th><th>References</th><th>Tags</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </section>
        `
    });
}

export function renderCodeFilesIndexPage(snapshot: ExportSnapshot): string {
    const currentPath = snapshot.manifest.codeFilesIndex.path;
    const rows = snapshot.codeFiles.map(file => `
        <tr data-filter-row="codeFiles" data-filter-text="${escapeHtml([file.name, file.fileUri, file.labels.join(' ')].join(' '))}">
            <td><strong>${snapshot.pageOptions.includeCodeFilePages ? `<a href="${escapeHtml(exportPageHref(snapshot, currentPath, file.page))}">${escapeHtml(file.name)}</a>` : escapeHtml(file.name)}</strong></td>
            <td>${escapeHtml(file.directory || '.')}</td>
            <td>${file.referencingIdeaIds.length}</td>
            <td>${escapeHtml(file.labels.join(', ') || '—')}</td>
        </tr>
    `).join('');
    return renderShell({
        currentPath,
        activeNav: 'code-files',
        title: `${snapshot.title} - Code files`,
        snapshot,
        includeGlobalSearch: true,
        body: `
            <header class="page-header">
                <p class="eyebrow">Code reference index</p>
                <h1>${escapeHtml(snapshot.title)}</h1>
                <p class="subtle">Outbound file_reference targets that are not idea-hosting reqlan files.</p>
            </header>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Code files</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter code files by path or label" data-filter-input="codeFiles" />
                    </div>
                </div>
                <table>
                    <thead>
                        <tr><th>File</th><th>Directory</th><th>Referenced by</th><th>Labels</th></tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="4" class="subtle">No outbound code file references.</td></tr>'}</tbody>
                </table>
            </section>
        `
    });
}

export function renderClustersIndexPage(snapshot: ExportSnapshot): string {
    const currentPath = snapshot.manifest.clustersIndex.path;
    const rows = snapshot.clusters.map(cluster => `
        <tr data-filter-row="clusters" data-filter-text="${escapeHtml([cluster.label, cluster.kind, cluster.description].join(' '))}">
            <td><strong>${snapshot.pageOptions.includeClusterPages ? `<a href="${escapeHtml(exportPageHref(snapshot, currentPath, cluster.page))}">${escapeHtml(cluster.label)}</a>` : escapeHtml(cluster.label)}</strong></td>
            <td>${escapeHtml(cluster.kind)}</td>
            <td>${cluster.counts.ideas}</td>
            <td>${cluster.counts.files}</td>
            <td>${escapeHtml(cluster.description)}</td>
        </tr>
    `).join('');
    return renderShell({
        currentPath,
        activeNav: 'clusters',
        title: `${snapshot.title} - Clusters`,
        snapshot,
        includeGlobalSearch: true,
        body: `
            <header class="page-header">
                <p class="eyebrow">Clusters</p>
                <h1>${escapeHtml(snapshot.title)}</h1>
                <p class="subtle">Deterministic and computed groupings for easier exploration.</p>
            </header>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Clusters</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter clusters by label, kind, or description" data-filter-input="clusters" />
                    </div>
                </div>
                <table>
                    <thead>
                        <tr><th>Cluster</th><th>Kind</th><th>Ideas</th><th>Files</th><th>Description</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </section>
        `
    });
}

export function renderAttributesIndexPage(snapshot: ExportSnapshot): string {
    const currentPath = snapshot.manifest.attributesIndex.path;
    const rows = snapshot.attributes.map(attribute => {
        const anchor = `attr-${slugAttributeKey(attribute.key)}`;
        const valueSummary = attribute.values
            .slice(0, 6)
            .map(entry => `${entry.value} (${entry.count})`)
            .join('; ');
        const keyCell = snapshot.pageOptions.includeAttributePages
            ? `<a href="${escapeHtml(exportPageHref(snapshot, currentPath, attribute.page))}">${escapeHtml(attribute.key)}</a>`
            : escapeHtml(attribute.key);
        return `
        <tr id="${escapeHtml(anchor)}" data-filter-row="attributes" data-filter-text="${escapeHtml([attribute.key, valueSummary, attribute.ideaIds.join(' ')].join(' '))}">
            <td><strong>${keyCell}</strong></td>
            <td>${attribute.ideaCount}</td>
            <td>${attribute.values.length}</td>
            <td>${escapeHtml(valueSummary || '—')}</td>
        </tr>`;
    }).join('');
    return renderShell({
        currentPath,
        activeNav: 'attributes',
        title: `${snapshot.title} - Attributes`,
        snapshot,
        includeGlobalSearch: true,
        body: `
            <header class="page-header">
                <p class="eyebrow">Attributes</p>
                <h1>${escapeHtml(snapshot.title)}</h1>
                <p class="subtle">Every attribute key in this export with values and idea counts.</p>
            </header>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Attributes</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter attributes by key or value" data-filter-input="attributes" />
                    </div>
                </div>
                <table>
                    <thead>
                        <tr><th>Attribute</th><th>Ideas</th><th>Values</th><th>Value summary</th></tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="4" class="subtle">No attributes declared.</td></tr>'}</tbody>
                </table>
            </section>
        `
    });
}

export function renderAttributeDetailPage(snapshot: ExportSnapshot, attribute: ExportAttributeRecord): string {
    const currentPath = attribute.page.path;
    const ideas = attribute.ideaIds
        .map(ideaId => snapshot.ideasById[ideaId])
        .filter((idea): idea is ExportIdeaRecord => Boolean(idea));
    const totalIdeas = attribute.ideaCount || 1;
    const valueRows = attribute.values.map(entry => {
        const percent = Math.round((entry.count / totalIdeas) * 1000) / 10;
        const width = Math.max(entry.count > 0 ? 1.5 : 0, Math.min(100, (entry.count / totalIdeas) * 100));
        const filterText = [entry.value, String(entry.count), `${percent}%`, ...entry.ideaIds].join(' ');
        return `
            <tr data-filter-row="attributeValues" data-filter-text="${escapeHtml(filterText)}">
                <td>${escapeHtml(entry.value)}</td>
                <td>
                    <div class="distribution-track" title="${escapeHtml(`${entry.count} of ${attribute.ideaCount} ideas (${percent}%)`)}" role="img" aria-label="${escapeHtml(`${entry.value}: ${entry.count} ideas, ${percent}%`)}">
                        <span class="distribution-fill" style="width: ${width}%"></span>
                    </div>
                </td>
                <td>${entry.count}</td>
                <td>${percent}%</td>
            </tr>`;
    }).join('');
    const ideaRows = ideas.map(idea => {
        const value = formatAttributeValue(idea.attributes[attribute.key]) || '(empty)';
        const filterText = [idea.name, value, ideaStatus(idea) ?? '', ideaTags(idea).join(' '), idea.summary].join(' ');
        return `
            <tr data-filter-row="attributeIdeas" data-filter-text="${escapeHtml(filterText)}">
                <td>${renderIdeaAnchor(snapshot, currentPath, idea, idea.name)}</td>
                <td>${escapeHtml(value)}</td>
                <td>${renderOptionalStatusCell(idea)}</td>
                <td>${renderOptionalTagsCell(idea)}</td>
                <td>${escapeHtml(idea.summary)}</td>
            </tr>`;
    }).join('');
    return renderShell({
        currentPath,
        activeNav: 'attributes',
        title: `${snapshot.title} - ${attribute.key}`,
        snapshot,
        includeGlobalSearch: snapshot.runtimeMode === 'interactive',
        breadcrumbs: [
            { label: 'Attributes', href: exportPageHref(snapshot, currentPath, snapshot.manifest.attributesIndex) },
            { label: attribute.key }
        ],
        body: `
            <header class="page-header">
                <p class="eyebrow">Attribute detail</p>
                <h1>${escapeHtml(attribute.key)}</h1>
                <p class="subtle">${attribute.ideaCount} ideas · ${attribute.values.length} distinct values</p>
            </header>
            <section class="grid">
                ${renderMetric('Ideas', String(attribute.ideaCount))}
                ${renderMetric('Values', String(attribute.values.length))}
            </section>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Value distribution</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter values" data-filter-input="attributeValues" />
                    </div>
                </div>
                <div class="scroll-window">
                    <table>
                        <thead><tr><th>Value</th><th>Distribution</th><th>Ideas</th><th>Share</th></tr></thead>
                        <tbody>${valueRows || '<tr><td colspan="4" class="subtle">No values.</td></tr>'}</tbody>
                    </table>
                </div>
            </section>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Ideas with this attribute</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter ideas by name, value, status, or tags" data-filter-input="attributeIdeas" />
                    </div>
                </div>
                <table>
                    <thead><tr><th>Idea</th><th>Value</th><th>Status</th><th>Tags</th><th>Summary</th></tr></thead>
                    <tbody>${ideaRows || '<tr><td colspan="5" class="subtle">No ideas declare this attribute.</td></tr>'}</tbody>
                </table>
            </section>
        `
    });
}

export function renderGraphPage(snapshot: ExportSnapshot): string {
    const currentPath = snapshot.manifest.graph.path;
    const graph = enrichGraphUrls(snapshot, snapshot.graphs.workspace, currentPath);
    const statuses = snapshot.byStatus;
    const tags = snapshot.byTag;
    const clusters = snapshot.clusters.slice(0, 16).map(cluster =>
        snapshot.pageOptions.includeClusterPages
            ? `<a class="pill" href="${escapeHtml(exportPageHref(snapshot, currentPath, cluster.page))}">${escapeHtml(cluster.label)}</a>`
            : `<span class="pill">${escapeHtml(cluster.label)}</span>`
    ).join('');
    return renderShell({
        currentPath,
        activeNav: 'graph',
        title: `${snapshot.title} - Graph`,
        snapshot,
        includeGlobalSearch: snapshot.runtimeMode === 'interactive',
        body: `
            <header class="page-header">
                <p class="eyebrow">Graph</p>
                <h1>${escapeHtml(snapshot.title)}</h1>
                <p class="subtle">Workspace graph with links into idea detail pages.</p>
            </header>
            <section class="graph-shell">
                <div class="toolbar">
                    <h2>Reference graph</h2>
                    <div class="actions">
                        <a class="pill" href="${escapeHtml(exportPageHref(snapshot, currentPath, snapshot.manifest.dataGraph))}">Graph JSON</a>
                    </div>
                </div>
                <div class="graph-controls-bar" data-graph-controls="graph-data">
                    <input class="searchbar graph-filter" type="search" placeholder="Search graph nodes" data-graph-search />
                    <input class="searchbar graph-filter" type="search" placeholder="Path filter" data-graph-path />
                    ${renderMultiFilterSelect('status', statuses, 'Filter by status')}
                    ${renderMultiFilterSelect('tag', tags, 'Filter by tag')}
                    <button type="button" class="graph-action" data-graph-toggle-external="true">Hide external</button>
                    <button type="button" class="graph-action" data-graph-toggle-ideasets="true">Hide ideasets</button>
                    <button type="button" class="graph-action is-active" data-graph-toggle-labels data-label-mode="auto" aria-pressed="mixed">Labels: auto</button>
                    <button type="button" class="graph-action" data-graph-toggle-physics aria-pressed="false">Live physics</button>
                    <button type="button" class="graph-action" data-graph-fit>Fit</button>
                    <button type="button" class="graph-action" data-graph-reset>Reset</button>
                    <span class="graph-status" data-graph-status-text></span>
                </div>
                <div class="pill-row">${clusters}</div>
                <div class="graph-root is-booting" data-graph-json="graph-data">
                    <div class="graph-boot" data-graph-boot role="status" aria-live="polite" aria-busy="true">
                        <span class="graph-boot-spinner" aria-hidden="true"></span>
                        <p>Initialising graph…</p>
                    </div>
                </div>
                <script id="graph-data" type="application/json">${stringifyJson(graph)}</script>
            </section>
        `
    });
}

export function renderIdeaDetailPage(snapshot: ExportSnapshot, idea: ExportIdeaRecord): string {
    const currentPath = idea.page.path;
    const clusters = relatedClusters(snapshot, idea);
    const parentFile = fileByIdea(snapshot, idea);
    const graph = enrichGraphUrls(snapshot, snapshot.graphs.byIdeaId[idea.id], currentPath);
    return renderShell({
        currentPath,
        activeNav: 'ideas',
        title: `${snapshot.title} - ${idea.name}`,
        snapshot,
        includeGlobalSearch: snapshot.runtimeMode === 'interactive',
        breadcrumbs: [
            { label: 'Ideas', href: exportPageHref(snapshot, currentPath, snapshot.manifest.ideasIndex) },
            { label: idea.name }
        ],
        body: `
            <header class="page-header">
                <p class="eyebrow">Idea detail</p>
                <h1 id="summary">${escapeHtml(idea.name)}</h1>
                <p class="subtle">${escapeHtml(idea.fileUri)}:${idea.lineStart + 1}</p>
                <div class="pill-row">
                    <span class="pill">${escapeHtml(idea.kind)}</span>
                    ${ideaStatus(idea) ? `<span class="pill">${escapeHtml(ideaStatus(idea)!)}</span>` : ''}
                    ${ideaTags(idea).map(tag => `<span class="pill">${escapeHtml(tag)}</span>`).join('')}
                </div>
            </header>
            <section class="detail-grid">
                <div class="panel prose print-break-avoid">
                    <h2>Summary</h2>
                    <p class="idea-summary">${renderIdeaSummaryHtml(snapshot, currentPath, idea)}</p>
                    <p><a class="section-link" href="#references-out">Jump to outbound references</a></p>
                    <p><a class="section-link" href="#references-in">Jump to inbound references</a></p>
                </div>
                <div class="panel print-break-avoid">
                    <h2>Navigation</h2>
                    <div class="entity-list">
                        ${parentFile ? renderMaybeLinkedCard(snapshot.pageOptions.includeFilePages, exportPageHref(snapshot, currentPath, parentFile.page), 'Source file', parentFile.fileUri) : ''}
                        ${clusters.map(cluster => renderMaybeLinkedCard(snapshot.pageOptions.includeClusterPages, exportPageHref(snapshot, currentPath, cluster.page), cluster.label, `${cluster.kind} cluster`)).join('')}
                        ${idea.page.printablePath && snapshot.pageOptions.includePrintPages ? `<a class="entity-card" href="${escapeHtml(exportHref(snapshot, currentPath, idea.page.printablePath))}"><strong>Printable page</strong><p class="subtle">Static print-friendly idea sheet.</p></a>` : ''}
                    </div>
                </div>
            </section>
            <section class="split">
                <div class="panel print-break-avoid" id="attributes">
                    <h2>Attributes</h2>
                    ${renderIdeaAttributes(snapshot, currentPath, idea)}
                </div>
                <div class="panel print-break-avoid">
                    <h2>Ancestor context</h2>
                    <div class="scroll-window">
                        <div class="entity-list">
                            ${idea.ancestors.ancestors.map(ancestor => {
                                const linked = snapshot.ideasById[ancestor.id];
                                return linked
                                    ? renderMaybeLinkedCard(snapshot.pageOptions.includeIdeaPages, exportPageHref(snapshot, currentPath, linked.page), ancestor.name, ancestor.summary)
                                    : '';
                            }).join('') || '<p class="subtle">No ancestor chain recorded.</p>'}
                        </div>
                    </div>
                </div>
            </section>
            ${renderReferenceSection(snapshot, currentPath, 'references-out', 'Outbound references', idea.references.outbound)}
            ${renderReferenceSection(snapshot, currentPath, 'references-in', 'Inbound references', idea.references.inbound)}
            ${renderReferenceSection(snapshot, currentPath, 'references-unresolved', 'Unresolved references', idea.references.unresolved)}
            <section class="graph-shell print-break-avoid" id="graph">
                <div class="toolbar"><h2>Local graph</h2></div>
                <div class="graph-controls-bar" data-graph-controls="graph-data">
                    <button type="button" class="graph-action is-active" data-graph-toggle-labels data-label-mode="auto" aria-pressed="mixed">Labels: auto</button>
                    <button type="button" class="graph-action" data-graph-toggle-physics aria-pressed="false">Live physics</button>
                    <button type="button" class="graph-action" data-graph-fit>Fit</button>
                    <span class="graph-status" data-graph-status-text></span>
                </div>
                <div class="graph-root is-booting" data-graph-json="graph-data">
                    <div class="graph-boot" data-graph-boot role="status" aria-live="polite" aria-busy="true">
                        <span class="graph-boot-spinner" aria-hidden="true"></span>
                        <p>Initialising graph…</p>
                    </div>
                </div>
                <script id="graph-data" type="application/json">${stringifyJson(graph)}</script>
            </section>
        `
    });
}

export function renderFileDetailPage(snapshot: ExportSnapshot, file: ExportFileRecord): string {
    const currentPath = file.page.path;
    const graph = enrichGraphUrls(snapshot, snapshot.graphs.byFileId[file.id], currentPath);
    const clusterLinks = snapshot.clusters.filter(cluster => cluster.fileUris.includes(file.fileUri)).slice(0, 12);
    return renderShell({
        currentPath,
        activeNav: 'files',
        title: `${snapshot.title} - ${file.name}`,
        snapshot,
        includeGlobalSearch: snapshot.runtimeMode === 'interactive',
        breadcrumbs: [
            { label: 'Files', href: exportPageHref(snapshot, currentPath, snapshot.manifest.filesIndex) },
            { label: file.name }
        ],
        body: `
            <header class="page-header">
                <p class="eyebrow">File detail</p>
                <h1>${escapeHtml(file.name)}</h1>
                <p class="subtle">${escapeHtml(file.fileUri)}</p>
            </header>
            <section class="grid">
                ${renderMetric('Ideas', String(file.ideas.length))}
                ${renderMetric('References', String(file.edgeCount))}
                ${renderMetric('Statuses', String(Object.keys(file.statuses).length))}
                ${renderMetric('Tags', String(Object.keys(file.tags).length))}
            </section>
            <section class="split">
                <div class="table-shell">
                    <div class="toolbar">
                        <h2>Ideas in file</h2>
                        <div class="actions">
                            <input class="searchbar" type="search" placeholder="Filter file ideas" data-filter-input="fileIdeas" />
                        </div>
                    </div>
                    <div class="scroll-window">
                        <table>
                            <thead><tr><th>Idea</th><th>Status</th><th>Tags</th><th>Summary</th></tr></thead>
                            <tbody>
                                ${file.ideas.map(idea => `
                                    <tr data-filter-row="fileIdeas" data-filter-text="${escapeHtml([idea.name, idea.summary, ideaStatus(idea) ?? '', ideaTags(idea).join(' ')].join(' '))}">
                                        <td>${renderIdeaAnchor(snapshot, currentPath, idea, idea.name)}</td>
                                        <td>${renderOptionalStatusCell(idea)}</td>
                                        <td>${renderOptionalTagsCell(idea)}</td>
                                        <td>${escapeHtml(idea.summary)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="panel">
                    <h2>Related clusters</h2>
                    <div class="scroll-window">
                        <div class="entity-list">
                            ${clusterLinks.map(cluster => renderMaybeLinkedCard(snapshot.pageOptions.includeClusterPages, exportPageHref(snapshot, currentPath, cluster.page), cluster.label, cluster.kind)).join('') || '<p class="subtle">No related clusters.</p>'}
                        </div>
                    </div>
                </div>
            </section>
            <section class="graph-shell print-break-avoid">
                <div class="toolbar"><h2>Local graph</h2></div>
                <div class="graph-controls-bar" data-graph-controls="graph-data">
                    <button type="button" class="graph-action is-active" data-graph-toggle-labels data-label-mode="auto" aria-pressed="mixed">Labels: auto</button>
                    <button type="button" class="graph-action" data-graph-toggle-physics aria-pressed="false">Live physics</button>
                    <button type="button" class="graph-action" data-graph-fit>Fit</button>
                    <span class="graph-status" data-graph-status-text></span>
                </div>
                <div class="graph-root is-booting" data-graph-json="graph-data">
                    <div class="graph-boot" data-graph-boot role="status" aria-live="polite" aria-busy="true">
                        <span class="graph-boot-spinner" aria-hidden="true"></span>
                        <p>Initialising graph…</p>
                    </div>
                </div>
                <script id="graph-data" type="application/json">${stringifyJson(graph)}</script>
            </section>
        `
    });
}

export function renderCodeFileDetailPage(snapshot: ExportSnapshot, file: ExportCodeFileRecord): string {
    const currentPath = file.page.path;
    const referencingIdeas = file.referencingIdeaIds
        .map(ideaId => snapshot.ideasById[ideaId])
        .filter((idea): idea is ExportIdeaRecord => Boolean(idea));
    return renderShell({
        currentPath,
        activeNav: 'code-files',
        title: `${snapshot.title} - ${file.name}`,
        snapshot,
        includeGlobalSearch: snapshot.runtimeMode === 'interactive',
        breadcrumbs: [
            { label: 'Code files', href: exportPageHref(snapshot, currentPath, snapshot.manifest.codeFilesIndex) },
            { label: file.name }
        ],
        body: `
            <header class="page-header">
                <p class="eyebrow">Code reference detail</p>
                <h1>${escapeHtml(file.name)}</h1>
                <p class="subtle">${escapeHtml(file.fileUri)}</p>
            </header>
            <section class="grid">
                ${renderMetric('Referenced by', String(referencingIdeas.length))}
                ${renderMetric('Labels', String(file.labels.length))}
            </section>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Referencing ideas</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter referencing ideas" data-filter-input="codeFileIdeas" />
                    </div>
                </div>
                <div class="scroll-window">
                    <table>
                        <thead><tr><th>Idea</th><th>Status</th><th>Tags</th><th>Summary</th></tr></thead>
                        <tbody>
                            ${referencingIdeas.map(idea => `
                                <tr data-filter-row="codeFileIdeas" data-filter-text="${escapeHtml([idea.name, idea.summary, ideaStatus(idea) ?? '', ideaTags(idea).join(' ')].join(' '))}">
                                    <td>${renderIdeaAnchor(snapshot, currentPath, idea, idea.name)}</td>
                                    <td>${renderOptionalStatusCell(idea)}</td>
                                    <td>${renderOptionalTagsCell(idea)}</td>
                                    <td>${escapeHtml(idea.summary)}</td>
                                </tr>
                            `).join('') || '<tr><td colspan="4" class="subtle">No referencing ideas.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </section>
            ${file.labels.length > 0 ? `
                <section class="panel">
                    <h2>Reference labels</h2>
                    <p>${escapeHtml(file.labels.join(', '))}</p>
                </section>
            ` : ''}
        `
    });
}

export function renderClusterDetailPage(snapshot: ExportSnapshot, cluster: ExportClusterRecord): string {
    const currentPath = cluster.page.path;
    const graph = enrichGraphUrls(snapshot, snapshot.graphs.byClusterId[cluster.id], currentPath);
    const members = cluster.ideaIds
        .map(ideaId => snapshot.ideasById[ideaId])
        .filter((idea): idea is ExportIdeaRecord => Boolean(idea));
    return renderShell({
        currentPath,
        activeNav: 'clusters',
        title: `${snapshot.title} - ${cluster.label}`,
        snapshot,
        includeGlobalSearch: snapshot.runtimeMode === 'interactive',
        breadcrumbs: [
            { label: 'Clusters', href: exportPageHref(snapshot, currentPath, snapshot.manifest.clustersIndex) },
            { label: cluster.label }
        ],
        body: `
            <header class="page-header">
                <p class="eyebrow">Cluster detail</p>
                <h1>${escapeHtml(cluster.label)}</h1>
                <p class="subtle">${escapeHtml(cluster.description)}</p>
                <div class="pill-row">
                    <span class="pill">${escapeHtml(cluster.kind)}</span>
                    <span class="pill">${cluster.counts.ideas} ideas</span>
                    <span class="pill">${cluster.counts.files} files</span>
                </div>
            </header>
            <section class="table-shell">
                <div class="toolbar">
                    <h2>Members</h2>
                    <div class="actions">
                        <input class="searchbar" type="search" placeholder="Filter cluster members" data-filter-input="clusterIdeas" />
                    </div>
                </div>
                <div class="scroll-window">
                    <table>
                        <thead><tr><th>Idea</th><th>File</th><th>Status</th><th>Summary</th></tr></thead>
                        <tbody>
                            ${members.map(idea => `
                                <tr data-filter-row="clusterIdeas" data-filter-text="${escapeHtml([idea.name, idea.fileUri, ideaStatus(idea) ?? '', idea.summary].join(' '))}">
                                    <td>${renderIdeaAnchor(snapshot, currentPath, idea, idea.name)}</td>
                                    <td>${escapeHtml(idea.fileUri)}</td>
                                    <td>${renderOptionalStatusCell(idea)}</td>
                                    <td>${escapeHtml(idea.summary)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </section>
            <section class="graph-shell print-break-avoid">
                <div class="toolbar"><h2>Cluster graph</h2></div>
                <div class="graph-controls-bar" data-graph-controls="graph-data">
                    <button type="button" class="graph-action is-active" data-graph-toggle-labels data-label-mode="auto" aria-pressed="mixed">Labels: auto</button>
                    <button type="button" class="graph-action" data-graph-toggle-physics aria-pressed="false">Live physics</button>
                    <button type="button" class="graph-action" data-graph-fit>Fit</button>
                    <span class="graph-status" data-graph-status-text></span>
                </div>
                <div class="graph-root is-booting" data-graph-json="graph-data">
                    <div class="graph-boot" data-graph-boot role="status" aria-live="polite" aria-busy="true">
                        <span class="graph-boot-spinner" aria-hidden="true"></span>
                        <p>Initialising graph…</p>
                    </div>
                </div>
                <script id="graph-data" type="application/json">${stringifyJson(graph)}</script>
            </section>
        `
    });
}

export function renderPrintHomePage(snapshot: ExportSnapshot): string {
    const currentPath = snapshot.manifest.printHome.path;
    const cards = snapshot.ideas.map(idea => `
        <article class="print-card print-break-avoid">
            <h3>${snapshot.pageOptions.includeIdeaPages ? `<a href="${escapeHtml(exportHref(snapshot, currentPath, idea.page.path))}">${escapeHtml(idea.name)}</a>` : escapeHtml(idea.name)}</h3>
            <p class="subtle">${escapeHtml(idea.fileUri)}</p>
            <p>${renderIdeaSummaryHtml(snapshot, currentPath, idea, '—')}</p>
            ${renderOptionalStatusParagraph(idea)}
            ${renderOptionalTagsParagraph(idea)}
        </article>
    `).join('');
    return renderShell({
        currentPath,
        activeNav: 'print',
        title: `${snapshot.title} - Print`,
        snapshot,
        body: `
            <header class="page-header">
                <p class="eyebrow">Printable report</p>
                <h1>${escapeHtml(snapshot.title)}</h1>
                <p class="subtle">Generated ${escapeHtml(formatDate(snapshot.generatedAt))}</p>
            </header>
            <section class="grid">
                ${renderMetric('Ideas', String(snapshot.counts.ideas))}
                ${renderMetric('References', String(snapshot.counts.edges))}
                ${renderMetric('Files', String(snapshot.counts.files))}
                ${renderMetric('Clusters', String(snapshot.counts.clusters))}
            </section>
            <section class="panel print-break-avoid">
                <h2>Status rollup</h2>
                <div class="scroll-window">${renderDefinitionList(snapshot.byStatus)}</div>
            </section>
            <section class="entity-list">${cards}</section>
        `
    });
}

export function renderPrintIdeaPage(snapshot: ExportSnapshot, idea: ExportIdeaRecord): string {
    const currentPath = idea.page.printablePath ?? snapshot.manifest.printHome.path;
    return renderShell({
        currentPath,
        activeNav: 'print',
        title: `${snapshot.title} - ${idea.name} print`,
        snapshot,
        body: `
            <header class="page-header">
                <p class="eyebrow">Printable idea sheet</p>
                <h1>${escapeHtml(idea.name)}</h1>
                <p class="subtle">${escapeHtml(idea.fileUri)}:${idea.lineStart + 1}</p>
            </header>
            <section class="print-card print-break-avoid">
                <p class="idea-summary">${renderIdeaSummaryHtml(snapshot, currentPath, idea)}</p>
                ${renderOptionalStatusParagraph(idea)}
                ${renderOptionalTagsParagraph(idea)}
                ${snapshot.pageOptions.includeIdeaPages ? `<p><strong>Interactive page:</strong> <a href="${escapeHtml(exportHref(snapshot, currentPath, idea.page.path))}">${escapeHtml(idea.name)}</a></p>` : ''}
            </section>
        `
    });
}

export function renderPrintFilePage(snapshot: ExportSnapshot, file: ExportFileRecord): string {
    const currentPath = file.printPage.path;
    return renderShell({
        currentPath,
        activeNav: 'print',
        title: `${snapshot.title} - ${file.name} print`,
        snapshot,
        body: `
            <header class="page-header">
                <p class="eyebrow">Printable file sheet</p>
                <h1>${escapeHtml(file.name)}</h1>
                <p class="subtle">${escapeHtml(file.fileUri)}</p>
            </header>
            <section class="table-shell">
                <table>
                    <thead><tr><th>Idea</th><th>Status</th><th>Tags</th><th>Summary</th></tr></thead>
                    <tbody>
                        ${file.ideas.map(idea => `
                            <tr>
                                <td>${snapshot.pageOptions.includeIdeaPages ? `<a href="${escapeHtml(exportHref(snapshot, currentPath, idea.page.path))}">${escapeHtml(idea.name)}</a>` : escapeHtml(idea.name)}</td>
                                <td>${renderOptionalStatusCell(idea)}</td>
                                <td>${renderOptionalTagsCell(idea)}</td>
                                <td>${escapeHtml(idea.summary)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </section>
        `
    });
}

export function renderPrintCodeFilePage(snapshot: ExportSnapshot, file: ExportCodeFileRecord): string {
    const currentPath = file.printPage.path;
    const referencingIdeas = file.referencingIdeaIds
        .map(ideaId => snapshot.ideasById[ideaId])
        .filter((idea): idea is ExportIdeaRecord => Boolean(idea));
    return renderShell({
        currentPath,
        activeNav: 'print',
        title: `${snapshot.title} - ${file.name} print`,
        snapshot,
        body: `
            <header class="page-header">
                <p class="eyebrow">Printable code reference sheet</p>
                <h1>${escapeHtml(file.name)}</h1>
                <p class="subtle">${escapeHtml(file.fileUri)}</p>
            </header>
            <section class="table-shell">
                <table>
                    <thead><tr><th>Idea</th><th>Status</th><th>Tags</th><th>Summary</th></tr></thead>
                    <tbody>
                        ${referencingIdeas.map(idea => `
                            <tr>
                                <td>${snapshot.pageOptions.includeIdeaPages ? `<a href="${escapeHtml(exportHref(snapshot, currentPath, idea.page.path))}">${escapeHtml(idea.name)}</a>` : escapeHtml(idea.name)}</td>
                                <td>${renderOptionalStatusCell(idea)}</td>
                                <td>${renderOptionalTagsCell(idea)}</td>
                                <td>${escapeHtml(idea.summary)}</td>
                            </tr>
                        `).join('') || '<tr><td colspan="4" class="subtle">No referencing ideas.</td></tr>'}
                    </tbody>
                </table>
            </section>
        `
    });
}

export function renderPrintClusterPage(snapshot: ExportSnapshot, cluster: ExportClusterRecord): string {
    const currentPath = cluster.page.printablePath ?? snapshot.manifest.printHome.path;
    const members = cluster.ideaIds
        .map(ideaId => snapshot.ideasById[ideaId])
        .filter((idea): idea is ExportIdeaRecord => Boolean(idea));
    return renderShell({
        currentPath,
        activeNav: 'print',
        title: `${snapshot.title} - ${cluster.label} print`,
        snapshot,
        body: `
            <header class="page-header">
                <p class="eyebrow">Printable cluster sheet</p>
                <h1>${escapeHtml(cluster.label)}</h1>
                <p class="subtle">${escapeHtml(cluster.description)}</p>
            </header>
            <section class="table-shell">
                <table>
                    <thead><tr><th>Idea</th><th>File</th><th>Status</th><th>Summary</th></tr></thead>
                    <tbody>
                        ${members.map(idea => `
                            <tr>
                                <td>${snapshot.pageOptions.includeIdeaPages ? `<a href="${escapeHtml(exportHref(snapshot, currentPath, idea.page.path))}">${escapeHtml(idea.name)}</a>` : escapeHtml(idea.name)}</td>
                                <td>${escapeHtml(idea.fileUri)}</td>
                                <td>${renderOptionalStatusCell(idea)}</td>
                                <td>${escapeHtml(idea.summary)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </section>
        `
    });
}

function renderReferenceSection(
    snapshot: ExportSnapshot,
    currentPath: string,
    id: string,
    title: string,
    rows: ExportIdeaRecord['references']['inbound']
): string {
    return `
        <section class="table-shell print-break-avoid" id="${escapeHtml(id)}">
            <div class="toolbar"><h2>${escapeHtml(title)}</h2></div>
            <div class="scroll-window">
                <table>
                    <thead><tr><th>Kind</th><th>Idea</th><th>Path</th><th>Snippet</th></tr></thead>
                    <tbody>
                        ${rows.map(row => {
                            const linked = row.direction === 'inbound'
                                ? snapshot.ideasById[row.sourceIdeaId]
                                : (row.targetIdeaId ? snapshot.ideasById[row.targetIdeaId] : undefined);
                            const label = row.direction === 'inbound' ? row.label || row.targetName : row.targetName;
                            const fileTarget = row.direction === 'outbound' && !linked
                                ? resolveExportFilePage(snapshot, { fileUri: row.targetPath })
                                : undefined;
                            const pathCell = fileTarget && filePageEnabled(snapshot, fileTarget.kind)
                                ? `<a href="${escapeHtml(exportPageHref(snapshot, currentPath, fileTarget.page))}">${escapeHtml(row.targetPath)}</a>`
                                : escapeHtml(row.targetPath);
                            const ideaCell = linked
                                ? renderIdeaAnchor(snapshot, currentPath, linked, linked.name)
                                : (fileTarget && filePageEnabled(snapshot, fileTarget.kind)
                                    ? `<a class="idea-ref idea-ref--file" href="${escapeHtml(exportPageHref(snapshot, currentPath, fileTarget.page))}">${escapeHtml(label)}</a>`
                                    : escapeHtml(label));
                            const snippetCell = row.snippet
                                ? renderTextWithRefsHtml(
                                    snapshot,
                                    currentPath,
                                    row.snippet,
                                    { idea: snapshot.ideasById[row.sourceIdeaId] }
                                )
                                : '—';
                            return `
                                <tr>
                                    <td>${escapeHtml(row.kind)}</td>
                                    <td>${ideaCell}</td>
                                    <td>${pathCell}</td>
                                    <td>${snippetCell}</td>
                                </tr>`;
                        }).join('') || '<tr><td colspan="4" class="subtle">None</td></tr>'}
                    </tbody>
                </table>
            </div>
        </section>
    `;
}

function enrichGraphUrls(snapshot: ExportSnapshot, graph: unknown, _currentPath: string): unknown {
    if (!graph || typeof graph !== 'object') {
        return graph;
    }
    // Use export-root-relative idea.page.url (e.g. ./ideas/...) so nested pages can
    // resolve via resolveExportUrl without dropping path segments like ideas/.
    const copy = structuredClone(graph) as {
        centerId?: string;
        nodes?: Array<Record<string, unknown>>;
    };
    const centerId = typeof copy.centerId === 'string' ? copy.centerId : undefined;
    for (const node of copy.nodes ?? []) {
        const idea = typeof node.id === 'string' ? snapshot.ideasById[node.id] : undefined;
        if (idea) {
            if (snapshot.pageOptions.includeIdeaPages) {
                node.pageUrl = idea.page.url;
            }
            const tags = ideaTags(idea);
            if (tags.length > 0) {
                node.tags = tags;
            } else {
                delete node.tags;
            }
            const status = ideaStatus(idea);
            if (status) {
                node.status = status;
            } else {
                delete node.status;
            }
            node.statusKey = idea.statusKey;
            node.tagsKeys = idea.tagsKeys;
            node.attributes = idea.attributes;
            const attributeKeys = Object.keys(idea.attributes).sort();
            if (attributeKeys.length > 0) {
                node.attributeKeys = attributeKeys;
            } else {
                delete node.attributeKeys;
            }
        } else {
            const fileTarget = resolveExportFilePage(snapshot, {
                id: typeof node.id === 'string' ? node.id : undefined,
                fileUri: typeof node.fileUri === 'string' ? node.fileUri : undefined
            });
            if (fileTarget && filePageEnabled(snapshot, fileTarget.kind)) {
                node.pageUrl = fileTarget.page.url;
            }
        }
        if (centerId && node.id === centerId) {
            node.isSubject = true;
        }
    }
    return copy;
}

function renderIdeaAttributes(snapshot: ExportSnapshot, currentPath: string, idea: ExportIdeaRecord): string {
    const entries = Object.entries(idea.attributes);
    if (entries.length === 0) {
        return '<p class="subtle">No attributes declared.</p>';
    }
    const rows = entries.map(([key, value]) => {
        const attribute = snapshot.attributesByKey[key];
        const href = attribute && snapshot.pageOptions.includeAttributePages
            ? exportPageHref(snapshot, currentPath, attribute.page)
            : `${exportPageHref(snapshot, currentPath, snapshot.manifest.attributesIndex)}#attr-${slugAttributeKey(key)}`;
        return `
            <tr>
                <td><a href="${escapeHtml(href)}">${escapeHtml(key)}</a></td>
                <td>${renderAttributeValueHtml(snapshot, currentPath, value, idea)}</td>
            </tr>`;
    }).join('');
    return `
        <div class="scroll-window">
            <table>
                <thead><tr><th>Key</th><th>Value</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <p class="subtle"><a href="${escapeHtml(exportPageHref(snapshot, currentPath, snapshot.manifest.attributesIndex))}">Browse all attributes</a></p>
    `;
}

function renderShell(options: RenderOptions): string {
    const stylesheetHref = exportHref(options.snapshot, options.currentPath, 'assets/styles.css');
    const appHref = exportHref(options.snapshot, options.currentPath, 'assets/app.js');
    const searchIndexScriptHref = exportHref(options.snapshot, options.currentPath, 'assets/search-index.js');
    const searchHref = exportHref(options.snapshot, options.currentPath, options.snapshot.manifest.dataSearch.path);
    const includeGlobalSearch = options.includeGlobalSearch && options.snapshot.runtimeMode === 'interactive';
    const headerLink = options.snapshot.headerLink
        ? `<a class="brand-link" href="${escapeHtml(options.snapshot.headerLink.href)}">${escapeHtml(options.snapshot.headerLink.label)}</a>`
        : '';
    const navLinks = [
        navLink(options, 'overview', options.snapshot.manifest.home, true),
        navLink(options, 'ideas', options.snapshot.manifest.ideasIndex, true),
        navLink(options, 'files', options.snapshot.manifest.filesIndex, options.snapshot.pageOptions.includeFilePages),
        navLink(options, 'code-files', options.snapshot.manifest.codeFilesIndex, options.snapshot.pageOptions.includeCodeFilePages),
        navLink(options, 'clusters', options.snapshot.manifest.clustersIndex, options.snapshot.pageOptions.includeClusterPages),
        navLink(options, 'attributes', options.snapshot.manifest.attributesIndex, true),
        navLink(options, 'graph', options.snapshot.manifest.graph, options.snapshot.pageOptions.includeGraphPage && options.snapshot.runtimeMode !== 'print'),
        navLink(options, 'print', options.snapshot.manifest.printHome, options.snapshot.pageOptions.includePrintPages)
    ].filter(Boolean).join('');
    const breadcrumbs = options.breadcrumbs?.length
        ? `<nav class="breadcrumbs">${options.breadcrumbs.map(item =>
            item.href ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>` : `<span>${escapeHtml(item.label)}</span>`
        ).join('<span>/</span>')}</nav>`
        : '';
    const interactiveScripts = options.snapshot.runtimeMode === 'print'
        ? ''
        : `
    <script src="${escapeHtml(searchIndexScriptHref)}"></script>
    <script src="${escapeHtml(appHref)}"></script>`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <link rel="stylesheet" href="${escapeHtml(stylesheetHref)}" />
</head>
<body data-runtime-mode="${escapeHtml(options.snapshot.runtimeMode)}" data-search-index="${escapeHtml(searchHref)}">
    <main class="layout">
        <header class="topbar">
            <div class="topbar-inner">
                <div class="nav">${headerLink}${navLinks}</div>
                ${includeGlobalSearch ? `
                    <div>
                        <input class="searchbar" type="search" placeholder="Search ideas, files, clusters, tags, statuses" data-global-search />
                    </div>
                ` : ''}
            </div>
            ${includeGlobalSearch ? '<div class="search-results hidden" data-search-results></div>' : ''}
        </header>
        ${breadcrumbs}
        ${options.body}
    </main>${interactiveScripts}
</body>
</html>`;
}

function navLink(
    options: RenderOptions,
    navId: RenderOptions['activeNav'],
    page: ExportPageInfo,
    enabled: boolean
): string {
    if (!enabled) {
        return '';
    }
    const href = exportPageHref(options.snapshot, options.currentPath, page);
    const activeClass = options.activeNav === navId ? 'active' : '';
    return `<a class="${activeClass}" href="${escapeHtml(href)}">${escapeHtml(page.title)}</a>`;
}

function renderMaybeLinkedCard(enabled: boolean, href: string, title: string, subtitle: string): string {
    return enabled
        ? `<a class="entity-card" href="${escapeHtml(href)}"><strong>${escapeHtml(title)}</strong><p class="subtle">${escapeHtml(subtitle)}</p></a>`
        : `<div class="entity-card"><strong>${escapeHtml(title)}</strong><p class="subtle">${escapeHtml(subtitle)}</p></div>`;
}

function renderIdeaAnchor(snapshot: ExportSnapshot, currentPath: string, idea: ExportIdeaRecord, label: string): string {
    return snapshot.pageOptions.includeIdeaPages
        ? `<a href="${escapeHtml(exportPageHref(snapshot, currentPath, idea.page))}">${escapeHtml(label)}</a>`
        : escapeHtml(label);
}
