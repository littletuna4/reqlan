/**
 * Shared Obsidian-style force step for Ideas Summary live physics and HTML export.
 * Gravity + edge springs + inverse-square repulsion; spatial grid for large n.
 * Plain ESM so the HTML export can embed it by stripping `export` keywords.
 */

/** @typedef {{
 *   gravity: number,
 *   repulsion: number,
 *   linkStrength: number,
 *   linkDistance: number,
 *   damping: number,
 *   maxVelocity: number,
 *   minSeparation: number,
 *   restSpeed: number,
 *   restTicks: number,
 *   repulsionCutoff?: number
 * }} PhysicsCoreSettings */

/** @typedef {{
 *   ids: string[],
 *   xs: Float64Array,
 *   ys: Float64Array,
 *   fxs: Float64Array,
 *   fys: Float64Array,
 *   velocities: Map<string, { vx: number, vy: number }>,
 *   pinnedIds: ReadonlySet<string>,
 *   edges: ReadonlyArray<{ sourceId: string, targetId: string }>
 * }} PhysicsStepState */

/**
 * Deterministic angle in [0, 2π) derived from a string.
 * @param {string} seed
 */
function hashAngleImpl(seed) {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 31 + seed.charCodeAt(index)) | 0;
    }
    return ((hash >>> 0) % 6283) / 1000;
}

/**
 * @param {number} i
 * @param {number} j
 * @param {string[]} ids
 * @param {Float64Array} xs
 * @param {Float64Array} ys
 * @param {Float64Array} fxs
 * @param {Float64Array} fys
 * @param {number} repulsion
 * @param {number} minSeparationSq
 * @param {number} cutoffSq
 */
function applyRepulsion(i, j, ids, xs, ys, fxs, fys, repulsion, minSeparationSq, cutoffSq) {
    let dx = xs[j] - xs[i];
    let dy = ys[j] - ys[i];
    let distSq = dx * dx + dy * dy;
    if (distSq > cutoffSq) {
        return;
    }
    if (distSq < 1e-6) {
        const angle = hashAngleImpl(ids[i] + ids[j]);
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        distSq = 1;
    }
    const clampedSq = Math.max(distSq, minSeparationSq);
    const dist = Math.sqrt(distSq);
    const force = repulsion / clampedSq;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    fxs[i] -= fx;
    fys[i] -= fy;
    fxs[j] += fx;
    fys[j] += fy;
}

/**
 * Zero fxs/fys then add gravity, repulsion, and edge springs.
 * Callers may add extra forces (e.g. group constraints) before integrateFromForces.
 * @param {PhysicsStepState} state
 * @param {PhysicsCoreSettings} settings
 */
function accumulateForcesImpl(state, settings) {
    const { ids, xs, ys, fxs, fys, edges } = state;
    const count = ids.length;
    fxs.fill(0);
    fys.fill(0);
    if (count === 0) {
        return;
    }

    const {
        gravity,
        repulsion,
        linkStrength,
        linkDistance,
        minSeparation,
        repulsionCutoff = 420
    } = settings;

    let centroidX = 0;
    let centroidY = 0;
    for (let i = 0; i < count; i += 1) {
        centroidX += xs[i];
        centroidY += ys[i];
    }
    centroidX /= count;
    centroidY /= count;
    for (let i = 0; i < count; i += 1) {
        fxs[i] -= gravity * (xs[i] - centroidX);
        fys[i] -= gravity * (ys[i] - centroidY);
    }

    const minSeparationSq = minSeparation * minSeparation;
    const cutoff = Math.max(minSeparation * 2, repulsionCutoff);
    const cutoffSq = cutoff * cutoff;

    if (count <= 80) {
        for (let i = 0; i < count; i += 1) {
            for (let j = i + 1; j < count; j += 1) {
                applyRepulsion(i, j, ids, xs, ys, fxs, fys, repulsion, minSeparationSq, cutoffSq);
            }
        }
    } else {
        const cellSize = cutoff;
        /** @type {Map<string, number[]>} */
        const grid = new Map();
        for (let i = 0; i < count; i += 1) {
            const key = `${Math.floor(xs[i] / cellSize)},${Math.floor(ys[i] / cellSize)}`;
            let bucket = grid.get(key);
            if (!bucket) {
                bucket = [];
                grid.set(key, bucket);
            }
            bucket.push(i);
        }
        for (let i = 0; i < count; i += 1) {
            const cx = Math.floor(xs[i] / cellSize);
            const cy = Math.floor(ys[i] / cellSize);
            for (let ox = -1; ox <= 1; ox += 1) {
                for (let oy = -1; oy <= 1; oy += 1) {
                    const bucket = grid.get(`${cx + ox},${cy + oy}`);
                    if (!bucket) continue;
                    for (let b = 0; b < bucket.length; b += 1) {
                        const j = bucket[b];
                        if (j <= i) continue;
                        applyRepulsion(i, j, ids, xs, ys, fxs, fys, repulsion, minSeparationSq, cutoffSq);
                    }
                }
            }
        }
    }

    const indexById = new Map();
    for (let i = 0; i < count; i += 1) {
        indexById.set(ids[i], i);
    }
    for (let e = 0; e < edges.length; e += 1) {
        const edge = edges[e];
        const sourceIndex = indexById.get(edge.sourceId);
        const targetIndex = indexById.get(edge.targetId);
        if (sourceIndex === undefined || targetIndex === undefined || sourceIndex === targetIndex) {
            continue;
        }
        const dx = xs[targetIndex] - xs[sourceIndex];
        const dy = ys[targetIndex] - ys[sourceIndex];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1e-3) {
            continue;
        }
        const force = linkStrength * (dist - linkDistance);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        fxs[sourceIndex] += fx;
        fys[sourceIndex] += fy;
        fxs[targetIndex] -= fx;
        fys[targetIndex] -= fy;
    }
}

/**
 * Semi-implicit Euler with damping; mutates xs/ys and velocities. Returns average speed.
 * @param {PhysicsStepState} state
 * @param {PhysicsCoreSettings} settings
 * @returns {number}
 */
function integrateFromForcesImpl(state, settings) {
    const { ids, xs, ys, fxs, fys, velocities, pinnedIds } = state;
    const { damping, maxVelocity } = settings;
    const count = ids.length;
    let speedSum = 0;
    let movingCount = 0;
    for (let i = 0; i < count; i += 1) {
        const id = ids[i];
        if (pinnedIds.has(id)) {
            continue;
        }
        const velocity = velocities.get(id) || { vx: 0, vy: 0 };
        let vx = (velocity.vx + fxs[i]) * damping;
        let vy = (velocity.vy + fys[i]) * damping;
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > maxVelocity) {
            const scale = maxVelocity / speed;
            vx *= scale;
            vy *= scale;
        }
        velocity.vx = vx;
        velocity.vy = vy;
        velocities.set(id, velocity);
        xs[i] += vx;
        ys[i] += vy;
        speedSum += Math.min(speed, maxVelocity);
        movingCount += 1;
    }
    return movingCount > 0 ? speedSum / movingCount : 0;
}

/**
 * @param {PhysicsStepState} state
 * @param {PhysicsCoreSettings} settings
 * @returns {number}
 */
function stepPhysicsImpl(state, settings) {
    accumulateForcesImpl(state, settings);
    return integrateFromForcesImpl(state, settings);
}

const ReqlanGraphPhysics = {
    /** @type {PhysicsCoreSettings} */
    DEFAULT_PHYSICS_SETTINGS: {
        gravity: 0.002,
        repulsion: 20000,
        linkStrength: 0.015,
        linkDistance: 120,
        damping: 0.5,
        maxVelocity: 10,
        minSeparation: 24,
        restSpeed: 0.02,
        restTicks: 90,
        repulsionCutoff: 420
    },
    hashAngle: hashAngleImpl,
    accumulateForces: accumulateForcesImpl,
    integrateFromForces: integrateFromForcesImpl,
    stepPhysics: stepPhysicsImpl
};

const DEFAULT_PHYSICS_SETTINGS = ReqlanGraphPhysics.DEFAULT_PHYSICS_SETTINGS;
const hashAngle = hashAngleImpl;
const accumulateForces = accumulateForcesImpl;
const integrateFromForces = integrateFromForcesImpl;
const stepPhysics = stepPhysicsImpl;


const searchIndexByRoot = new WeakMap();

function exportRootPrefix(root) {
    const searchUrl = root.dataset.searchIndex || '';
    const dataIdx = searchUrl.lastIndexOf('data/');
    return dataIdx >= 0 ? searchUrl.slice(0, dataIdx) : '';
}

