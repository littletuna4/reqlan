/**
 * Webview modal for fuzzy/paginated idea search used by reference code actions.
 * rq:["../../../../reqlan rq/extension/features-commands.rq".search_code_actions]
 */
import {
    type SearchReferenceCommandArgs
} from '@reqlan/language';
import type { IdeaSummary } from '@reqlan/analytical';
import { filterAndScoreIdeas } from '@reqlan/analytical';
import * as vscode from 'vscode';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';
import { applyIdeaReferenceEdit } from './insert-idea-reference.js';
import { safeWebviewPost } from '../shared/safe-webview-post.js';

export { filterAndScoreIdeas } from '@reqlan/analytical';

const VIEW_TYPE = 'reqlan.referenceSearch';
const PAGE_SIZE = 8;

type HostToWebview = {
    type: 'init' | 'results';
    query: string;
    page: number;
    total: number;
    totalPages: number;
    mode: 'replace' | 'wrap';
    context?: SearchReferenceCommandArgs['context'];
    results: SearchHitView[];
};

interface SearchHitView {
    name: string;
    kind: string;
    path: string;
    summary: string;
    fileUri: string;
}

type WebviewToHost =
    | { type: 'ready' }
    | { type: 'search'; query: string; page: number }
    | { type: 'select'; fileUri: string; name: string; kind: string }
    | { type: 'cancel' };

export class ReferenceSearchPanel {
    private static current?: ReferenceSearchPanel;

    private readonly panel: vscode.WebviewPanel;
    private readonly index: IndexService;
    private readonly args: SearchReferenceCommandArgs;
    private ideas: IdeaSummary[] = [];
    private query: string;
    private page = 0;

    private constructor(index: IndexService, args: SearchReferenceCommandArgs) {
        this.index = index;
        this.args = args;
        this.query = args.refText ?? '';
        const title = (args.mode ?? 'replace') === 'wrap'
            ? 'Wrap as idea reference'
            : 'Search idea reference';
        this.panel = vscode.window.createWebviewPanel(
            VIEW_TYPE,
            title,
            { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
            { enableScripts: true, retainContextWhenHidden: false }
        );
        this.panel.webview.html = renderSearchHtml();
        this.panel.webview.onDidReceiveMessage(async (message: WebviewToHost) => {
            await this.onMessage(message);
        });
        this.panel.onDidDispose(() => {
            if (ReferenceSearchPanel.current === this) {
                ReferenceSearchPanel.current = undefined;
            }
        });
        void this.loadIdeas().then(() => this.postResults('init'));
    }

    static async show(index: IndexService, args: SearchReferenceCommandArgs): Promise<void> {
        if (!index.isReady) {
            void vscode.window.showWarningMessage('Reqlan index is not ready yet.');
            return;
        }
        if (ReferenceSearchPanel.current) {
            ReferenceSearchPanel.current.panel.dispose();
        }
        ReferenceSearchPanel.current = new ReferenceSearchPanel(index, {
            ...args,
            mode: args.mode ?? 'replace'
        });
    }

    private async loadIdeas(): Promise<void> {
        this.ideas = await this.index.indexStore.listAllIdeas();
    }

    private async onMessage(message: WebviewToHost): Promise<void> {
        if (!message?.type) {
            return;
        }
        if (message.type === 'ready') {
            this.postResults('init');
            return;
        }
        if (message.type === 'cancel') {
            this.panel.dispose();
            return;
        }
        if (message.type === 'search') {
            this.query = message.query ?? '';
            this.page = Math.max(0, message.page ?? 0);
            this.postResults('results');
            return;
        }
        if (message.type === 'select') {
            await applyIdeaReferenceEdit(this.args, {
                fileUri: message.fileUri,
                name: message.name,
                kind: message.kind
            });
            this.panel.dispose();
        }
    }

    private postResults(type: 'init' | 'results'): void {
        const hits = filterAndScoreIdeas(this.ideas, this.query);
        const total = hits.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (this.page >= totalPages) {
            this.page = totalPages - 1;
        }
        const slice = hits.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE);
        const payload: HostToWebview = {
            type,
            query: this.query,
            page: this.page,
            total,
            totalPages,
            mode: this.args.mode ?? 'replace',
            context: this.args.context,
            results: slice.map(hit => ({
                name: hit.name,
                kind: hit.kind,
                path: vscode.workspace.asRelativePath(hit.fileUri),
                summary: hit.summary,
                fileUri: hit.fileUri
            }))
        };
        safeWebviewPost(this.panel.webview, payload);
    }
}

