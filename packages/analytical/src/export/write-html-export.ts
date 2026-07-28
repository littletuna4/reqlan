import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExportRequest, ExportResult, ExportSnapshot } from './types.js';

export async function writeHtmlExport(
    snapshot: ExportSnapshot,
    request: ExportRequest
): Promise<ExportResult> {
    const outputDir = join(request.outputDir, request.exportName);
    const assetsDir = join(outputDir, 'assets');
    const dataDir = join(outputDir, 'data');
    await mkdir(assetsDir, { recursive: true });
    await mkdir(dataDir, { recursive: true });

    const printFileName = ensureHtmlFileName(request.printEntryFileName);
    const indexFilePath = join(outputDir, 'index.html');
    const printFilePath = join(outputDir, printFileName);
    const requirementsFilePath = request.includeRequirementsPage
        ? join(outputDir, 'requirements.html')
        : undefined;
    const graphFilePath = request.includeGraphPage
        ? join(outputDir, 'graph.html')
        : undefined;
    const dataFilePath = join(dataDir, 'export.json');

    await Promise.all([
        writeFile(join(assetsDir, 'styles.css'), SHARED_STYLES, 'utf8'),
        writeFile(join(assetsDir, 'graph.js'), GRAPH_JS, 'utf8'),
        writeFile(dataFilePath, stringifyJson(snapshot), 'utf8'),
        writeFile(join(dataDir, 'graph.json'), stringifyJson(snapshot.graph), 'utf8'),
        writeFile(indexFilePath, renderIndexPage(snapshot, request, printFileName), 'utf8'),
        writeFile(printFilePath, renderPrintPage(snapshot), 'utf8'),
        requirementsFilePath
            ? writeFile(requirementsFilePath, renderRequirementsPage(snapshot), 'utf8')
            : Promise.resolve(),
        graphFilePath
            ? writeFile(graphFilePath, renderGraphPage(snapshot), 'utf8')
            : Promise.resolve()
    ]);

    return {
        outputDir,
        indexFilePath,
        printFilePath,
        requirementsFilePath,
        graphFilePath,
        dataFilePath
    };
}

function renderIndexPage(snapshot: ExportSnapshot, request: ExportRequest, printFileName: string): string {
    const links = [
        `<li><a href="./${escapeHtml(printFileName)}">Printable report</a></li>`,
        request.includeRequirementsPage ? '<li><a href="./requirements.html">Requirements</a></li>' : '',
        request.includeGraphPage ? '<li><a href="./graph.html">Graph</a></li>' : '',
        '<li><a href="./data/export.json">Export data (JSON)</a></li>'
    ].filter(Boolean).join('');

    return renderDocument(snapshot.title, `
        <header class="hero">
            <div>
                <p class="eyebrow">Reqlan export</p>
                <h1>${escapeHtml(snapshot.title)}</h1>
                <p class="subtle">Template: ${escapeHtml(snapshot.templateId)} | Scope: ${escapeHtml(snapshot.scope)}</p>
            </div>
            <div class="card">
                <p><strong>Generated</strong></p>
                <p>${escapeHtml(formatDate(snapshot.generatedAt))}</p>
                <p><strong>Workspace</strong></p>
                <p>${escapeHtml(snapshot.workspaceRoot)}</p>
            </div>
        </header>
        <section class="grid">
            ${renderMetric('Requirements', String(snapshot.counts.ideas))}
            ${renderMetric('References', String(snapshot.counts.edges))}
            ${renderMetric('Files', String(snapshot.counts.files))}
        </section>
        <section class="panel">
            <h2>Pages</h2>
            <ul>${links}</ul>
        </section>
        <section class="split">
            <div class="panel">
                <h2>Status rollup</h2>
                ${renderDefinitionList(snapshot.byStatus)}
            </div>
            <div class="panel">
                <h2>Tags</h2>
                ${renderDefinitionList(snapshot.byTag)}
            </div>
        </section>
        <section class="panel">
            <h2>Files</h2>
            <ul class="file-list">${snapshot.files.map(file => `<li>${escapeHtml(file)}</li>`).join('')}</ul>
        </section>
    `);
}

