<script lang="ts">
    import { getApp } from '../state/context.js';
    import CollapsiblePane from './CollapsiblePane.svelte';
    import NestedSection from './NestedSection.svelte';
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
</script>

<CollapsiblePane title="Todos" id="todos" {expanded} {fill} {height} {resizable} {onToggle} {onResize}>
    <div class="section-actions">
        <button
            type="button"
            class="action-button"
            disabled={!indexReady || app.todoLoading}
            onclick={() => app.loadTodos()}
        >Refresh</button>
    </div>
    {#if !indexReady}
        <p class="muted pane-status" role="status">Waiting for index…</p>
    {:else}
        <PaneStatus
            loading={app.todoLoading && !app.todoLoaded}
            error={app.todoError}
            empty={results.length === 0}
            loadingText="Loading todos…"
            emptyText="No ideas with a @todo attribute."
        >
            <NestedSection title="Open todos" count={total} defaultExpanded={true}>
                {#if truncated}
                    <p class="muted">Showing {results.length} of {total}</p>
                {/if}
                <ul class="list">
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
            </NestedSection>
        </PaneStatus>
    {/if}
</CollapsiblePane>
