<script lang="ts">
    /**
     * rq:["../../../../../reqlan rq/extension/module/activitybar-panels/search.rq".search_pane_match_highlighting]
     */
    import { splitSearchHighlight } from '../../shared/search/fuzzy-search.js';

    interface Props {
        text: string;
        query: string;
        /** Character-subsequence marks for short fields such as idea names. */
        allowSparseFuzzy?: boolean;
    }

    let { text, query, allowSparseFuzzy = false }: Props = $props();
    let parts = $derived(splitSearchHighlight(text, query, { allowSparseFuzzy }));
</script>

{#each parts as part, index (index)}
    {#if part.matched}<mark class="search-hit">{part.text}</mark>{:else}{part.text}{/if}
{/each}

<style>
    mark.search-hit {
        background-color: var(
            --vscode-editor-findMatchHighlightBackground,
            rgba(234, 92, 0, 0.35)
        );
        color: inherit;
        border-radius: 2px;
        padding: 0 0.05em;
        font-weight: inherit;
    }
</style>
