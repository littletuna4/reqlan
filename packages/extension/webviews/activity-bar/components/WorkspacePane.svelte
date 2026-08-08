<script lang="ts">
    import type { FileIndexIssueView, IndexErrorDetail, IndexStatusView } from '../../../src/webview_module/shared/messages.js';
    import { getApp } from '../state/context.js';
    import { groupFileIssuesByFile } from '../lib/group-file-issues.js';
    import CollapsiblePane from './CollapsiblePane.svelte';
    import NestedSection from './NestedSection.svelte';
    import BasePicker from './BasePicker.svelte';

    interface Props {
        expanded: boolean;
        fill?: boolean;
        height?: number;
        resizable?: boolean;
        onToggle: (id: string, expanded: boolean) => void;
        onResize?: (id: string, height: number) => void;
    }
    let { expanded, fill = false, height, resizable = false, onToggle, onResize }: Props = $props();

    const app = getApp();
    let status = $derived(app.indexStatus);
    let issueGroups = $derived(status ? groupFileIssuesByFile(status.fileIssues) : []);
    let bases = $derived(status?.bases ?? []);
    let discoveryEmpty = $derived(Boolean(status?.discoveryEmpty));
    let pendingBaseId = $derived(app.pendingBaseId);
    let baseSyncing = $derived(
        Boolean(status && (!status.ready || status.state === 'syncing' || status.syncProgress))
    );
    let baseSyncLabel = $derived(app.indexProgressLabel ?? (status?.state === 'syncing' ? 'Indexing…' : undefined));

    function formatTime(at: number): string {
        return new Date(at).toLocaleTimeString();
    }

    function stateLabel(value: IndexStatusView): string {
        if (app.pendingBaseId) {
            return 'switching';
        }
        if (value.discoveryEmpty) {
            return 'no base';
        }
        if (value.syncProgress) {
            return 'syncing';
        }
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

<CollapsiblePane title="Workspace" id="workspace" {expanded} {fill} {height} {resizable} {onToggle} {onResize}>
    {#if !status}
        <p class="muted pane-status" role="status">Waiting for workspace index…</p>
    {:else if discoveryEmpty}
        <p class="muted">No reqlan bases found. Create a `.reqlan` folder at the workspace root to enable indexing.</p>
        <div class="section-actions">
            <button class="action-button" onclick={() => app.createBase()}>Create Base</button>
        </div>
    {:else}
        {#if bases.length > 0}
            <BasePicker
                {bases}
                activeBaseId={status.activeBaseId}
                {pendingBaseId}
                syncing={baseSyncing}
                syncLabel={baseSyncLabel}
                onSelect={(baseId) => app.selectBase(baseId)}
            />
        {/if}

        {#if pendingBaseId}
            <p class="muted pane-status" role="status">Switching base…</p>
        {:else if baseSyncing && !status.syncProgress}
            <p class="muted pane-status" role="status">Waiting for index on selected base…</p>
        {/if}

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
            {#if status.syncProgress.currentFile}
                <p class="muted">Current: {status.syncProgress.currentFile}</p>
            {/if}
            <div class="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <span style="width: {pct}%"></span>
            </div>
        {/if}

        {#if isGlobalError(status.lastError) && status.lastError}
            <NestedSection title="Global error" defaultExpanded={true} scrollable={false}>
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
            </NestedSection>
        {/if}

        {#if issueGroups.length > 0}
            <NestedSection
                title="Index errors"
                count={status.fileIssues.length}
                defaultExpanded={true}
                scrollable={false}
            >
                <p class="muted">Grouped by file. Click a row to open.</p>
                {#each issueGroups as group (group.fileUri)}
                    <NestedSection
                        title={group.label}
                        count={group.issues.length}
                        defaultExpanded={issueGroups.length <= 3}
                    >
                        <ul class="issue-list">
                            {#each group.issues as issue (issue.fileUri + ':' + issue.line + ':' + issue.column)}
                                <li>
                                    <button type="button" class="issue-row" onclick={() => openIssue(issue)}>
                                        <span class="issue-location">L{issue.line + 1}:{issue.column + 1}</span>
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
                    </NestedSection>
                {/each}
            </NestedSection>
        {:else if status.ready}
            <p class="muted">No index errors in the active base.</p>
        {/if}

        {#if status.lastError && status.lastError.file}
            <NestedSection title="File error" defaultExpanded={true} scrollable={false}>
                <p class="error-text">{status.lastError.summary}</p>
                <dl class="error-detail">
                    <dt class="muted">File</dt>
                    <dd>{status.lastError.file}</dd>
                    {#if status.lastError.ideas?.length}
                        <dt class="muted">Ideas</dt>
                        <dd>{status.lastError.ideas.join(', ')}</dd>
                    {/if}
                </dl>
            </NestedSection>
        {/if}

        <NestedSection
            title="Recent activity"
            count={status.recentActivity.length}
            defaultExpanded={status.recentActivity.length > 0 && status.recentActivity.length <= 5}
        >
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
        </NestedSection>

        <div class="section-actions">
            <button class="action-button" onclick={() => app.refreshIndex()}>Refresh</button>
            {#if status.syncProgress && status.syncProgress.total > 0}
                <button class="action-button" onclick={() => app.cancelIndexSync()}>Cancel sync</button>
            {/if}
            <button class="action-button" onclick={() => app.clearAndRebuildIndex()}>Clear & rebuild</button>
            <button class="action-button" onclick={() => app.openIdeasSummary('index')}>Open index tab</button>
        </div>
    {/if}
</CollapsiblePane>

