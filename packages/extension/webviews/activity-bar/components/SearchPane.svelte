<script lang="ts">
    import { getApp } from '../state/context.js';
    import { formatSearchMatchCount } from '../../../src/activity_bar_module/search-results-meta.js';
    import AddToChatButton from './AddToChatButton.svelte';
    import CollapsiblePane from './CollapsiblePane.svelte';
    import SearchHighlight from './SearchHighlight.svelte';

    // rq:["../../../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane]
    // rq:["../../../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane_load_more]
    // rq:["../../../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane_file_hits]

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
    let query = $derived(app.ideaSearchQuery);
    let highlightQuery = $derived(app.ideaSearchAppliedQuery || query);
    let results = $derived(app.ideaSearchResults);
    let truncated = $derived(app.ideaSearchTruncated);
    let loadingMore = $derived(app.ideaSearchLoadingMore);
    let hasQuery = $derived(query.trim().length > 0);
    let loading = $derived(app.ideaSearchLoading);
    let progress = $derived(app.ideaSearchProgress);
    let elapsedSec = $derived(app.ideaSearchElapsedSec);
    let error = $derived(app.ideaSearchError);
    // Keep prior hits mounted while a newer query scores — hiding them made open feel blocked.
    let showResults = $derived(results.length > 0);
    let showEmpty = $derived(hasQuery && !loading && !error && results.length === 0);
    let showInitialLoading = $derived(hasQuery && loading && results.length === 0 && !error);

    let progressLabel = $derived.by(() => {
        if (!progress) {
            return loading ? 'Searching…' : '';
        }
        if (progress.detail) {
            return `${progress.message} · ${progress.detail}`;
        }
        return progress.message;
    });

    let elapsedLabel = $derived(
        loading && elapsedSec > 0 ? `${elapsedSec}s` : undefined
    );

    function onInput(event: Event): void {
        const value = (event.currentTarget as HTMLInputElement).value;
        app.onIdeaSearchInput(value);
    }

    function openAdvancedSearch(event: MouseEvent): void {
        event.stopPropagation();
        app.openAdvancedIdeaSearch();
    }
</script>

