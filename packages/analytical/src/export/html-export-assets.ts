export const SHARED_STYLES = `
:root {
    color-scheme: dark;
    --bg: #07111f;
    --bg-elev: rgba(15, 23, 42, 0.9);
    --bg-soft: rgba(15, 23, 42, 0.6);
    --fg: #e5eefb;
    --muted: #9eb1c9;
    --line: rgba(148, 163, 184, 0.22);
    --accent: #67e8f9;
    --accent-strong: #38bdf8;
    --good: #4ade80;
    --warn: #fbbf24;
    --bad: #fb7185;
    font-family: Inter, Arial, sans-serif;
}
* { box-sizing: border-box; }
body {
    margin: 0;
    background:
        radial-gradient(circle at top left, rgba(56, 189, 248, 0.16), transparent 30%),
        radial-gradient(circle at top right, rgba(103, 232, 249, 0.10), transparent 28%),
        var(--bg);
    color: var(--fg);
}
a { color: var(--accent); text-decoration: none; }
a:hover { color: var(--accent-strong); }
main.layout { max-width: 1360px; margin: 0 auto; padding: 1.5rem; }
.topbar {
    position: sticky; top: 0; z-index: 10; backdrop-filter: blur(18px);
    background: rgba(7, 17, 31, 0.82); border-bottom: 1px solid var(--line); margin: 0 -1.5rem 1.5rem;
    padding: 0.9rem 1.5rem;
}
.topbar-inner, .hero, .split, .grid, .detail-grid { display: grid; gap: 1rem; }
.topbar-inner { grid-template-columns: 1.3fr auto; align-items: center; }
.nav { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
.nav a { padding: 0.45rem 0.75rem; border-radius: 999px; background: rgba(30, 41, 59, 0.7); }
.nav a.active { background: rgba(56, 189, 248, 0.18); color: white; }
.hero { grid-template-columns: 2fr 1fr; margin-bottom: 1.5rem; }
.grid { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.split, .detail-grid { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
.panel, .metric, .card, .table-shell, .graph-shell, .print-card, .search-result {
    background: var(--bg-soft);
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: 0 14px 40px rgba(2, 6, 23, 0.22);
}
.panel, .card, .table-shell, .graph-shell, .print-card, .search-result { padding: 1rem 1.1rem; }
.metric { padding: 0; overflow: hidden; }
.metric-link, .metric > span, .metric > strong {
    display: flex; flex-direction: column; gap: 0.35rem; padding: 1rem; color: inherit;
}
.metric-label, .subtle, .eyebrow, .breadcrumbs { color: var(--muted); }
.metric-value { font-size: 1.75rem; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.75rem; }
.page-header { margin-bottom: 1rem; }
.toolbar {
    display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; justify-content: space-between;
    margin-bottom: 0.9rem;
}
.toolbar .actions, .pill-row, .breadcrumbs { display: flex; gap: 0.55rem; flex-wrap: wrap; align-items: center; }
.chip, .pill {
    display: inline-flex; align-items: center; gap: 0.35rem;
    padding: 0.28rem 0.6rem; border-radius: 999px;
    border: 1px solid var(--line); background: rgba(30, 41, 59, 0.6);
}
.graph-controls-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    align-items: center;
    margin-bottom: 0.9rem;
    padding: 0.8rem;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: rgba(2, 6, 23, 0.34);
}
.graph-filter {
    flex: 1 1 180px;
    min-width: 160px;
}
.graph-action {
    border: 1px solid rgba(125, 211, 252, 0.18);
    background: rgba(30, 41, 59, 0.7);
    color: var(--fg);
    border-radius: 999px;
    padding: 0.7rem 0.9rem;
    cursor: pointer;
}
.graph-action.is-active {
    background: rgba(56, 189, 248, 0.18);
    color: white;
}
.graph-status {
    color: var(--muted);
    font-size: 0.92rem;
    margin-left: auto;
}
.searchbar, select, input[type="search"] {
    width: min(100%, 440px); background: rgba(2, 6, 23, 0.5); color: var(--fg);
    border: 1px solid rgba(125, 211, 252, 0.18); border-radius: 12px; padding: 0.75rem 0.9rem;
}
table { width: 100%; border-collapse: collapse; }
th, td {
    padding: 0.75rem 0.65rem; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top;
}
th { color: #cfe1f6; font-size: 0.94rem; }
tbody tr:hover { background: rgba(15, 23, 42, 0.45); }
.table-shell { overflow-x: auto; }
.entity-list { display: grid; gap: 0.85rem; }
.entity-card {
    border: 1px solid var(--line); border-radius: 14px; padding: 0.9rem 1rem; background: rgba(2, 6, 23, 0.28);
}
.entity-card h3, .panel h2, .table-shell h2, .graph-shell h2 { margin-top: 0; }
.rollup-list { display: grid; gap: 0.5rem; }
.rollup-list div {
    display: flex; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--line); padding-bottom: 0.4rem;
}
.rollup-list dd { margin: 0; }
.graph-root svg {
    width: 100%; min-height: 620px; background: rgba(2, 6, 23, 0.55); border-radius: 14px;
}
.graph-root line { stroke: rgba(148, 163, 184, 0.35); stroke-width: 1.2; }
.graph-root circle { fill: #0ea5e9; stroke: rgba(255,255,255,0.4); stroke-width: 1; }
.graph-root .external circle { fill: #f59e0b; }
.graph-root text { fill: var(--fg); font-size: 12px; }
.search-results { display: grid; gap: 0.7rem; margin-top: 1rem; }
.hidden { display: none !important; }
.breadcrumbs { margin-bottom: 0.65rem; }
.breadcrumbs a { color: var(--muted); }
.section-link { font-size: 0.92rem; }
.prose p { line-height: 1.55; }
pre.code-like {
    white-space: pre-wrap; padding: 0.9rem; border-radius: 12px;
    background: rgba(2, 6, 23, 0.5); border: 1px solid var(--line);
}
@media (max-width: 900px) {
    .hero, .topbar-inner { grid-template-columns: 1fr; }
}
@media print {
    :root { color-scheme: light; }
    body { background: white; color: black; }
    .topbar, .searchbar, .toolbar .actions, .graph-shell .toolbar, .hide-on-print { display: none !important; }
    .panel, .metric, .card, .table-shell, .graph-shell, .print-card, .search-result, .entity-card {
        background: white; color: black; border-color: #cbd5e1; box-shadow: none;
    }
    a { color: black; text-decoration: underline; }
    .print-break-avoid { break-inside: avoid; }
}
`;

