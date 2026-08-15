/**
 * Webview listing stats + matching ideas/files for a wildcard reference.
 * rq:["../../../../reqlan rq/language/imports.rq".wildcard_references_webview]
 */
import type { WildcardReferenceArgs } from '@reqlan/language';
import * as vscode from 'vscode';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';
import { openIndexFile } from '../analytical_submodule/index-store/open-index-file.js';
import { wildcardSearchSeed } from '../activity_bar_module/idea-path-filter.js';
import { safeWebviewPost } from '../shared/safe-webview-post.js';
import {
    buildWildcardMatchesPayload,
    type WildcardMatchesPayload
} from '../activity_bar_module/wildcard-matches-payload.js';
import type { ActivityBarWebviewProvider } from '../activity_bar_module/activity-bar-webview-provider.js';

const VIEW_TYPE = 'reqlan.wildcardMatches';

type HostToWebview =
    | { type: 'init'; payload: WildcardMatchesPayload }
    | { type: 'empty'; pathPattern: string; ideaPattern: string };

type WebviewToHost =
    | { type: 'ready' }
    | { type: 'openIdea'; fileUri: string; lineStart: number }
    | { type: 'openFile'; fileUri: string }
    | { type: 'openSearch' }
    | { type: 'close' };

export class WildcardMatchesPanel {
    private static current?: WildcardMatchesPanel;

    private readonly panel: vscode.WebviewPanel;
    private readonly index: IndexService;
    private readonly args: WildcardReferenceArgs;
    private readonly getActivityBar: () => ActivityBarWebviewProvider | undefined;
    private payload?: WildcardMatchesPayload;

    private constructor(
        index: IndexService,
        args: WildcardReferenceArgs,
        getActivityBar: () => ActivityBarWebviewProvider | undefined
    ) {
        this.index = index;
        this.args = args;
        this.getActivityBar = getActivityBar;
        this.panel = vscode.window.createWebviewPanel(
            VIEW_TYPE,
            `Wildcard: ${args.ideaPattern}`,
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
            { enableScripts: true, retainContextWhenHidden: true }
        );
        this.panel.webview.html = renderMatchesHtml();
        this.panel.webview.onDidReceiveMessage(async (message: WebviewToHost) => {
            await this.onMessage(message);
        });
        this.panel.onDidDispose(() => {
            if (WildcardMatchesPanel.current === this) {
                WildcardMatchesPanel.current = undefined;
            }
        });
        void this.load().then(() => this.postInit());
    }

    static async show(
        index: IndexService,
        args: WildcardReferenceArgs,
        getActivityBar: () => ActivityBarWebviewProvider | undefined
    ): Promise<void> {
        if (!index.isReady) {
            void vscode.window.showWarningMessage('Reqlan index is not ready yet.');
            return;
        }
        if (WildcardMatchesPanel.current) {
            WildcardMatchesPanel.current.panel.dispose();
        }
        WildcardMatchesPanel.current = new WildcardMatchesPanel(index, args, getActivityBar);
    }

    private async load(): Promise<void> {
        const ideas = await this.index.indexStore.listAllIdeas();
        this.payload = buildWildcardMatchesPayload(this.args, ideas, fileUri =>
            vscode.workspace.asRelativePath(fileUri)
        );
    }

    private async onMessage(message: WebviewToHost): Promise<void> {
        if (!message?.type) {
            return;
        }
        if (message.type === 'ready') {
            this.postInit();
            return;
        }
        if (message.type === 'close') {
            this.panel.dispose();
            return;
        }
        if (message.type === 'openIdea') {
            await openIndexFile(
                message.fileUri,
                message.lineStart,
                0,
                this.index.getActiveBase()?.descriptor.root
            );
            return;
        }
        if (message.type === 'openFile') {
            await openIndexFile(message.fileUri, 0, 0, this.index.getActiveBase()?.descriptor.root);
            return;
        }
        if (message.type === 'openSearch') {
            const activityBar = this.getActivityBar();
            if (activityBar) {
                await activityBar.openSearch(wildcardSearchSeed(this.args));
            }
        }
    }

    private postInit(): void {
        if (!this.payload) {
            const empty: HostToWebview = {
                type: 'empty',
                pathPattern: this.args.pathPattern,
                ideaPattern: this.args.ideaPattern
            };
            safeWebviewPost(this.panel.webview, empty);
            return;
        }
        const message: HostToWebview = { type: 'init', payload: this.payload };
        safeWebviewPost(this.panel.webview, message);
    }
}

