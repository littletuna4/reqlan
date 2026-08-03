<script lang="ts">
    /**
     * Overview tab — stats, cross-surface search, export buttons, timeline preview.
     * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".overview_page]
     * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".overview_search]
     * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".overview_coverage_scores]
     */
    import { getApp } from '../state/context.js';

    const app = getApp();

    let searchDraft = '';
    let coverageOpen = false;

    $: status = app.index.status;
    $: links = app.overview.links;
    $: activity = status?.recentActivity ?? [];
    $: searchResult = app.overview.search;
    $: searching = app.overview.searching;
    $: coverage = app.overview.coverage;
    $: coverageLoading = app.overview.coverageLoading;

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
        <p class="subtle">Search ideas, ideasets, attributes, and references in the active base.</p>
        <div class="overview-search-row">
            <input
                class="table-filter"
                type="search"
                placeholder="Search across the active base…"
                value={searchDraft}
                on:input={onSearchInput}
                on:keydown={handleKey}
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
                                    on:click={() => app.openOverviewSurface(section.surface, searchResult.query)}
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
                                            on:click={() => openHit(hit)}
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
            <h2>Stats</h2>
            <div class="stat-grid">
                <div class="stat-card">
                    <div class="label">State</div>
                    <div class="value">{status.state}</div>
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
                <div class="stat-card">
                    <div class="label">Bases</div>
                    <div class="value">{status.bases?.length ?? 0}</div>
                </div>
            </div>
        </section>
    {/if}

    <section>
        <details class="overview-coverage" on:toggle={onCoverageToggle}>
            <summary>
                <h2>Coverage scores</h2>
                <span class="subtle">Ideas / LOC density and file-reference coverage</span>
            </summary>
            <p class="subtle">
                Calculated on demand for the active base (non-.rq, non-ignored files). Expand to load.
            </p>
            {#if coverageLoading}
                <p class="subtle">Calculating coverage…</p>
            {:else if coverage}
                <div class="overview-search-section-header">
                    <span class="subtle">
                        Updated {formatTime(coverage.calculatedAt)}
                        {#if coverage.locTruncated}
                            · LOC is a lower bound (size caps)
                        {/if}
                    </span>
                    <button type="button" class="secondary" on:click={refreshCoverage}>Refresh</button>
                </div>
                <div class="stat-grid">
                    <div class="stat-card">
                        <div class="label">File coverage</div>
                        <div class="value">{formatPct(coverage.fileCoveragePct)}</div>
                        <div class="subtle">
                            {coverage.referencedEligibleFileCount} / {coverage.eligibleNonRqFileCount} files
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="label">Ideas / kLOC</div>
                        <div class="value">{formatRatio(coverage.ideasPerKLoc)}</div>
                        <div class="subtle">
                            {coverage.ideaCount} ideas · {formatLoc(coverage.totalLoc)} LOC
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="label">File references</div>
                        <div class="value">{coverage.distinctFileReferenceCount}</div>
                        <div class="subtle">Distinct outbound targets</div>
                    </div>
                    <div class="stat-card">
                        <div class="label">.rq files</div>
                        <div class="value">{coverage.rqFileCount}</div>
                        <div class="subtle">In active base (non-ignored)</div>
                    </div>
                </div>
            {:else if coverageOpen}
                <p class="subtle">No coverage data yet.</p>
            {/if}
        </details>
    </section>

    <section>
        <h2>Export</h2>
        <p class="subtle">Open the export form or run a printable PDF export for the active base.</p>
        <div class="overview-links">
            <button type="button" on:click={() => app.openExport('html')}>Export HTML…</button>
            <button type="button" class="secondary" on:click={() => app.openExport('pdf')}>Export PDF…</button>
            <button type="button" class="secondary" on:click={() => app.openExport()}>Open export form…</button>
        </div>
    </section>

    <section>
        <h2>Links</h2>
        <div class="overview-links">
            {#each links as link (link.id)}
                <button type="button" class="secondary" on:click={() => app.openExternal(link.href)}>
                    {link.label}
                </button>
            {/each}
        </div>
    </section>

    <section>
        <div class="overview-search-section-header">
            <h2>Recent changes</h2>
            <button type="button" class="secondary" on:click={() => app.setTab('timeline')}>Open Timeline</button>
        </div>
        {#if activity.length === 0}
            <p class="subtle">No recent index activity yet. See Timeline for git-dated ideas when available.</p>
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
