<script lang="ts">
    /**
     * Overview tab — stats, cross-surface search, export buttons, timeline preview.
     * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".overview_page]
     * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".overview_search]
     * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".overview_coverage_scores]
     */
    import type { IndexState } from '../../../src/webview_module/shared/messages.js';
    import { getApp } from '../state/context.js';

    const app = getApp();

    let searchDraft = $state('');
    let coverageOpen = $state(false);

    const status = $derived(app.index.status);
    const links = $derived(app.overview.links);
    const activity = $derived(status?.recentActivity ?? []);
    const searchResult = $derived(app.overview.search);
    const searching = $derived(app.overview.searching);
    const coverage = $derived(app.overview.coverage);
    const coverageLoading = $derived(app.overview.coverageLoading);
    const coverageError = $derived(app.overview.coverageError);

    function onSearchInput(event: Event): void {
        searchDraft = (event.currentTarget as HTMLInputElement).value;
        app.overviewSearch(searchDraft);
    }

    function handleKey(event: KeyboardEvent): void {
        if (event.key === 'Enter' && searchDraft.trim()) {
            app.openOverviewSurface('ideas', searchDraft);
        }
    }

    function formatTime(at: number): string {
        return new Date(at).toLocaleString();
    }

    function formatPct(value: number | null | undefined): string {
        if (value == null) {
            return '—';
        }
        return `${value}%`;
    }

    function formatRatio(value: number | null | undefined): string {
        if (value == null) {
            return '—';
        }
        return String(value);
    }

    function formatLoc(value: number): string {
        return value.toLocaleString();
    }

    function statusLabel(state: IndexState, ready: boolean): string {
        if (ready) {
            return 'Ready';
        }
        switch (state) {
            case 'syncing':
            case 'opening':
                return 'Updating…';
            case 'error':
                return 'Needs attention';
            case 'uninitialized':
            case 'idle':
                return 'Not ready';
            case 'closing':
                return 'Closing…';
            default:
                return 'Not ready';
        }
    }

    function onCoverageToggle(event: Event): void {
        const details = event.currentTarget as HTMLDetailsElement;
        coverageOpen = details.open;
        if (details.open) {
            app.loadOverviewCoverage();
        }
    }

    function refreshCoverage(): void {
        app.loadOverviewCoverage(true);
    }

    function openHit(hit: {
        kind: string;
        fileUri?: string;
        lineStart?: number;
        attributeKey?: string;
    }): void {
        if (hit.kind === 'attribute' && hit.attributeKey) {
            app.openAttributeInIdeas(hit.attributeKey);
            return;
        }
        if (hit.fileUri) {
            app.openIdea(hit.fileUri, hit.lineStart ?? 0);
        }
    }
</script>

