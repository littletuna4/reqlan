import { IDEAS_PAGE_SIZE, IDEASETS_PAGE_SIZE, REFERENCES_PAGE_SIZE } from './messages.js';

/** Ideas summary webview HTML per ["../../../../reqlan rq/extension/module/webview.rq"] */
export function renderIdeasSummaryHtml(): string {
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reqlan Ideas Summary</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 16px;
    }
    h1 { font-size: 1.2em; font-weight: 600; margin: 0 0 8px; }
    h2 { font-size: 1em; font-weight: 600; margin: 16px 0 8px; }
    .status { color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
    .status.error { color: var(--vscode-errorForeground); }
    .tabs { display: flex; gap: 4px; margin-bottom: 12px; flex-wrap: wrap; }
    .tab {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-panel-border);
      padding: 6px 12px;
      cursor: pointer;
      border-radius: 2px;
    }
    .tab.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td {
      border-bottom: 1px solid var(--vscode-panel-border);
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
    }
    th {
      position: sticky;
      top: 0;
      background: var(--vscode-editor-background);
      font-weight: 600;
    }
    tr.clickable { cursor: pointer; }
    tr.clickable:hover { background: var(--vscode-list-hoverBackground); }
    .pager { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 4px 10px;
      cursor: pointer;
      border-radius: 2px;
    }
    button:disabled { opacity: 0.5; cursor: default; }
    .hidden { display: none; }
    .actions { margin-bottom: 12px; }
    pre.dump {
      max-height: 400px;
      overflow: auto;
      background: var(--vscode-textBlockQuote-background);
      padding: 12px;
      border-radius: 4px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 8px;
      margin-bottom: 16px;
    }
    .stat-card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 10px;
      background: var(--vscode-editor-inactiveSelectionBackground);
    }
    .stat-card .label {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
      margin-bottom: 4px;
    }
    .stat-card .value { font-weight: 600; font-size: 1.1em; }
    .progress-bar {
      height: 6px;
      background: var(--vscode-panel-border);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 8px;
    }
    .progress-bar > span {
      display: block;
      height: 100%;
      background: var(--vscode-progressBar-background);
    }
    .activity-list { list-style: none; padding: 0; margin: 0; }
    .activity-list li {
      padding: 6px 0;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .activity-list .time {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
    }
    .state-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.85em;
      font-weight: 600;
      text-transform: uppercase;
    }
    .state-ready { background: var(--vscode-testing-iconPassed); color: var(--vscode-editor-background); }
    .state-syncing, .state-opening { background: var(--vscode-progressBar-background); }
    .state-error { background: var(--vscode-inputValidation-errorBackground); }
    .state-idle, .state-uninitialized { background: var(--vscode-badge-background); }
    .error-detail { margin: 0; }
    .error-detail dt {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
      margin-top: 8px;
    }
    .error-detail dd {
      margin: 2px 0 0;
      word-break: break-word;
    }
    .error-summary { font-weight: 600; margin-bottom: 4px; }
    .issue-link { color: var(--vscode-textLink-foreground); text-decoration: underline; cursor: pointer; }
    .state-ready-warn { background: var(--vscode-inputValidation-warningBackground); }
    .member-select {
      width: 100%;
      font-family: inherit;
      font-size: inherit;
      color: var(--vscode-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      padding: 4px 6px;
      border-radius: 2px;
    }
    .issues-table-scroll {
      max-height: min(320px, 40vh);
      overflow: auto;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      margin-bottom: 12px;
    }
    .issues-table-scroll table { margin: 0; }
    .issues-table-scroll th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--vscode-editor-background);
      box-shadow: 0 1px 0 var(--vscode-panel-border);
    }
  </style>