function resolveExportUrl(root, url) {
    const cleaned = String(url || '').replace(/^\.\//, '');
    return `${exportRootPrefix(root)}${cleaned}`;
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

function mountSearchableCheckboxDropdown(host, onChange) {
    if (!host) {
        return {
            getSelected: () => [],
            clear: () => undefined,
            setOnChange: () => undefined
        };
    }
    if (host.__scdApi) {
        host.__scdApi.setOnChange(onChange);
        return host.__scdApi;
    }
    let options = [];
    try {
        options = JSON.parse(host.dataset.options || '[]');
    } catch {
        options = [];
    }
    const label = host.dataset.label || 'Filter';
    const placeholder = host.dataset.placeholder || 'Search…';
    let selected = new Set();
    let open = false;
    let searching = false;
    let query = '';
    let panel = null;
    let search = null;
    let searchRow = null;
    let clearBtn = null;
    let list = null;
    let listenersBound = false;
    let changeHandler = onChange;

    let trigger = host.querySelector('.scd-trigger');
    let triggerLabel = host.querySelector('.scd-trigger-label');
    if (!trigger) {
        trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'scd-trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        triggerLabel = document.createElement('span');
        triggerLabel.className = 'scd-trigger-label';
        const chevron = document.createElement('span');
        chevron.className = 'scd-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        trigger.append(triggerLabel, chevron);
        host.appendChild(trigger);
    }
    if (!trigger.querySelector('.scd-chevron')) {
        const chevron = document.createElement('span');
        chevron.className = 'scd-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        trigger.appendChild(chevron);
    }
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-busy', 'false');
    host.classList.remove('is-loading');
    host.dataset.scdReady = '1';

    function emitChange() {
        changeHandler?.([...selected]);
    }

    function syncTrigger() {
        const values = [...selected];
        host.dataset.selected = JSON.stringify(values);
        host.classList.toggle('has-selection', values.length > 0);
        if (!triggerLabel) return;
        if (values.length === 0) triggerLabel.textContent = label;
        else if (values.length === 1) {
            const match = options.find(option => option.value === values[0]);
            triggerLabel.textContent = match?.label || values[0];
        } else triggerLabel.textContent = `${values.length} selected`;
        if (clearBtn) clearBtn.hidden = values.length === 0;
    }

    function setSearching(next) {
        searching = next;
        host.classList.toggle('is-searching', searching);
        if (searchRow) searchRow.classList.toggle('is-active', searching);
    }

    function endSearching() {
        query = '';
        if (search) search.value = '';
        setSearching(false);
        if (search && document.activeElement === search) search.blur();
    }

    function ensurePanel() {
        if (panel) return;
        panel = document.createElement('div');
        panel.className = 'scd-panel';
        panel.hidden = true;
        panel.setAttribute('role', 'listbox');
        panel.setAttribute('aria-multiselectable', 'true');
        panel.setAttribute('aria-label', label);

        searchRow = document.createElement('div');
        searchRow.className = 'scd-search-row';
        search = document.createElement('input');
        search.type = 'search';
        search.className = 'scd-search';
        search.placeholder = placeholder;
        search.setAttribute('aria-label', `Search ${label}`);
        clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'scd-clear';
        clearBtn.textContent = 'Clear';
        clearBtn.hidden = true;
        searchRow.append(search, clearBtn);

        list = document.createElement('div');
        list.className = 'scd-list';
        panel.append(searchRow, list);
        host.appendChild(panel);

        search.addEventListener('focus', () => setSearching(true));
        search.addEventListener('blur', () => {
            if (!query.trim()) setSearching(false);
        });
        search.addEventListener('input', () => {
            query = search.value;
            if (query.trim()) setSearching(true);
            renderList();
        });
        clearBtn.addEventListener('click', () => {
            selected.clear();
            syncTrigger();
            renderList();
            emitChange();
        });
    }

    function renderList() {
        if (!list) return;
        const needle = lower(query.trim());
        const visible = options.filter(option => !needle || lower(option.label).includes(needle));
        list.innerHTML = '';
        if (visible.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'scd-empty';
            empty.textContent = 'No matches';
            list.appendChild(empty);
            return;
        }
        let lastGroup = '';
        for (const option of visible) {
            const group = option.special ? 'Special' : label;
            if (group !== lastGroup) {
                const groupLabel = document.createElement('div');
                groupLabel.className = 'scd-group-label';
                groupLabel.textContent = group;
                list.appendChild(groupLabel);
                lastGroup = group;
            }
            const row = document.createElement('label');
            row.className = 'scd-option';
            if (option.kind) row.classList.add(`is-${option.kind}`);
            if (option.special) row.classList.add('is-special');
            const box = document.createElement('input');
            box.type = 'checkbox';
            box.checked = selected.has(option.value);
            box.addEventListener('change', () => {
                if (box.checked) selected.add(option.value);
                else selected.delete(option.value);
                syncTrigger();
                emitChange();
            });
            const text = document.createElement('span');
            text.className = 'scd-option-label';
            text.textContent = option.label;
            row.append(box, text);
            if (typeof option.count === 'number') {
                const count = document.createElement('span');
                count.className = 'scd-option-count';
                count.textContent = String(option.count);
                row.appendChild(count);
            }
            list.appendChild(row);
        }
    }

    function onDocPointerDown(event) {
        if (!open) return;
        if (!host.contains(event.target)) setOpen(false);
    }

    function onKeyDown(event) {
        if (event.key !== 'Escape' || !open) return;
        if (searching || query.trim()) {
            endSearching();
            renderList();
            event.stopPropagation();
            return;
        }
        setOpen(false);
    }

    function onPeerOpen(event) {
        if (!open) return;
        if (event.detail?.source && event.detail.source !== host) setOpen(false);
    }

    function bindListeners() {
        if (listenersBound) return;
        document.addEventListener('pointerdown', onDocPointerDown);
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('reqlan-scd-open', onPeerOpen);
        listenersBound = true;
    }

    function unbindListeners() {
        if (!listenersBound) return;
        document.removeEventListener('pointerdown', onDocPointerDown);
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('reqlan-scd-open', onPeerOpen);
        listenersBound = false;
    }

    function setOpen(next) {
        open = next;
        host.classList.toggle('is-open', open);
        if (open) {
            ensurePanel();
            panel.hidden = false;
            trigger.setAttribute('aria-expanded', 'true');
            setSearching(false);
            renderList();
            bindListeners();
            document.dispatchEvent(new CustomEvent('reqlan-scd-open', { detail: { source: host } }));
        } else {
            if (panel) panel.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
            endSearching();
            unbindListeners();
        }
    }

    trigger.addEventListener('click', () => setOpen(!open));
    syncTrigger();
    const api = {
        getSelected: () => [...selected],
        clear: () => {
            selected.clear();
            syncTrigger();
            if (open) renderList();
        },
        setOnChange: (fn) => {
            changeHandler = fn;
        }
    };
    host.__scdApi = api;
    return api;
}

function enhanceScdPlaceholders(root) {
    for (const host of root.querySelectorAll('[data-graph-status-scd], [data-graph-tag-scd]')) {
        mountSearchableCheckboxDropdown(host, null);
    }
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
            : matches.map(({ doc }) => `
                <a class="search-result" href="${resolveExportUrl(root, doc.url)}">
                    <div class="pill-row">
                        <span class="pill">${doc.kind}</span>
                        ${doc.status ? `<span class="pill">${doc.status}</span>` : ''}
                    </div>
                    <strong>${doc.title}</strong>
                    <p class="subtle">${doc.summary || ''}</p>
                </a>
            `).join('');
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
const COLUMNS_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M9 4v16M15 4v16"></path></svg>';
const EYE_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
const EYE_OFF_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.77 21.77 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-2.16 3.19"></path><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

function setUiDragLock(locked) {
    document.documentElement.classList.toggle('is-ui-dragging', locked);
    if (!locked) return;
    const selection = window.getSelection?.();
    if (selection && typeof selection.removeAllRanges === 'function') {
        selection.removeAllRanges();
    }
}

function isLayoutDragInteractiveTarget(target, handle) {
    if (!(target instanceof Element)) return false;
    const interactive = target.closest(
        'a, button, input, select, textarea, label, .actions, [data-layout-resize], .col-resize-handle, .col-visibility-toggle'
    );
    return Boolean(interactive && interactive !== handle);
}

function ensureTableActionsHost(table) {
    const shell = table.closest('.table-shell') || table.parentElement;
    const toolbar = shell
        ? (shell.querySelector(':scope > .layout-card-head.toolbar')
            || shell.querySelector(':scope > .toolbar'))
        : null;
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
    return actions;
}

function ensureTableFilterToggle(table, filterRow, filterInputs, syncToggleState) {
    const actions = ensureTableActionsHost(table);
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

// rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export_table_columns]
function tableColumnStorageKey(table) {
    const card = table.closest('[data-layout-id]');
    const id = card?.getAttribute('data-layout-id')
        || [...(table.tHead?.rows?.[0]?.cells || [])]
            .map((th) => th.getAttribute('data-filter-key') || '')
            .filter(Boolean)
            .join('-')
        || 'table';
    return `reqlan-export:table-cols:${window.location.pathname}:${id}`;
}

function readTableColumnState(table) {
    try {
        const raw = window.localStorage.getItem(tableColumnStorageKey(table));
        if (!raw) return { hidden: {}, widths: {} };
        const parsed = JSON.parse(raw);
        return {
            hidden: parsed && typeof parsed.hidden === 'object' && parsed.hidden ? parsed.hidden : {},
            widths: parsed && typeof parsed.widths === 'object' && parsed.widths ? parsed.widths : {},
        };
    } catch (_error) {
        return { hidden: {}, widths: {} };
    }
}

function writeTableColumnState(table, state) {
    try {
        window.localStorage.setItem(tableColumnStorageKey(table), JSON.stringify(state));
    } catch (_error) {
        // Ignore quota / private-mode failures.
    }
}

function columnKeyForHeader(th, index) {
    const filterKey = String(th.getAttribute('data-filter-key') || '').trim();
    return filterKey || `col-${index}`;
}

function applyColumnHidden(table, index, hidden) {
    const rows = [
        ...(table.tHead ? [...table.tHead.rows] : []),
        ...(table.tBodies[0] ? [...table.tBodies[0].rows] : []),
    ];
    for (const row of rows) {
        const cell = row.cells[index];
        if (cell) cell.classList.toggle('is-col-hidden', hidden);
    }
}

function applyColumnWidth(table, index, widthPx) {
    const header = table.tHead?.rows?.[0]?.cells?.[index];
    if (!header) return;
    if (widthPx == null || !Number.isFinite(widthPx) || widthPx <= 0) {
        header.style.width = '';
        header.style.minWidth = '';
        header.style.maxWidth = '';
        return;
    }
    const px = `${Math.round(widthPx)}px`;
    header.style.width = px;
    header.style.minWidth = px;
    header.style.maxWidth = px;
}

function mountTableColumnControls(table, headers) {
    if (document.body.getAttribute('data-runtime-mode') !== 'interactive') return null;
    const state = readTableColumnState(table);
    const labels = headers.map((th, index) => {
        const sortLabel = th.querySelector('.sort-button span')?.textContent;
        return String(sortLabel || th.textContent || `Column ${index + 1}`).trim();
    });
    let lastAnchor = -1;
    let resizeSession = null;

    function persist() {
        writeTableColumnState(table, state);
        syncSelectorChrome();
    }

    function setHidden(index, hidden, { persistState = true } = {}) {
        const key = columnKeyForHeader(headers[index], index);
        applyColumnHidden(table, index, hidden);
        if (hidden) state.hidden[key] = true;
        else delete state.hidden[key];
        const eye = headers[index]?.querySelector('.col-visibility-toggle');
        if (eye) {
            eye.setAttribute('aria-pressed', hidden ? 'true' : 'false');
            eye.setAttribute('aria-label', hidden ? `Show ${labels[index]}` : `Hide ${labels[index]}`);
            eye.innerHTML = hidden ? EYE_OFF_ICON_SVG : EYE_ICON_SVG;
            eye.title = hidden ? 'Show column' : 'Hide column';
        }
        if (persistState) persist();
        else syncSelectorChrome();
    }

    function visibleCount() {
        return headers.reduce((count, th, index) => {
            const key = columnKeyForHeader(th, index);
            return count + (state.hidden[key] ? 0 : 1);
        }, 0);
    }

    headers.forEach((th, index) => {
        const key = columnKeyForHeader(th, index);
        const eye = document.createElement('button');
        eye.type = 'button';
        eye.className = 'col-visibility-toggle';
        eye.setAttribute('aria-pressed', 'false');
        eye.setAttribute('aria-label', `Hide ${labels[index]}`);
        eye.title = 'Hide column';
        eye.innerHTML = EYE_ICON_SVG;
        eye.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const willHide = !th.classList.contains('is-col-hidden');
            if (willHide && visibleCount() <= 1) return;
            setHidden(index, willHide);
            renderSelectorList();
        });
        const handle = document.createElement('span');
        handle.className = 'col-resize-handle';
        handle.setAttribute('aria-hidden', 'true');
        handle.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const startWidth = th.getBoundingClientRect().width;
            resizeSession = {
                index,
                startX: event.clientX,
                startWidth,
                pointerId: event.pointerId,
            };
            th.classList.add('is-col-resizing');
            setUiDragLock(true);
            handle.setPointerCapture(event.pointerId);
        });
        th.append(eye, handle);
        if (state.hidden[key]) setHidden(index, true, { persistState: false });
        if (state.widths[key] != null) applyColumnWidth(table, index, Number(state.widths[key]));
    });

    const actions = ensureTableActionsHost(table);
    const host = document.createElement('div');
    host.className = 'table-columns';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'table-columns-toggle';
    toggle.setAttribute('aria-haspopup', 'listbox');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Select visible columns');
    toggle.title = 'Columns';
    toggle.innerHTML = COLUMNS_ICON_SVG;
    const panel = document.createElement('div');
    panel.className = 'table-columns-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'listbox');
    panel.setAttribute('aria-multiselectable', 'true');
    panel.setAttribute('aria-label', 'Visible columns');
    const toolbar = document.createElement('div');
    toolbar.className = 'table-columns-toolbar';
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'table-columns-search';
    search.placeholder = 'Search columns…';
    search.setAttribute('aria-label', 'Search columns');
    const selectAll = document.createElement('button');
    selectAll.type = 'button';
    selectAll.className = 'table-columns-action';
    selectAll.textContent = 'Select all';
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'table-columns-action';
    clearBtn.textContent = 'Clear';
    const list = document.createElement('div');
    list.className = 'table-columns-list';
    toolbar.append(search, selectAll, clearBtn);
    panel.append(toolbar, list);
    host.append(toggle, panel);
    actions.appendChild(host);

    function syncSelectorChrome() {
        const hiddenCount = headers.reduce((count, th, index) => {
            const key = columnKeyForHeader(th, index);
            return count + (state.hidden[key] ? 1 : 0);
        }, 0);
        host.classList.toggle('has-hidden', hiddenCount > 0);
        toggle.classList.toggle('is-active', !panel.hidden);
    }

    function setOpen(open) {
        panel.hidden = !open;
        host.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.classList.toggle('is-active', open);
        if (open) {
            renderSelectorList();
            search.focus();
        }
        syncSelectorChrome();
    }

    function renderSelectorList() {
        const needle = lower(search.value.trim());
        list.replaceChildren();
        const visibleIndexes = [];
        headers.forEach((th, index) => {
            if (needle && !lower(labels[index]).includes(needle)) return;
            visibleIndexes.push(index);
            const key = columnKeyForHeader(th, index);
            const row = document.createElement('label');
            row.className = 'table-columns-option';
            row.dataset.colIndex = String(index);
            const box = document.createElement('input');
            box.type = 'checkbox';
            box.checked = !state.hidden[key];
            box.addEventListener('click', (event) => {
                const willShow = box.checked;
                if (!willShow && visibleCount() <= 1) {
                    event.preventDefault();
                    box.checked = true;
                    return;
                }
                if (event.shiftKey && lastAnchor >= 0) {
                    const from = Math.min(lastAnchor, index);
                    const to = Math.max(lastAnchor, index);
                    const hide = !willShow;
                    for (let i = from; i <= to; i += 1) {
                        if (hide && visibleCount() <= 1 && !headers[i].classList.contains('is-col-hidden')) {
                            continue;
                        }
                        setHidden(i, hide, { persistState: false });
                    }
                    persist();
                    lastAnchor = index;
                    renderSelectorList();
                    return;
                }
                setHidden(index, !willShow);
                lastAnchor = index;
                renderSelectorList();
            });
            const text = document.createElement('span');
            text.textContent = labels[index];
            row.append(box, text);
            if (box.checked) row.classList.add('is-active');
            list.appendChild(row);
        });
        if (visibleIndexes.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'table-columns-empty';
            empty.textContent = 'No matches';
            list.appendChild(empty);
        }
    }

    toggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setOpen(panel.hidden);
    });
    search.addEventListener('input', () => renderSelectorList());
    selectAll.addEventListener('click', () => {
        headers.forEach((_th, index) => setHidden(index, false, { persistState: false }));
        persist();
        renderSelectorList();
    });
    clearBtn.addEventListener('click', () => {
        // Keep the first visible column so the table never empties.
        let kept = false;
        headers.forEach((_th, index) => {
            if (!kept) {
                setHidden(index, false, { persistState: false });
                kept = true;
                return;
            }
            setHidden(index, true, { persistState: false });
        });
        persist();
        renderSelectorList();
    });

    document.addEventListener('pointerdown', (event) => {
        if (panel.hidden) return;
        if (!host.contains(event.target)) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !panel.hidden) {
            setOpen(false);
            toggle.focus();
        }
    });

    document.addEventListener('pointermove', (event) => {
        if (!resizeSession || event.pointerId !== resizeSession.pointerId) return;
        event.preventDefault();
        const next = Math.max(56, resizeSession.startWidth + (event.clientX - resizeSession.startX));
        applyColumnWidth(table, resizeSession.index, next);
        const key = columnKeyForHeader(headers[resizeSession.index], resizeSession.index);
        state.widths[key] = next;
    });
    function endColResize(event) {
        if (!resizeSession || event.pointerId !== resizeSession.pointerId) return;
        headers[resizeSession.index]?.classList.remove('is-col-resizing');
        persist();
        resizeSession = null;
        setUiDragLock(false);
    }
    document.addEventListener('pointerup', endColResize);
    document.addEventListener('pointercancel', endColResize);
    document.addEventListener('selectstart', (event) => {
        if (resizeSession) event.preventDefault();
    });

    syncSelectorChrome();
    return { setHidden, persist };
}

