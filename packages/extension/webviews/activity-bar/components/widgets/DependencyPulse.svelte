<script lang="ts">
    interface Props {
        parentCount: number;
        outboundCount: number;
        inboundCount: number;
        dependentCount: number;
    }

    let { parentCount, outboundCount, inboundCount, dependentCount }: Props = $props();
</script>

<div class="dependency-pulse" title="↑ parents · → outbound · ← inbound · ↓ dependents">
    <div class="pulse-row">↑ {parentCount}</div>
    <div class="pulse-mid">
        <span>←{inboundCount}</span>
        <span class="pulse-dot">●</span>
        <span>{outboundCount}→</span>
    </div>
    <div class="pulse-row">↓ {dependentCount}</div>
</div>

<style>
    .dependency-pulse {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        font-size: 0.85em;
        margin: 4px 0 8px;
        color: var(--vscode-descriptionForeground);
    }
    .pulse-mid {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .pulse-dot {
        color: var(--vscode-textLink-foreground);
    }
    .pulse-row {
        text-align: center;
    }
</style>
