<script lang="ts">
    interface Props {
        intensity: number;
        title?: string;
    }

    let { intensity, title = 'Churn' }: Props = $props();

    let bars = $derived.by(() => {
        const level = Math.min(1, Math.max(0, intensity));
        const heights = [0.15, 0.2, 0.25, 0.35, 0.45, 0.55, 0.7, 0.85, 1, 0.75, 0.4, 0.2];
        return heights.map(h => Math.max(0.08, h * level));
    });
</script>

<div class="churn-heat" title="{title}">
    {#each bars as height, index (index)}
        <span class="churn-bar" style="height: {Math.round(height * 100)}%"></span>
    {/each}
</div>

<style>
    .churn-heat {
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 18px;
        margin: 4px 0 8px;
    }
    .churn-bar {
        flex: 1;
        min-width: 3px;
        background: var(--vscode-charts-orange, #d18616);
        opacity: 0.85;
        border-radius: 1px;
    }
</style>
