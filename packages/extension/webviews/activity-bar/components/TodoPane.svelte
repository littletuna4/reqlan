<script lang="ts">
    import { getApp } from '../state/context.js';
    import CollapsiblePane from './CollapsiblePane.svelte';
    import PaneStatus from './PaneStatus.svelte';

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
    let results = $derived(app.todoResults);
    let total = $derived(app.todoTotal);
    let truncated = $derived(app.todoTruncated);
    let indexReady = $derived(Boolean(app.indexStatus?.ready));
    let loading = $derived(app.todoLoading);
    let showResults = $derived(results.length > 0);
</script>

<CollapsiblePane title="Todos" id="todos" {expanded} {fill} {height} {resizable} {onToggle} {onResize}>
    {#snippet headerActions()}
        <button
            type="button"
            class="section-header-link"
            disabled={!indexReady || loading}
            title="Reload todos from the index"
            onclick={(event) => {
                event.stopPropagation();
                app.loadTodos();
            }}
        >Refresh</button>
    {/snippet}
    <div class="todo-results">
        {#if !indexReady}
            <p class="muted pane-status" role="status">Waiting for index…</p>
        {:else}
            <PaneStatus
                loading={loading && !app.todoLoaded}
                error={app.todoError}
                empty={!showResults}
                loadingText="Loading todos…"
                emptyText="No ideas with a @todo attribute."
            >
                {#if loading && showResults}
                    <p class="muted todo-results-meta" role="status">Updating…</p>
                {:else if truncated}
                    <p class="muted todo-results-meta">Showing {results.length} of {total}</p>
                {:else if total > 0}
                    <p class="muted todo-results-meta">{total} todo{total === 1 ? '' : 's'}</p>
                {/if}
                <ul class="list todo-results-list">
                    {#each results as hit}
                        <li>
                            <button class="link" onclick={() => app.openIdea(hit.fileUri, hit.lineStart)}>
                                {hit.name}
                            </button>
                            <div class="muted">{hit.path}</div>
                            {#if hit.todoNote}
                                <div class="muted">{hit.todoNote}</div>
                            {/if}
                            <div class="section-actions">
                                <button
                                    type="button"
                                    class="action-button"
                                    onclick={() => app.pinIdea(hit.id)}
                                >Pin</button>
                            </div>
                        </li>
                    {/each}
                </ul>
            </PaneStatus>
        {/if}
    </div>
</CollapsiblePane>

<style>
    .todo-results {
        flex: 1 1 auto;
        min-height: 0;
        width: 100%;
        overflow-x: hidden;
        overflow-y: auto;
    }

    .todo-results-meta {
        margin: 0 0 6px;
    }

    .todo-results-list {
        width: 100%;
    }
</style>
