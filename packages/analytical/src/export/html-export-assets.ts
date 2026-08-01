export const SHARED_STYLES = `
:root {
    color-scheme: dark;
    --bg: #14100e;
    --bg-elev: #1f1815;
    --bg-soft: #1f1815;
    --bg-raised: #2a211d;
    --fg: #ebe4de;
    --muted: #a89488;
    --faint: #6e5f56;
    --line: #3d2f28;
    --accent: #07a0e5;
    --accent-strong: #0bbefb;
    --accent-dim: #0371c1;
    --rust: #b85c38;
    --rust-muted: #8a4530;
    --good: #4ade80;
    --warn: #fbbf24;
    --bad: #fb7185;
    font-family: Inter, system-ui, sans-serif;
}
* { box-sizing: border-box; }
body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    line-height: 1.55;
}
a { color: var(--accent-strong); text-decoration: none; }
a:hover { color: var(--accent); }
main.layout {
    max-width: 1360px; margin: 0 auto; padding: 1.5rem;
    display: flex; flex-direction: column; gap: 1.5rem;
}
.topbar {
    position: sticky; top: 0; z-index: 10;
    background: var(--bg-elev); border-bottom: 1px solid var(--line); margin: 0 -1.5rem;
    padding: 0.9rem 1.5rem;
}
.topbar-inner, .hero, .split, .grid, .detail-grid { display: grid; gap: 1.5rem; }
.topbar-inner { grid-template-columns: 1.3fr auto; align-items: center; }
.nav { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
.nav a {
    padding: 0.45rem 0.75rem; border-radius: 8px;
    background: var(--bg-raised); color: var(--muted); border: 1px solid var(--line);
}
.nav a:hover { color: var(--fg); border-color: color-mix(in srgb, var(--accent) 35%, var(--line)); }
.nav a.active {
    background: color-mix(in srgb, var(--rust) 28%, var(--bg-raised));
    color: var(--fg); border-color: var(--rust);
}
.nav a.brand-link {
    background: transparent;
    border-color: transparent;
    color: var(--fg);
    font-weight: 650;
    letter-spacing: 0.02em;
    padding-left: 0.15rem;
    padding-right: 0.9rem;
}
.nav a.brand-link:hover {
    color: var(--accent);
    border-color: transparent;
    background: transparent;
}
.hero { grid-template-columns: 2fr 1fr; }
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr));
    gap: 1.5rem;
    row-gap: 1.5rem;
    column-gap: 1.5rem;
}
.split, .detail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
    gap: 1.5rem;
}
.panel, .metric, .card, .table-shell, .graph-shell, .print-card, .search-result {
    background: var(--bg-raised);
    border: 1px solid var(--line);
    border-radius: 10px;
}
.panel, .card, .table-shell, .graph-shell, .print-card, .search-result { padding: 1rem 1.1rem; }
.metric { padding: 0; overflow: hidden; }
.metric-link, .metric > span, .metric > strong {
    display: flex; flex-direction: column; gap: 0.35rem; padding: 1rem; color: inherit;
}
.metric-link:hover { background: color-mix(in srgb, var(--accent) 10%, var(--bg-raised)); }
.metric-label, .subtle, .eyebrow, .breadcrumbs { color: var(--muted); }
.metric-value { font-size: 1.75rem; color: var(--accent-strong); }
.eyebrow { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.75rem; color: var(--rust); }
.page-header { display: grid; gap: 0.55rem; }
.page-header h1 { margin: 0; }
.page-header .eyebrow { margin: 0; }
.page-header .subtle { margin: 0; }
.toolbar {
    display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; justify-content: space-between;
    margin-bottom: 0.9rem;
}
.toolbar .actions, .pill-row, .breadcrumbs { display: flex; gap: 0.75rem; row-gap: 0.85rem; flex-wrap: wrap; align-items: center; }
.chip, .pill {
    display: inline-flex; align-items: center; gap: 0.35rem;
    padding: 0.28rem 0.6rem; border-radius: 8px;
    border: 1px solid var(--line); background: var(--bg); color: var(--muted);
}
a.pill:hover { color: var(--accent-strong); border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); }
.graph-controls-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    align-items: center;
    margin-bottom: 0.9rem;
    padding: 0.8rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--bg);
}
.graph-shell > .pill-row { margin-bottom: 0.9rem; }
.graph-filter {
    flex: 1 1 180px;
    min-width: 160px;
}
.graph-action {
    border: 1px solid var(--line);
    background: var(--bg-soft);
    color: var(--fg);
    border-radius: 8px;
    padding: 0.7rem 0.9rem;
    cursor: pointer;
}
.graph-action:hover { border-color: var(--accent-dim); color: var(--accent-strong); }
.graph-action.is-active {
    background: color-mix(in srgb, var(--rust) 28%, var(--bg-soft));
    border-color: var(--rust);
    color: var(--fg);
}
.graph-status {
    color: var(--muted);
    font-size: 0.92rem;
    margin-left: auto;
}
.searchbar, select, input[type="search"] {
    width: min(100%, 440px); background: var(--bg); color: var(--fg);
    border: 1px solid var(--line); border-radius: 8px; padding: 0.75rem 0.9rem;
}
.searchbar:focus, select:focus, input[type="search"]:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 25%, transparent);
}
table { width: 100%; border-collapse: collapse; }
th, td {
    padding: 0.75rem 0.65rem; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top;
}
th { color: var(--muted); font-size: 0.94rem; }
tbody tr:hover { background: var(--bg-raised); }
.table-shell { overflow-x: auto; }
.scroll-window {
    --scroll-window-max: min(28rem, 50vh);
}
body[data-runtime-mode="interactive"] .scroll-window {
    max-height: var(--scroll-window-max);
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg);
}
body[data-runtime-mode="interactive"] .scroll-window > table {
    margin: 0;
}
body[data-runtime-mode="interactive"] .scroll-window .entity-list,
body[data-runtime-mode="interactive"] .scroll-window .rollup-list {
    padding: 0.75rem;
}
.sortable-th { padding: 0.45rem 0.4rem; }
.sort-button {
    display: inline-flex; align-items: center; gap: 0.35rem;
    width: 100%; margin: 0; padding: 0.3rem 0.25rem;
    border: 0; background: transparent; color: inherit;
    font: inherit; text-align: left; cursor: pointer;
}
.sort-button:hover { color: var(--fg); }
.sort-button.sort-active { color: var(--accent-strong); }
.sort-indicator { color: var(--faint); font-size: 0.8em; min-width: 1em; }
.sort-button.sort-active .sort-indicator { color: var(--accent-strong); }
.table-filter-toggle {
    display: inline-flex; align-items: center; justify-content: center;
    width: 2.25rem; height: 2.25rem; padding: 0;
    border: 1px solid var(--line); border-radius: 8px;
    background: var(--bg-raised); color: var(--muted); cursor: pointer;
}
.table-filter-toggle:hover { color: var(--fg); border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); }
.table-filter-toggle.is-active {
    color: var(--fg);
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--bg-raised));
}
.table-filter-toggle.has-filters:not(.is-active) {
    color: var(--accent-strong);
    border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
}
.table-filter-toggle svg { width: 1rem; height: 1rem; display: block; }
.table-filter-actions {
    display: flex; justify-content: flex-end; gap: 0.55rem;
    margin-bottom: 0.65rem;
}
.column-filter-row { display: none; }
.column-filter-row.is-open { display: table-row; }
.column-filter-row th {
    padding: 0.35rem 0.4rem 0.75rem; border-bottom: 1px solid var(--line); font-weight: 400;
}
.column-filter {
    width: 100%; min-width: 4.5rem; background: var(--bg); color: var(--fg);
    border: 1px solid var(--line); border-radius: 6px; padding: 0.4rem 0.55rem; font-size: 0.85rem;
}
.column-filter:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 25%, transparent);
}
body[data-runtime-mode="interactive"] .scroll-window thead tr:first-child th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--bg-raised);
    box-shadow: 0 1px 0 var(--line);
}
body[data-runtime-mode="interactive"] .scroll-window thead .column-filter-row.is-open th {
    position: sticky;
    top: 2.65rem;
    z-index: 1;
    background: var(--bg-raised);
    box-shadow: 0 1px 0 var(--line);
}
.entity-list { display: grid; gap: 1.5rem; }
.entity-card {
    border: 1px solid var(--line); border-radius: 10px; padding: 0.9rem 1rem; background: var(--bg);
    color: inherit;
}
.entity-card:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); }
.entity-card h3, .entity-card p { margin: 0; }
.entity-card p + p, .entity-card strong + p, .entity-card h3 + p { margin-top: 0.35rem; }
.panel > h2, .table-shell > h2, .graph-shell > h2, .print-card > h3 { margin-top: 0; margin-bottom: 0.75rem; }
.toolbar h2 { margin: 0; }
.rollup-list { display: grid; gap: 0.5rem; }
.rollup-list div {
    display: flex; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--line); padding-bottom: 0.4rem;
}
.rollup-list dd { margin: 0; }
.distribution-track {
    height: 0.7rem;
    min-width: 6rem;
    border-radius: 999px;
    background: var(--bg);
    border: 1px solid var(--line);
    overflow: hidden;
}
.distribution-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--accent-dim), var(--accent-strong));
    min-width: 0;
}
.graph-root svg {
    width: 100%; min-height: 620px; background: var(--bg); border-radius: 10px; border: 1px solid var(--line);
}
.graph-root line {
    stroke: color-mix(in srgb, var(--line) 80%, transparent); stroke-width: 1.2;
    opacity: 0.85; transition: opacity 180ms ease;
}
.graph-root .node { cursor: pointer; }
.graph-root circle {
    fill: var(--accent); stroke: color-mix(in srgb, var(--fg) 35%, transparent); stroke-width: 1.25;
    transition: fill 180ms ease, stroke 180ms ease, r 180ms ease;
}
.graph-root .external circle { fill: var(--rust-muted); stroke: color-mix(in srgb, var(--rust) 50%, transparent); }
.graph-root .ideaset circle { fill: color-mix(in srgb, #d18616 78%, white); stroke: #d18616; }
.graph-root .subject circle {
    fill: var(--rust);
    stroke: var(--accent-strong);
    stroke-width: 2.75;
    animation: subject-pulse 2.4s ease-in-out infinite;
}
.graph-root text {
    fill: var(--fg); font-size: 11px; paint-order: stroke;
    stroke: var(--bg); stroke-width: 3px; stroke-linejoin: round;
    pointer-events: none;
}
.graph-root .subject text {
    fill: var(--accent-strong); font-size: 12.5px; font-weight: 600;
}
.graph-root .node:hover circle { stroke: var(--accent-strong); stroke-width: 2; }
.graph-root .graph-label {
    width: 160px;
    color: var(--fg);
    font: 11px/1.3 Inter, system-ui, sans-serif;
    text-align: center;
    word-break: break-word;
    overflow-wrap: anywhere;
    pointer-events: none;
    user-select: none;
}
.graph-root .graph-label strong { display: block; font-weight: 600; }
.graph-root .graph-label .meta { display: block; color: var(--muted); font-size: 10px; margin-top: 0.15rem; }
.graph-root .graph-label .attrs { display: block; color: var(--rust); font-size: 9.5px; margin-top: 0.1rem; }
.graph-root .subject .graph-label strong { color: var(--accent-strong); }
.graph-root svg { touch-action: none; cursor: grab; }
.graph-root svg.is-panning { cursor: grabbing; }
.graph-root .node { cursor: pointer; }
@keyframes subject-pulse {
    0%, 100% { filter: drop-shadow(0 0 0 transparent); }
    50% { filter: drop-shadow(0 0 8px color-mix(in srgb, var(--rust) 55%, transparent)); }
}
.search-results { display: grid; gap: 0.7rem; margin-top: 1rem; }
.search-result:hover { border-color: var(--accent-dim); }
.hidden { display: none !important; }
.breadcrumbs a { color: var(--muted); }
.breadcrumbs a:hover { color: var(--accent-strong); }
.section-link { font-size: 0.92rem; }
.prose p { line-height: 1.55; }
.idea-summary { white-space: normal; }
.idea-ref {
    display: inline;
    padding: 0.05em 0.35em;
    margin: 0 0.05em;
    border-radius: 0.3em;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
    background: color-mix(in srgb, var(--accent) 14%, var(--bg-raised));
    color: var(--accent-strong);
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
}
a.idea-ref:hover {
    color: var(--fg);
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 22%, var(--bg-raised));
}
.idea-ref--file {
    border-color: color-mix(in srgb, var(--rust) 40%, var(--line));
    background: color-mix(in srgb, var(--rust) 16%, var(--bg-raised));
    color: #e8a07a;
}
a.idea-ref--file:hover {
    color: var(--fg);
    border-color: var(--rust);
}
.idea-ref--unresolved {
    border-style: dashed;
    border-color: color-mix(in srgb, var(--warn) 45%, var(--line));
    background: color-mix(in srgb, var(--warn) 10%, var(--bg-raised));
    color: var(--warn);
    font-weight: 500;
}
pre.code-like {
    white-space: pre-wrap; padding: 0.9rem; border-radius: 8px;
    background: var(--bg); border: 1px solid var(--line);
}
@media (max-width: 900px) {
    .hero, .topbar-inner { grid-template-columns: 1fr; }
}
@media print {
    :root { color-scheme: light; }
    body { background: white; color: black; }
    .topbar, .searchbar, .toolbar .actions, .graph-shell .toolbar, .column-filter-row, .table-filter-toggle, .table-filter-actions, .hide-on-print { display: none !important; }
    .sort-button { cursor: default; }
    .panel, .metric, .card, .table-shell, .graph-shell, .print-card, .search-result, .entity-card {
        background: white; color: black; border-color: #cbd5e1; box-shadow: none;
    }
    .scroll-window {
        max-height: none !important;
        overflow: visible !important;
        border: none !important;
        background: transparent !important;
    }
    .scroll-window thead th {
        position: static !important;
        box-shadow: none !important;
    }
    a { color: black; text-decoration: underline; }
    .print-break-avoid { break-inside: avoid; }
}
`;

