<script lang="ts">
    import type { FileIndexIssueView, IndexErrorDetail, IndexStatusView } from '../../../src/webview_module/shared/messages.js';
    import { getApp } from '../state/context.js';
    import CollapsiblePane from './CollapsiblePane.svelte';

    interface Props {
        expanded: boolean;
        onToggle: (id: string, expanded: boolean) => void;
    }
    let { expanded, onToggle }: Props = $props();

    const app = getApp();
    let status = $derived(app.indexStatus);

    function formatTime(at: number): string {
        return new Date(at).toLocaleTimeString();
    }

    function stateLabel(value: IndexStatusView): string {
        if (value.ready && value.fileIssueCount > 0) {
            return 'ready (issues)';
        }
        return value.state;
    }

    function isGlobalError(lastError: IndexErrorDetail | undefined): boolean {
        return Boolean(lastError && !lastError.file);
    }

    function openIssue(issue: FileIndexIssueView): void {
        app.openIdea(issue.fileUri, issue.line, issue.column);
    }
</script>

<CollapsiblePane title="Workspace" id="workspace" {expanded} {onToggle}>
    {#if !status}
        <p class="muted">Waiting for workspace index…</p>
    {:else}
        <dl class="workspace-stats">
            <div class="workspace-stat">
                <dt class="muted">State</dt>
                <dd>
                    <span class="state-badge state-{status.state}" class:state-ready-warn={status.ready && status.fileIssueCount > 0}>
                        {stateLabel(status)}
                    </span>
                </dd>
            </div>
            <div class="workspace-stat">
                <dt class="muted">Ideas</dt>
                <dd>{status.ideaCount}</dd>
            </div>
            <div class="workspace-stat">
                <dt class="muted">References</dt>
                <dd>{status.edgeCount}</dd>
            </div>
            <div class="workspace-stat">
                <dt class="muted">File issues</dt>
                <dd class:issue-count={status.fileIssueCount > 0}>{status.fileIssueCount}</dd>
            </div>
        </dl>

        {#if status.syncProgress && status.syncProgress.total > 0}
            {@const pct = Math.round((status.syncProgress.processed / status.syncProgress.total) * 100)}
            <p class="workspace-subheading">Syncing</p>
            <p class="muted">{status.syncProgress.processed} / {status.syncProgress.total} files ({pct}%)</p>
            <div class="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <span style="width: {pct}%"></span>
            </div>
        {/if}

        {#if isGlobalError(status.lastError) && status.lastError}
            <p class="workspace-subheading">Global error</p>
            <p class="error-text">{status.lastError.summary}</p>
            <dl class="error-detail">
                {#if status.lastError.phase}
                    <dt class="muted">Phase</dt>
                    <dd>{status.lastError.phase}</dd>
                {/if}
                {#if status.lastError.cause}
                    <dt class="muted">Cause</dt>
                    <dd>{status.lastError.cause}</dd>
                {/if}
            </dl>
        {/if}

        {#if status.fileIssues.length > 0}
            <p class="workspace-subheading">Index errors ({status.fileIssues.length})</p>
            <p class="muted">Issues from the most recent index run. Click a row to open the file.</p>
            <ul class="issue-list">
                {#each status.fileIssues as issue (issue.fileUri + ':' + issue.line + ':' + issue.column)}
                    <li>
                        <button type="button" class="issue-row" onclick={() => openIssue(issue)}>
                            <span class="issue-location">{issue.location}</span>
                            <span class="issue-phase muted">{issue.phase}</span>
                            <span class="issue-message">{issue.message}</span>
                            {#if issue.cause}
                                <span class="issue-cause muted">{issue.cause}</span>
                            {/if}
                            {#if issue.ideaNames?.length}
                                <span class="issue-ideas muted">{issue.ideaNames.join(', ')}</span>
                            {/if}
                        </button>
                    </li>
                {/each}
            </ul>
        {:else if status.ready}
            <p class="muted">No index errors in the workspace.</p>
        {/if}

        {#if status.lastError && status.lastError.file}
            <p class="workspace-subheading">File error</p>
            <p class="error-text">{status.lastError.summary}</p>
            <dl class="error-detail">
                <dt class="muted">File</dt>
                <dd>{status.lastError.file}</dd>
                {#if status.lastError.ideas?.length}
                    <dt class="muted">Ideas</dt>
                    <dd>{status.lastError.ideas.join(', ')}</dd>
                {/if}
            </dl>
        {/if}

        <p class="workspace-subheading">Recent activity</p>
        <ul class="activity-list">
            {#if status.recentActivity.length === 0}
                <li class="muted">No recent activity</li>
            {:else}
                {#each status.recentActivity as item (item.at + item.detail)}
                    <li>
                        <strong>{item.label}</strong> — {item.detail}
                        <div class="activity-time muted">{formatTime(item.at)}</div>
                    </li>
                {/each}
            {/if}
        </ul>

        <div class="section-actions">
            <button class="action-button" onclick={() => app.refreshIndex()}>Refresh</button>
            <button class="action-button" onclick={() => app.clearAndRebuildIndex()}>Clear & rebuild</button>
            <button class="action-button" onclick={() => app.openIdeasSummary('index')}>Open index tab</button>
        </div>
    {/if}
</CollapsiblePane>
