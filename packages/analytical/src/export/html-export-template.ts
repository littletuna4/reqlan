import type {
    ExportClusterRecord,
    ExportFileRecord,
    ExportIdeaRecord,
    ExportPageInfo,
    ExportSnapshot
} from './types.js';
import {
    escapeHtml,
    fileByIdea,
    formatDate,
    hrefFor,
    pageHref,
    relatedClusters,
    renderDefinitionList,
    renderMetric,
    stringifyJson
} from './html-export-utils.js';

interface RenderOptions {
    currentPath: string;
    activeNav: 'overview' | 'ideas' | 'files' | 'clusters' | 'graph' | 'print';
    title: string;
    body: string;
    snapshot: ExportSnapshot;
    breadcrumbs?: Array<{ label: string; href?: string }>;
    includeGlobalSearch?: boolean;
}

export function renderHomePage(snapshot: ExportSnapshot): string {
    const currentPath = snapshot.manifest.home.path;
    const highlightClusters = snapshot.clusters.slice(0, 8).map(cluster => `
        <a class="entity-card" href="${escapeHtml(pageHref(currentPath, cluster.page))}">
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
            ${renderMetric('Ideas', String(snapshot.counts.ideas), pageHref(currentPath, snapshot.manifest.ideasIndex))}
            ${renderMetric('References', String(snapshot.counts.edges), pageHref(currentPath, snapshot.manifest.graph))}
            ${renderMetric('Files', String(snapshot.counts.files), pageHref(currentPath, snapshot.manifest.filesIndex))}
            ${renderMetric('Clusters', String(snapshot.counts.clusters), pageHref(currentPath, snapshot.manifest.clustersIndex))}
        </section>
        <section class="split">
            <div class="panel">
                <h2>Status Rollup</h2>
                ${renderDefinitionList(snapshot.byStatus)}
            </div>
            <div class="panel">
                <h2>Tags</h2>
                ${renderDefinitionList(snapshot.byTag)}
            </div>
        </section>
        <section class="panel">
            <div class="toolbar">
                <h2>Highlighted Clusters</h2>
                <div class="actions">
                    <a class="pill" href="${escapeHtml(pageHref(currentPath, snapshot.manifest.printHome))}">Printable report</a>
                    <a class="pill" href="${escapeHtml(pageHref(currentPath, snapshot.manifest.dataExport))}">Snapshot JSON</a>
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
        <tr data-filter-row="ideas" data-filter-text="${escapeHtml([idea.name, idea.summary, idea.status ?? '', idea.tags.join(' '), idea.fileUri].join(' '))}">
            <td><strong>${renderIdeaAnchor(snapshot, currentPath, idea, idea.name)}</strong></td>
            <td>${escapeHtml(idea.fileUri)}</td>
            <td>${escapeHtml(idea.status ?? 'unspecified')}</td>
            <td>${escapeHtml(idea.tags.join(', ') || '—')}</td>
            <td>${escapeHtml(idea.summary || '—')}</td>
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
            <td><strong>${snapshot.pageOptions.includeFilePages ? `<a href="${escapeHtml(pageHref(currentPath, file.page))}">${escapeHtml(file.name)}</a>` : escapeHtml(file.name)}</strong></td>
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

export function renderClustersIndexPage(snapshot: ExportSnapshot): string {
    const currentPath = snapshot.manifest.clustersIndex.path;
    const rows = snapshot.clusters.map(cluster => `
        <tr data-filter-row="clusters" data-filter-text="${escapeHtml([cluster.label, cluster.kind, cluster.description].join(' '))}">
            <td><strong>${snapshot.pageOptions.includeClusterPages ? `<a href="${escapeHtml(pageHref(currentPath, cluster.page))}">${escapeHtml(cluster.label)}</a>` : escapeHtml(cluster.label)}</strong></td>
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

export function renderGraphPage(snapshot: ExportSnapshot): string {
    const currentPath = snapshot.manifest.graph.path;
    const graph = enrichGraphUrls(snapshot, snapshot.graphs.workspace, currentPath);
    const statuses = Object.keys(snapshot.byStatus).sort();
    const tags = Object.keys(snapshot.byTag).sort();
    const clusters = snapshot.clusters.slice(0, 16).map(cluster =>
        snapshot.pageOptions.includeClusterPages
            ? `<a class="pill" href="${escapeHtml(pageHref(currentPath, cluster.page))}">${escapeHtml(cluster.label)}</a>`
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
                        <a class="pill" href="${escapeHtml(pageHref(currentPath, snapshot.manifest.dataGraph))}">Graph JSON</a>
                    </div>
                </div>
                <div class="graph-controls-bar" data-graph-controls="graph-data">
                    <input class="searchbar graph-filter" type="search" placeholder="Search graph nodes" data-graph-search />
                    <input class="searchbar graph-filter" type="search" placeholder="Path filter" data-graph-path />
                    <select class="graph-filter" data-graph-status>
                        <option value="">All statuses</option>
                        ${statuses.map(status => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join('')}
                    </select>
                    <select class="graph-filter" data-graph-tag>
                        <option value="">All tags</option>
                        ${tags.map(tag => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join('')}
                    </select>
                    <button type="button" class="graph-action" data-graph-toggle-external="true">Hide external</button>
                    <button type="button" class="graph-action" data-graph-reset>Reset</button>
                    <span class="graph-status" data-graph-status-text></span>
                </div>
                <div class="pill-row">${clusters}</div>
                <div class="graph-root" data-graph-json="graph-data"></div>
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
            { label: 'Ideas', href: pageHref(currentPath, snapshot.manifest.ideasIndex) },
            { label: idea.name }
        ],
        body: `
            <header class="page-header">
                <p class="eyebrow">Idea detail</p>
                <h1 id="summary">${escapeHtml(idea.name)}</h1>
                <p class="subtle">${escapeHtml(idea.fileUri)}:${idea.lineStart + 1}</p>
                <div class="pill-row">
                    <span class="pill">${escapeHtml(idea.kind)}</span>
                    <span class="pill">${escapeHtml(idea.status ?? 'unspecified')}</span>
                    ${idea.tags.map(tag => `<span class="pill">${escapeHtml(tag)}</span>`).join('')}
                </div>
            </header>
            <section class="detail-grid">
                <div class="panel prose print-break-avoid">
                    <h2>Summary</h2>
                    <p>${escapeHtml(idea.summary || 'No summary provided.')}</p>
                    <p><a class="section-link" href="#references-out">Jump to outbound references</a></p>
                    <p><a class="section-link" href="#references-in">Jump to inbound references</a></p>
                </div>
                <div class="panel print-break-avoid">
                    <h2>Navigation</h2>
                    <div class="entity-list">
                        ${parentFile ? renderMaybeLinkedCard(snapshot.pageOptions.includeFilePages, pageHref(currentPath, parentFile.page), 'Source file', parentFile.fileUri) : ''}
                        ${clusters.map(cluster => renderMaybeLinkedCard(snapshot.pageOptions.includeClusterPages, pageHref(currentPath, cluster.page), cluster.label, `${cluster.kind} cluster`)).join('')}
                        ${idea.page.printablePath && snapshot.pageOptions.includePrintPages ? `<a class="entity-card" href="${escapeHtml(hrefFor(currentPath, idea.page.printablePath))}"><strong>Printable page</strong><p class="subtle">Static print-friendly idea sheet.</p></a>` : ''}
                    </div>
                </div>
            </section>
            <section class="split">
                <div class="panel print-break-avoid" id="attributes">
                    <h2>Attributes</h2>
                    <pre class="code-like">${escapeHtml(stringifyJson(idea.attributes))}</pre>
                </div>
                <div class="panel print-break-avoid">
                    <h2>Ancestor context</h2>
                    <div class="entity-list">
                        ${idea.ancestors.ancestors.map(ancestor => {
                            const linked = snapshot.ideasById[ancestor.id];
                            return linked
                                ? renderMaybeLinkedCard(snapshot.pageOptions.includeIdeaPages, pageHref(currentPath, linked.page), ancestor.name, ancestor.summary)
                                : '';
                        }).join('') || '<p class="subtle">No ancestor chain recorded.</p>'}
                    </div>
                </div>
            </section>
            ${renderReferenceSection(snapshot, currentPath, 'references-out', 'Outbound references', idea.references.outbound)}
            ${renderReferenceSection(snapshot, currentPath, 'references-in', 'Inbound references', idea.references.inbound)}
            ${renderReferenceSection(snapshot, currentPath, 'references-unresolved', 'Unresolved references', idea.references.unresolved)}
            <section class="graph-shell print-break-avoid" id="graph">
                <div class="toolbar"><h2>Local graph</h2></div>
                <div class="graph-root" data-graph-json="graph-data"></div>
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
            { label: 'Files', href: pageHref(currentPath, snapshot.manifest.filesIndex) },
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
                    <table>
                        <thead><tr><th>Idea</th><th>Status</th><th>Tags</th><th>Summary</th></tr></thead>
                        <tbody>
                            ${file.ideas.map(idea => `
                                <tr data-filter-row="fileIdeas" data-filter-text="${escapeHtml([idea.name, idea.summary, idea.status ?? '', idea.tags.join(' ')].join(' '))}">
                                    <td>${renderIdeaAnchor(snapshot, currentPath, idea, idea.name)}</td>
                                    <td>${escapeHtml(idea.status ?? 'unspecified')}</td>
                                    <td>${escapeHtml(idea.tags.join(', ') || '—')}</td>
                                    <td>${escapeHtml(idea.summary)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="panel">
                    <h2>Related clusters</h2>
                    <div class="entity-list">
                        ${clusterLinks.map(cluster => renderMaybeLinkedCard(snapshot.pageOptions.includeClusterPages, pageHref(currentPath, cluster.page), cluster.label, cluster.kind)).join('') || '<p class="subtle">No related clusters.</p>'}
                    </div>
                </div>
            </section>
            <section class="graph-shell print-break-avoid">
                <div class="toolbar"><h2>Local graph</h2></div>
                <div class="graph-root" data-graph-json="graph-data"></div>
                <script id="graph-data" type="application/json">${stringifyJson(graph)}</script>
            </section>
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
            { label: 'Clusters', href: pageHref(currentPath, snapshot.manifest.clustersIndex) },
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
                <table>
                    <thead><tr><th>Idea</th><th>File</th><th>Status</th><th>Summary</th></tr></thead>
                    <tbody>
                        ${members.map(idea => `
                            <tr data-filter-row="clusterIdeas" data-filter-text="${escapeHtml([idea.name, idea.fileUri, idea.status ?? '', idea.summary].join(' '))}">
                                <td>${renderIdeaAnchor(snapshot, currentPath, idea, idea.name)}</td>
                                <td>${escapeHtml(idea.fileUri)}</td>
                                <td>${escapeHtml(idea.status ?? 'unspecified')}</td>
                                <td>${escapeHtml(idea.summary)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </section>
            <section class="graph-shell print-break-avoid">
                <div class="toolbar"><h2>Cluster graph</h2></div>
                <div class="graph-root" data-graph-json="graph-data"></div>
                <script id="graph-data" type="application/json">${stringifyJson(graph)}</script>
            </section>
        `
    });
}

export function renderPrintHomePage(snapshot: ExportSnapshot): string {
    const currentPath = snapshot.manifest.printHome.path;
    const cards = snapshot.ideas.map(idea => `
        <article class="print-card print-break-avoid">
            <h3>${snapshot.pageOptions.includeIdeaPages ? `<a href="${escapeHtml(hrefFor(currentPath, idea.page.path))}">${escapeHtml(idea.name)}</a>` : escapeHtml(idea.name)}</h3>
            <p class="subtle">${escapeHtml(idea.fileUri)}</p>
            <p>${escapeHtml(idea.summary || '—')}</p>
            <p><strong>Status:</strong> ${escapeHtml(idea.status ?? 'unspecified')}</p>
            <p><strong>Tags:</strong> ${escapeHtml(idea.tags.join(', ') || '—')}</p>
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
                ${renderDefinitionList(snapshot.byStatus)}
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
                <p>${escapeHtml(idea.summary || 'No summary provided.')}</p>
                <p><strong>Status:</strong> ${escapeHtml(idea.status ?? 'unspecified')}</p>
                <p><strong>Tags:</strong> ${escapeHtml(idea.tags.join(', ') || '—')}</p>
                ${snapshot.pageOptions.includeIdeaPages ? `<p><strong>Interactive page:</strong> <a href="${escapeHtml(hrefFor(currentPath, idea.page.path))}">${escapeHtml(idea.name)}</a></p>` : ''}
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
                                <td>${snapshot.pageOptions.includeIdeaPages ? `<a href="${escapeHtml(hrefFor(currentPath, idea.page.path))}">${escapeHtml(idea.name)}</a>` : escapeHtml(idea.name)}</td>
                                <td>${escapeHtml(idea.status ?? 'unspecified')}</td>
                                <td>${escapeHtml(idea.tags.join(', ') || '—')}</td>
                                <td>${escapeHtml(idea.summary)}</td>
                            </tr>
                        `).join('')}
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
                                <td>${snapshot.pageOptions.includeIdeaPages ? `<a href="${escapeHtml(hrefFor(currentPath, idea.page.path))}">${escapeHtml(idea.name)}</a>` : escapeHtml(idea.name)}</td>
                                <td>${escapeHtml(idea.fileUri)}</td>
                                <td>${escapeHtml(idea.status ?? 'unspecified')}</td>
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
            <table>
                <thead><tr><th>Kind</th><th>Idea</th><th>Path</th><th>Snippet</th></tr></thead>
                <tbody>
                    ${rows.map(row => {
                        const linked = row.direction === 'inbound'
                            ? snapshot.ideasById[row.sourceIdeaId]
                            : (row.targetIdeaId ? snapshot.ideasById[row.targetIdeaId] : undefined);
                        const label = row.direction === 'inbound' ? row.label || row.targetName : row.targetName;
                        return `
                            <tr>
                                <td>${escapeHtml(row.kind)}</td>
                                <td>${linked ? renderIdeaAnchor(snapshot, currentPath, linked, linked.name) : escapeHtml(label)}</td>
                                <td>${escapeHtml(row.targetPath)}</td>
                                <td>${escapeHtml(row.snippet || '—')}</td>
                            </tr>
                        `;
                    }).join('') || '<tr><td colspan="4" class="subtle">No references.</td></tr>'}
                </tbody>
            </table>
        </section>
    `;
}

function enrichGraphUrls(snapshot: ExportSnapshot, graph: unknown, currentPath: string): unknown {
    if (!graph || typeof graph !== 'object') {
        return graph;
    }
    const copy = structuredClone(graph) as { nodes?: Array<Record<string, unknown>> };
    for (const node of copy.nodes ?? []) {
        const idea = typeof node.id === 'string' ? snapshot.ideasById[node.id] : undefined;
        if (idea && snapshot.pageOptions.includeIdeaPages) {
            node.pageUrl = pageHref(currentPath, idea.page);
        }
    }
    return copy;
}

function renderShell(options: RenderOptions): string {
    const stylesheetHref = hrefFor(options.currentPath, 'assets/styles.css');
    const appHref = hrefFor(options.currentPath, 'assets/app.js');
    const searchHref = hrefFor(options.currentPath, options.snapshot.manifest.dataSearch.path);
    const includeGlobalSearch = options.includeGlobalSearch && options.snapshot.runtimeMode === 'interactive';
    const navLinks = [
        navLink(options, 'overview', options.snapshot.manifest.home, true),
        navLink(options, 'ideas', options.snapshot.manifest.ideasIndex, true),
        navLink(options, 'files', options.snapshot.manifest.filesIndex, options.snapshot.pageOptions.includeFilePages),
        navLink(options, 'clusters', options.snapshot.manifest.clustersIndex, options.snapshot.pageOptions.includeClusterPages),
        navLink(options, 'graph', options.snapshot.manifest.graph, options.snapshot.pageOptions.includeGraphPage && options.snapshot.runtimeMode !== 'print'),
        navLink(options, 'print', options.snapshot.manifest.printHome, options.snapshot.pageOptions.includePrintPages)
    ].filter(Boolean).join('');
    const breadcrumbs = options.breadcrumbs?.length
        ? `<nav class="breadcrumbs">${options.breadcrumbs.map(item =>
            item.href ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>` : `<span>${escapeHtml(item.label)}</span>`
        ).join('<span>/</span>')}</nav>`
        : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <link rel="stylesheet" href="${escapeHtml(stylesheetHref)}" />
</head>
<body data-search-index="${escapeHtml(searchHref)}">
    <main class="layout">
        <header class="topbar">
            <div class="topbar-inner">
                <div class="nav">${navLinks}</div>
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
    </main>
    ${options.snapshot.runtimeMode === 'print' ? '' : `<script type="module" src="${escapeHtml(appHref)}"></script>`}
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
    const href = pageHref(options.currentPath, page);
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
        ? `<a href="${escapeHtml(pageHref(currentPath, idea.page))}">${escapeHtml(label)}</a>`
        : escapeHtml(label);
}