function renderMatchesHtml(): string {
    return [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="UTF-8" />',
        '<style>',
        ':root { color-scheme: light dark; }',
        'body { margin: 0; padding: 1rem 1.1rem 1.25rem; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); }',
        'h1 { margin: 0 0 0.35rem; font-size: 1.05rem; font-weight: 600; }',
        '.pattern { margin: 0 0 1rem; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family, monospace); font-size: 0.85rem; word-break: break-all; }',
        '.stats { display: flex; flex-wrap: wrap; gap: 0.65rem; margin: 0 0 1rem; }',
        '.stat { min-width: 5.5rem; padding: 0.45rem 0.65rem; border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); background: var(--vscode-sideBar-background, var(--vscode-editorWidget-background)); }',
        '.stat .label { display: block; font-size: 0.72rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--vscode-descriptionForeground); }',
        '.stat .value { font-size: 1.05rem; font-weight: 600; }',
        'h2 { margin: 1rem 0 0.45rem; font-size: 0.92rem; font-weight: 600; }',
        'ul { list-style: none; margin: 0; padding: 0; border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); max-height: 16rem; overflow: auto; }',
        'li { margin: 0; border-bottom: 1px solid var(--vscode-widget-border, transparent); }',
        'li:last-child { border-bottom: none; }',
        'button.row { display: block; width: 100%; text-align: left; appearance: none; border: none; background: transparent; color: inherit; font: inherit; padding: 0.55rem 0.65rem; cursor: pointer; }',
        'button.row:hover, button.row:focus { background: var(--vscode-list-hoverBackground); outline: none; }',
        '.name { font-weight: 600; }',
        '.meta { margin-left: 0.4rem; font-size: 0.8rem; opacity: 0.8; }',
        '.path, .summary { margin: 0.15rem 0 0; font-size: 0.85rem; color: var(--vscode-descriptionForeground); }',
        '.actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }',
        '.actions button { appearance: none; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); padding: 0.3rem 0.65rem; cursor: pointer; font: inherit; }',
        '.actions .primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }',
        '.empty { padding: 1rem 0.65rem; color: var(--vscode-descriptionForeground); }',
        '</style>',
        '</head>',
        '<body>',
        '<h1>Wildcard matches</h1>',
        '<p id="pattern" class="pattern"></p>',
        '<div id="stats" class="stats"></div>',
        '<h2>Requirements</h2>',
        '<ul id="ideas"></ul>',
        '<h2>Files</h2>',
        '<ul id="files"></ul>',
        '<div class="actions">',
        '<button id="search" type="button">Open in Search</button>',
        '<button id="close" class="primary" type="button">Close</button>',
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
const patternEl = document.getElementById('pattern');
const statsEl = document.getElementById('stats');
const ideasEl = document.getElementById('ideas');
const filesEl = document.getElementById('files');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderStats(stats) {
  var chips = [
    { label: 'Ideas', value: stats.ideaCount },
    { label: 'Files', value: stats.fileCount }
  ].concat((stats.statusCounts || []).slice(0, 4).map(function (entry) {
    return { label: entry.status, value: entry.count };
  }));
  statsEl.innerHTML = chips.map(function (chip) {
    return '<div class="stat"><span class="label">' + escapeHtml(chip.label)
      + '</span><span class="value">' + escapeHtml(String(chip.value)) + '</span></div>';
  }).join('');
}

function render(payload) {
  patternEl.textContent = '["' + payload.stats.pathPattern + '".' + payload.stats.ideaPattern + ']';
  renderStats(payload.stats);
  if (!payload.ideas.length) {
    ideasEl.innerHTML = '<li class="empty">No matching requirements</li>';
  } else {
    ideasEl.innerHTML = payload.ideas.map(function (hit) {
      var summary = hit.summary ? '<p class="summary">' + escapeHtml(hit.summary) + '</p>' : '';
      var status = hit.status ? '<span class="meta">' + escapeHtml(hit.status) + '</span>' : '';
      return '<li><button type="button" class="row idea" data-uri="' + escapeHtml(hit.fileUri)
        + '" data-line="' + hit.lineStart + '">'
        + '<span class="name">' + escapeHtml(hit.name) + '</span>' + status
        + '<p class="path">' + escapeHtml(hit.path) + '</p>'
        + summary
        + '</button></li>';
    }).join('');
  }
  if (!payload.files.length) {
    filesEl.innerHTML = '<li class="empty">No matching files</li>';
  } else {
    filesEl.innerHTML = payload.files.map(function (file) {
      return '<li><button type="button" class="row file" data-uri="' + escapeHtml(file.fileUri) + '">'
        + '<span class="name">' + escapeHtml(file.path) + '</span>'
        + '<span class="meta">' + file.ideaCount + ' idea' + (file.ideaCount === 1 ? '' : 's') + '</span>'
        + '</button></li>';
    }).join('');
  }
  ideasEl.querySelectorAll('button.idea').forEach(function (button) {
    button.addEventListener('click', function () {
      vscode.postMessage({
        type: 'openIdea',
        fileUri: button.getAttribute('data-uri'),
        lineStart: Number(button.getAttribute('data-line') || 0)
      });
    });
  });
  filesEl.querySelectorAll('button.file').forEach(function (button) {
    button.addEventListener('click', function () {
      vscode.postMessage({ type: 'openFile', fileUri: button.getAttribute('data-uri') });
    });
  });
}

document.getElementById('close').addEventListener('click', function () {
  vscode.postMessage({ type: 'close' });
});
document.getElementById('search').addEventListener('click', function () {
  vscode.postMessage({ type: 'openSearch' });
});

window.addEventListener('message', function (event) {
  var message = event.data;
  if (!message) return;
  if (message.type === 'init') {
    render(message.payload);
    return;
  }
  if (message.type === 'empty') {
    render({
      stats: {
        ideaCount: 0,
        fileCount: 0,
        pathPattern: message.pathPattern,
        ideaPattern: message.ideaPattern,
        statusCounts: []
      },
      ideas: [],
      files: []
    });
  }
});

vscode.postMessage({ type: 'ready' });
`.trim();
}
