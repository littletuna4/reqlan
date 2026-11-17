// File explorer wiring: tree expand/collapse, filter, selection, preview pane.
// rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
function wireFileExplorer(root) {
    if (root.getAttribute('data-runtime-mode') !== 'interactive') return;
    const explorer = root.querySelector('[data-explorer]');
    const tree = explorer?.querySelector('[data-explorer-tree]');
    const preview = explorer?.querySelector('[data-explorer-preview]');
    if (!explorer || !tree || !preview) return;
    const filterInput = explorer.querySelector('[data-explorer-filter]');
    const previewToggle = explorer.querySelector('[data-explorer-preview-toggle]');
    const addressbar = explorer.querySelector('[data-explorer-addressbar]');
    const resizeHandle = explorer.querySelector('[data-explorer-resize]');
    const emptyNote = preview.querySelector('.explorer-preview-empty');
    const content = preview.querySelector('.explorer-preview-content');
    const nameEl = preview.querySelector('.explorer-preview-name');
    const kindEl = preview.querySelector('.explorer-preview-kind');
    const statusEl = preview.querySelector('.explorer-preview-status');
    const tagsEl = preview.querySelector('.explorer-preview-tags');
    const countsEl = preview.querySelector('.explorer-preview-counts');
    const katzEl = preview.querySelector('.explorer-preview-katz');
    const fileEl = preview.querySelector('.explorer-preview-file');
    const summaryEl = preview.querySelector('.explorer-preview-summary');
    const openLink = preview.querySelector('[data-explorer-open]');

    // Flat map keyed by the rows' data-explorer-select identity.
    let data = {};
    try {
        const parsed = JSON.parse(root.querySelector('#explorer-data')?.textContent || '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
    } catch (_error) {
        // Keep the empty default so selection stays inert.
    }

    const storageKey = `reqlan-export:explorer:${window.location.pathname}`;
    const defaultState = () => ({ open: {}, previewOpen: true, selected: '', previewWidth: 0 });

    function readState() {
        try {
            const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '');
            if (parsed && typeof parsed === 'object' && parsed) {
                return { ...defaultState(), ...parsed };
            }
        } catch (_error) {
            // Fall through to the default state.
        }
        return defaultState();
    }

    function writeState(state) {
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(state));
        } catch (_error) {
            // Ignore quota / private-mode failures.
        }
    }

    function cssEscapeAttr(value) {
        if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
        return String(value).replace(/["\\]/g, '\\$&');
    }

    const nodesByKey = new Map();
    for (const node of tree.querySelectorAll('li[data-explorer-node]')) {
        nodesByKey.set(node.getAttribute('data-explorer-key') || '', node);
    }

    function setOpen(node, open, { persist = true } = {}) {
        node.classList.toggle('is-open', open);
        const button = node.querySelector(':scope > .explorer-row > .explorer-disclosure');
        if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (!persist) return;
        const state = readState();
        state.open[node.getAttribute('data-explorer-key') || ''] = open;
        writeState(state);
    }

    // rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer] drag-resize the preview pane; the persisted width is in px and restored on load.
    const minPreviewWidth = 192;
    function setPreviewWidth(width, { persist = true } = {}) {
        const maxWidth = Math.max(minPreviewWidth, (explorer.clientWidth || 640) - 256);
        const clamped = Math.min(Math.max(Math.round(width), minPreviewWidth), maxWidth);
        explorer.style.setProperty('--explorer-preview-width', `${clamped}px`);
        if (!persist) return;
        const state = readState();
        state.previewWidth = clamped;
        writeState(state);
    }

    if (resizeHandle) {
        resizeHandle.addEventListener('pointerdown', (event) => {
            if (!(event instanceof PointerEvent)) return;
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = preview.offsetWidth;
            resizeHandle.setPointerCapture(event.pointerId);
            const onMove = (move) => {
                // Handle sits left of the preview: dragging left widens the pane.
                setPreviewWidth(startWidth + (startX - move.clientX), { persist: false });
            };
            const onUp = (up) => {
                resizeHandle.releasePointerCapture(up.pointerId);
                resizeHandle.removeEventListener('pointermove', onMove);
                resizeHandle.removeEventListener('pointerup', onUp);
                resizeHandle.removeEventListener('pointercancel', onUp);
                setPreviewWidth(preview.offsetWidth);
            };
            resizeHandle.addEventListener('pointermove', onMove);
            resizeHandle.addEventListener('pointerup', onUp);
            resizeHandle.addEventListener('pointercancel', onUp);
        });
        resizeHandle.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const step = event.key === 'ArrowLeft' ? 16 : -16;
            setPreviewWidth(preview.offsetWidth + step);
        });
    }

    function setPreviewOpen(open, { persist = true } = {}) {
        explorer.classList.toggle('is-preview-closed', !open);
        preview.hidden = !open;
        if (previewToggle) {
            previewToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            previewToggle.classList.toggle('is-active', open);
        }
        if (!persist) return;
        const state = readState();
        state.previewOpen = open;
        writeState(state);
    }

    function makePill(text) {
        const pill = document.createElement('span');
        pill.className = 'pill';
        pill.textContent = text;
        return pill;
    }

    function crumbSeparator() {
        const separator = document.createElement('span');
        separator.className = 'explorer-crumb-separator';
        separator.setAttribute('aria-hidden', 'true');
        separator.textContent = '/';
        return separator;
    }

    function crumbNode(crumb, isCurrent) {
        const node = document.createElement(!isCurrent && Boolean(data[crumb.id]) ? 'button' : 'span');
        node.className = `explorer-crumb${isCurrent ? ' is-current' : ''}`;
        node.textContent = crumb.name;
        if (node instanceof HTMLButtonElement) {
            node.type = 'button';
            node.addEventListener('click', () => selectItem(crumb.id));
        }
        return node;
    }

    // rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
    function renderAddressbar(item, selectId) {
        if (!addressbar) return;
        const crumbs = [{ name: data['folder:.']?.name || '', id: 'folder:.' }];
        if (item.kind === 'root') {
            crumbs[0].name = item.name;
        } else {
            const path = item.kind === 'idea' ? item.file : item.path || '';
            const segments = path.split('/').filter(Boolean);
            // All kinds: the final segment is the item itself (selectId); only directory segments get folder crumbs.
            const limit = segments.length - 1;
            for (let index = 0; index < limit; index += 1) {
                crumbs.push({ name: segments[index], id: `folder:${segments.slice(0, index + 1).join('/')}` });
            }
            crumbs.push({ name: item.name, id: selectId });
        }
        const parts = [];
        crumbs.forEach((crumb, index) => {
            if (index) parts.push(crumbSeparator());
            parts.push(crumbNode(crumb, index === crumbs.length - 1));
        });
        addressbar.replaceChildren(...parts);
    }

    // rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
    function selectItem(selectId, { persist = true, scroll = true } = {}) {
        const item = data[selectId];
        if (!item || typeof item !== 'object') return;
        renderAddressbar(item, selectId);
        for (const row of tree.querySelectorAll('.explorer-row.is-selected')) {
            row.classList.remove('is-selected');
        }
        const row = tree.querySelector(`[data-explorer-select="${cssEscapeAttr(selectId)}"]`);
        row?.classList.add('is-selected');
        if (row && scroll) row.scrollIntoView({ block: 'nearest' });
        nameEl.textContent = item.name || '';
        kindEl.textContent = item.kind === 'idea' && item.status
            ? `Idea · ${item.status}`
            : ({ root: 'Workspace root', folder: 'Folder', file: 'File', code: 'Code file' })[item.kind] || '';
        statusEl.hidden = true;
        tagsEl.hidden = true;
        countsEl.hidden = true;
        katzEl.hidden = true;
        if (item.kind === 'idea') {
            if (item.status) {
                statusEl.textContent = item.status;
                statusEl.hidden = false;
            }
            const tags = item.tags || [];
            tagsEl.replaceChildren(...tags.map(tag => makePill(tag)));
            tagsEl.hidden = !tags.length;
            katzEl.textContent = `Katz ${Number(item.katz).toFixed(3)}`;
            katzEl.hidden = false;
        } else {
            const counts = item.counts || {};
            const pills = [];
            if (counts.folders) pills.push(makePill(`${counts.folders} folders`));
            if (counts.files) pills.push(makePill(`${counts.files} files`));
            if (counts.codeFiles) pills.push(makePill(`${counts.codeFiles} code files`));
            if (counts.ideas) pills.push(makePill(`${counts.ideas} ideas`));
            if (item.kind === 'file' && item.ideaCount) pills.push(makePill(`${item.ideaCount} ideas`));
            if (item.kind === 'code') {
                if (item.refCount) pills.push(makePill(`${item.refCount} refs`));
                pills.push(...(item.labels || []).map(label => makePill(label)));
            }
            countsEl.replaceChildren(...pills);
            countsEl.hidden = !pills.length;
        }
        fileEl.textContent = item.kind === 'idea' ? `${item.file}:${item.line}` : item.path || '';
        summaryEl.textContent = item.summary || '';
        openLink.hidden = !item.url;
        if (item.url) {
            openLink.href = item.url;
            openLink.textContent = ({
                root: 'Open folder page',
                folder: 'Open folder page',
                file: 'Open file page',
                code: 'Open code file page',
                idea: 'Open idea page',
            })[item.kind] || 'Open page';
        }
        emptyNote.hidden = true;
        content.hidden = false;
        setPreviewOpen(true, { persist });
        if (persist) {
            const state = readState();
            state.selected = selectId;
            writeState(state);
        }
    }

    function applyState(state) {
        for (const [key, node] of nodesByKey) {
            setOpen(node, state.open[key] !== false, { persist: false });
        }
        if (state.previewWidth) setPreviewWidth(state.previewWidth, { persist: false });
        // Unknown legacy ids (plain idea ids) find no payload entry and are ignored.
        if (state.selected) selectItem(state.selected, { persist: false, scroll: false });
        setPreviewOpen(state.previewOpen !== false, { persist: false });
    }

    // rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export_file_explorer]
    tree.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        const disclosure = event.target.closest('.explorer-disclosure');
        if (disclosure && tree.contains(disclosure)) {
            const node = disclosure.closest('li[data-explorer-node]');
            if (node) setOpen(node, !node.classList.contains('is-open'));
            return;
        }
        const row = event.target.closest('[data-explorer-select]');
        if (!row || !tree.contains(row)) return;
        selectItem(row.getAttribute('data-explorer-select') || '');
    });

    tree.addEventListener('keydown', (event) => {
        const row = event.target instanceof Element && event.target.matches('[data-explorer-select]')
            ? event.target
            : null;
        if (row && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            selectItem(row.getAttribute('data-explorer-select') || '');
            return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const focusables = [...tree.querySelectorAll('button, [data-explorer-select]')]
            .filter((element) => element.offsetParent !== null);
        const current = focusables.indexOf(document.activeElement);
        if (current < 0 || focusables.length < 2) return;
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        focusables[(current + step + focusables.length) % focusables.length].focus();
    });

    function applyFilter() {
        const needle = lower(filterInput?.value.trim() || '');
        for (const leaf of tree.querySelectorAll('li[data-explorer-leaf]')) {
            const text = lower(leaf.getAttribute('data-filter-text') || leaf.textContent || '');
            leaf.hidden = Boolean(needle) && !text.includes(needle);
        }
        // Deepest-first so a parent sees its children's final visibility.
        const nodes = [...tree.querySelectorAll('li[data-explorer-node]')].reverse();
        for (const node of nodes) {
            const hasVisible = node.querySelector('li[data-explorer-leaf]:not([hidden])')
                || node.querySelector('li[data-explorer-node]:not([hidden])');
            node.hidden = Boolean(needle) && !hasVisible;
            if (needle && hasVisible) setOpen(node, true, { persist: false });
        }
        if (!needle) applyState(readState());
    }
    filterInput?.addEventListener('input', applyFilter);

    previewToggle?.addEventListener('click', () => setPreviewOpen(preview.hidden));

    applyState(readState());
}

wireFileExplorer(document.body);
