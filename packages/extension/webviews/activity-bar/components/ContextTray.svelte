<script lang="ts">
    import { getApp } from '../state/context.js';
    import CollapsiblePane from './CollapsiblePane.svelte';

    interface Props {
        expanded: boolean;
        onToggle: (id: string, expanded: boolean) => void;
    }
    let { expanded, onToggle }: Props = $props();

    const app = getApp();
</script>

<CollapsiblePane title="Context tray" id="tray" {expanded} {onToggle}>
    {#if app.tray.length === 0}
        <p class="muted">Pin ideas from reference rows to build AI context.</p>
    {:else}
        <div class="chip-row">
            {#each app.tray as idea}
                <span class="chip">
                    {idea.name}
                    <button onclick={() => app.unpinIdea(idea.id)}>×</button>
                </span>
            {/each}
        </div>
    {/if}
    <div class="section-actions">
        <button class="action-button" onclick={() => app.copyTrayMarkdown()} disabled={app.tray.length === 0}>Copy markdown</button>
        <button class="action-button" onclick={() => app.clearTray()} disabled={app.tray.length === 0}>Clear</button>
    </div>
</CollapsiblePane>
