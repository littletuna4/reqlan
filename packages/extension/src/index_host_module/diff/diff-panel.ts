/**
 * Editor webview for idea diffs.
 * rq:["../../../../../reqlan rq/cli/diff.rq".diff_webview]
 */
import * as vscode from 'vscode';
import { openAnalysisApi } from '@reqlan/analytical/core';
import {
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
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
body { font: 13px/1.4 var(--vscode-editor-font-family, sans-serif); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); margin: 0; padding: 12px; }
label { display: block; margin: 8px 0 4px; }
input, select, button { font: inherit; }
.row { margin: 10px 0; }
.meta { font-weight: 600; }
.header { margin: 12px 0 4px; color: var(--vscode-descriptionForeground); }
.add { color: var(--vscode-gitDecoration-addedResourceForeground); }
.del { color: var(--vscode-gitDecoration-deletedResourceForeground); }
</style>
</head>
<body>
<label>From <input id="from" placeholder="HEAD or empty" /></label>
<label>To <input id="to" placeholder="empty uses the default" /></label>
<label>Detail
<select id="verbosity">
<option value="summary">summary</option>
<option value="references">references</option>
<option value="text">text</option>
</select>
</label>
<button id="run" type="button">Diff</button>
<div id="out"></div>
<script>
const vscode = acquireVsCodeApi();
const out = document.getElementById('out');
document.getElementById('run').addEventListener('click', () => {
  vscode.postMessage({
    type: 'diff',
    from: document.getElementById('from').value,
    to: document.getElementById('to').value,
    verbosity: document.getElementById('verbosity').value
  });
});
window.addEventListener('message', (event) => {
  const message = event.data;
  if (message.type === 'error') {
    out.textContent = message.message;
    return;
  }
  const parts = [];
  if (message.comparison) {
    parts.push('<div class="header">Comparing ' + esc(message.comparison.from) + ' -> ' + esc(message.comparison.to) + '</div>');
  }
  parts.push(...(message.rows || []).map(renderRow));
  out.innerHTML = parts.join('');
});
function esc(value) {
  return String(value).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
function tokenClass(change) {
  if (change === 'created') return 'add';
  if (change === 'deleted') return 'del';
  return '';
}
function renderRow(row) {
  const path = row.fromFile ? row.fromFile + ' -> ' + row.file : row.file;
  const lines = ['<div class="row"><div class="meta ' + tokenClass(row.change) + '">' + esc(row.change) + ' ' + esc(row.name) + ' ' + esc(path) + '</div>'];
  for (const name of row.added || []) lines.push('<div class="add">+ ' + esc(name) + '</div>');
  for (const name of row.removed || []) lines.push('<div class="del">- ' + esc(name) + '</div>');
  if (row.before) lines.push('<div class="del">- ' + esc(row.before) + '</div>');
  if (row.after) lines.push('<div class="add">+ ' + esc(row.after) + '</div>');
  lines.push('</div>');
  return lines.join('');
}
</script>
</body>
</html>`;
}

export type { DiffChange };