function wireTables(root) {
    const tables = root.querySelectorAll('table');
    const tableControllers = [];
    const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

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
                    ? root.querySelector(`[data-filter-input="${filterId}"]`)
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
            const label = String(th.textContent || '').trim() || `Column ${index + 1}`;
            const filterKey = String(th.getAttribute('data-filter-key') || '').trim();
            th.classList.add('sortable-th');
            th.replaceChildren();
            if (filterKey) {
                th.setAttribute('data-filter-key', filterKey);
            }
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'sort-button';
            button.dataset.sortCol = String(index);
            button.setAttribute('aria-label', `Sort by ${label}`);
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
            const label = String(th.querySelector('.sort-button span')?.textContent || `Column ${index + 1}`);
            const filterKey = String(th.getAttribute('data-filter-key') || '').trim().toLowerCase();
            const cell = document.createElement('th');
            const input = document.createElement('input');
            input.type = 'search';
            input.className = 'column-filter';
            input.placeholder = 'Filter…';
            input.dataset.colFilter = String(index);
            if (filterKey) {
                input.dataset.filterKey = filterKey;
            }
            input.setAttribute('aria-label', `Filter ${label}`);
            input.addEventListener('input', () => controller.applyFilters());
            filterInputs.push(input);
            cell.appendChild(input);
            filterRow.appendChild(cell);
        });
        thead.appendChild(filterRow);
        filterToggle = ensureTableFilterToggle(table, filterRow, filterInputs, syncToggleState);
        mountTableColumnControls(table, headers);
        tableControllers.push(controller);

        let seeded = false;
        for (const input of filterInputs) {
            const key = String(input.dataset.filterKey || '').trim().toLowerCase();
            if (!key) continue;
            const aliases = [key];
            if (key === 'tags') aliases.push('tag');
            if (key === 'status') aliases.push('statuses');
            if (key === 'cluster') aliases.push('label');
            let value = '';
            for (const alias of aliases) {
                if (params.has(alias)) {
                    value = params.get(alias) || '';
                    break;
                }
            }
            if (!value) continue;
            input.value = value;
            seeded = true;
        }
        if (seeded) {
            filterRow.classList.add('is-open');
            filterToggle.classList.add('is-active', 'has-filters');
            filterToggle.setAttribute('aria-expanded', 'true');
            controller.applyFilters();
        }
    }

    const inputs = root.querySelectorAll('[data-filter-input]');
    for (const input of inputs) {
        input.addEventListener('input', () => {
            const targetId = input.dataset.filterInput;
            for (const controller of tableControllers) {
                const ownsRows = controller.tbody.querySelector(`[data-filter-row="${targetId}"]`);
                if (ownsRows) {
                    controller.applyFilters();
                }
            }
        });
    }
}

const EXPORT_PHYSICS_SETTINGS = ReqlanGraphPhysics.DEFAULT_PHYSICS_SETTINGS;

// Tight visual radii for denser canvas packing (labels still show full names).
const GRAPH_NODE_RADIUS = 7;
const GRAPH_SUBJECT_RADIUS = 10;
const GRAPH_LABEL_MAX_WIDTH = 132;
const GRAPH_HIT_PAD = 6;
// Auto-mode opacity ramp: fully hidden below START, fully opaque at END (brief muted band between).
const GRAPH_LABEL_FADE_START = 0.62;
const GRAPH_LABEL_FADE_END = 0.82;
const GRAPH_LABEL_MODES = ['auto', 'on', 'off'];
const FILE_TREATMENT_MODES = ['invisible', 'compound', 'linked'];