function renderSearchHtml(): string {
    // HTML/JS is intentionally inline (same pattern as reference-code-lens-card).
    return [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="UTF-8" />',
        '<style>',
        ':root { color-scheme: light dark; }',
        'body { margin: 0; padding: 1rem 1.1rem 1.25rem; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); }',
        'h1 { margin: 0 0 0.75rem; font-size: 1.05rem; font-weight: 600; }',
        '.context { display: none; margin: 0 0 1rem; border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); background: var(--vscode-sideBar-background, var(--vscode-editorWidget-background)); padding: 0.75rem 0.85rem; }',
        '.context.visible { display: block; }',
        '.context .eyebrow { margin: 0 0 0.35rem; font-size: 0.75rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--vscode-descriptionForeground); }',
        '.context .idea-name { margin: 0 0 0.55rem; font-size: 0.95rem; font-weight: 600; font-family: var(--vscode-editor-font-family, var(--vscode-font-family)); }',
        '.context-body { margin: 0; max-height: 10rem; overflow: auto; white-space: pre-wrap; word-break: break-word; line-height: 1.45; font-family: var(--vscode-editor-font-family, monospace); font-size: var(--vscode-editor-font-size, 0.9rem); }',
        '.rq-ref { color: var(--vscode-textLink-foreground); font-weight: 500; }',
        '.rq-attr { color: var(--vscode-symbolIcon-keywordForeground, var(--vscode-descriptionForeground)); }',
        '.rq-target { display: inline; padding: 0.05rem 0.2rem; border-radius: 2px; background: var(--vscode-editor-findMatchHighlightBackground, rgba(255, 200, 0, 0.35)); color: var(--vscode-editor-foreground); font-weight: 700; box-shadow: 0 0 0 1px var(--vscode-focusBorder, rgba(100, 150, 255, 0.6)); animation: rq-pulse 1.4s ease-in-out infinite; }',
        '@keyframes rq-pulse { 0%, 100% { box-shadow: 0 0 0 1px var(--vscode-focusBorder, rgba(100, 150, 255, 0.55)); filter: brightness(1); } 50% { box-shadow: 0 0 0 3px var(--vscode-focusBorder, rgba(100, 150, 255, 0.35)); filter: brightness(1.12); } }',
        '.search { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }',
        'input[type="search"] { flex: 1; min-width: 0; padding: 0.4rem 0.55rem; border: 1px solid var(--vscode-input-border, var(--vscode-widget-border)); background: var(--vscode-input-background); color: var(--vscode-input-foreground); font: inherit; }',
        'input[type="search"]:focus { outline: 1px solid var(--vscode-focusBorder); }',
        '.meta { margin: 0 0 0.5rem; color: var(--vscode-descriptionForeground); font-size: 0.85rem; }',
        'ul { list-style: none; margin: 0; padding: 0; border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); max-height: 18rem; overflow: auto; }',
        'li { margin: 0; border-bottom: 1px solid var(--vscode-widget-border, transparent); }',
        'li:last-child { border-bottom: none; }',
        'button.result { display: block; width: 100%; text-align: left; appearance: none; border: none; background: transparent; color: inherit; font: inherit; padding: 0.55rem 0.65rem; cursor: pointer; }',
        'button.result:hover, button.result:focus { background: var(--vscode-list-hoverBackground); outline: none; }',
        'button.result.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }',
        '.name { font-weight: 600; }',
        '.kind { margin-left: 0.4rem; font-size: 0.8rem; opacity: 0.8; }',
        '.path, .summary { margin: 0.15rem 0 0; font-size: 0.85rem; color: var(--vscode-descriptionForeground); }',
        'button.result.active .path, button.result.active .summary { color: inherit; opacity: 0.9; }',
        '.pager { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.75rem; }',
        '.pager button, .actions button { appearance: none; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); padding: 0.3rem 0.65rem; cursor: pointer; font: inherit; }',
        '.pager button:disabled { opacity: 0.5; cursor: default; }',
        '.actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }',
        '.actions .primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }',
        '.empty { padding: 1rem 0.65rem; color: var(--vscode-descriptionForeground); }',
        '</style>',
        '</head>',
        '<body>',
        '<h1 id="title">Search idea reference</h1>',
        '<section id="context" class="context" aria-live="polite">',
        '<p class="eyebrow" id="contextEyebrow">In idea</p>',
        '<p class="idea-name" id="contextIdeaName"></p>',
        '<pre class="context-body" id="contextBody"></pre>',
        '</section>',
        '<div class="search">',
        '<input id="query" type="search" placeholder="Fuzzy / partial search…" autocomplete="off" />',
        '</div>',
        '<p id="meta" class="meta"></p>',
        '<ul id="results"></ul>',
        '<div class="pager">',
        '<button id="prev" type="button">Previous</button>',
        '<span id="pageLabel"></span>',
        '<button id="next" type="button">Next</button>',
        '</div>',
        '<div class="actions">',
        '<button id="cancel" type="button">Cancel</button>',
        '<button id="select" class="primary" type="button" disabled>Select</button>',
        '</div>',
        '<script>',
        webviewScript(),
        '</script>',
        '</body>',
        '</html>'
    ].join('\n');
}

