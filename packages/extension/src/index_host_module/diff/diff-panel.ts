/**
 * Editor webview for idea diffs.
 * rq:["../../../../../reqlan rq/cli/diff.rq".diff_webview]
 */
import * as vscode from 'vscode';
import { openAnalysisApi } from '@reqlan/analytical/core';
import {
    DIFF_CHANGE_CLASS,
    diffRowView,
    type DiffChange,
    type DiffRowInput,
    type DiffVerbosity
} from './diff-row-model.js';

const VIEW_TYPE = 'reqlan.diffIdeas';

interface DiffRequestMessage {
    type: 'diff';
    from?: string;
    to?: string;
    verbosity?: DiffVerbosity;
}

export class DiffPanel {
    private static current?: DiffPanel;
    readonly panel: vscode.WebviewPanel;

    static show(context: vscode.ExtensionContext): void {
        if (DiffPanel.current) {
            DiffPanel.current.panel.reveal(vscode.ViewColumn.Beside);
            return;
        }
        DiffPanel.current = new DiffPanel(context);
    }

    private constructor(context: vscode.ExtensionContext) {
        this.panel = vscode.window.createWebviewPanel(VIEW_TYPE, 'Diff Ideas', vscode.ViewColumn.Beside, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        this.panel.webview.html = diffHtml();
        this.panel.webview.onDidReceiveMessage(
            (message: DiffRequestMessage) => {
                void this.run(message);
            },
            undefined,
            context.subscriptions
        );
        this.panel.onDidDispose(() => {
            DiffPanel.current = undefined;
        });
    }

    private async run(message: DiffRequestMessage): Promise<void> {
        if (!message || message.type !== 'diff') {
            return;
        }
        const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!folder) {
            await this.panel.webview.postMessage({ type: 'error', message: 'Open a workspace folder first.' });
            return;
        }
        const verbosity = message.verbosity ?? 'summary';
        try {
            const opened = await openAnalysisApi({ workspaceRoot: folder });
            try {
                const result = (await opened.api.diffIdeas(
                    blank(message.from),
                    blank(message.to),
                    verbosity
                )) as { from: string; to: string; implicit: boolean; rows: DiffRowInput[] };
                const views = result.rows.map(row => diffRowView(row, verbosity));
                await this.panel.webview.postMessage({
                    type: 'rows',
                    rows: views,
                    comparison: result.implicit
                        ? { from: result.from, to: result.to }
                        : undefined
                });
            } finally {
                await opened.dispose();
            }
        } catch (error) {
            const text = error instanceof Error ? error.message : String(error);
            await this.panel.webview.postMessage({ type: 'error', message: text });
        }
    }
}