function fileIdeasetNodeId(fileUri) {
    return 'rq-file:' + fileUri;
}

function isFileIdeasetNode(node) {
    return Boolean(node && (node.isFileIdeaset || String(node.id || '').startsWith('rq-file:')));
}

function fileIdeasetDisplayName(fileUri) {
    const trimmed = String(fileUri || '').replace(/\\\\/g, '/');
    const slash = trimmed.lastIndexOf('/');
    const fileName = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
    return fileName.endsWith('.rq') ? fileName.slice(0, -3) : fileName;
}

function fileTreatmentLabel(mode) {
    if (mode === 'compound') return 'Files: compound';
    if (mode === 'linked') return 'Files: linked';
    return 'Files: hidden';
}

function applyFileTreatment(graph, treatment) {
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph.edges) ? graph.edges : [];
    const baseNodes = nodes.filter(node => !isFileIdeasetNode(node));
    const keep = new Set(baseNodes.map(node => node.id));
    const baseEdges = edges.filter(edge => keep.has(edge.sourceId) && keep.has(edge.targetId));
    if (treatment !== 'linked') {
        return { ...graph, nodes: baseNodes, edges: baseEdges };
    }
    const membersByFile = new Map();
    for (const node of baseNodes) {
        if (node.isExternal || !node.fileUri) continue;
        const list = membersByFile.get(node.fileUri) || [];
        list.push(node);
        membersByFile.set(node.fileUri, list);
    }
    const extraNodes = [];
    const extraEdges = [];
    for (const fileUri of [...membersByFile.keys()].sort()) {
        const members = membersByFile.get(fileUri) || [];
        if (!members.length) continue;
        const id = fileIdeasetNodeId(fileUri);
        const name = fileIdeasetDisplayName(fileUri);
        extraNodes.push({
            id,
            name,
            kind: 'ideaset',
            fileUri,
            lineStart: 0,
            tags: [],
            isFileIdeaset: true,
            pageUrl: members.find(member => member.hostFilePageUrl)?.hostFilePageUrl
                || members.find(member => member.pageUrl)?.pageUrl
                || undefined
        });
        for (const member of members) {
            extraEdges.push({
                id: id + '->ideaset_member:' + member.id,
                sourceId: id,
                targetId: member.id,
                kind: 'ideaset_member',
                label: name
            });
        }
    }
    return {
        ...graph,
        nodes: baseNodes.concat(extraNodes),
        edges: baseEdges.concat(extraEdges)
    };
}