function renderRequirementsPage(snapshot: ExportSnapshot): string {
    const rows = snapshot.ideas.map(idea => `
        <tr>
            <td><strong>${escapeHtml(idea.name)}</strong></td>
            <td>${escapeHtml(idea.fileUri)}</td>
            <td>${escapeHtml(idea.status ?? 'unspecified')}</td>
            <td>${escapeHtml(idea.tags.join(', ') || '—')}</td>
            <td>${escapeHtml(idea.summary || '—')}</td>
        </tr>
    `).join('');

    return renderDocument(`${snapshot.title} - Requirements`, `
        <header class="page-header">
            <h1>${escapeHtml(snapshot.title)}</h1>
            <p class="subtle">Requirement listing</p>
        </header>
        <section class="panel">
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Path</th>
                        <th>Status</th>
                        <th>Tags</th>
                        <th>Summary</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </section>
    `);
}

function renderGraphPage(snapshot: ExportSnapshot): string {
    return renderDocument(`${snapshot.title} - Graph`, `
        <header class="page-header">
            <h1>${escapeHtml(snapshot.title)}</h1>
            <p class="subtle">Graph view (${snapshot.graph.nodes.length} nodes, ${snapshot.graph.edges.length} edges)</p>
        </header>
        <section class="panel">
            <div id="graph-root" class="graph-root"></div>
        </section>
        <section class="split">
            <div class="panel">
                <h2>Nodes</h2>
                <ul>${snapshot.graph.nodes.map(node => `
                    <li><strong>${escapeHtml(node.name)}</strong> <span class="subtle">(${escapeHtml(node.kind)})</span></li>
                `).join('')}</ul>
            </div>
            <div class="panel">
                <h2>Edges</h2>
                <ul>${snapshot.graph.edges.map(edge => `
                    <li>${escapeHtml(edge.sourceId)} -> ${escapeHtml(edge.targetId)} <span class="subtle">(${escapeHtml(edge.kind)})</span></li>
                `).join('')}</ul>
            </div>
        </section>
        <script id="graph-data" type="application/json">${stringifyJson(snapshot.graph)}</script>
        <script type="module" src="./assets/graph.js"></script>
    `);
}

function renderPrintPage(snapshot: ExportSnapshot): string {
    return renderDocument(`${snapshot.title} - Print`, `
        <header class="page-header">
            <h1>${escapeHtml(snapshot.title)}</h1>
            <p class="subtle">Printable report | Generated ${escapeHtml(formatDate(snapshot.generatedAt))}</p>
        </header>
        <section class="panel print-break-avoid">
            <h2>Overview</h2>
            <div class="grid">
                ${renderMetric('Requirements', String(snapshot.counts.ideas))}
                ${renderMetric('References', String(snapshot.counts.edges))}
                ${renderMetric('Files', String(snapshot.counts.files))}
            </div>
        </section>
        <section class="panel print-break-avoid">
            <h2>Status rollup</h2>
            ${renderDefinitionList(snapshot.byStatus)}
        </section>
        <section class="panel">
            <h2>Requirements</h2>
            <div class="requirement-list">
                ${snapshot.ideas.map(idea => `
                    <article class="requirement-card print-break-avoid">
                        <h3>${escapeHtml(idea.name)}</h3>
                        <p class="subtle">${escapeHtml(idea.fileUri)}</p>
                        <p>${escapeHtml(idea.summary || '—')}</p>
                        <p><strong>Status:</strong> ${escapeHtml(idea.status ?? 'unspecified')}</p>
                        <p><strong>Tags:</strong> ${escapeHtml(idea.tags.join(', ') || '—')}</p>
                    </article>
                `).join('')}
            </div>
        </section>
    `);
}

function renderMetric(label: string, value: string): string {
    return `
        <article class="metric">
            <span class="metric-label">${escapeHtml(label)}</span>
            <strong class="metric-value">${escapeHtml(value)}</strong>
        </article>
    `;
}

