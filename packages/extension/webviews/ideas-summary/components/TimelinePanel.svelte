<script lang="ts">
    /**
     * Timeline tab — indexed git idea dates + index activity.
     * per ["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".timeline_page]
     */
    import { onMount } from 'svelte';
    import type { TimelineEventSource } from '../../../src/webview_module/shared/messages.js';
    import { getApp } from '../state/context.js';

    const app = getApp();

    let sourceFilter: 'all' | TimelineEventSource = 'all';

    $: events = app.timeline.events;
    $: filtered = sourceFilter === 'all'
        ? events
        : events.filter(event => event.source === sourceFilter);

    onMount(() => {
        app.loadTimeline();
    });

    function formatTime(at: number): string {
        if (!at) {
            return '—';
        }
        return new Date(at).toLocaleString();
    }

    function openEvent(fileUri: string | undefined, lineStart: number | undefined): void {
        if (!fileUri) {
            return;
        }
        app.openIdea(fileUri, lineStart ?? 0);
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
                on:click={() => { sourceFilter = 'all'; }}
            >All</button>
            <button
                type="button"
                class="secondary"
                class:has-filters={sourceFilter === 'git'}
                on:click={() => { sourceFilter = 'git'; }}
            >Git</button>
            <button
                type="button"
                class="secondary"
                class:has-filters={sourceFilter === 'index'}
                on:click={() => { sourceFilter = 'index'; }}
            >Index</button>
            <button type="button" class="secondary" on:click={() => app.loadTimeline()}>Refresh</button>
        </div>
    </div>

    <p class="subtle">
        Recent idea changes from indexed git dates, plus index/workspace activity for the active base.
    </p>

    {#if app.timeline.loading}
        <p class="subtle">Loading timeline…</p>
    {:else if filtered.length === 0}
        <p class="subtle">
            No timeline events yet. Git dates appear after the index captures them; index activity appears as files sync.
        </p>
    {:else}
        <ul class="timeline-list">
            {#each filtered as event (event.id)}
                <li class="timeline-item">
                    <span class="timeline-source pill">{event.source}</span>
                    {#if event.fileUri}
                        <button
                            type="button"
                            class="timeline-open"
                            on:click={() => openEvent(event.fileUri, event.lineStart)}
                        >
                            <span class="timeline-label">{event.label}</span>
                            <span class="timeline-detail">{event.detail}</span>
                        </button>
                    {:else}
                        <div class="timeline-open">
                            <span class="timeline-label">{event.label}</span>
                            <span class="timeline-detail">{event.detail}</span>
                        </div>
                    {/if}
                    <span class="timeline-time">{formatTime(event.at)}</span>
                </li>
            {/each}
        </ul>
    {/if}
</div>