</head>
<body>
  <h1>Ideas Summary</h1>
  <div id="status" class="status">Loading index…</div>

  <div class="tabs">
    <button class="tab active" data-tab="index">Index</button>
    <button class="tab" data-tab="ideas">Ideas</button>
    <button class="tab" data-tab="ideasets">Ideasets</button>
    <button class="tab" data-tab="references">References</button>
  </div>

  <div id="index-panel">
    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">State</div>
        <div class="value"><span id="index-state" class="state-badge state-idle">—</span></div>
      </div>
      <div class="stat-card">
        <div class="label">Ideas</div>
        <div class="value" id="index-ideas">—</div>
      </div>
      <div class="stat-card">
        <div class="label">References</div>
        <div class="value" id="index-edges">—</div>
      </div>
      <div class="stat-card">
        <div class="label">File issues</div>
        <div class="value" id="index-file-issues">—</div>
      </div>
    </div>
    <div id="sync-progress-section" class="hidden">
      <h2>Sync progress</h2>
      <div id="sync-progress-label">—</div>
      <div class="progress-bar"><span id="sync-progress-bar" style="width:0%"></span></div>
    </div>
    <div id="index-error-section" class="hidden">
      <h2>Global error</h2>
      <div id="index-error" class="status error"></div>
    </div>
    <div id="file-issues-section" class="hidden">
      <h2>Errors from last index</h2>
      <p class="status">All issues from the most recent index run. Valid ideas are still indexed where possible.</p>
      <div class="issues-table-scroll">
        <table>
          <thead>
            <tr>
              <th style="width:18%">Location</th>
              <th style="width:8%">Phase</th>
              <th style="width:18%">Ideas</th>
              <th style="width:24%">Message</th>
              <th style="width:32%">Cause</th>
            </tr>
          </thead>
          <tbody id="file-issues-body"></tbody>
        </table>
      </div>
    </div>
    <div class="actions">
      <button id="refresh-index">Refresh index</button>
    </div>
    <h2>Recent activity</h2>
    <ul id="activity-list" class="activity-list"></ul>
  </div>

  <div id="ideas-panel" class="hidden">
    <table>
      <thead>
        <tr>
          <th style="width:18%">Title</th>
          <th style="width:22%">Path</th>
          <th style="width:14%">Body</th>
          <th style="width:28%">Other attributes</th>
          <th style="width:8%">Refs</th>
        </tr>
      </thead>
      <tbody id="ideas-body"></tbody>
    </table>
    <div class="pager">
      <button id="ideas-prev">Previous</button>
      <span id="ideas-page-label">Page 1</span>
      <button id="ideas-next">Next</button>
    </div>
  </div>

  <div id="ideasets-panel" class="hidden">
    <table>
      <thead>
        <tr>
          <th style="width:22%">Name</th>
          <th style="width:28%">Path</th>
          <th style="width:14%">Kind</th>
          <th style="width:36%">Members</th>
        </tr>
      </thead>
      <tbody id="ideasets-body"></tbody>
    </table>
    <div class="pager">
      <button id="ideasets-prev">Previous</button>
      <span id="ideasets-page-label">Page 1</span>
      <button id="ideasets-next">Next</button>
    </div>
  </div>

  <div id="references-panel" class="hidden">
    <table>
      <thead>
        <tr>
          <th style="width:24%">Source</th>
          <th style="width:24%">Target</th>
          <th style="width:10%">In .rq</th>
          <th style="width:14%">Type</th>
        </tr>
      </thead>
      <tbody id="references-body"></tbody>
    </table>
    <div class="pager">
      <button id="references-prev">Previous</button>
      <span id="references-page-label">Page 1</span>
      <button id="references-next">Next</button>
    </div>
  </div>

  <div id="export-panel" class="hidden actions">
    <button id="dump-graph">Export full graph (JSON)</button>
  </div>
  <pre id="dump-output" class="dump hidden"></pre>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const IDEAS_PAGE_SIZE = ${IDEAS_PAGE_SIZE};
    const IDEASETS_PAGE_SIZE = ${IDEASETS_PAGE_SIZE};
    const REFERENCES_PAGE_SIZE = ${REFERENCES_PAGE_SIZE};

    let ideasPage = 0;
    let ideasetsPage = 0;
    let referencesPage = 0;
    let ideasTotal = 0;
    let ideasetsTotal = 0;
    let referencesTotal = 0;
    let activeTab = 'index';
    let indexReady = false;

    const statusEl = document.getElementById('status');
    const ideasBody = document.getElementById('ideas-body');
    const ideasetsBody = document.getElementById('ideasets-body');
    const referencesBody = document.getElementById('references-body');
    const ideasPageLabel = document.getElementById('ideas-page-label');
    const ideasetsPageLabel = document.getElementById('ideasets-page-label');
    const referencesPageLabel = document.getElementById('references-page-label');
    const dumpOutput = document.getElementById('dump-output');

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function formatTime(at) {
      return new Date(at).toLocaleTimeString();
    }

    function setTab(tab) {
      activeTab = tab;
      document.querySelectorAll('.tab').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tab);
      });
      document.getElementById('index-panel').classList.toggle('hidden', tab !== 'index');
      document.getElementById('ideas-panel').classList.toggle('hidden', tab !== 'ideas');
      document.getElementById('ideasets-panel').classList.toggle('hidden', tab !== 'ideasets');
      document.getElementById('references-panel').classList.toggle('hidden', tab !== 'references');
      document.getElementById('export-panel').classList.toggle('hidden', tab === 'index');
    }

    function renderLastError(lastError) {
      const parts = [
        \`<div class="error-summary">\${escapeHtml(lastError.summary)}</div>\`,
        '<dl class="error-detail">'
      ];
      if (lastError.file) {
        parts.push(\`<dt>File</dt><dd>\${escapeHtml(lastError.file)}</dd>\`);
      }
      if (lastError.ideas && lastError.ideas.length) {
        parts.push(\`<dt>Ideas</dt><dd>\${escapeHtml(lastError.ideas.join(', '))}</dd>\`);
      }
      if (lastError.phase) {
        parts.push(\`<dt>Phase</dt><dd>\${escapeHtml(lastError.phase)}</dd>\`);
      }
      if (lastError.cause) {
        parts.push(\`<dt>Cause</dt><dd>\${escapeHtml(lastError.cause)}</dd>\`);
      }
      parts.push('</dl>');
      return parts.join('');
    }

    function renderFileIssues(issues) {
      const section = document.getElementById('file-issues-section');
      const body = document.getElementById('file-issues-body');
      if (!issues || issues.length === 0) {
        section.classList.add('hidden');
        body.innerHTML = '';
        return;
      }
      section.classList.remove('hidden');
      body.innerHTML = issues.map(issue => \`
        <tr class="clickable" data-file-uri="\${escapeHtml(issue.fileUri)}" data-line="\${issue.line}" data-column="\${issue.column}">
          <td>\${escapeHtml(issue.location)}</td>
          <td>\${escapeHtml(issue.phase)}</td>
          <td>\${escapeHtml(issue.ideaNames && issue.ideaNames.length ? issue.ideaNames.join(', ') : '—')}</td>
          <td>\${escapeHtml(issue.message)}</td>
          <td>\${escapeHtml(issue.cause ?? '—')}</td>
        </tr>
      \`).join('');
      body.querySelectorAll('tr.clickable').forEach(row => {
        row.addEventListener('click', () => {
          vscode.postMessage({
            type: 'openIdea',
            fileUri: row.dataset.fileUri,
            line: Number(row.dataset.line),
            column: Number(row.dataset.column)
          });
        });
      });
    }

    function renderIndexStatus(status) {
      indexReady = status.ready;
      const stateEl = document.getElementById('index-state');
      const issueCount = status.fileIssueCount ?? 0;
      if (status.ready && issueCount > 0) {
        stateEl.textContent = 'ready (issues)';
        stateEl.className = 'state-badge state-ready-warn';
      } else {
        stateEl.textContent = status.state;
        stateEl.className = 'state-badge state-' + status.state;
      }

      document.getElementById('index-ideas').textContent = String(status.ideaCount);
      document.getElementById('index-edges').textContent = String(status.edgeCount);
      document.getElementById('index-file-issues').textContent = String(issueCount);

      const progressSection = document.getElementById('sync-progress-section');
      if (status.syncProgress && status.syncProgress.total > 0) {
        progressSection.classList.remove('hidden');
        const pct = Math.round((status.syncProgress.processed / status.syncProgress.total) * 100);
        document.getElementById('sync-progress-label').textContent =
          \`\${status.syncProgress.processed} / \${status.syncProgress.total} files (\${pct}%)\`;
        document.getElementById('sync-progress-bar').style.width = pct + '%';
      } else {
        progressSection.classList.add('hidden');
      }

      const errorSection = document.getElementById('index-error-section');
      const isGlobalError = status.lastError && !status.lastError.file;
      if (isGlobalError) {
        errorSection.classList.remove('hidden');
        document.getElementById('index-error').innerHTML = renderLastError(status.lastError);
      } else {
        errorSection.classList.add('hidden');
      }

      renderFileIssues(status.fileIssues);

      const activityList = document.getElementById('activity-list');
      if (status.recentActivity.length === 0) {
        activityList.innerHTML = '<li>No recent activity</li>';
      } else {
        activityList.innerHTML = status.recentActivity.map(item => \`
          <li>
            <strong>\${escapeHtml(item.label)}</strong> — \${escapeHtml(item.detail)}
            <div class="time">\${formatTime(item.at)}</div>
          </li>
        \`).join('');
      }

      if (status.ready) {
        const issueHint = issueCount > 0 ? \`, \${issueCount} issue(s) from last index\` : '';
        statusEl.textContent = \`\${status.ideaCount} ideas, \${status.edgeCount} references indexed\${issueHint}\`;
        statusEl.classList.toggle('error', issueCount > 0);
      } else if (isGlobalError) {
        statusEl.textContent = status.lastError.summary;
        statusEl.classList.add('error');
      } else if (issueCount > 0) {
        statusEl.textContent = \`\${issueCount} issue(s) from last index\`;
        statusEl.classList.add('error');
      } else if (status.syncProgress) {
        statusEl.textContent = \`Indexing workspace… \${status.syncProgress.processed}/\${status.syncProgress.total} files\`;
        statusEl.classList.remove('error');
      } else {
        statusEl.textContent = \`Index state: \${status.state}\`;
        statusEl.classList.remove('error');
      }
    }

    function renderIdeas(rows) {
      ideasBody.innerHTML = rows.map(row => \`
        <tr class="clickable" data-file-uri="\${escapeHtml(row.fileUri)}" data-line="\${row.lineStart}">
          <td>\${escapeHtml(row.title)}</td>
          <td>\${escapeHtml(row.path)}</td>
          <td>\${escapeHtml(row.mainAttribute ?? '—')}</td>
          <td>\${escapeHtml(row.otherAttributes || '—')}</td>
          <td>\${row.referenceCount}</td>
        </tr>
      \`).join('');
      ideasBody.querySelectorAll('tr.clickable').forEach(row => {
        row.addEventListener('click', () => {
          vscode.postMessage({ type: 'openIdea', fileUri: row.dataset.fileUri, line: Number(row.dataset.line) });
        });
      });
    }

    function renderIdeasets(rows) {
      ideasetsBody.innerHTML = rows.map(row => {
        const memberCount = row.members?.length ?? row.memberCount ?? 0;
        const placeholder = memberCount === 0
          ? 'No members'
          : \`Open member (\${memberCount})…\`;
        const options = (row.members ?? []).map(member => \`
          <option
            data-file-uri="\${escapeHtml(member.fileUri)}"
            data-line="\${member.lineStart}"
          >\${escapeHtml(member.name)}</option>
        \`).join('');
        return \`
        <tr>
          <td>\${escapeHtml(row.name)}</td>
          <td>\${escapeHtml(row.path)}</td>
          <td>\${row.kind === 'file' ? 'file (implicit)' : 'explicit'}</td>
          <td>
            <select class="member-select" \${memberCount === 0 ? 'disabled' : ''}>
              <option value="">\${escapeHtml(placeholder)}</option>
              \${options}
            </select>
          </td>
        </tr>
      \`}).join('');
      ideasetsBody.querySelectorAll('.member-select').forEach(select => {
        select.addEventListener('change', () => {
          const option = select.selectedOptions[0];
          if (!option?.dataset.fileUri) {
            return;
          }
          vscode.postMessage({
            type: 'openIdea',
            fileUri: option.dataset.fileUri,
            line: Number(option.dataset.line)
          });
          select.value = '';
        });
      });
    }

    function renderReferences(rows) {
      referencesBody.innerHTML = rows.map(row => \`
        <tr class="clickable" data-file-uri="\${escapeHtml(row.sourceFileUri)}" data-line="\${row.sourceLineStart}">
          <td>\${escapeHtml(row.sourcePath)} · \${escapeHtml(row.sourceName)}</td>
          <td>\${escapeHtml(row.targetPath)} · \${escapeHtml(row.targetName)}</td>
          <td>\${row.isInRq ? 'yes' : 'no'}</td>
          <td>\${escapeHtml(row.referenceType)}</td>
        </tr>
      \`).join('');
      referencesBody.querySelectorAll('tr.clickable').forEach(row => {
        row.addEventListener('click', () => {
          vscode.postMessage({ type: 'openIdea', fileUri: row.dataset.fileUri, line: Number(row.dataset.line) });
        });
      });
    }

    function updateIdeasPager() {
      const totalPages = Math.max(1, Math.ceil(ideasTotal / IDEAS_PAGE_SIZE));
      ideasPageLabel.textContent = \`Page \${ideasPage + 1} of \${totalPages} (\${ideasTotal} ideas)\`;
      document.getElementById('ideas-prev').disabled = ideasPage <= 0;
      document.getElementById('ideas-next').disabled = ideasPage + 1 >= totalPages;
    }

    function updateIdeasetsPager() {
      const totalPages = Math.max(1, Math.ceil(ideasetsTotal / IDEASETS_PAGE_SIZE));
      ideasetsPageLabel.textContent = \`Page \${ideasetsPage + 1} of \${totalPages} (\${ideasetsTotal} ideasets)\`;
      document.getElementById('ideasets-prev').disabled = ideasetsPage <= 0;
      document.getElementById('ideasets-next').disabled = ideasetsPage + 1 >= totalPages;
    }

    function updateReferencesPager() {
      const totalPages = Math.max(1, Math.ceil(referencesTotal / REFERENCES_PAGE_SIZE));
      referencesPageLabel.textContent = \`Page \${referencesPage + 1} of \${totalPages} (\${referencesTotal} references)\`;
      document.getElementById('references-prev').disabled = referencesPage <= 0;
      document.getElementById('references-next').disabled = referencesPage + 1 >= totalPages;
    }

    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'indexStatus':
          renderIndexStatus(message.status);
          break;
        case 'ideasPage':
          ideasPage = message.page;
          ideasTotal = message.total;
          renderIdeas(message.rows);
          updateIdeasPager();
          break;
        case 'ideasetsPage':
          ideasetsPage = message.page;
          ideasetsTotal = message.total;
          renderIdeasets(message.rows);
          updateIdeasetsPager();
          break;
        case 'referencesPage':
          referencesPage = message.page;
          referencesTotal = message.total;
          renderReferences(message.rows);
          updateReferencesPager();
          break;
        case 'fullGraph':
          dumpOutput.classList.remove('hidden');
          dumpOutput.textContent = JSON.stringify({
            ideaCount: message.ideaCount,
            edgeCount: message.edgeCount,
            ideas: JSON.parse(message.ideasJson),
            edges: JSON.parse(message.edgesJson)
          }, null, 2);
          break;
        case 'error':
          statusEl.textContent = message.message;
          statusEl.classList.add('error');
          break;
      }
    });

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => setTab(tab.dataset.tab));
    });

    document.getElementById('refresh-index').addEventListener('click', () => {
      vscode.postMessage({ type: 'refreshIndex' });
    });
    document.getElementById('ideas-prev').addEventListener('click', () => {
      if (ideasPage > 0) vscode.postMessage({ type: 'loadIdeas', page: ideasPage - 1 });
    });
    document.getElementById('ideas-next').addEventListener('click', () => {
      vscode.postMessage({ type: 'loadIdeas', page: ideasPage + 1 });
    });
    document.getElementById('ideasets-prev').addEventListener('click', () => {
      if (ideasetsPage > 0) vscode.postMessage({ type: 'loadIdeasets', page: ideasetsPage - 1 });
    });
    document.getElementById('ideasets-next').addEventListener('click', () => {
      vscode.postMessage({ type: 'loadIdeasets', page: ideasetsPage + 1 });
    });
    document.getElementById('references-prev').addEventListener('click', () => {
      if (referencesPage > 0) vscode.postMessage({ type: 'loadReferences', page: referencesPage - 1 });
    });
    document.getElementById('references-next').addEventListener('click', () => {
      vscode.postMessage({ type: 'loadReferences', page: referencesPage + 1 });
    });
    document.getElementById('dump-graph').addEventListener('click', () => {
      dumpOutput.textContent = 'Loading full graph…';
      dumpOutput.classList.remove('hidden');
      vscode.postMessage({ type: 'dumpFullGraph' });
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
