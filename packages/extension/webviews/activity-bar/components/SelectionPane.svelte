<script lang="ts">
    import { getApp } from '../state/context.js';
    import CollapsiblePane from './CollapsiblePane.svelte';
    import NestedSection from './NestedSection.svelte';

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
    let selection = $derived(app.context?.selection);
    let ideas = $derived(selection?.ideas ?? []);
</script>

<CollapsiblePane title="Selection" id="selection" {expanded} {fill} {height} {resizable} {onToggle} {onResize}>
    {#if !selection || ideas.length === 0}
        <p class="muted pane-status">Select multiple ideas in the editor to list them here.</p>
    {:else}
        <p class="muted">
            Lines {selection.startLine + 1}–{selection.endLine + 1} · {ideas.length} idea(s)
        </p>
        <NestedSection title="Selected ideas" count={ideas.length} defaultExpanded={true}>
            <ul class="list">
                {#each ideas as idea}
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
    {/if}
</CollapsiblePane>
