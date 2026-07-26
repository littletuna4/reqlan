<script lang="ts">
    import { getApp } from '../state/context.js';
    import CollapsiblePane from './CollapsiblePane.svelte';
    import NestedSection from './NestedSection.svelte';

    interface Props {
        expanded: boolean;
        onToggle: (id: string, expanded: boolean) => void;
    }
    let { expanded, onToggle }: Props = $props();

    const app = getApp();
    let selection = $derived(app.context?.selection);
</script>

{#if selection && selection.ideas.length > 0}
    <CollapsiblePane title="Selection" id="selection" {expanded} {onToggle}>
        <p class="muted">
            Lines {selection.startLine + 1}–{selection.endLine + 1} · {selection.ideas.length} idea(s)
        </p>
        <NestedSection title="Selected ideas" count={selection.ideas.length} defaultExpanded={true}>
            <ul class="list">
                {#each selection.ideas as idea}
                    <li>
                        <button class="link" onclick={() => app.openIdea(idea.fileUri, idea.lineStart)}>
                            {idea.name}
                        </button>
                        <div class="section-actions">
                            <button class="action-button" onclick={() => app.focusIdea(idea.id)}>Focus</button>
                            <button class="action-button" onclick={() => app.pinIdea(idea.id)}>Pin</button>
                        </div>
                    </li>
                {/each}
            </ul>
        </NestedSection>
    </CollapsiblePane>
{/if}