function blank(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

function diffHtml(): string {
    const kindClasses = JSON.stringify(DIFF_CHANGE_CLASS);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
:root { color-scheme: light dark; }
body {
  font: var(--vscode-font-size, 13px)/1.4 var(--vscode-font-family, sans-serif);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  margin: 0;
  padding: 0 0 16px;
}
.toolbar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px 12px;
  padding: 12px;
  background: var(--vscode-editor-background);
  border-bottom: 1px solid var(--vscode-panel-border, transparent);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 8rem;
  min-width: 7rem;
}
.field-detail { flex: 0 1 7rem; min-width: 6rem; }
.field-action { flex: 0 0 auto; }
.field label {
  font-size: 0.85em;
  color: var(--vscode-descriptionForeground);
}
input, select, button {
  font: inherit;
  box-sizing: border-box;
  height: 26px;
}
input, select {
  width: 100%;
  padding: 2px 6px;
  color: var(--vscode-input-foreground);
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border, transparent);
  border-radius: 2px;
  outline: none;
}
input:focus, select:focus {
  border-color: var(--vscode-focusBorder);
}
button {
  padding: 0 14px;
  cursor: pointer;
  color: var(--vscode-button-foreground);
  background: var(--vscode-button-background);
  border: 1px solid var(--vscode-button-border, transparent);
  border-radius: 2px;
}
button:hover:not(:disabled) {
  background: var(--vscode-button-hoverBackground);
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
#out { padding: 0 12px; }
.status {
  margin: 12px 0 4px;
  color: var(--vscode-descriptionForeground);
}
.status.error {
  color: var(--vscode-errorForeground);
  background: var(--vscode-inputValidation-errorBackground, transparent);
  border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));
  border-radius: 2px;
  padding: 0.35rem 0.55rem;
  font-weight: 600;
}
.row {
  padding: 10px 0;
  border-bottom: 1px solid var(--vscode-panel-border, transparent);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.65rem;
}
.kind {
  flex: 0 0 5.5rem;
  font-weight: 600;
  text-transform: lowercase;
}
.name { font-weight: 600; }
.path {
  color: var(--vscode-descriptionForeground);
  overflow-wrap: anywhere;
  min-width: 0;
}
.kind-created { color: var(--vscode-gitDecoration-addedResourceForeground); }
.kind-deleted { color: var(--vscode-gitDecoration-deletedResourceForeground); }
.kind-modified { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
.kind-moved { color: var(--vscode-gitDecoration-renamedResourceForeground); }
.add { color: var(--vscode-gitDecoration-addedResourceForeground); }
.del { color: var(--vscode-gitDecoration-deletedResourceForeground); }
.refs, .text-block { margin-top: 6px; }
.ref-line { font-family: var(--vscode-editor-font-family, monospace); }
.text-grid {
  display: grid;
  gap: 8px;
  margin-top: 6px;
}
@media (min-width: 480px) {
  .text-grid.modified { grid-template-columns: 1fr 1fr; }
}
.text-pane-label {
  font-size: 0.85em;
  color: var(--vscode-descriptionForeground);
  margin-bottom: 4px;
}
.text-body {
  margin: 0;
  padding: 6px 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: var(--vscode-editor-font-size, 12px);
  background: var(--vscode-textCodeBlock-background, transparent);
  border: 1px solid var(--vscode-panel-border, transparent);
  border-radius: 2px;
}
</style>
</head>
<body>
<form class="toolbar" id="form" autocomplete="off">
  <div class="field">
    <label for="from">From</label>
    <input id="from" name="from" placeholder="HEAD or empty" />
  </div>
  <div class="field">
    <label for="to">To</label>
    <input id="to" name="to" placeholder="empty uses the default" />
  </div>
  <div class="field field-detail">
    <label for="verbosity">Detail</label>
    <select id="verbosity" name="verbosity">
      <option value="summary">summary</option>
      <option value="references">references</option>
      <option value="text">text</option>
    </select>
  </div>
  <div class="field field-action">
    <label for="run">&nbsp;</label>
    <button id="run" type="submit">Diff</button>
  </div>
</form>
<div id="out"></div>
<script>
const vscode = acquireVsCodeApi();
const KIND_CLASS = ${kindClasses};
const out = document.getElementById('out');
const form = document.getElementById('form');
const runBtn = document.getElementById('run');
function setLoading(loading) {
  runBtn.disabled = loading;
  runBtn.textContent = loading ? 'Diffing…' : 'Diff';
}
function postDiff() {
  setLoading(true);
  out.innerHTML = '<div class="status">Diffing…</div>';
  vscode.postMessage({
    type: 'diff',
    from: document.getElementById('from').value,
    to: document.getElementById('to').value,
    verbosity: document.getElementById('verbosity').value
  });
}
form.addEventListener('submit', (event) => {
  event.preventDefault();
  postDiff();
});
window.addEventListener('message', (event) => {
  const message = event.data;
  setLoading(false);
  if (message.type === 'error') {
    out.innerHTML = '<div class="status error">' + esc(message.message) + '</div>';
    return;
  }
  const parts = [];
  if (message.comparison) {
    parts.push('<div class="status">Comparing ' + esc(message.comparison.from) + ' -> ' + esc(message.comparison.to) + '</div>');
  }
  const rows = message.rows || [];
  if (rows.length === 0) {
    parts.push('<div class="status">No idea changes</div>');
  } else {
    parts.push(...rows.map(renderRow));
  }
  out.innerHTML = parts.join('');
});
function esc(value) {
  return String(value).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
function kindClass(change) {
  return KIND_CLASS[change] || '';
}
function renderRow(row) {
  const path = row.fromFile ? row.fromFile + ' → ' + row.file : row.file;
  const kind = kindClass(row.change);
  const lines = [
    '<div class="row">',
    '<div class="meta">',
    '<span class="kind ' + kind + '">' + esc(row.change) + '</span>',
    '<span class="name">' + esc(row.name) + '</span>',
    '<span class="path">' + esc(path) + '</span>',
    '</div>'
  ];
  const added = row.added || [];
  const removed = row.removed || [];
  if (added.length || removed.length) {
    lines.push('<div class="refs">');
    for (const name of added) lines.push('<div class="ref-line add">+ ' + esc(name) + '</div>');
    for (const name of removed) lines.push('<div class="ref-line del">- ' + esc(name) + '</div>');
    lines.push('</div>');
  }
  const hasText = row.before !== undefined || row.after !== undefined;
  if (hasText) {
    if (row.change === 'modified') {
      lines.push('<div class="text-grid modified">');
      lines.push('<div><div class="text-pane-label">Before</div><pre class="text-body del">' + esc(row.before || '') + '</pre></div>');
      lines.push('<div><div class="text-pane-label">After</div><pre class="text-body add">' + esc(row.after || '') + '</pre></div>');
      lines.push('</div>');
    } else if (row.change === 'created') {
      lines.push('<div class="text-block"><pre class="text-body add">' + esc(row.after || '') + '</pre></div>');
    } else if (row.change === 'deleted') {
      lines.push('<div class="text-block"><pre class="text-body del">' + esc(row.before || '') + '</pre></div>');
    }
  }
  lines.push('</div>');
  return lines.join('');
}
postDiff();
</script>
</body>
</html>`;
}

export type { DiffChange };
