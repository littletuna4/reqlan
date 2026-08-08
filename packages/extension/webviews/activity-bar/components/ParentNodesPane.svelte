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
    let result = $derived(app.ancestors);
</script>

<CollapsiblePane title="Parents" id="parents" {expanded} {fill} {height} {resizable} {onToggle} {onResize}>
    <PaneStatus
        loading={app.ancestorsLoading}
        error={app.ancestorsError}
        empty={!result || result.ancestors.length === 0}
        loadingText="Loading ancestors…"
        emptyText="No upstream reference parents."
    >
        <p class="muted">Status rollup: {Object.entries(result?.statusRollup ?? {}).map(([k, v]) => `${k}:${v}`).join(', ')}</p>
        <NestedSection title="Ancestors" count={result?.ancestors.length ?? 0} defaultExpanded={true}>
            <ul class="list">
                {#each result?.ancestors ?? [] as ancestor, index}
                    <li>
                        <button class="link" onclick={() => app.openIdea(ancestor.fileUri, ancestor.lineStart)}>
                            {index + 1}. {ancestor.name}
                        </button>
                        <span class="muted"> ({ancestor.status ?? 'unspecified'})</span>
                    </li>
                {/each}
            </ul>
        </NestedSection>
        {#if (result?.blocking.length ?? 0) > 0}
            <NestedSection title="Blocks completion" count={result?.blocking.length ?? 0} defaultExpanded={true}>
                <ul class="list">
                    {#each result?.blocking ?? [] as blocker}
                        <li>
                            <button class="link" onclick={() => app.openIdea(blocker.fileUri, blocker.lineStart)}>
                                {blocker.name}
                            </button>
                        </li>
                    {/each}
                </ul>
            </NestedSection>
        {/if}
    </PaneStatus>
</CollapsiblePane>