function wireGraph(root) {
    const graphRoots = root.querySelectorAll('[data-graph-json]');
    for (const element of graphRoots) {
        const scriptId = element.dataset.graphJson;
        const dataElement = root.querySelector(`#${scriptId}`);
        if (!dataElement) continue;
        let graph;
        try {
            graph = JSON.parse(dataElement.textContent || '{}');
        } catch {
            continue;
        }
        let controls = root.querySelector(`[data-graph-controls="${scriptId}"]`);
        if (!controls) {
            controls = document.createElement('div');
            controls.className = 'graph-controls-bar';
            controls.dataset.graphControls = scriptId;
            controls.innerHTML = '<button type="button" class="graph-action is-active" data-graph-toggle-labels data-label-mode="auto" aria-pressed="mixed">Labels: auto</button><button type="button" class="graph-action" data-graph-toggle-physics aria-pressed="false">Live physics</button><button type="button" class="graph-action" data-graph-fit>Fit</button><span class="graph-status" data-graph-status-text></span>';
            element.parentElement?.insertBefore(controls, element);
        }
        const searchInput = controls.querySelector('[data-graph-search]');
        const pathInput = controls.querySelector('[data-graph-path]');
        const statusHost = controls.querySelector('[data-graph-status-scd]');
        const tagHost = controls.querySelector('[data-graph-tag-scd]');
        const toggleExternal = controls.querySelector('[data-graph-toggle-external]');
        const toggleIdeasets = controls.querySelector('[data-graph-toggle-ideasets]');
        const fileTreatmentSelect = controls.querySelector('[data-graph-file-treatment]');
        const toggleWildcard = controls.querySelector('[data-graph-toggle-wildcard]');
        const toggleLabels = controls.querySelector('[data-graph-toggle-labels]');
        const togglePhysics = controls.querySelector('[data-graph-toggle-physics]');
        const fitButton = controls.querySelector('[data-graph-fit]');
        const resetButton = controls.querySelector('[data-graph-reset]');
        const statusText = controls.querySelector('[data-graph-status-text]');
        if (statusText) statusText.textContent = 'Initialising graph…';
        element.classList.add('is-booting');
        let hideExternal = false;
        let hideIdeasets = false;
        let fileTreatment = fileTreatmentSelect?.value || 'linked';
        let includeWildcardRefs = true;
        let labelMode = 'auto';
        let statusSelected = [];
        let tagSelected = [];
        const statusFilter = mountSearchableCheckboxDropdown(statusHost, (values) => {
            statusSelected = values;
            refresh();
        });
        const tagFilter = mountSearchableCheckboxDropdown(tagHost, (values) => {
            tagSelected = values;
            refresh();
        });
        statusSelected = statusFilter.getSelected();
        tagSelected = tagFilter.getSelected();
        let livePhysics = false;
        let animationFrame = 0;
        let settleFrame = 0;
        let settleGeneration = 0;
        // While true, auto labels stay at opacity 0 so text paint does not lag settle.
        let settlingLayout = false;
        let calmTicks = 0;
        let simNodes = [];
        let simEdges = [];
        const positions = new Map();
        const velocities = new Map();
        let canvas;
        let ctx;
        let cssWidth = 1200;
        let cssHeight = 640;
        const pinnedIds = new Set();
        let view = { x: 0, y: 0, w: 1200, h: 640 };
        let userViewport = false;
        let dragNodeId = null;
        let dragCompound = null;
        let dragMoved = false;
        let panMode = false;
        let panOrigin = null;
        let suppressClickUntil = 0;
        let hoverNodeId = null;
        let hoverCompound = null;
        let pulsePhase = 0;
        let compoundRegions = [];

        function resolveGraphNodeUrl(pageUrl) {
            let cleaned = String(pageUrl || '').replace(/^\.\//, '');
            if (cleaned && !cleaned.includes('/') && cleaned.endsWith('.html')) {
                cleaned = `ideas/${cleaned}`;
            }
            return resolveExportUrl(root, cleaned);
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

        function nodeRadius(node) {
            return node.isSubject || node.id === graph.centerId ? GRAPH_SUBJECT_RADIUS : GRAPH_NODE_RADIUS;
        }

        function seedMissingPositions(nodes, width, height, centerId) {
            const cx = width / 2;
            const cy = height / 2;
            const subject = nodes.find(node => node.isSubject || node.id === centerId);
            const radius = Math.min(width, height) * 0.22;
            nodes.forEach((node, index) => {
                if (positions.has(node.id)) return;
                if (subject && node.id === subject.id) {
                    positions.set(node.id, { x: cx, y: cy });
                    return;
                }
                const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1) - Math.PI / 2;
                const ring = radius * (0.7 + (index % 3) * 0.12);
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
            const count = nodes.length;
            if (count === 0) return 0;
            const ids = new Array(count);
            const xs = new Float64Array(count);
            const ys = new Float64Array(count);
            const fxs = new Float64Array(count);
            const fys = new Float64Array(count);
            for (let i = 0; i < count; i += 1) {
                const node = nodes[i];
                const pos = positions.get(node.id) || { x: 0, y: 0 };
                ids[i] = node.id;
                xs[i] = pos.x;
                ys[i] = pos.y;
            }
            const averageSpeed = ReqlanGraphPhysics.stepPhysics({
                ids,
                xs,
                ys,
                fxs,
                fys,
                velocities,
                pinnedIds,
                edges
            }, EXPORT_PHYSICS_SETTINGS);
            for (let i = 0; i < count; i += 1) {
                positions.set(ids[i], { x: xs[i], y: ys[i] });
            }
            return averageSpeed;
        }

        function contentBounds() {
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const node of simNodes) {
                const pos = positions.get(node.id);
                if (!pos) continue;
                const r = nodeRadius(node);
                minX = Math.min(minX, pos.x - r);
                minY = Math.min(minY, pos.y - r);
                maxX = Math.max(maxX, pos.x + r);
                // Reserve label space only when labels are forced on; auto hides when fitted/zoomed out.
                maxY = Math.max(maxY, pos.y + r + (labelMode === 'on' ? 54 : 0));
            }
            if (!Number.isFinite(minX)) {
                return { minX: 0, minY: 0, maxX: 1200, maxY: 640 };
            }
            return { minX, minY, maxX, maxY };
        }

        function syncLabelsButton() {
            if (!toggleLabels) return;
            const label = labelMode === 'auto' ? 'Labels: auto' : labelMode === 'on' ? 'Labels: on' : 'Labels: off';
            toggleLabels.textContent = label;
            toggleLabels.dataset.labelMode = labelMode;
            toggleLabels.classList.toggle('is-active', labelMode !== 'off');
            toggleLabels.setAttribute('aria-pressed', labelMode === 'auto' ? 'mixed' : labelMode === 'on' ? 'true' : 'false');
        }

        function labelOpacityAtScale(scale) {
            if (labelMode === 'on') return 1;
            if (labelMode === 'off') return 0;
            if (scale <= GRAPH_LABEL_FADE_START) return 0;
            if (scale >= GRAPH_LABEL_FADE_END) return 1;
            return (scale - GRAPH_LABEL_FADE_START) / (GRAPH_LABEL_FADE_END - GRAPH_LABEL_FADE_START);
        }

        function fitView(force = false) {
            if (userViewport && !force) return;
            const bounds = contentBounds();
            const pad = 56;
            let x = bounds.minX - pad;
            let y = bounds.minY - pad;
            let w = Math.max(360, bounds.maxX - bounds.minX + pad * 2);
            let h = Math.max(360, bounds.maxY - bounds.minY + pad * 2);
            // Match canvas aspect so uniform scale fills without squashing (SVG viewBox meet).
            const canvasAspect = cssWidth / Math.max(1, cssHeight);
            const viewAspect = w / h;
            if (viewAspect < canvasAspect) {
                const widened = h * canvasAspect;
                x -= (widened - w) / 2;
                w = widened;
            } else if (viewAspect > canvasAspect) {
                const heightened = w / canvasAspect;
                y -= (heightened - h) / 2;
                h = heightened;
            }
            view = { x, y, w, h };
            userViewport = false;
        }

        function viewportTransform() {
            const scale = Math.min(cssWidth / Math.max(1, view.w), cssHeight / Math.max(1, view.h));
            return {
                scale,
                offsetX: (cssWidth - view.w * scale) / 2,
                offsetY: (cssHeight - view.h * scale) / 2
            };
        }

        function wrapLines(text, maxWidth, font) {
            if (!text) return [];
            ctx.font = font;
            const words = String(text).split(/\\s+/);
            const lines = [];
            let current = '';
            for (const word of words) {
                const next = current ? `${current} ${word}` : word;
                if (ctx.measureText(next).width <= maxWidth) {
                    current = next;
                } else {
                    if (current) lines.push(current);
                    if (ctx.measureText(word).width <= maxWidth) {
                        current = word;
                    } else {
                        let chunk = '';
                        for (const ch of word) {
                            const trial = chunk + ch;
                            if (ctx.measureText(trial).width <= maxWidth) chunk = trial;
                            else {
                                if (chunk) lines.push(chunk);
                                chunk = ch;
                            }
                        }
                        current = chunk;
                    }
                }
            }
            if (current) lines.push(current);
            return lines;
        }

        function nodeFill(node) {
            if (node.isSubject || node.id === graph.centerId) return '#b85c38';
            if (node.isExternal) return '#8a4530';
            if (node.kind === 'ideaset') return '#e0a24a';
            return '#07a0e5';
        }

        function nodeStroke(node, hover) {
            if (hover) return '#0bbefb';
            if (node.isSubject || node.id === graph.centerId) return '#0bbefb';
            if (node.isExternal) return 'rgba(184,92,56,0.55)';
            if (node.kind === 'ideaset') return '#d18616';
            return 'rgba(235,228,222,0.35)';
        }

        function paint() {
            if (!canvas || !ctx) return;
            if (!userViewport) fitView(false);
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            const nextW = Math.max(1, Math.floor(cssWidth * dpr));
            const nextH = Math.max(1, Math.floor(cssHeight * dpr));
            if (canvas.width !== nextW || canvas.height !== nextH) {
                canvas.width = nextW;
                canvas.height = nextH;
            }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, cssWidth, cssHeight);
            ctx.fillStyle = '#14100e';
            ctx.fillRect(0, 0, cssWidth, cssHeight);

            const { scale, offsetX, offsetY } = viewportTransform();
            // Auto labels stay invisible during batch settle ([graph_label_auto] / html_export_graph_label_auto).
            const ambientLabelOpacity =
                settlingLayout && labelMode === 'auto' ? 0 : labelOpacityAtScale(scale);
            ctx.save();
            ctx.translate(offsetX, offsetY);
            ctx.scale(scale, scale);
            ctx.translate(-view.x, -view.y);

            if (fileTreatment === 'compound') {
                compoundRegions = [];
                const byFile = new Map();
                for (const node of simNodes) {
                    if (node.isExternal || isFileIdeasetNode(node) || !node.fileUri) continue;
                    const list = byFile.get(node.fileUri) || [];
                    list.push(node);
                    byFile.set(node.fileUri, list);
                }
                for (const [fileUri, members] of byFile) {
                    let minX = Infinity;
                    let minY = Infinity;
                    let maxX = -Infinity;
                    let maxY = -Infinity;
                    let any = false;
                    let pageUrl;
                    for (const node of members) {
                        const pos = positions.get(node.id);
                        if (!pos) continue;
                        const r = nodeRadius(node) + 14;
                        any = true;
                        minX = Math.min(minX, pos.x - r);
                        minY = Math.min(minY, pos.y - r);
                        maxX = Math.max(maxX, pos.x + r);
                        maxY = Math.max(maxY, pos.y + r);
                        pageUrl = pageUrl || node.hostFilePageUrl || node.pageUrl;
                    }
                    if (!any) continue;
                    const pad = 8;
                    const x = minX - pad;
                    const y = minY - pad;
                    const w = (maxX - minX) + pad * 2;
                    const h = (maxY - minY) + pad * 2;
                    const titleH = 18;
                    const label = fileIdeasetDisplayName(fileUri);
                    compoundRegions.push({
                        fileUri,
                        pageUrl,
                        memberIds: members.map(member => member.id),
                        x,
                        y,
                        w,
                        h,
                        titleY: y - titleH,
                        titleH,
                        label
                    });
                    const radius = 10;
                    const hover = hoverCompound && hoverCompound.fileUri === fileUri;
                    ctx.beginPath();
                    ctx.moveTo(x + radius, y);
                    ctx.arcTo(x + w, y, x + w, y + h, radius);
                    ctx.arcTo(x + w, y + h, x, y + h, radius);
                    ctx.arcTo(x, y + h, x, y, radius);
                    ctx.arcTo(x, y, x + w, y, radius);
                    ctx.closePath();
                    ctx.fillStyle = hover ? 'rgba(209, 134, 22, 0.14)' : 'rgba(209, 134, 22, 0.08)';
                    ctx.fill();
                    ctx.strokeStyle = hover ? 'rgba(224, 162, 74, 0.85)' : 'rgba(209, 134, 22, 0.45)';
                    ctx.lineWidth = (hover ? 1.8 : 1.2) / scale;
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(224, 162, 74, 0.95)';
                    ctx.font = `600 ${11 / scale}px "IBM Plex Sans", system-ui, sans-serif`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(label, x + 6, y - 4 / scale);
                    // Underline title to signal clickability.
                    const titleWidth = ctx.measureText(label).width;
                    ctx.beginPath();
                    ctx.moveTo(x + 6, y - 2 / scale);
                    ctx.lineTo(x + 6 + titleWidth, y - 2 / scale);
                    ctx.strokeStyle = 'rgba(224, 162, 74, 0.85)';
                    ctx.lineWidth = 1 / scale;
                    ctx.stroke();
                }
            } else {
                compoundRegions = [];
            }

            ctx.lineWidth = 1.1 / scale;
            ctx.strokeStyle = 'rgba(61,47,40,0.85)';
            ctx.globalAlpha = 0.85;
            for (const edge of simEdges) {
                const source = positions.get(edge.sourceId);
                const target = positions.get(edge.targetId);
                if (!source || !target) continue;
                const isWildcard = edge.kind === 'wildcard_reference';
                ctx.setLineDash(isWildcard ? [2 / scale, 3.5 / scale] : []);
                ctx.beginPath();
                ctx.moveTo(source.x, source.y);
                ctx.lineTo(target.x, target.y);
                ctx.stroke();
            }
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;

            pulsePhase = (pulsePhase + 0.035) % (Math.PI * 2);
            for (const node of simNodes) {
                const pos = positions.get(node.id);
                if (!pos) continue;
                const r = nodeRadius(node);
                const hover = node.id === hoverNodeId || node.id === dragNodeId;
                const isSubject = node.isSubject || node.id === graph.centerId;
                if (isSubject) {
                    const glow = 4 + Math.sin(pulsePhase) * 3;
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, r + glow, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(184,92,56,0.22)';
                    ctx.fill();
                }
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
                ctx.fillStyle = nodeFill(node);
                ctx.fill();
                ctx.lineWidth = (isSubject ? 2.2 : hover ? 2 : 1.15) / scale;
                ctx.strokeStyle = nodeStroke(node, hover);
                ctx.stroke();

                // Auto: continuous opacity from zoom; hovered/dragged nodes stay fully opaque.
                const labelOpacity = hover && labelMode === 'auto' ? 1 : ambientLabelOpacity;
                if (labelOpacity <= 0) continue;
                const meta = formatNodeMeta(node);
                const attrs = formatNodeAttrs(node);
                const nameFont = isSubject ? '600 11px Inter, system-ui, sans-serif' : '600 10px Inter, system-ui, sans-serif';
                const metaFont = '9.5px Inter, system-ui, sans-serif';
                const nameLines = wrapLines(node.name, GRAPH_LABEL_MAX_WIDTH, nameFont);
                const metaLines = wrapLines(meta, GRAPH_LABEL_MAX_WIDTH, metaFont);
                const attrLines = wrapLines(attrs, GRAPH_LABEL_MAX_WIDTH, metaFont);
                let ty = pos.y + r + 12;
                ctx.save();
                ctx.globalAlpha = labelOpacity;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillStyle = isSubject ? '#0bbefb' : '#ebe4de';
                ctx.font = nameFont;
                for (const line of nameLines) {
                    ctx.lineWidth = 3 / scale;
                    ctx.strokeStyle = '#14100e';
                    ctx.strokeText(line, pos.x, ty);
                    ctx.fillText(line, pos.x, ty);
                    ty += 12;
                }
                ctx.fillStyle = '#a89488';
                ctx.font = metaFont;
                for (const line of metaLines) {
                    ctx.fillText(line, pos.x, ty);
                    ty += 11;
                }
                ctx.fillStyle = '#b85c38';
                for (const line of attrLines) {
                    ctx.fillText(line, pos.x, ty);
                    ty += 11;
                }
                ctx.restore();
            }
            ctx.restore();
        }

        function stopLoop() {
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
                animationFrame = 0;
            }
        }

        function cancelSettle() {
            settleGeneration += 1;
            if (settleFrame) {
                cancelAnimationFrame(settleFrame);
                settleFrame = 0;
            }
        }

        function scheduleTick() {
            if (animationFrame) return;
            animationFrame = requestAnimationFrame(() => {
                animationFrame = 0;
                if (!livePhysics) {
                    paint();
                    return;
                }
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

        function settleChunkSize(nodeCount) {
            if (nodeCount > 400) return 1;
            if (nodeCount > 200) return 2;
            if (nodeCount > 80) return 4;
            return 8;
        }

        function batchSettleAsync(nodes, edges, onDone) {
            cancelSettle();
            const generation = settleGeneration;
            const iterations = Math.min(96, 36 + Math.floor(nodes.length * 0.45));
            const chunkSize = settleChunkSize(nodes.length);
            let step = 0;

            function finish() {
                if (generation !== settleGeneration) return;
                for (const velocity of velocities.values()) {
                    velocity.vx = 0;
                    velocity.vy = 0;
                }
                calmTicks = EXPORT_PHYSICS_SETTINGS.restTicks;
                settleFrame = 0;
                onDone();
            }

            function runChunk() {
                if (generation !== settleGeneration) return;
                const end = Math.min(step + chunkSize, iterations);
                for (; step < end; step += 1) {
                    physicsStep(nodes, edges);
                }
                paint();
                if (statusText && iterations > 0) {
                    const pct = Math.min(99, Math.round((step / iterations) * 100));
                    statusText.textContent = `Settling layout… ${pct}%`;
                }
                if (step >= iterations) {
                    finish();
                    return;
                }
                settleFrame = requestAnimationFrame(runChunk);
            }

            if (iterations <= 0) {
                finish();
                return;
            }
            settleFrame = requestAnimationFrame(runChunk);
        }

        function hitTest(point) {
            let best = null;
            let bestDist = Infinity;
            for (const node of simNodes) {
                const pos = positions.get(node.id);
                if (!pos) continue;
                const dx = point.x - pos.x;
                const dy = point.y - pos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const threshold = nodeRadius(node) + GRAPH_HIT_PAD;
                if (dist <= threshold && dist < bestDist) {
                    best = node;
                    bestDist = dist;
                }
            }
            return best;
        }

        function hitTestCompound(point) {
            // Prefer title hits, then body (for drag).
            let bodyHit = null;
            for (let i = compoundRegions.length - 1; i >= 0; i -= 1) {
                const region = compoundRegions[i];
                const inTitle = point.x >= region.x
                    && point.x <= region.x + region.w
                    && point.y >= region.titleY
                    && point.y <= region.y + 2;
                if (inTitle) {
                    return { region, titleHit: true };
                }
                const inBody = point.x >= region.x
                    && point.x <= region.x + region.w
                    && point.y >= region.y
                    && point.y <= region.y + region.h;
                if (inBody && !bodyHit) {
                    bodyHit = { region, titleHit: false };
                }
            }
            return bodyHit;
        }

        function resizeCanvas() {
            const rect = element.getBoundingClientRect();
            cssWidth = Math.max(320, Math.floor(rect.width || 1200));
            cssHeight = Math.max(620, Math.min(1400, 220 + simNodes.length * 18));
            if (canvas) {
                canvas.style.width = '100%';
                canvas.style.height = `${cssHeight}px`;
            }
        }

        function mountGraph(filteredNodes, filteredEdges) {
            stopLoop();
            cancelSettle();
            simNodes = filteredNodes;
            simEdges = filteredEdges;
            const validIds = new Set(filteredNodes.map(node => node.id));
            pruneState(validIds);
            const width = 1200;
            const height = Math.max(640, Math.min(1400, 220 + filteredNodes.length * 18));
            seedMissingPositions(filteredNodes, width, height, graph.centerId);
            canvas = document.createElement('canvas');
            canvas.setAttribute('role', 'img');
            canvas.setAttribute('aria-label', `Requirement graph with ${filteredNodes.length} nodes`);
            ctx = canvas.getContext('2d');
            element.innerHTML = '';
            element.classList.remove('is-booting');
            element.appendChild(canvas);
            resizeCanvas();
            wireViewport(canvas);
            userViewport = false;
            const finishStatus = () => {
                settlingLayout = false;
                if (statusText) {
                    statusText.textContent = `${filteredNodes.length} nodes, ${filteredEdges.length} edges`;
                }
                paint();
            };
            if (!livePhysics) {
                settlingLayout = true;
                if (statusText) statusText.textContent = 'Settling layout…';
                paint();
                batchSettleAsync(filteredNodes, filteredEdges, finishStatus);
            } else {
                settlingLayout = false;
                finishStatus();
                wake();
            }
        }

        function clientToGraph(event) {
            const rect = canvas.getBoundingClientRect();
            const { scale, offsetX, offsetY } = viewportTransform();
            const cssX = ((event.clientX - rect.left) / rect.width) * cssWidth;
            const cssY = ((event.clientY - rect.top) / rect.height) * cssHeight;
            return {
                x: view.x + (cssX - offsetX) / scale,
                y: view.y + (cssY - offsetY) / scale
            };
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
                paint();
            }, { passive: false });

            target.addEventListener('pointerdown', (event) => {
                const point = clientToGraph(event);
                const hit = hitTest(point);
                if (hit) {
                    dragNodeId = hit.id;
                    dragCompound = null;
                    dragMoved = false;
                    pinnedIds.add(hit.id);
                    velocities.set(hit.id, { vx: 0, vy: 0 });
                    target.classList.add('is-dragging-node');
                    target.setPointerCapture(event.pointerId);
                    event.preventDefault();
                    paint();
                    return;
                }
                const compoundHit = hitTestCompound(point);
                if (compoundHit) {
                    dragCompound = {
                        ...compoundHit.region,
                        titleHit: compoundHit.titleHit,
                        origin: point,
                        memberOrigins: Object.fromEntries(
                            compoundHit.region.memberIds.map(id => {
                                const pos = positions.get(id) || { x: 0, y: 0 };
                                return [id, { x: pos.x, y: pos.y }];
                            })
                        )
                    };
                    dragNodeId = null;
                    dragMoved = false;
                    for (const id of compoundHit.region.memberIds) {
                        pinnedIds.add(id);
                        velocities.set(id, { vx: 0, vy: 0 });
                    }
                    target.classList.add('is-dragging-node');
                    target.setPointerCapture(event.pointerId);
                    event.preventDefault();
                    paint();
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
                if (dragCompound) {
                    const point = clientToGraph(event);
                    const dx = point.x - dragCompound.origin.x;
                    const dy = point.y - dragCompound.origin.y;
                    if (Math.abs(dx) + Math.abs(dy) > 1) {
                        dragMoved = true;
                    }
                    for (const id of dragCompound.memberIds) {
                        const origin = dragCompound.memberOrigins[id];
                        if (!origin) continue;
                        positions.set(id, { x: origin.x + dx, y: origin.y + dy });
                    }
                    wake();
                    paint();
                    return;
                }
                if (panMode && panOrigin) {
                    const rect = target.getBoundingClientRect();
                    const { scale } = viewportTransform();
                    const dx = ((event.clientX - panOrigin.x) / rect.width) * cssWidth / scale;
                    const dy = ((event.clientY - panOrigin.y) / rect.height) * cssHeight / scale;
                    view.x = panOrigin.viewX - dx;
                    view.y = panOrigin.viewY - dy;
                    userViewport = true;
                    paint();
                    return;
                }
                const point = clientToGraph(event);
                const hit = hitTest(point);
                const nextHover = hit?.id || null;
                const compoundHit = hit ? null : hitTestCompound(point);
                const nextCompound = compoundHit?.region || null;
                if (nextHover !== hoverNodeId || nextCompound?.fileUri !== hoverCompound?.fileUri) {
                    hoverNodeId = nextHover;
                    hoverCompound = nextCompound;
                    paint();
                }
            });

            target.addEventListener('pointerup', (event) => {
                target.classList.remove('is-dragging-node');
                if (dragNodeId) {
                    const node = simNodes.find(item => item.id === dragNodeId);
                    const moved = dragMoved;
                    const nodeId = dragNodeId;
                    dragNodeId = null;
                    pinnedIds.delete(nodeId);
                    wake();
                    paint();
                    if (!moved && node?.pageUrl && Date.now() > suppressClickUntil) {
                        window.location.href = resolveGraphNodeUrl(node.pageUrl);
                    } else if (moved) {
                        suppressClickUntil = Date.now() + 250;
                    }
                    return;
                }
                if (dragCompound) {
                    const compound = dragCompound;
                    const moved = dragMoved;
                    const openTitle = !moved && compound.titleHit;
                    for (const id of compound.memberIds) {
                        pinnedIds.delete(id);
                    }
                    dragCompound = null;
                    wake();
                    paint();
                    if (openTitle && compound.pageUrl && Date.now() > suppressClickUntil) {
                        window.location.href = resolveGraphNodeUrl(compound.pageUrl);
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
                target.classList.remove('is-dragging-node');
                if (dragNodeId) {
                    pinnedIds.delete(dragNodeId);
                    dragNodeId = null;
                    wake();
                }
                if (dragCompound) {
                    for (const id of dragCompound.memberIds) {
                        pinnedIds.delete(id);
                    }
                    dragCompound = null;
                    wake();
                }
                panMode = false;
                panOrigin = null;
                target.classList.remove('is-panning');
                paint();
            });

            window.addEventListener('resize', () => {
                resizeCanvas();
                paint();
            });
        }

        function matches(node) {
            const FILTER_NOT_PRESENT = '__not_present__';
            const query = lower(searchInput?.value?.trim());
            const pathQuery = lower(pathInput?.value?.trim());
            if (hideExternal && node.isExternal) return false;
            if (hideIdeasets && node.kind === 'ideaset' && !isFileIdeasetNode(node)) return false;
            const haystack = [node.name, node.kind, node.fileUri, node.status || '', ...(node.tags || [])].map(lower).join(' ');
            if (query && !haystack.includes(query)) return false;
            if (pathQuery && !lower(node.fileUri).includes(pathQuery)) return false;
            if (statusSelected.length) {
                const key = node.statusKey || (String(node.status || '').trim() ? String(node.status).trim() : FILTER_NOT_PRESENT);
                if (!statusSelected.includes(key)) return false;
            }
            if (tagSelected.length) {
                const keys = Array.isArray(node.tagsKeys) && node.tagsKeys.length
                    ? node.tagsKeys
                    : (Array.isArray(node.tags) && node.tags.length ? node.tags : [FILTER_NOT_PRESENT]);
                if (!tagSelected.some(value => keys.includes(value))) return false;
            }
            return true;
        }

        function syncFilesSelect() {
            if (!fileTreatmentSelect) return;
            fileTreatmentSelect.value = fileTreatment;
            const selected = fileTreatmentSelect.selectedOptions?.[0];
            if (selected?.title) {
                fileTreatmentSelect.title = selected.title;
            }
        }

        function refresh() {
            const treated = applyFileTreatment(graph, fileTreatment);
            const visibleNodes = (treated.nodes || []).filter(matches);
            const visibleIds = new Set(visibleNodes.map(node => node.id));
            const visibleEdges = (treated.edges || []).filter(edge => {
                if (!visibleIds.has(edge.sourceId) || !visibleIds.has(edge.targetId)) return false;
                if (!includeWildcardRefs && edge.kind === 'wildcard_reference') return false;
                return true;
            });
            mountGraph(visibleNodes, visibleEdges);
        }

        for (const control of [searchInput, pathInput]) {
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
        fileTreatmentSelect?.addEventListener('change', () => {
            fileTreatment = fileTreatmentSelect.value || 'invisible';
            syncFilesSelect();
            refresh();
        });
        toggleWildcard?.addEventListener('click', () => {
            includeWildcardRefs = !includeWildcardRefs;
            toggleWildcard.classList.toggle('is-active', includeWildcardRefs);
            toggleWildcard.setAttribute('aria-pressed', includeWildcardRefs ? 'true' : 'false');
            refresh();
        });
        toggleLabels?.addEventListener('click', () => {
            const index = GRAPH_LABEL_MODES.indexOf(labelMode);
            labelMode = GRAPH_LABEL_MODES[(index + 1) % GRAPH_LABEL_MODES.length];
            syncLabelsButton();
            paint();
        });
        togglePhysics?.addEventListener('click', () => {
            livePhysics = !livePhysics;
            togglePhysics.classList.toggle('is-active', livePhysics);
            togglePhysics.setAttribute('aria-pressed', livePhysics ? 'true' : 'false');
            if (livePhysics) {
                cancelSettle();
                if (statusText) {
                    statusText.textContent = `${simNodes.length} nodes, ${simEdges.length} edges`;
                }
                wake();
            } else {
                stopLoop();
                paint();
            }
        });
        fitButton?.addEventListener('click', () => {
            fitView(true);
            paint();
        });
        resetButton?.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (pathInput) pathInput.value = '';
            statusSelected = [];
            tagSelected = [];
            statusFilter.clear();
            tagFilter.clear();
            hideExternal = false;
            hideIdeasets = false;
            fileTreatment = 'linked';
            includeWildcardRefs = true;
            labelMode = 'auto';
            toggleExternal?.classList.remove('is-active');
            toggleIdeasets?.classList.remove('is-active');
            toggleWildcard?.classList.add('is-active');
            toggleWildcard?.setAttribute('aria-pressed', 'true');
            syncLabelsButton();
            syncFilesSelect();
            if (toggleExternal) toggleExternal.textContent = 'Hide external';
            if (toggleIdeasets) toggleIdeasets.textContent = 'Hide ideasets';
            positions.clear();
            velocities.clear();
            pinnedIds.clear();
            userViewport = false;
            refresh();
        });
        syncLabelsButton();
        syncFilesSelect();
        // Defer first mount so page chrome paints before JSON/layout work.
        requestAnimationFrame(() => {
            refresh();
        });
    }
}

function scheduleBackground(task) {
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => task(), { timeout: 250 });
        return;
    }
    requestAnimationFrame(() => {
        setTimeout(task, 0);
    });
}

// rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export_idea_tooltips]
// rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export_heading_tooltips]
function wireIdeaTooltips(root) {
    const tip = document.createElement('div');
    tip.className = 'idea-tooltip';
    tip.id = 'idea-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tip);
    let current = null;
    let showTimer = 0;
    let hideTimer = 0;

    function anchorFrom(target) {
        if (!target || typeof target.closest !== 'function') return null;
        const idea = target.closest('[data-tip-name]');
        if (idea && root.contains(idea)) return idea;
        const heading = target.closest('[data-heading-tip]');
        return heading && root.contains(heading) ? heading : null;
    }

    function holds(parent, node) {
        return !!node && typeof node.nodeType === 'number' && parent.contains(node);
    }

    function fill(anchor) {
        tip.replaceChildren();
        const headingTip = anchor.getAttribute('data-heading-tip');
        if (headingTip != null && headingTip !== '' && !anchor.hasAttribute('data-tip-name')) {
            const prose = document.createElement('div');
            prose.className = 'idea-tooltip-body';
            prose.textContent = headingTip;
            tip.append(prose);
            return true;
        }
        const name = anchor.getAttribute('data-tip-name') || '';
        if (!name) return false;
        const file = anchor.getAttribute('data-tip-file') || '';
        const body = anchor.getAttribute('data-tip-body') || '';
        const status = anchor.getAttribute('data-tip-status') || '';
        const head = document.createElement('div');
        head.className = 'idea-tooltip-head';
        const title = document.createElement('div');
        title.className = 'idea-tooltip-name';
        title.textContent = name;
        head.append(title);
        if (status) {
            const pill = document.createElement('span');
            pill.className = 'idea-tooltip-status';
            pill.textContent = status;
            head.append(pill);
        }
        tip.append(head);
        if (file) {
            const path = document.createElement('div');
            path.className = 'idea-tooltip-file';
            path.textContent = file;
            tip.append(path);
        }
        if (body) {
            const prose = document.createElement('div');
            prose.className = 'idea-tooltip-body';
            prose.textContent = body;
            tip.append(prose);
        }
        return true;
    }

    function place(anchor) {
        const margin = 10;
        const gap = 8;
        const rect = anchor.getBoundingClientRect();
        const tipRect = tip.getBoundingClientRect();
        let top = rect.bottom + gap;
        if (top + tipRect.height > window.innerHeight - margin) {
            const above = rect.top - gap - tipRect.height;
            top = above >= margin ? above : margin;
        }
        let left = rect.left;
        top = Math.max(margin, Math.min(top, window.innerHeight - tipRect.height - margin));
        left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));
        tip.style.left = `${Math.round(left)}px`;
        tip.style.top = `${Math.round(top)}px`;
    }

    function show(anchor) {
        if (!fill(anchor)) return;
        if (current && current !== anchor) current.removeAttribute('aria-describedby');
        current = anchor;
        anchor.setAttribute('aria-describedby', tip.id);
        tip.removeAttribute('aria-hidden');
        place(anchor);
        tip.classList.add('is-open');
    }

    function hide() {
        if (current) current.removeAttribute('aria-describedby');
        current = null;
        tip.classList.remove('is-open');
        tip.setAttribute('aria-hidden', 'true');
    }

    function scheduleHide() {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
        hideTimer = setTimeout(hide, 160);
    }

    root.addEventListener('pointerover', (event) => {
        if (event.pointerType === 'touch') return;
        const anchor = anchorFrom(event.target);
        if (!anchor) return;
        clearTimeout(hideTimer);
        if (anchor === current) return;
        clearTimeout(showTimer);
        showTimer = setTimeout(() => show(anchor), current ? 40 : 160);
    });
    root.addEventListener('pointerout', (event) => {
        const anchor = anchorFrom(event.target);
        if (!anchor) return;
        const next = event.relatedTarget;
        if (next === tip || holds(tip, next) || holds(anchor, next)) return;
        if (anchorFrom(next) === anchor) return;
        scheduleHide();
    });
    tip.addEventListener('pointerenter', () => clearTimeout(hideTimer));
    tip.addEventListener('pointerleave', (event) => {
        if (current && (event.relatedTarget === current || holds(current, event.relatedTarget))) return;
        scheduleHide();
    });
    root.addEventListener('focusin', (event) => {
        const anchor = anchorFrom(event.target);
        if (!anchor) return;
        clearTimeout(hideTimer);
        clearTimeout(showTimer);
        show(anchor);
    });
    root.addEventListener('focusout', (event) => {
        if (anchorFrom(event.target)) scheduleHide();
    });
    window.addEventListener('scroll', () => {
        if (current) place(current);
    }, true);
    window.addEventListener('resize', () => {
        if (current) place(current);
    });
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') hide();
    });
}

// rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export_layout_cards]
function wireLayoutCards(root) {
    if (root.getAttribute('data-runtime-mode') !== 'interactive') return;

    const LAYOUT_COLUMNS = 12;
    const RESIZE_MOVE_THRESHOLD_PX = 4;
    const storageKey = `reqlan-export:layout:${window.location.pathname}`;

    function emptyState() {
        return { groups: {}, collapsed: {}, spans: {}, spanBeforeFill: {} };
    }

    function readState() {
        try {
            const raw = window.localStorage.getItem(storageKey);
            if (!raw) return emptyState();
            const parsed = JSON.parse(raw);
            return {
                groups: parsed && typeof parsed.groups === 'object' && parsed.groups ? parsed.groups : {},
                collapsed: parsed && typeof parsed.collapsed === 'object' && parsed.collapsed ? parsed.collapsed : {},
                spans: parsed && typeof parsed.spans === 'object' && parsed.spans ? parsed.spans : {},
                spanBeforeFill: parsed && typeof parsed.spanBeforeFill === 'object' && parsed.spanBeforeFill
                    ? parsed.spanBeforeFill
                    : {},
            };
        } catch (_error) {
            return emptyState();
        }
    }

    function writeState(state) {
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(state));
        } catch (_error) {
            // Ignore quota / private-mode failures.
        }
    }

    function groupKey(group) {
        return group.getAttribute('data-layout-group') || '';
    }

    function cardId(card) {
        return card.getAttribute('data-layout-id') || '';
    }

    function isEntityTile(card) {
        return card.classList.contains('entity-card')
            || Boolean(card.parentElement && card.parentElement.classList.contains('entity-list'));
    }

    function isWidthResizable(card) {
        return Boolean(card.querySelector(':scope > [data-layout-resize]')) && !isEntityTile(card);
    }

    function clampSpan(value, maxCols = LAYOUT_COLUMNS) {
        const n = Number(value);
        const max = Math.max(1, maxCols);
        if (!Number.isFinite(n)) return Math.min(LAYOUT_COLUMNS / 2, max);
        return Math.max(1, Math.min(max, Math.round(n)));
    }

    function groupColumnCount(group) {
        const styles = window.getComputedStyle(group);
        const cols = styles.gridTemplateColumns;
        if (!cols || cols === 'none') return LAYOUT_COLUMNS;
        const count = cols.split(' ').filter(Boolean).length;
        return count > 0 ? count : LAYOUT_COLUMNS;
    }

    function applySpan(card, span, maxCols = LAYOUT_COLUMNS) {
        const next = clampSpan(span, maxCols);
        card.setAttribute('data-layout-span', String(next));
        card.style.setProperty('--layout-span', String(next));
        const handle = card.querySelector(':scope > [data-layout-resize]');
        if (handle) handle.setAttribute('aria-valuenow', String(next));
        return next;
    }

    function persistSpan(card, span, maxCols = LAYOUT_COLUMNS) {
        if (!isWidthResizable(card)) return;
        const id = cardId(card);
        if (!id) return;
        const state = readState();
        state.spans[id] = applySpan(card, span, maxCols);
        writeState(state);
    }

    function setCollapsed(card, collapsed) {
        const id = cardId(card);
        const toggle = card.querySelector('[data-layout-toggle]');
        card.classList.toggle('is-collapsed', collapsed);
        if (toggle) toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        if (!id) return;
        const state = readState();
        if (collapsed) state.collapsed[id] = true;
        else delete state.collapsed[id];
        writeState(state);
    }

    function persistGroupOrder(group) {
        const key = groupKey(group);
        if (!key) return;
        const order = Array.from(group.querySelectorAll(':scope > .layout-card'))
            .map(cardId)
            .filter(Boolean);
        const state = readState();
        state.groups[key] = order;
        writeState(state);
    }

    function restoreGroup(group) {
        const key = groupKey(group);
        const state = readState();
        const order = key && Array.isArray(state.groups[key]) ? state.groups[key] : null;
        if (order && order.length) {
            const byId = new Map();
            Array.from(group.querySelectorAll(':scope > .layout-card')).forEach((card) => {
                const id = cardId(card);
                if (id) byId.set(id, card);
            });
            order.forEach((id) => {
                const card = byId.get(id);
                if (card) group.appendChild(card);
            });
        }
        let spansDirty = false;
        const cols = groupColumnCount(group);
        Array.from(group.querySelectorAll(':scope > .layout-card')).forEach((card) => {
            const id = cardId(card);
            if (isEntityTile(card) || !isWidthResizable(card)) {
                if (id && state.spans[id] != null) {
                    delete state.spans[id];
                    spansDirty = true;
                }
                if (id && state.spanBeforeFill[id] != null) {
                    delete state.spanBeforeFill[id];
                    spansDirty = true;
                }
            } else {
                if (id && state.spans[id] != null) applySpan(card, state.spans[id], cols);
                else applySpan(card, card.getAttribute('data-layout-span') || cols / 2, cols);
                const handle = card.querySelector(':scope > [data-layout-resize]');
                if (handle) {
                    handle.setAttribute('aria-valuemin', '1');
                    handle.setAttribute('aria-valuemax', String(cols));
                }
            }
            if (id && state.collapsed[id]) setCollapsed(card, true);
        });
        if (spansDirty) writeState(state);
    }

    function toggleFillRow(card) {
        if (!isWidthResizable(card) || card.classList.contains('is-collapsed')) return;
        const group = card.parentElement;
        if (!group || !group.hasAttribute('data-layout-group')) return;
        const id = cardId(card);
        if (!id) return;
        const cols = groupColumnCount(group);
        const current = clampSpan(card.getAttribute('data-layout-span') || cols / 2, cols);
        const state = readState();
        if (current >= cols) {
            const restore = state.spanBeforeFill[id] != null
                ? clampSpan(state.spanBeforeFill[id], cols)
                : Math.min(LAYOUT_COLUMNS / 2, cols);
            delete state.spanBeforeFill[id];
            state.spans[id] = applySpan(card, restore, cols);
            writeState(state);
            return;
        }
        state.spanBeforeFill[id] = current;
        state.spans[id] = applySpan(card, cols, cols);
        writeState(state);
    }

    let dragCard = null;
    let resizeSession = null;

    root.addEventListener('click', (event) => {
        const toggle = event.target && event.target.closest
            ? event.target.closest('[data-layout-toggle]')
            : null;
        if (!toggle || !root.contains(toggle)) return;
        event.preventDefault();
        const card = toggle.closest('.layout-card');
        if (!card) return;
        setCollapsed(card, !card.classList.contains('is-collapsed'));
    });

    root.addEventListener('dragstart', (event) => {
        if (resizeSession) {
            event.preventDefault();
            return;
        }
        const handle = event.target && event.target.closest
            ? event.target.closest('[data-layout-drag]')
            : null;
        if (!handle || !root.contains(handle)) return;
        if (isLayoutDragInteractiveTarget(event.target, handle)) {
            event.preventDefault();
            return;
        }
        const card = handle.closest('.layout-card');
        if (!card) return;
        dragCard = card;
        card.classList.add('is-dragging');
        setUiDragLock(true);
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', cardId(card));
        }
    });

    root.addEventListener('dragend', () => {
        if (dragCard) dragCard.classList.remove('is-dragging');
        root.querySelectorAll('.layout-card.is-drop-target').forEach((el) => {
            el.classList.remove('is-drop-target');
        });
        dragCard = null;
        setUiDragLock(false);
    });

    root.addEventListener('dragover', (event) => {
        if (!dragCard || resizeSession) return;
        const over = event.target && event.target.closest
            ? event.target.closest('.layout-card')
            : null;
        if (!over || over === dragCard) return;
        const group = over.parentElement;
        if (!group || !group.hasAttribute('data-layout-group')) return;
        if (dragCard.parentElement !== group) return;
        event.preventDefault();
        root.querySelectorAll('.layout-card.is-drop-target').forEach((el) => {
            if (el !== over) el.classList.remove('is-drop-target');
        });
        over.classList.add('is-drop-target');
        const rect = over.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        if (before) group.insertBefore(dragCard, over);
        else group.insertBefore(dragCard, over.nextSibling);
    });

    root.addEventListener('drop', (event) => {
        if (!dragCard) return;
        event.preventDefault();
        const group = dragCard.parentElement;
        if (group && group.hasAttribute('data-layout-group')) persistGroupOrder(group);
        root.querySelectorAll('.layout-card.is-drop-target').forEach((el) => {
            el.classList.remove('is-drop-target');
        });
    });

    function endResize() {
        if (!resizeSession) return;
        const { card, span, moved, cols } = resizeSession;
        card.classList.remove('is-resizing');
        if (moved) persistSpan(card, span, cols);
        resizeSession = null;
        setUiDragLock(false);
    }

    root.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'touch' && event.button !== 0) return;
        const handle = event.target && event.target.closest
            ? event.target.closest('[data-layout-resize]')
            : null;
        if (!handle || !root.contains(handle)) return;
        const card = handle.closest('.layout-card');
        const group = card && card.parentElement;
        if (!card || !group || !group.hasAttribute('data-layout-group')) return;
        if (!isWidthResizable(card)) return;
        event.preventDefault();
        event.stopPropagation();
        const cols = groupColumnCount(group);
        const startSpan = clampSpan(card.getAttribute('data-layout-span') || cols, cols);
        resizeSession = {
            card,
            group,
            cols,
            startX: event.clientX,
            startSpan,
            span: startSpan,
            moved: false,
            pointerId: event.pointerId,
        };
        setUiDragLock(true);
        handle.setPointerCapture(event.pointerId);
    });

    root.addEventListener('dblclick', (event) => {
        const handle = event.target && event.target.closest
            ? event.target.closest('[data-layout-resize]')
            : null;
        if (!handle || !root.contains(handle)) return;
        const card = handle.closest('.layout-card');
        if (!card || !isWidthResizable(card)) return;
        event.preventDefault();
        event.stopPropagation();
        if (resizeSession) {
            resizeSession.card.classList.remove('is-resizing');
            resizeSession = null;
            setUiDragLock(false);
        }
        toggleFillRow(card);
    });

    root.addEventListener('selectstart', (event) => {
        if (resizeSession || dragCard) event.preventDefault();
    });

    root.addEventListener('pointermove', (event) => {
        if (!resizeSession || event.pointerId !== resizeSession.pointerId) return;
        event.preventDefault();
        const { card, group, cols, startX, startSpan, moved } = resizeSession;
        const dx = Math.abs(event.clientX - startX);
        if (!moved && dx < RESIZE_MOVE_THRESHOLD_PX) return;
        if (!moved) {
            resizeSession.moved = true;
            card.classList.add('is-resizing');
        }
        const width = group.getBoundingClientRect().width;
        if (width <= 0) return;
        const deltaCols = (event.clientX - startX) / (width / cols);
        const next = clampSpan(startSpan + deltaCols, cols);
        resizeSession.span = next;
        applySpan(card, next, cols);
    });

    root.addEventListener('pointerup', (event) => {
        if (!resizeSession || event.pointerId !== resizeSession.pointerId) return;
        endResize();
    });
    root.addEventListener('pointercancel', (event) => {
        if (!resizeSession || event.pointerId !== resizeSession.pointerId) return;
        endResize();
    });

    root.addEventListener('keydown', (event) => {
        const handle = event.target && event.target.closest
            ? event.target.closest('[data-layout-resize]')
            : null;
        if (!handle || !root.contains(handle)) return;
        const card = handle.closest('.layout-card');
        if (!card || !isWidthResizable(card)) return;
        const group = card.parentElement;
        const cols = group && group.hasAttribute('data-layout-group')
            ? groupColumnCount(group)
            : LAYOUT_COLUMNS;
        const current = clampSpan(card.getAttribute('data-layout-span') || cols / 2, cols);
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault();
            persistSpan(card, current + 1, cols);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault();
            persistSpan(card, current - 1, cols);
        } else if (event.key === 'Home') {
            event.preventDefault();
            persistSpan(card, 1, cols);
        } else if (event.key === 'End') {
            event.preventDefault();
            persistSpan(card, cols, cols);
        }
    });

    Array.from(root.querySelectorAll('[data-layout-group]')).forEach(restoreGroup);
}

function boot() {
    const root = document.body;
    wireIdeaTooltips(root);
    wireLayoutCards(root);
    // Interactive Status/Tags triggers before heavy table/graph init.
    enhanceScdPlaceholders(root);
    wireTables(root);
    void wireGlobalSearch(root);
    // Graph boot + settle run in the background so large exports stay responsive.
    scheduleBackground(() => wireGraph(root));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}