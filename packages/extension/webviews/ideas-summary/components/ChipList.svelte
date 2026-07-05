<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { attributeKeyFromChipItem, chipLabels } from '../lib/chip-labels.js';

    export let items: string[] = [];
    export let titles: string[] | undefined = undefined;
    export let filterKeys: string[] | undefined = undefined;
    export let visibleCount = 4;
    export let clickable = false;
    export let filterable = false;
    export let activeKeys: string[] = [];
    export let activeFilterKeys: string[] = [];
    export let align: 'start' | 'end' = 'end';
    export let emptyLabel = '—';

    const dispatch = createEventDispatcher<{ select: { index: number } }>();

    let expanded = false;

    $: labels = chipLabels(items);
    $: fullTitles = titles ?? items;
    $: visibleIndices = expanded || items.length <= visibleCount
        ? items.map((_, index) => index)
        : items.map((_, index) => index).slice(0, visibleCount);
    $: hiddenCount = Math.max(0, items.length - visibleCount);
    $: showExpand = items.length > visibleCount && !expanded;
    $: showCollapse = expanded && items.length > visibleCount;

    function toggleExpanded(event: MouseEvent): void {
        event.stopPropagation();
        expanded = !expanded;
    }

    function handleSelect(index: number, event: MouseEvent): void {
        event.stopPropagation();
        dispatch('select', { index });
    }

    function isActive(index: number): boolean {
        if (!filterable) {
            return false;
        }
        if (filterKeys) {
            return activeFilterKeys.includes(filterKeys[index]);
        }
        return activeKeys.includes(attributeKeyFromChipItem(items[index]));
    }
</script>

{#if items.length === 0}
    <span class="member-empty">{emptyLabel}</span>
{:else}
    <div class="member-chips" class:member-chips-end={align === 'end'}>
        {#each visibleIndices as index (index)}
            {#if clickable || filterable}
                <button
                    type="button"
                    class="member-chip"
                    class:member-chip-active={isActive(index)}
                    title={fullTitles[index]}
                    on:click={(event) => handleSelect(index, event)}
                >
                    <span class="member-chip-text">{labels[index]}</span>
                </button>
            {:else}
                <span class="member-chip" title={fullTitles[index]}>
                    <span class="member-chip-text">{labels[index]}</span>
                </span>
            {/if}
        {/each}
        {#if showExpand}
            <button
                type="button"
                class="member-chip member-chip-more"
                title="Show all"
                on:click={toggleExpanded}
            >
                … +{hiddenCount}
            </button>
        {:else if showCollapse}
            <button
                type="button"
                class="member-chip member-chip-more"
                title="Show fewer"
                on:click={toggleExpanded}
            >
                …
            </button>
        {/if}
    </div>
{/if}