export const APP_JS = `
const searchIndexByRoot = new WeakMap();

async function loadSearchIndex(root) {
    if (searchIndexByRoot.has(root)) return searchIndexByRoot.get(root);
    const url = root.dataset.searchIndex;
    if (!url) return [];
    const loaded = fetch(url).then(response => response.json()).catch(() => []);
    searchIndexByRoot.set(root, loaded);
    return loaded;
}

function lower(value) {
    return String(value || '').toLowerCase();
}

function scoreDocument(doc, query) {
    const haystack = [
        doc.title,
        doc.summary,
        ...(doc.tags || []),
        ...(doc.pathTokens || []),
        ...(doc.keywords || [])
    ].map(lower).join(' ');
    return haystack.includes(query) ? haystack.indexOf(query) : -1;
}

async function wireGlobalSearch(root) {
    const input = root.querySelector('[data-global-search]');
    const results = root.querySelector('[data-search-results]');
    if (!input || !results) return;
    const docs = await loadSearchIndex(root);
    function render() {
        const query = lower(input.value.trim());
        if (!query) {
            results.innerHTML = '';
            results.classList.add('hidden');
            return;
        }
        const matches = docs
            .map(doc => ({ doc, score: scoreDocument(doc, query) }))
            .filter(item => item.score >= 0)
            .sort((a, b) => a.score - b.score || a.doc.title.localeCompare(b.doc.title))
            .slice(0, 18);
        results.classList.remove('hidden');
        results.innerHTML = matches.length === 0
            ? '<div class="search-result"><strong>No matches</strong><p class="subtle">Try idea names, tags, statuses, file paths, or cluster labels.</p></div>'
            : matches.map(({ doc }) => \`
                <a class="search-result" href="\${doc.url}">
                    <div class="pill-row">
                        <span class="pill">\${doc.kind}</span>
                        \${doc.status ? \`<span class="pill">\${doc.status}</span>\` : ''}
                    </div>
                    <strong>\${doc.title}</strong>
                    <p class="subtle">\${doc.summary || ''}</p>
                </a>
            \`).join('');
    }
    input.addEventListener('input', render);
}

function wireTableFilter(root) {
    const inputs = root.querySelectorAll('[data-filter-input]');
    for (const input of inputs) {
        input.addEventListener('input', () => {
            const targetId = input.dataset.filterInput;
            const query = lower(input.value.trim());
            const rows = root.querySelectorAll(\`[data-filter-row="\${targetId}"]\`);
            for (const row of rows) {
                const text = lower(row.getAttribute('data-filter-text'));
                row.classList.toggle('hidden', Boolean(query) && !text.includes(query));
            }
        });
    }
}

function wireGraph(root) {
    const graphRoots = root.querySelectorAll('[data-graph-json]');
    for (const element of graphRoots) {
        const scriptId = element.dataset.graphJson;
        const dataElement = root.querySelector(\`#\${scriptId}\`);
        if (!dataElement) continue;
        let graph;
        try {
            graph = JSON.parse(dataElement.textContent || '{}');
        } catch {
            continue;
        }
        const controls = root.querySelector(\`[data-graph-controls="\${scriptId}"]\`);
        const searchInput = controls?.querySelector('[data-graph-search]');
        const pathInput = controls?.querySelector('[data-graph-path]');
        const statusSelect = controls?.querySelector('[data-graph-status]');
        const tagSelect = controls?.querySelector('[data-graph-tag]');
        const toggleExternal = controls?.querySelector('[data-graph-toggle-external]');
        const resetButton = controls?.querySelector('[data-graph-reset]');
        const statusText = controls?.querySelector('[data-graph-status-text]');
        let hideExternal = false;

        function renderGraph(filteredNodes, filteredEdges) {
            const width = 1200;
            const height = Math.max(600, Math.min(1200, 120 + filteredNodes.length * 18));
            const columns = Math.max(2, Math.ceil(Math.sqrt(filteredNodes.length || 1)));
            const gapX = width / (columns + 1);
            const gapY = height / (Math.ceil((filteredNodes.length || 1) / columns) + 1);
            const positions = new Map();
            filteredNodes.forEach((node, index) => {
                const col = index % columns;
                const row = Math.floor(index / columns);
                positions.set(node.id, {
                    x: gapX * (col + 1),
                    y: gapY * (row + 1)
                });
            });
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', \`0 0 \${width} \${height}\`);
            for (const edge of filteredEdges) {
                const source = positions.get(edge.sourceId);
                const target = positions.get(edge.targetId);
                if (!source || !target) continue;
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', source.x);
                line.setAttribute('y1', source.y);
                line.setAttribute('x2', target.x);
                line.setAttribute('y2', target.y);
                svg.appendChild(line);
            }
            for (const node of filteredNodes) {
                const pos = positions.get(node.id);
                if (!pos) continue;
                const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                if (node.isExternal) {
                    group.setAttribute('class', 'external');
                }
                const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'a');
                if (node.pageUrl) {
                    anchor.setAttribute('href', node.pageUrl);
                }
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', pos.x);
                circle.setAttribute('cy', pos.y);
                circle.setAttribute('r', '15');
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', String(pos.x + 20));
                text.setAttribute('y', String(pos.y + 4));
                text.textContent = node.name;
                anchor.appendChild(circle);
                anchor.appendChild(text);
                group.appendChild(anchor);
                svg.appendChild(group);
            }
            element.innerHTML = '';
            element.appendChild(svg);
            if (statusText) {
                statusText.textContent = \`\${filteredNodes.length} nodes, \${filteredEdges.length} edges\`;
            }
        }

        function matches(node) {
            const query = lower(searchInput?.value?.trim());
            const pathQuery = lower(pathInput?.value?.trim());
            const statusQuery = lower(statusSelect?.value?.trim());
            const tagQuery = lower(tagSelect?.value?.trim());
            if (hideExternal && node.isExternal) return false;
            const haystack = [node.name, node.kind, node.fileUri, node.status || '', ...(node.tags || [])].map(lower).join(' ');
            if (query && !haystack.includes(query)) return false;
            if (pathQuery && !lower(node.fileUri).includes(pathQuery)) return false;
            if (statusQuery && lower(node.status || '') !== statusQuery) return false;
            if (tagQuery && !(node.tags || []).some(tag => lower(tag) === tagQuery)) return false;
            return true;
        }

        function refresh() {
            const visibleNodes = (graph.nodes || []).filter(matches);
            const visibleIds = new Set(visibleNodes.map(node => node.id));
            const visibleEdges = (graph.edges || []).filter(edge =>
                visibleIds.has(edge.sourceId) && visibleIds.has(edge.targetId)
            );
            renderGraph(visibleNodes, visibleEdges);
        }

        for (const control of [searchInput, pathInput, statusSelect, tagSelect]) {
            control?.addEventListener('input', refresh);
            control?.addEventListener('change', refresh);
        }
        toggleExternal?.addEventListener('click', () => {
            hideExternal = !hideExternal;
            toggleExternal.classList.toggle('is-active', hideExternal);
            toggleExternal.textContent = hideExternal ? 'Show external' : 'Hide external';
            refresh();
        });
        resetButton?.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (pathInput) pathInput.value = '';
            if (statusSelect) statusSelect.value = '';
            if (tagSelect) tagSelect.value = '';
            hideExternal = false;
            toggleExternal?.classList.remove('is-active');
            if (toggleExternal) toggleExternal.textContent = 'Hide external';
            refresh();
        });
        refresh();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const root = document.body;
    await wireGlobalSearch(root);
    wireTableFilter(root);
    wireGraph(root);
});
`;
