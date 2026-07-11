import * as vscode from 'vscode';

/** Svelte webview shell per ["../../../../reqlan rq/extension/module/webview.rq"] */
export function getIdeasSummaryHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = getNonce();
    const baseUri = vscode.Uri.joinPath(extensionUri, 'media', 'webviews', 'ideas-summary');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(baseUri, 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(baseUri, 'main.css'));
    const csp = [
        "default-src 'none'",
        // cytoscape applies inline styles on its container/canvases; without this the
        // graph surface stays empty even after a slice arrives.
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `font-src ${webview.cspSource}`,
        `script-src 'nonce-${nonce}'`
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reqlan Ideas Summary</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let index = 0; index < 32; index++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}