<CollapsiblePane title="Search" id="search" {expanded} {fill} {height} {resizable} {onToggle} {onResize}>
    {#snippet headerActions()}
        <button
            type="button"
            class="section-header-link"
            title="Open Ideas Summary with this search"
            onclick={openAdvancedSearch}
        >Advanced</button>
    {/snippet}
    <input
        class="filter-input search-query"
        type="search"
        placeholder="Search ideas or files…"
        value={query}
        oninput={onInput}
        aria-label="Search ideas or files"
    />
    <div class="search-results">
        {#if !hasQuery}
            <p class="muted pane-status">Type to search ideas or files by name, summary, or tag.</p>
        {:else if error}
            <p class="error-text" role="alert">{error}</p>
        {:else if showInitialLoading}
            <div class="search-progress" role="status" aria-live="polite">
                <span class="search-progress-spinner" aria-hidden="true"></span>
                <div class="search-progress-copy">
                    <span>{progressLabel}</span>
                    {#if elapsedLabel}
                        <span class="search-progress-elapsed">{elapsedLabel}</span>
                    {/if}
                </div>
                <div class="search-progress-track" aria-hidden="true">
                    <div class="search-progress-pulse"></div>
                </div>
            </div>
        {:else if showEmpty}
            <p class="muted pane-status">No matching ideas or files.</p>
        {:else if showResults}
            {#if loading}
                <div class="search-progress search-progress-inline" role="status" aria-live="polite">
                    <span class="search-progress-spinner" aria-hidden="true"></span>
                    <div class="search-progress-copy">
                        <span>{progressLabel || 'Updating…'}</span>
                        {#if elapsedLabel}
                            <span class="search-progress-elapsed">{elapsedLabel}</span>
                        {/if}
                    </div>
                </div>
            {:else if results.length > 0}
                <p class="muted search-results-meta">{formatSearchMatchCount(results.length, truncated)}</p>
            {/if}
            <ul class="list search-results-list">
                {#each results as hit}
                    <li>
                        <button class="link" onclick={() => app.openIdea(hit.fileUri, hit.lineStart)}>
                            <SearchHighlight text={hit.name} query={highlightQuery} allowSparseFuzzy />
                        </button>
                        <div class="muted">
                            {#if hit.kind === 'file'}
                                <span>file · </span>
                            {/if}
                            <SearchHighlight text={hit.path} query={highlightQuery} />
                        </div>
                        {#if hit.summary}
                            <div class="muted">
                                <SearchHighlight text={hit.summary} query={highlightQuery} />
                            </div>
                        {/if}
                        {#if hit.kind !== 'file'}
                            <div class="section-actions">
                                <button
                                    type="button"
                                    class="action-button"
                                    title="Insert [{hit.name}] at cursor"
                                    onclick={() => app.insertReference(hit)}
                                >Insert ref</button>
                                <AddToChatButton {hit} />
                                <button
                                    type="button"
                                    class="action-button"
                                    onclick={() => app.pinIdea(hit.id)}
                                >Pin</button>
                            </div>
                        {/if}
                    </li>
                {/each}
            </ul>
            {#if truncated && !loading}
                <button
                    type="button"
                    class="action-button search-load-more"
                    disabled={loadingMore}
                    onclick={() => app.loadMoreIdeaSearch()}
                >
                    {#if loadingMore}
                        Loading more…
                    {:else}
                        Show more
                    {/if}
                </button>
            {/if}
        {/if}
    </div>
</CollapsiblePane>

<style>
    .search-query {
        flex-shrink: 0;
        width: 100%;
    }

    .search-results {
        flex: 1 1 auto;
        min-height: 0;
        width: 100%;
        overflow-x: hidden;
        overflow-y: auto;
    }

    .search-results-meta {
        margin: 0 0 6px;
    }

    .search-results-list {
        width: 100%;
    }

    .search-load-more {
        margin: 8px 0 4px;
    }

    .search-progress {
        display: grid;
        grid-template-columns: auto 1fr;
        grid-template-rows: auto auto;
        column-gap: 8px;
        row-gap: 6px;
        align-items: center;
        margin: 0 0 8px;
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
    }

    .search-progress-inline {
        grid-template-rows: auto;
    }

    .search-progress-spinner {
        width: 12px;
        height: 12px;
        border: 2px solid color-mix(in srgb, var(--vscode-progressBar-background, var(--vscode-button-background)) 35%, transparent);
        border-top-color: var(--vscode-progressBar-background, var(--vscode-button-background));
        border-radius: 50%;
        animation: search-spin 0.8s linear infinite;
    }

    .search-progress-copy {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        min-width: 0;
    }

    .search-progress-copy > span:first-child {
        min-width: 0;
        overflow-wrap: anywhere;
    }

    .search-progress-elapsed {
        flex-shrink: 0;
        opacity: 0.85;
        font-variant-numeric: tabular-nums;
    }

    .search-progress-track {
        grid-column: 1 / -1;
        position: relative;
        height: 3px;
        overflow: hidden;
        border-radius: 999px;
        background: color-mix(in srgb, var(--vscode-progressBar-background, var(--vscode-button-background)) 22%, transparent);
    }

    .search-progress-pulse {
        position: absolute;
        inset: 0 auto 0 0;
        width: 40%;
        background: var(--vscode-progressBar-background, var(--vscode-button-background));
        animation: search-pulse 1.1s ease-in-out infinite;
    }

    @keyframes search-spin {
        to {
            transform: rotate(360deg);
        }
    }

    @keyframes search-pulse {
        0% {
            left: -40%;
        }
        100% {
            left: 100%;
        }
    }
</style>
