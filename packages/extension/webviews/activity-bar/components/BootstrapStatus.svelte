<script lang="ts">
    import type { ActivityBarContentPhase } from '../state/app.svelte.js';
    import { getApp } from '../state/context.js';

    interface Props {
        phase: ActivityBarContentPhase;
    }

    let { phase }: Props = $props();
    const app = getApp();

    let title = $derived.by(() => {
        switch (phase) {
            case 'connecting':
                return 'Connecting to extension…';
            case 'waiting_index':
                return 'Building workspace index…';
            case 'bootstrapping':
                return 'Loading context…';
            case 'error':
                return 'Something went wrong';
            default:
                return 'Loading…';
        }
    });

    let detail = $derived.by(() => {
        if (phase === 'error') {
            return app.bootstrapError ?? app.statusText;
        }
        if (phase === 'waiting_index') {
            const state = app.indexStatus?.state;
            const progress = app.indexProgressLabel;
            if (progress) {
                return `Syncing ${progress}`;
            }
            if (state) {
                return `Index state: ${state}`;
            }
            return 'Waiting for the first index status update.';
        }
        if (phase === 'bootstrapping') {
            return 'Index is ready — composing activity bar panes.';
        }
        return 'Waiting for the extension host to respond.';
    });
</script>

<section class="bootstrap-status" class:bootstrap-error={phase === 'error'} aria-live="polite">
    <p class="bootstrap-title">{title}</p>
    <p class="muted bootstrap-detail">{detail}</p>
    {#if phase === 'waiting_index' && app.indexStatus?.syncProgress && app.indexStatus.syncProgress.total > 0}
        {@const pct = Math.round(
            (app.indexStatus.syncProgress.processed / app.indexStatus.syncProgress.total) * 100
        )}
        <div class="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <span style="width: {pct}%"></span>
        </div>
    {/if}
    {#if phase === 'error'}
        <div class="section-actions">
            <button type="button" class="action-button" onclick={() => app.retryBootstrap()}>Retry</button>
            <button type="button" class="action-button" onclick={() => app.refreshIndex()}>Refresh index</button>
        </div>
    {:else if phase === 'waiting_index'}
        <div class="section-actions">
            <button type="button" class="action-button" onclick={() => app.refreshIndex()}>Refresh index</button>
            {#if app.indexStatus?.syncProgress && app.indexStatus.syncProgress.total > 0}
                <button type="button" class="action-button" onclick={() => app.cancelIndexSync()}>Cancel sync</button>
            {/if}
        </div>
    {/if}
</section>
