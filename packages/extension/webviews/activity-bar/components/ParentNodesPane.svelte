<script lang="ts">
    import { getApp } from '../state/context.js';
    import CollapsiblePane from './CollapsiblePane.svelte';

    interface Props {
        expanded: boolean;
        onToggle: (id: string, expanded: boolean) => void;
    }
    let { expanded, onToggle }: Props = $props();

    const app = getApp();
    let result = $derived(app.ancestors);
</script>

<CollapsiblePane title="Parents" id="parents" {expanded} {onToggle}>
    {#if !result || result.ancestors.length === 0}
        <p class="muted">No upstream reference parents.</p>
    {:else}
        <p class="muted">Status rollup: {Object.entries(result.statusRollup).map(([k, v]) => `${k}:${v}`).join(', ')}</p>
        <ul class="list">
            {#each result.ancestors as ancestor, index}
                <li>
                    <button class="link" onclick={() => app.openIdea(ancestor.fileUri, ancestor.lineStart)}>
                        {index + 1}. {ancestor.name}
                    </button>
                    <span class="muted"> ({ancestor.status ?? 'unspecified'})</span>
                </li>
            {/each}
        </ul>
        {#if result.blocking.length > 0}
            <h4>Blocks completion</h4>
            <ul class="list">
                {#each result.blocking as blocker}
                    <li>
                        <button class="link" onclick={() => app.openIdea(blocker.fileUri, blocker.lineStart)}>
                            {blocker.name}
                        </button>
                    </li>
                {/each}
            </ul>
        {/if}
    {/if}
</CollapsiblePane>