function webviewScript(): string {
    return `
const vscode = acquireVsCodeApi();
const titleEl = document.getElementById('title');
const contextEl = document.getElementById('context');
const contextEyebrow = document.getElementById('contextEyebrow');
const contextIdeaName = document.getElementById('contextIdeaName');
const contextBody = document.getElementById('contextBody');
const queryEl = document.getElementById('query');
const resultsEl = document.getElementById('results');
const metaEl = document.getElementById('meta');
const pageLabel = document.getElementById('pageLabel');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const selectBtn = document.getElementById('select');
const cancelBtn = document.getElementById('cancel');

let page = 0;
let totalPages = 1;
let selected = null;
let debounceTimer = null;
let contextRendered = false;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function styleProse(text) {
  var escaped = escapeHtml(text);
  return escaped
    .replace(/\\[\\[[^\\]\\n]+\\]\\]/g, function (match) {
      return '<span class="rq-ref">' + match + '</span>';
    })
    .replace(/\\[[^\\]\\n]+\\]/g, function (match) {
      return '<span class="rq-ref">' + match + '</span>';
    })
    .replace(/(^|\\n)(\\s*@[\\w-]+)/g, function (_m, lead, attr) {
      return lead + '<span class="rq-attr">' + attr + '</span>';
    });
}

function renderContext(payload) {
  if (contextRendered) return;
  contextRendered = true;
  var mode = payload.mode || 'replace';
  titleEl.textContent = mode === 'wrap' ? 'Wrap as idea reference' : 'Search idea reference';
  contextEyebrow.textContent = mode === 'wrap' ? 'Will wrap selection in' : 'Replacing reference in';
  var ctx = payload.context;
  if (!ctx) {
    contextEl.classList.remove('visible');
    return;
  }
  contextIdeaName.textContent = ctx.ideaName || '';
  contextBody.innerHTML =
    styleProse(ctx.before || '')
    + '<mark class="rq-target">' + escapeHtml(ctx.target || '') + '</mark>'
    + styleProse(ctx.after || '');
  contextEl.classList.add('visible');
  var mark = contextBody.querySelector('.rq-target');
  if (mark && typeof mark.scrollIntoView === 'function') {
    mark.scrollIntoView({ block: 'nearest' });
  }
}

function requestSearch(nextPage) {
  page = Math.max(0, nextPage);
  vscode.postMessage({ type: 'search', query: queryEl.value, page: page });
}

function render(payload) {
  renderContext(payload);
  page = payload.page;
  totalPages = payload.totalPages;
  selected = null;
  selectBtn.disabled = true;
  metaEl.textContent = payload.total === 0
    ? 'No matching ideas'
    : payload.total + ' match' + (payload.total === 1 ? '' : 'es');
  pageLabel.textContent = 'Page ' + (page + 1) + ' of ' + totalPages;
  prevBtn.disabled = page <= 0;
  nextBtn.disabled = page + 1 >= totalPages;

  if (!payload.results.length) {
    resultsEl.innerHTML = '<li class="empty">No results</li>';
    return;
  }
  resultsEl.innerHTML = payload.results.map(function (hit, index) {
    var summary = hit.summary ? '<p class="summary">' + escapeHtml(hit.summary) + '</p>' : '';
    return '<li><button type="button" class="result" data-index="' + index + '">'
      + '<span class="name">' + escapeHtml(hit.name) + '</span>'
      + '<span class="kind">' + escapeHtml(hit.kind) + '</span>'
      + '<p class="path">' + escapeHtml(hit.path) + '</p>'
      + summary
      + '</button></li>';
  }).join('');

  var buttons = resultsEl.querySelectorAll('button.result');
  payload.results.forEach(function (hit, index) {
    var button = buttons[index];
    if (!button) return;
    button.addEventListener('click', function () {
      selected = hit;
      selectBtn.disabled = false;
      buttons.forEach(function (el) { el.classList.remove('active'); });
      button.classList.add('active');
    });
    button.addEventListener('dblclick', function () {
      vscode.postMessage({ type: 'select', fileUri: hit.fileUri, name: hit.name, kind: hit.kind });
    });
  });
}

queryEl.addEventListener('input', function () {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(function () { requestSearch(0); }, 120);
});
queryEl.addEventListener('keydown', function (event) {
  if (event.key === 'Enter' && selected) {
    event.preventDefault();
    selectBtn.click();
  }
});
prevBtn.addEventListener('click', function () { requestSearch(page - 1); });
nextBtn.addEventListener('click', function () { requestSearch(page + 1); });
cancelBtn.addEventListener('click', function () { vscode.postMessage({ type: 'cancel' }); });
selectBtn.addEventListener('click', function () {
  if (!selected) return;
  vscode.postMessage({ type: 'select', fileUri: selected.fileUri, name: selected.name, kind: selected.kind });
});

window.addEventListener('message', function (event) {
  var payload = event.data;
  if (!payload || (payload.type !== 'init' && payload.type !== 'results')) return;
  if (payload.type === 'init' && typeof payload.query === 'string' && queryEl.value !== payload.query) {
    queryEl.value = payload.query;
  }
  render(payload);
  if (payload.type === 'init') {
    queryEl.focus();
    queryEl.select();
  }
});

vscode.postMessage({ type: 'ready' });
`.trim();
}
