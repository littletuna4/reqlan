<script lang="ts">
    import { getApp } from '../state/context.js';
    import CollapsiblePane from './CollapsiblePane.svelte';
    import MiniGraphCanvas from './MiniGraphCanvas.svelte';

    interface Props {
        expanded: boolean;
        onToggle: (id: string, expanded: boolean) => void;
    }
    let { expanded, onToggle }: Props = $props();

    const app = getApp();

    function handleFocusNode(nodeId: string): void {
        app.focusIdea(nodeId);
        app.loadGraph(nodeId);
    }
</script>

<CollapsiblePane title="Mini graph" id="graph" {expanded} {onToggle}>
    {#if expanded}
        <svelte:boundary>
            <MiniGraphCanvas
                slice={app.graph.slice}
                loading={app.graph.loading}
                error={app.graph.error}
                rendering={app.graph.rendering}
                onRendered={() => app.onGraphRendered()}
                onFocusNode={handleFocusNode}
            />
            {#snippet failed(error)}
                <p class="error-text">Graph failed: {error instanceof Error ? error.message : 'Unknown error'}</p>
            {/snippet}
        </svelte:boundary>
        <button class="action-button" onclick={() => app.openIdeasSummary('graph')}>Open in Graph tab</button>
    {/if}
</CollapsiblePane>
