/**
 * Lightweight reference card opened from CodeLens (links already handle navigation).
 */
import * as vscode from 'vscode';
import type { ReferenceCodeLensPayload } from '@reqlan/language';
import { openIndexFile } from '../analytical_submodule/index-store/open-index-file.js';
import { openFolderReferencePicker } from './register-folder-reference-handling.js';

const VIEW_TYPE = 'reqlan.referenceCodeLensCard';

export class ReferenceCodeLensCard {
    private static current?: ReferenceCodeLensCard;

    private readonly panel: vscode.WebviewPanel;
    private payload: ReferenceCodeLensPayload;

    private constructor(payload: ReferenceCodeLensPayload) {
        this.payload = payload;
        this.panel = vscode.window.createWebviewPanel(
            VIEW_TYPE,
            cardTitle(payload),
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: false }
        );
        this.panel.webview.html = renderCardHtml(payload);
        this.panel.webview.onDidReceiveMessage(async (message: { type?: string }) => {
            if (message?.type === 'open') {
                await openIndexFile(
                    this.payload.targetUri,
                    this.payload.line ?? 0,
                    this.payload.character ?? 0
                );
                return;
            }
            if (message?.type === 'reveal') {
                await vscode.commands.executeCommand(
                    'revealInExplorer',
                    vscode.Uri.parse(this.payload.targetUri)
                );
                return;
            }
            if (message?.type === 'pick') {
                await openFolderReferencePicker(this.payload.targetUri, this.payload.folderFiles);
            }
        });
        this.panel.onDidDispose(() => {
            if (ReferenceCodeLensCard.current === this) {
                ReferenceCodeLensCard.current = undefined;
            }
        });
    }

    static show(payload: ReferenceCodeLensPayload): void {
        if (ReferenceCodeLensCard.current) {
            ReferenceCodeLensCard.current.update(payload);
            ReferenceCodeLensCard.current.panel.reveal(vscode.ViewColumn.Beside, true);
            return;
        }
        ReferenceCodeLensCard.current = new ReferenceCodeLensCard(payload);
    }

    private update(payload: ReferenceCodeLensPayload): void {
        this.payload = payload;
        this.panel.title = cardTitle(payload);
        this.panel.webview.html = renderCardHtml(payload);
    }
}

function cardTitle(payload: ReferenceCodeLensPayload): string {
    return `${payload.classification} · ${payload.displayName}`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderCardHtml(payload: ReferenceCodeLensPayload): string {
    const stats = payload.stats.map(stat => `<li>${escapeHtml(stat)}</li>`).join('');
    const summary = payload.summary
        ? `<p class="summary">${escapeHtml(payload.summary)}</p>`
        : '';
    const path = `<p class="path">${escapeHtml(vscode.workspace.asRelativePath(
        vscode.Uri.parse(payload.targetUri),
        false
    ))}</p>`;

    const actions = payload.kind === 'folder'
        ? `
            <button data-action="reveal">Reveal in Explorer</button>
            <button data-action="pick" class="secondary">Select a file…</button>
          `
        : `
            <button data-action="open">Open target</button>
            <p class="hint">References already act as links — use Ctrl/Cmd-click in the editor to navigate.</p>
          `;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  :root {
    color-scheme: light dark;
  }
  body {
    margin: 0;
    padding: 1rem 1.1rem 1.25rem;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
  }
  .card {
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    background: var(--vscode-sideBar-background, var(--vscode-editorWidget-background));
    padding: 1rem 1.1rem;
    max-width: 28rem;
  }
  .eyebrow {
    margin: 0 0 0.35rem;
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
  }
  h1 {
    margin: 0 0 0.5rem;
    font-size: 1.15rem;
    font-weight: 600;
  }
  .path, .hint {
    margin: 0.35rem 0 0;
    color: var(--vscode-descriptionForeground);
    font-size: 0.85rem;
  }
  .summary {
    margin: 0.75rem 0 0;
    line-height: 1.45;
    white-space: pre-wrap;
  }
  ul {
    margin: 0.75rem 0 0;
    padding-left: 1.1rem;
  }
  li { margin: 0.2rem 0; }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
    align-items: center;
  }
  button {
    appearance: none;
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    padding: 0.35rem 0.75rem;
    cursor: pointer;
    font: inherit;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
</style>
</head>
<body>
  <article class="card">
    <p class="eyebrow">${escapeHtml(payload.classification)}</p>
    <h1>${escapeHtml(payload.displayName)}</h1>
    ${path}
    ${summary}
    ${stats ? `<ul>${stats}</ul>` : ''}
    <div class="actions">${actions}</div>
  </article>
  <script>
    const vscode = acquireVsCodeApi();
    for (const button of document.querySelectorAll('[data-action]')) {
      button.addEventListener('click', () => {
        vscode.postMessage({ type: button.getAttribute('data-action') });
      });
    }
  </script>
</body>
</html>`;
}