function renderDefinitionList(values: Record<string, number>): string {
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

function renderDocument(title: string, body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="./assets/styles.css" />
</head>
<body>
    <main class="layout">
        ${body}
    </main>
</body>
</html>`;
}

function formatDate(value: string): string {
    return new Date(value).toLocaleString('en-AU', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function stringifyJson(value: unknown): string {
    return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}

function ensureHtmlFileName(value: string): string {
    const trimmed = value.trim();
    if (trimmed.toLowerCase().endsWith('.html')) {
        return trimmed;
    }
    return `${trimmed}.html`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const SHARED_STYLES = `
:root {
    color-scheme: light dark;
    font-family: Inter, Arial, sans-serif;
}
body {
    margin: 0;
    background: #0f172a;
    color: #e2e8f0;
}
a {
    color: #7dd3fc;
}
table {
    width: 100%;
    border-collapse: collapse;
}
th, td {
    padding: 0.6rem;
    text-align: left;
    border-bottom: 1px solid rgba(148, 163, 184, 0.25);
    vertical-align: top;
}
.layout {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
}
.hero, .split {
    display: grid;
    gap: 1rem;
}
.hero {
    grid-template-columns: 2fr 1fr;
    margin-bottom: 1.5rem;
}
.split {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
}
.panel, .metric, .card {
    background: rgba(15, 23, 42, 0.65);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 12px;
    padding: 1rem;
}
.metric {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
}
.metric-label, .subtle, .eyebrow {
    color: #94a3b8;
}
.metric-value {
    font-size: 1.7rem;
}
.eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.75rem;
}
.page-header {
    margin-bottom: 1rem;
}
.rollup-list {
    display: grid;
    gap: 0.5rem;
}
.rollup-list div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    padding-bottom: 0.4rem;
}
.rollup-list dt {
    font-weight: 600;
}
.rollup-list dd {
    margin: 0;
}
.file-list, .requirement-list {
    display: grid;
    gap: 0.75rem;
}
.requirement-card {
    padding: 0.75rem 1rem;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 10px;
}
.graph-root svg {
    width: 100%;
    min-height: 560px;
    background: rgba(2, 6, 23, 0.45);
    border-radius: 12px;
}
.graph-edge {
    stroke: rgba(148, 163, 184, 0.55);
    stroke-width: 1.5;
}
.graph-node circle {
    fill: #0ea5e9;
}
.graph-node.external circle {
    fill: #f59e0b;
}
.graph-node text {
    fill: #e2e8f0;
    font-size: 12px;
}
@media print {
    body {
        background: white;
        color: black;
    }
    a {
        color: black;
    }
    .panel, .metric, .card, .requirement-card {
        background: white;
        border-color: #cbd5e1;
    }
    .print-break-avoid {
        break-inside: avoid;
    }
}
`;

const GRAPH_JS = `
const dataElement = document.getElementById('graph-data');
const root = document.getElementById('graph-root');
if (dataElement && root) {
    const graph = JSON.parse(dataElement.textContent || '{}');
    const width = 1100;
    const height = 640;
    const radius = Math.min(width, height) * 0.34;
    const centerX = width / 2;
    const centerY = height / 2;
    const positions = new Map();
    const nodes = graph.nodes || [];
    nodes.forEach((node, index) => {
        const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1);
        positions.set(node.id, {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius
        });
    });
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 1100 640');
    for (const edge of graph.edges || []) {
        const source = positions.get(edge.sourceId);
        const target = positions.get(edge.targetId);
        if (!source || !target) continue;
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', source.x);
        line.setAttribute('y1', source.y);
        line.setAttribute('x2', target.x);
        line.setAttribute('y2', target.y);
        line.setAttribute('class', 'graph-edge');
        svg.appendChild(line);
    }
    for (const node of nodes) {
        const position = positions.get(node.id);
        if (!position) continue;
        const group = document.createElementNS(ns, 'g');
        group.setAttribute('class', node.isExternal ? 'graph-node external' : 'graph-node');
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', position.x);
        circle.setAttribute('cy', position.y);
        circle.setAttribute('r', 16);
        const text = document.createElementNS(ns, 'text');
        text.setAttribute('x', position.x + 22);
        text.setAttribute('y', position.y + 4);
        text.textContent = node.name;
        group.appendChild(circle);
        group.appendChild(text);
        svg.appendChild(group);
    }
    root.appendChild(svg);
}
`;
