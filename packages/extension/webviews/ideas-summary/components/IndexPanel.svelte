<script lang="ts">
    import type { FileIndexIssueView, IndexErrorDetail, IndexStatusView } from '../../../src/webview_module/shared/messages.js';
    import { postToExtension } from '../lib/vscode.js';
    import { getApp } from '../state/context.js';

    const app = getApp();

    function formatTime(at: number): string {
        return new Date(at).toLocaleTimeString();
    }

    function stateBadgeClass(status: IndexStatusView): string {
        const issueCount = status.fileIssueCount ?? 0;
        if (status.ready && issueCount > 0) {
            return 'state-badge state-ready-warn';
        }
        return `state-badge state-${status.state}`;
    }

    function stateBadgeText(status: IndexStatusView): string {
        const issueCount = status.fileIssueCount ?? 0;
        if (status.ready && issueCount > 0) {
            return 'ready (issues)';
        }
        return status.state;
    }

    function isGlobalError(lastError: IndexErrorDetail | undefined): boolean {
        return Boolean(lastError && !lastError.file);
    }

    function openIssue(issue: FileIndexIssueView): void {
        app.openIdea(issue.fileUri, issue.line, issue.column);
    }
</script>

{#if app.index.status}
    {@const status = app.index.status}
    <div class="stat-grid">
        <div class="stat-card">
            <div class="label">State</div>
            <div class="value"><span class={stateBadgeClass(status)}>{stateBadgeText(status)}</span></div>
        </div>
        <div class="stat-card">
            <div class="label">Ideas</div>
            <div class="value">{status.ideaCount}</div>
        </div>
        <div class="stat-card">
            <div class="label">References</div>
            <div class="value">{status.edgeCount}</div>
        </div>
        <div class="stat-card">
            <div class="label">File issues</div>
            <div class="value">{status.fileIssueCount}</div>
        </div>
    </div>

    {#if status.syncProgress && status.syncProgress.total > 0}
        <h2>Sync progress</h2>
        {@const pct = Math.round((status.syncProgress.processed / status.syncProgress.total) * 100)}
        <div>{status.syncProgress.processed} / {status.syncProgress.total} files ({pct}%)</div>
        <div class="progress-bar">
            <span style="width: {pct}%"></span>
        </div>
    {/if}

    {#if isGlobalError(status.lastError) && status.lastError}
        <h2>Global error</h2>
        <div class="status error">
            <div class="error-summary">{status.lastError.summary}</div>
            <dl class="error-detail">
                {#if status.lastError.file}
                    <dt>File</dt>
                    <dd>{status.lastError.file}</dd>
                {/if}
                {#if status.lastError.ideas?.length}
                    <dt>Ideas</dt>
                    <dd>{status.lastError.ideas.join(', ')}</dd>
                {/if}
                {#if status.lastError.phase}
                    <dt>Phase</dt>
                    <dd>{status.lastError.phase}</dd>
                {/if}
                {#if status.lastError.cause}
                    <dt>Cause</dt>
                    <dd>{status.lastError.cause}</dd>
                {/if}
            </dl>
        </div>
    {/if}

    {#if status.fileIssues.length > 0}
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
                <tbody>
                    {#each status.fileIssues as issue (issue.fileUri + issue.line + issue.column)}
                        <tr class="clickable" on:click={() => openIssue(issue)}>
                            <td>{issue.location}</td>
                            <td>{issue.phase}</td>
                            <td>{issue.ideaNames?.length ? issue.ideaNames.join(', ') : '—'}</td>
                            <td>{issue.message}</td>
                            <td>{issue.cause ?? '—'}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}

    <div class="actions">
        <button on:click={() => postToExtension({ type: 'refreshIndex' })}>Refresh index</button>
        <button class="secondary" on:click={() => postToExtension({ type: 'clearAndRebuildIndex' })}>Clear &amp; rebuild index</button>
    </div>

    <h2>Recent activity</h2>
    <ul class="activity-list">
        {#if status.recentActivity.length === 0}
            <li>No recent activity</li>
        {:else}
            {#each status.recentActivity as item (item.at + item.detail)}
                <li>
                    <strong>{item.label}</strong> — {item.detail}
                    <div class="time">{formatTime(item.at)}</div>
                </li>
            {/each}
        {/if}
    </ul>
{/if}