export const APP_JS = `
const searchIndexByRoot = new WeakMap();

function exportRootPrefix(root) {
    const searchUrl = root.dataset.searchIndex || '';
    const dataIdx = searchUrl.lastIndexOf('data/');
    return dataIdx >= 0 ? searchUrl.slice(0, dataIdx) : '';
}

function resolveExportUrl(root, url) {
    const cleaned = String(url || '').replace(/^\\.\\//, '');
    return \`\${exportRootPrefix(root)}\${cleaned}\`;
}

async function loadSearchIndex(root) {
    if (searchIndexByRoot.has(root)) return searchIndexByRoot.get(root);
    const embedded = typeof globalThis.__REQLAN_SEARCH_INDEX__ !== 'undefined'
        ? globalThis.__REQLAN_SEARCH_INDEX__
        : null;
    if (Array.isArray(embedded)) {
        const ready = Promise.resolve(embedded);
        searchIndexByRoot.set(root, ready);
        return ready;
    }
    const url = root.dataset.searchIndex;
    if (!url) return [];
    const loaded = fetch(url).then(response => {
        if (!response.ok) throw new Error('search index fetch failed');
        return response.json();
    }).catch(() => []);
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
                <a class="search-result" href="\${resolveExportUrl(root, doc.url)}">
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

function cellSortValue(cell) {
    if (!cell) return '';
    const explicit = cell.getAttribute('data-sort-value');
    if (explicit != null) return explicit.trim();
    return String(cell.textContent || '').replace(/\\s+/g, ' ').trim();
}

function compareSortValues(left, right) {
    const leftNumber = Number(String(left).replace(/,/g, ''));
    const rightNumber = Number(String(right).replace(/,/g, ''));
    const bothNumeric = left !== '' && right !== ''
        && Number.isFinite(leftNumber)
        && Number.isFinite(rightNumber);
    if (bothNumeric) {
        return leftNumber - rightNumber;
    }
    return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}

function isPlaceholderRow(row) {
    if (!row || row.cells.length === 0) return true;
    return [...row.cells].some(cell => Number(cell.colSpan || 1) > 1);
}

const FILTER_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>';

function ensureTableFilterToggle(table, filterRow, filterInputs, syncToggleState) {
    const shell = table.closest('.table-shell') || table.parentElement;
    const toolbar = shell ? shell.querySelector(':scope > .toolbar') : null;
    let actions = toolbar ? toolbar.querySelector('.actions') : null;
    if (toolbar && !actions) {
        actions = document.createElement('div');
        actions.className = 'actions';
        toolbar.appendChild(actions);
    }
    if (!actions) {
        actions = document.createElement('div');
        actions.className = 'actions table-filter-actions';
        table.parentElement?.insertBefore(actions, table);
    }

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'table-filter-toggle';
    toggle.setAttribute('aria-label', 'Toggle column filters');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('title', 'Column filters');
    toggle.innerHTML = FILTER_ICON_SVG;
    toggle.addEventListener('click', () => {
        const open = !filterRow.classList.contains('is-open');
        filterRow.classList.toggle('is-open', open);
        toggle.classList.toggle('is-active', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        syncToggleState();
        if (open) {
            filterInputs[0]?.focus();
        }
    });
    actions.appendChild(toggle);
    return toggle;
}

function wireTables(root) {
    const tables = root.querySelectorAll('table');
    const tableControllers = [];

    for (const table of tables) {
        const thead = table.tHead;
        const tbody = table.tBodies[0];
        if (!thead || !tbody || thead.rows.length === 0) continue;
        const headerRow = thead.rows[0];
        if (headerRow.dataset.enhanced === '1') continue;
        headerRow.dataset.enhanced = '1';

        const headers = [...headerRow.cells];
        if (headers.length === 0) continue;

        let sortIndex = -1;
        let sortDir = 'asc';
        const filterInputs = [];
        let filterToggle = null;
        const syncToggleState = () => {
            if (!filterToggle) return;
            const hasFilters = filterInputs.some(input => input.value.trim());
            filterToggle.classList.toggle('has-filters', hasFilters);
        };
        const controller = {
            table,
            tbody,
            filterInputs,
            applyFilters() {
                const sample = [...tbody.rows].find(row => row.hasAttribute('data-filter-row'));
                const filterId = sample?.getAttribute('data-filter-row');
                const globalInput = filterId
                    ? root.querySelector(\`[data-filter-input="\${filterId}"]\`)
                    : null;
                const globalQuery = lower(globalInput?.value.trim());
                const columnQueries = filterInputs.map(input => lower(input.value.trim()));
                for (const row of tbody.rows) {
                    if (isPlaceholderRow(row)) continue;
                    const globalText = lower(row.getAttribute('data-filter-text') || row.textContent);
                    const matchesGlobal = !globalQuery || globalText.includes(globalQuery);
                    const matchesColumns = columnQueries.every((query, index) => {
                        if (!query) return true;
                        return lower(cellSortValue(row.cells[index])).includes(query);
                    });
                    row.classList.toggle('hidden', !(matchesGlobal && matchesColumns));
                }
                syncToggleState();
            }
        };

        headers.forEach((th, index) => {
            const label = String(th.textContent || '').trim() || \`Column \${index + 1}\`;
            th.classList.add('sortable-th');
            th.replaceChildren();
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'sort-button';
            button.dataset.sortCol = String(index);
            button.setAttribute('aria-label', \`Sort by \${label}\`);
            const labelNode = document.createElement('span');
            labelNode.textContent = label;
            const indicator = document.createElement('span');
            indicator.className = 'sort-indicator';
            indicator.setAttribute('aria-hidden', 'true');
            button.append(labelNode, indicator);
            button.addEventListener('click', () => {
                if (sortIndex === index) {
                    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    sortIndex = index;
                    sortDir = 'asc';
                }
                const dataRows = [...tbody.rows].filter(row => !isPlaceholderRow(row));
                dataRows.sort((left, right) => {
                    const cmp = compareSortValues(
                        cellSortValue(left.cells[index]),
                        cellSortValue(right.cells[index])
                    );
                    return sortDir === 'asc' ? cmp : -cmp;
                });
                for (const row of dataRows) {
                    tbody.appendChild(row);
                }
                for (const header of headers) {
                    const sortButton = header.querySelector('.sort-button');
                    const mark = header.querySelector('.sort-indicator');
                    if (!sortButton || !mark) continue;
                    const active = Number(sortButton.dataset.sortCol) === sortIndex;
                    sortButton.classList.toggle('sort-active', active);
                    mark.textContent = active ? (sortDir === 'asc' ? '▲' : '▼') : '';
                }
            });
            th.appendChild(button);
        });

        const filterRow = document.createElement('tr');
        filterRow.className = 'column-filter-row';
        headers.forEach((th, index) => {
            const label = String(th.querySelector('.sort-button span')?.textContent || \`Column \${index + 1}\`);
            const cell = document.createElement('th');
            const input = document.createElement('input');
            input.type = 'search';
            input.className = 'column-filter';
            input.placeholder = 'Filter…';
            input.dataset.colFilter = String(index);
            input.setAttribute('aria-label', \`Filter \${label}\`);
            input.addEventListener('input', () => controller.applyFilters());
            filterInputs.push(input);
            cell.appendChild(input);
            filterRow.appendChild(cell);
        });
        thead.appendChild(filterRow);
        filterToggle = ensureTableFilterToggle(table, filterRow, filterInputs, syncToggleState);
        tableControllers.push(controller);
    }

    const inputs = root.querySelectorAll('[data-filter-input]');
    for (const input of inputs) {
        input.addEventListener('input', () => {
            const targetId = input.dataset.filterInput;
            for (const controller of tableControllers) {
                const ownsRows = controller.tbody.querySelector(\`[data-filter-row="\${targetId}"]\`);
                if (ownsRows) {
                    controller.applyFilters();
                }
            }
        });
    }
}

function hashAngle(seed) {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 31 + seed.charCodeAt(index)) | 0;
    }
    return ((hash >>> 0) % 6283) / 1000;
}

// Matches packages/extension/webviews/shared/graph/graph-physics.ts DEFAULT_PHYSICS_SETTINGS.
const EXPORT_PHYSICS_SETTINGS = {
    gravity: 0.002,
    repulsion: 20000,
    linkStrength: 0.015,
    linkDistance: 120,
    damping: 0.5,
    maxVelocity: 10,
    minSeparation: 24,
    restSpeed: 0.02,
    restTicks: 90
};

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
        let controls = root.querySelector(\`[data-graph-controls="\${scriptId}"]\`);
        if (!controls) {
            controls = document.createElement('div');
            controls.className = 'graph-controls-bar';
            controls.dataset.graphControls = scriptId;
            controls.innerHTML = '<button type="button" class="graph-action" data-graph-toggle-physics aria-pressed="false">Live physics</button><button type="button" class="graph-action" data-graph-fit>Fit</button><span class="graph-status" data-graph-status-text></span>';
            element.parentElement?.insertBefore(controls, element);
        }
        const searchInput = controls.querySelector('[data-graph-search]');
        const pathInput = controls.querySelector('[data-graph-path]');
        const statusSelect = controls.querySelector('[data-graph-status]');
        const tagSelect = controls.querySelector('[data-graph-tag]');
        const toggleExternal = controls.querySelector('[data-graph-toggle-external]');
        const toggleIdeasets = controls.querySelector('[data-graph-toggle-ideasets]');
        const togglePhysics = controls.querySelector('[data-graph-toggle-physics]');
        const fitButton = controls.querySelector('[data-graph-fit]');
        const resetButton = controls.querySelector('[data-graph-reset]');
        const statusText = controls.querySelector('[data-graph-status-text]');
        let hideExternal = false;
        let hideIdeasets = false;
        let livePhysics = false;
        let animationFrame = 0;
        let calmTicks = 0;
        let simNodes = [];
        let simEdges = [];
        const positions = new Map();
        const velocities = new Map();
        let svg;
        let edgeEls = [];
        let nodeEls = [];
        const pinnedIds = new Set();
        let view = { x: 0, y: 0, w: 1200, h: 640 };
        let userViewport = false;
        let dragNodeId = null;
        let dragMoved = false;
        let panMode = false;
        let panOrigin = null;
        let suppressClickUntil = 0;

        function resolveGraphNodeUrl(pageUrl) {
            let cleaned = String(pageUrl || '').replace(/^\\.\\//, '');
            if (cleaned && !cleaned.includes('/') && cleaned.endsWith('.html')) {
                cleaned = \`ideas/\${cleaned}\`;
            }
            return resolveExportUrl(root, cleaned);
        }

        function escapeXml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function formatNodeMeta(node) {
            const bits = [];
            if (node.status) bits.push(String(node.status));
            if (Array.isArray(node.tags) && node.tags.length) bits.push(node.tags.join(', '));
            return bits.join(' · ');
        }

        function formatNodeAttrs(node) {
            const keys = Array.isArray(node.attributeKeys)
                ? node.attributeKeys
                : Object.keys(node.attributes || {});
            return keys.length ? keys.map(key => '@' + key).join(' ') : '';
        }

        function seedMissingPositions(nodes, width, height, centerId) {
            const cx = width / 2;
            const cy = height / 2;
            const subject = nodes.find(node => node.isSubject || node.id === centerId);
            const radius = Math.min(width, height) * 0.34;
            nodes.forEach((node, index) => {
                if (positions.has(node.id)) return;
                if (subject && node.id === subject.id) {
                    positions.set(node.id, { x: cx, y: cy });
                    return;
                }
                const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1) - Math.PI / 2;
                const ring = radius * (0.72 + (index % 3) * 0.14);
                positions.set(node.id, {
                    x: cx + Math.cos(angle) * ring,
                    y: cy + Math.sin(angle) * ring
                });
            });
        }

        function pruneState(validIds) {
            for (const id of [...positions.keys()]) {
                if (!validIds.has(id)) positions.delete(id);
            }
            for (const id of [...velocities.keys()]) {
                if (!validIds.has(id)) velocities.delete(id);
            }
        }

        function physicsStep(nodes, edges) {
            const settings = EXPORT_PHYSICS_SETTINGS;
            const count = nodes.length;
            if (count === 0) return 0;
            const ids = new Array(count);
            const xs = new Float64Array(count);
            const ys = new Float64Array(count);
            const fxs = new Float64Array(count);
            const fys = new Float64Array(count);
            const indexById = new Map();
            for (let i = 0; i < count; i += 1) {
                const node = nodes[i];
                const pos = positions.get(node.id) || { x: 0, y: 0 };
                ids[i] = node.id;
                xs[i] = pos.x;
                ys[i] = pos.y;
                indexById.set(node.id, i);
            }
            let centroidX = 0;
            let centroidY = 0;
            for (let i = 0; i < count; i += 1) {
                centroidX += xs[i];
                centroidY += ys[i];
            }
            centroidX /= count;
            centroidY /= count;
            for (let i = 0; i < count; i += 1) {
                fxs[i] -= settings.gravity * (xs[i] - centroidX);
                fys[i] -= settings.gravity * (ys[i] - centroidY);
            }
            const minSeparationSq = settings.minSeparation * settings.minSeparation;
            for (let i = 0; i < count; i += 1) {
                for (let j = i + 1; j < count; j += 1) {
                    let dx = xs[j] - xs[i];
                    let dy = ys[j] - ys[i];
                    let distSq = dx * dx + dy * dy;
                    if (distSq < 1e-6) {
                        const angle = hashAngle(ids[i] + ids[j]);
                        dx = Math.cos(angle);
                        dy = Math.sin(angle);
                        distSq = 1;
                    }
                    const clampedSq = Math.max(distSq, minSeparationSq);
                    const dist = Math.sqrt(distSq);
                    const force = settings.repulsion / clampedSq;
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;
                    fxs[i] -= fx;
                    fys[i] -= fy;
                    fxs[j] += fx;
                    fys[j] += fy;
                }
            }
            for (const edge of edges) {
                const sourceIndex = indexById.get(edge.sourceId);
                const targetIndex = indexById.get(edge.targetId);
                if (sourceIndex === undefined || targetIndex === undefined || sourceIndex === targetIndex) continue;
                const dx = xs[targetIndex] - xs[sourceIndex];
                const dy = ys[targetIndex] - ys[sourceIndex];
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 1e-3) continue;
                const force = settings.linkStrength * (dist - settings.linkDistance);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                fxs[sourceIndex] += fx;
                fys[sourceIndex] += fy;
                fxs[targetIndex] -= fx;
                fys[targetIndex] -= fy;
            }
            let speedSum = 0;
            let movingCount = 0;
            for (let i = 0; i < count; i += 1) {
                const id = ids[i];
                if (pinnedIds.has(id)) {
                    continue;
                }
                const velocity = velocities.get(id) || { vx: 0, vy: 0 };
                let vx = (velocity.vx + fxs[i]) * settings.damping;
                let vy = (velocity.vy + fys[i]) * settings.damping;
                const speed = Math.sqrt(vx * vx + vy * vy);
                if (speed > settings.maxVelocity) {
                    const scale = settings.maxVelocity / speed;
                    vx *= scale;
                    vy *= scale;
                }
                velocity.vx = vx;
                velocity.vy = vy;
                velocities.set(id, velocity);
                positions.set(id, { x: xs[i] + vx, y: ys[i] + vy });
                speedSum += Math.min(speed, settings.maxVelocity);
                movingCount += 1;
            }
            return movingCount > 0 ? speedSum / movingCount : 0;
        }

        function contentBounds() {
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const pos of positions.values()) {
                minX = Math.min(minX, pos.x);
                minY = Math.min(minY, pos.y);
                maxX = Math.max(maxX, pos.x);
                maxY = Math.max(maxY, pos.y);
            }
            if (!Number.isFinite(minX)) {
                return { minX: 0, minY: 0, maxX: 1200, maxY: 640 };
            }
            return { minX, minY, maxX, maxY };
        }

        function applyView() {
            if (!svg) return;
            svg.setAttribute('viewBox', \`\${view.x} \${view.y} \${view.w} \${view.h}\`);
        }

        function fitView(force = false) {
            if (userViewport && !force) {
                applyView();
                return;
            }
            const bounds = contentBounds();
            const pad = 80;
            view = {
                x: bounds.minX - pad,
                y: bounds.minY - pad,
                w: Math.max(360, bounds.maxX - bounds.minX + pad * 2),
                h: Math.max(360, bounds.maxY - bounds.minY + pad * 2 + 70)
            };
            userViewport = false;
            applyView();
        }

        function paint() {
            if (!svg) return;
            for (const { node, circle, label } of nodeEls) {
                const pos = positions.get(node.id);
                if (!pos) continue;
                circle.setAttribute('cx', String(pos.x));
                circle.setAttribute('cy', String(pos.y));
                label.setAttribute('x', String(pos.x - 80));
                label.setAttribute('y', String(pos.y + 18));
            }
            for (const { edge, line } of edgeEls) {
                const source = positions.get(edge.sourceId);
                const target = positions.get(edge.targetId);
                if (!source || !target) continue;
                line.setAttribute('x1', String(source.x));
                line.setAttribute('y1', String(source.y));
                line.setAttribute('x2', String(target.x));
                line.setAttribute('y2', String(target.y));
                line.setAttribute('opacity', '0.85');
            }
            if (!userViewport) {
                fitView(false);
            } else {
                applyView();
            }
        }

        function stopLoop() {
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
                animationFrame = 0;
            }
        }

        function scheduleTick() {
            if (animationFrame) return;
            animationFrame = requestAnimationFrame(() => {
                animationFrame = 0;
                if (!livePhysics) return;
                const averageSpeed = physicsStep(simNodes, simEdges);
                paint();
                if (averageSpeed < EXPORT_PHYSICS_SETTINGS.restSpeed) {
                    calmTicks += 1;
                    if (calmTicks >= EXPORT_PHYSICS_SETTINGS.restTicks) {
                        return;
                    }
                } else {
                    calmTicks = 0;
                }
                scheduleTick();
            });
        }

        function wake() {
            calmTicks = 0;
            if (livePhysics) scheduleTick();
        }

        function batchSettle(nodes, edges) {
            const iterations = Math.min(120, 48 + nodes.length);
            for (let i = 0; i < iterations; i += 1) {
                physicsStep(nodes, edges);
            }
            for (const velocity of velocities.values()) {
                velocity.vx = 0;
                velocity.vy = 0;
            }
            calmTicks = EXPORT_PHYSICS_SETTINGS.restTicks;
        }

        function mountGraph(filteredNodes, filteredEdges) {
            stopLoop();
            simNodes = filteredNodes;
            simEdges = filteredEdges;
            const validIds = new Set(filteredNodes.map(node => node.id));
            pruneState(validIds);
            const width = 1200;
            const height = Math.max(640, Math.min(1400, 220 + filteredNodes.length * 28));
            seedMissingPositions(filteredNodes, width, height, graph.centerId);
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', \`0 0 \${width} \${height}\`);
            edgeEls = [];
            for (const edge of filteredEdges) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                svg.appendChild(line);
                edgeEls.push({ edge, line });
            }
            nodeEls = [];
            for (const node of filteredNodes) {
                const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                const classes = ['node'];
                if (node.isExternal) classes.push('external');
                if (node.kind === 'ideaset') classes.push('ideaset');
                if (node.isSubject || node.id === graph.centerId) classes.push('subject');
                group.setAttribute('class', classes.join(' '));
                group.dataset.nodeId = node.id;
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('r', node.isSubject || node.id === graph.centerId ? '18' : '13');
                const label = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
                label.setAttribute('width', '160');
                label.setAttribute('height', '96');
                const meta = formatNodeMeta(node);
                const attrs = formatNodeAttrs(node);
                label.innerHTML = \`<div xmlns="http://www.w3.org/1999/xhtml" class="graph-label"><strong>\${escapeXml(node.name)}</strong>\${meta ? \`<span class="meta">\${escapeXml(meta)}</span>\` : ''}\${attrs ? \`<span class="attrs">\${escapeXml(attrs)}</span>\` : ''}</div>\`;
                const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                title.textContent = [node.name, meta, attrs].filter(Boolean).join('\\n');
                group.appendChild(title);
                group.appendChild(circle);
                group.appendChild(label);
                svg.appendChild(group);
                nodeEls.push({ node, circle, label, group });
            }
            element.innerHTML = '';
            element.appendChild(svg);
            wireViewport(svg);
            if (statusText) {
                statusText.textContent = \`\${filteredNodes.length} nodes, \${filteredEdges.length} edges\`;
            }
            userViewport = false;
            if (!livePhysics) {
                batchSettle(filteredNodes, filteredEdges);
                paint();
            } else {
                paint();
                wake();
            }
        }

        function clientToGraph(event) {
            const rect = svg.getBoundingClientRect();
            const x = view.x + ((event.clientX - rect.left) / rect.width) * view.w;
            const y = view.y + ((event.clientY - rect.top) / rect.height) * view.h;
            return { x, y };
        }

        function wireViewport(target) {
            target.addEventListener('wheel', (event) => {
                event.preventDefault();
                const factor = event.deltaY < 0 ? 0.9 : 1.1;
                const before = clientToGraph(event);
                view.w = Math.min(8000, Math.max(180, view.w * factor));
                view.h = Math.min(8000, Math.max(180, view.h * factor));
                const after = clientToGraph(event);
                view.x += before.x - after.x;
                view.y += before.y - after.y;
                userViewport = true;
                applyView();
            }, { passive: false });

            target.addEventListener('pointerdown', (event) => {
                const nodeGroup = event.target.closest?.('.node');
                if (nodeGroup) {
                    const nodeId = nodeGroup.dataset.nodeId;
                    dragNodeId = nodeId;
                    dragMoved = false;
                    pinnedIds.add(nodeId);
                    velocities.set(nodeId, { vx: 0, vy: 0 });
                    target.setPointerCapture(event.pointerId);
                    event.preventDefault();
                    return;
                }
                panMode = true;
                panOrigin = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y };
                target.classList.add('is-panning');
                target.setPointerCapture(event.pointerId);
                event.preventDefault();
            });

            target.addEventListener('pointermove', (event) => {
                if (dragNodeId) {
                    const point = clientToGraph(event);
                    positions.set(dragNodeId, { x: point.x, y: point.y });
                    dragMoved = true;
                    wake();
                    paint();
                    return;
                }
                if (panMode && panOrigin) {
                    const rect = target.getBoundingClientRect();
                    const dx = ((event.clientX - panOrigin.x) / rect.width) * view.w;
                    const dy = ((event.clientY - panOrigin.y) / rect.height) * view.h;
                    view.x = panOrigin.viewX - dx;
                    view.y = panOrigin.viewY - dy;
                    userViewport = true;
                    applyView();
                }
            });

            target.addEventListener('pointerup', (event) => {
                if (dragNodeId) {
                    const node = simNodes.find(item => item.id === dragNodeId);
                    const moved = dragMoved;
                    const nodeId = dragNodeId;
                    dragNodeId = null;
                    pinnedIds.delete(nodeId);
                    wake();
                    if (!moved && node?.pageUrl && Date.now() > suppressClickUntil) {
                        window.location.href = resolveGraphNodeUrl(node.pageUrl);
                    } else if (moved) {
                        suppressClickUntil = Date.now() + 250;
                    }
                    return;
                }
                if (panMode) {
                    panMode = false;
                    panOrigin = null;
                    target.classList.remove('is-panning');
                }
            });

            target.addEventListener('pointercancel', () => {
                if (dragNodeId) {
                    pinnedIds.delete(dragNodeId);
                    dragNodeId = null;
                    wake();
                }
                panMode = false;
                panOrigin = null;
                target.classList.remove('is-panning');
            });
        }

        function matches(node) {
            const query = lower(searchInput?.value?.trim());
            const pathQuery = lower(pathInput?.value?.trim());
            const statusQuery = lower(statusSelect?.value?.trim());
            const tagQuery = lower(tagSelect?.value?.trim());
            if (hideExternal && node.isExternal) return false;
            if (hideIdeasets && node.kind === 'ideaset') return false;
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
            mountGraph(visibleNodes, visibleEdges);
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
        toggleIdeasets?.addEventListener('click', () => {
            hideIdeasets = !hideIdeasets;
            toggleIdeasets.classList.toggle('is-active', hideIdeasets);
            toggleIdeasets.textContent = hideIdeasets ? 'Show ideasets' : 'Hide ideasets';
            refresh();
        });
        togglePhysics?.addEventListener('click', () => {
            livePhysics = !livePhysics;
            togglePhysics.classList.toggle('is-active', livePhysics);
            togglePhysics.setAttribute('aria-pressed', livePhysics ? 'true' : 'false');
            if (livePhysics) {
                wake();
            } else {
                stopLoop();
            }
        });
        fitButton?.addEventListener('click', () => {
            fitView(true);
        });
        resetButton?.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (pathInput) pathInput.value = '';
            if (statusSelect) statusSelect.value = '';
            if (tagSelect) tagSelect.value = '';
            hideExternal = false;
            hideIdeasets = false;
            toggleExternal?.classList.remove('is-active');
            toggleIdeasets?.classList.remove('is-active');
            if (toggleExternal) toggleExternal.textContent = 'Hide external';
            if (toggleIdeasets) toggleIdeasets.textContent = 'Hide ideasets';
            positions.clear();
            velocities.clear();
            pinnedIds.clear();
            userViewport = false;
            refresh();
        });
        refresh();
    }
}

function boot() {
    const root = document.body;
    wireTables(root);
    wireGraph(root);
    void wireGlobalSearch(root);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
`;

export function buildSearchIndexScript(documents: unknown): string {
    return `globalThis.__REQLAN_SEARCH_INDEX__ = ${JSON.stringify(documents).replace(/</g, '\\u003c')};\n`;
}
