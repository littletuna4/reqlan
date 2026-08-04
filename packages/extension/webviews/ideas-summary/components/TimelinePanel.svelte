<script lang="ts">
    /**
     * Timeline tab — idea evolution from git dates + idea-level reindex activity.
     * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".timeline_page]
     */
    import { onMount } from 'svelte';
    import type { TimelineEventSource, TimelineEventView } from '../../../src/webview_module/shared/messages.js';
    import { getApp } from '../state/context.js';

    const app = getApp();

    // $derived tracks AppState $state updates from the extension message listener;
    // legacy $: does not (see GraphView.svelte).
    let sourceFilter = $state<'all' | TimelineEventSource>('all');

    const events = $derived(app.timeline.events);
    const filtered = $derived(sourceFilter === 'all'
        ? events
        : events.filter(event => event.source === sourceFilter));

    onMount(() => {
        app.loadTimeline();
    });

    function formatTime(at: number): string {
        if (!at) {
            return '—';
        }
        return new Date(at).toLocaleString();
    }

    function openEvent(event: TimelineEventView): void {
        if (!event.fileUri) {
            return;
        }
        app.openIdea(event.fileUri, event.lineStart ?? 0);
    }

    function metaBits(event: TimelineEventView): string[] {
        const bits: string[] = [];
        if (event.status) {
            bits.push(event.status);
        }
        if (event.ideaKind && event.ideaKind !== 'ideaset') {
            bits.push(event.ideaKind);
        }
        if (event.tags?.length) {
            bits.push(...event.tags.slice(0, 3));
        }
        return bits;
    }
</script>

<div class="timeline">
    <div class="table-toolbar">
        <h2 class="timeline-heading">Timeline</h2>
        <div class="timeline-filters">
            <button
                type="button"
                class="secondary"
                class:has-filters={sourceFilter === 'all'}
                onclick={() => { sourceFilter = 'all'; }}
            >All</button>
            <button
                type="button"
                class="secondary"
                class:has-filters={sourceFilter === 'git'}
                onclick={() => { sourceFilter = 'git'; }}
            >Git</button>
            <button
                type="button"
                class="secondary"
                class:has-filters={sourceFilter === 'index'}
                onclick={() => { sourceFilter = 'index'; }}
            >Reindexed</button>
            <button type="button" class="secondary" onclick={() => app.loadTimeline()}>Refresh</button>
        </div>
    </div>

    <p class="subtle">
        Idea evolution for the active base — when ideas were created or last edited in git,
        plus ideas reindexed in this session.
    </p>

    {#if app.timeline.loading}
        <p class="subtle">Loading timeline… first open may backfill git dates for ideas.</p>
    {:else if filtered.length === 0}
        <p class="subtle">
            No idea timeline events yet. Open Refresh after the index is ready, or edit a `.rq` file so ideas reindex.
        </p>
    {:else}
        <ul class="timeline-list">
            {#each filtered as event (event.id)}
                {@const bits = metaBits(event)}
                <li class="timeline-item">
                    <div class="timeline-badges">
                        <span class="timeline-source pill">{event.source === 'index' ? 'index' : 'git'}</span>
                        <span class="timeline-action pill">{event.label}</span>
                    </div>
                    {#if event.fileUri}
                        <button
                            type="button"
                            class="timeline-open"
                            onclick={() => openEvent(event)}
                        >
                            <span class="timeline-label">{event.ideaName ?? event.detail}</span>
                            {#if event.summary}
                                <span class="timeline-summary">{event.summary}</span>
                            {/if}
                            {#if bits.length > 0}
                                <span class="timeline-meta">
                                    {#each bits as bit (bit)}
                                        <span class="timeline-chip">{bit}</span>
                                    {/each}
                                </span>
                            {/if}
                            {#if event.path}
                                <span class="timeline-detail">{event.path}</span>
                            {/if}
                        </button>
                    {:else}
                        <div class="timeline-open">
                            <span class="timeline-label">{event.ideaName ?? event.detail}</span>
                            {#if event.summary}
                                <span class="timeline-summary">{event.summary}</span>
                            {/if}
                            {#if event.path}
                                <span class="timeline-detail">{event.path}</span>
                            {/if}
                        </div>
                    {/if}
                    <span class="timeline-time">{formatTime(event.at)}</span>
                </li>
            {/each}
        </ul>
    {/if}
</div>