<div class="overview">
    <section class="overview-search">
        <h2>Search</h2>
        <p class="subtle">Find ideas, ideasets, attributes, and references in this workspace.</p>
        <div class="overview-search-row">
            <input
                class="table-filter"
                type="search"
                placeholder="Search this workspace…"
                value={searchDraft}
                oninput={onSearchInput}
                onkeydown={handleKey}
            />
        </div>

        {#if searching}
            <p class="subtle">Searching…</p>
        {:else if searchResult && searchResult.query}
            <div class="overview-search-results">
                {#each searchResult.sections as section (section.surface)}
                    <div class="overview-search-section">
                        <div class="overview-search-section-header">
                            <strong>{section.label}</strong>
                            <span class="subtle">{section.total}</span>
                            {#if section.total > 0}
                                <button
                                    type="button"
                                    class="secondary"
                                    onclick={() => app.openOverviewSurface(section.surface, searchResult.query)}
                                >
                                    Open in {section.label}
                                </button>
                            {/if}
                        </div>
                        {#if section.hits.length === 0}
                            <p class="subtle">No matches</p>
                        {:else}
                            <ul class="overview-hit-list">
                                {#each section.hits as hit, index (`${section.surface}:${hit.title}:${index}`)}
                                    <li>
                                        <button
                                            type="button"
                                            class="overview-hit"
                                            onclick={() => openHit(hit)}
                                            disabled={!hit.fileUri && hit.kind !== 'attribute'}
                                        >
                                            <span class="overview-hit-title">{hit.title}</span>
                                            <span class="overview-hit-detail subtle">{hit.detail}</span>
                                        </button>
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </section>

    {#if status}
        <section>
            <h2>At a glance</h2>
            <div class="stat-grid">
                <div class="stat-card">
                    <div class="label">Status</div>
                    <div class="value">{statusLabel(status.state, status.ready)}</div>
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
                    <div class="label">Issues</div>
                    <div class="value">{status.fileIssueCount}</div>
                </div>
                <div class="stat-card">
                    <div class="label">Bases</div>
                    <div class="value">{status.bases?.length ?? 0}</div>
                </div>
            </div>
        </section>
    {/if}

    <section>
        <details class="overview-coverage" ontoggle={onCoverageToggle}>
            <summary>
                <h2>Coverage</h2>
                <span class="subtle">How thoroughly ideas link into your project</span>
            </summary>
            <p class="subtle">
                Measures how many project files are linked from ideas, and how dense those ideas are relative to your codebase. Expand to calculate.
            </p>
            {#if coverageLoading}
                <p class="subtle">Calculating coverage…</p>
            {:else}
                {#if coverageError}
                    <p class="status error">{coverageError}</p>
                {/if}
                {#if coverage}
                    <div class="overview-search-section-header">
                        <span class="subtle">
                            Updated {formatTime(coverage.calculatedAt)}
                            {#if coverage.locTruncated}
                                · Line counts may be incomplete for very large projects
                            {/if}
                        </span>
                        <button type="button" class="secondary" onclick={refreshCoverage}>Refresh</button>
                    </div>
                    <div class="stat-grid">
                        <div class="stat-card">
                            <div class="label">Linked files</div>
                            <div class="value">{formatPct(coverage.fileCoveragePct)}</div>
                            <div class="subtle">
                                {coverage.referencedEligibleFileCount} of {coverage.eligibleNonRqFileCount} project files
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="label">Requirement density</div>
                            <div class="value">{formatRatio(coverage.ideasPerKLoc)}</div>
                            <div class="subtle">
                                {coverage.ideaCount} ideas · {formatLoc(coverage.totalLoc)} lines of code
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="label">Linked paths</div>
                            <div class="value">{coverage.distinctFileReferenceCount}</div>
                            <div class="subtle">Unique files or folders referenced</div>
                        </div>
                        <div class="stat-card">
                            <div class="label">Requirement files</div>
                            <div class="value">{coverage.rqFileCount}</div>
                            <div class="subtle">Requirement documents in this workspace</div>
                        </div>
                    </div>
                {:else if coverageOpen && !coverageError}
                    <p class="subtle">Coverage is not available yet.</p>
                {/if}
            {/if}
        </details>
    </section>

    <section>
        <h2>Export</h2>
        <p class="subtle">Share the active base as HTML, Markdown, JSON, CSV, or PDF.</p>
        <div class="overview-links">
            <button type="button" onclick={() => app.openExport('html')}>Export HTML…</button>
            <button type="button" class="secondary" onclick={() => app.openExport('markdown')}>Export Markdown…</button>
            <button type="button" class="secondary" onclick={() => app.openExport('json')}>Export JSON…</button>
            <button type="button" class="secondary" onclick={() => app.openExport('csv')}>Export CSV…</button>
            <button type="button" class="secondary" onclick={() => app.openExport('pdf')}>Export PDF…</button>
            <button type="button" class="secondary" onclick={() => app.openExport()}>Open export form…</button>
        </div>
    </section>

    <section>
        <h2>Links</h2>
        <div class="overview-links">
            {#each links as link (link.id)}
                <button type="button" class="secondary" onclick={() => app.openExternal(link.href)}>
                    {link.label}
                </button>
            {/each}
        </div>
    </section>

    <section>
        <div class="overview-search-section-header">
            <h2>Recent changes</h2>
            <button type="button" class="secondary" onclick={() => app.setTab('timeline')}>Open Timeline</button>
        </div>
        {#if activity.length === 0}
            <p class="subtle">No recent changes yet. Open Timeline for a fuller history.</p>
        {:else}
            <ul class="activity-list">
                {#each activity.slice(0, 6) as item (`${item.at}:${item.detail}`)}
                    <li>
                        <span class="activity-label">{item.label}</span>
                        <span class="activity-detail">{item.detail}</span>
                        <span class="activity-time">{formatTime(item.at)}</span>
                    </li>
                {/each}
            </ul>
        {/if}
    </section>
</div>
