<script lang="ts">
    /**
     * Overview tab — stats, cross-surface search, export buttons, timeline preview.
     * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".overview_page]
     * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".overview_search]
     */
    import { getApp } from '../state/context.js';

    const app = getApp();

    let searchDraft = '';

    $: status = app.index.status;
    $: links = app.overview.links;
    $: activity = status?.recentActivity ?? [];
    $: searchResult = app.overview.search;
    $: searching = app.overview.searching;

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
