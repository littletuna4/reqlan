<script lang="ts">
    interface Props {
        stability: number;
        title?: string;
    }

    let { stability, title = 'Stable' }: Props = $props();

    let pct = $derived(Math.round(Math.min(1, Math.max(0, stability)) * 100));
</script>

<div class="stability-meter" title="{title} {pct}%">
    <div class="meter-label">
        <span>{title}</span>
        <span class="muted">{pct}%</span>
    </div>
    <div class="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style="width: {pct}%"></span>
    </div>
</div>

<style>
    .stability-meter {
        margin: 6px 0 8px;
    }
    .meter-label {
        display: flex;
        justify-content: space-between;
        font-size: 0.85em;
        margin-bottom: 2px;
    }
</style>
