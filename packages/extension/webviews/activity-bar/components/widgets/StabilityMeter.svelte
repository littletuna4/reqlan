<script lang="ts">
    interface Props {
        stability: number;
        title?: string;
        confidence?: number;
        aiRisk?: string;
        coverage?: string;
    }

    let { stability, title = 'Stable', confidence, aiRisk, coverage }: Props = $props();

    let pct = $derived(Math.round(Math.min(1, Math.max(0, stability)) * 100));
    let tooltip = $derived.by(() => {
        const parts = [
            `Stability ${pct}% (${title}): how settled this idea looks for safe AI edits.`,
            'Older, quiet ideas with modest fanout and no broken refs score higher; hot, highly connected, or broken ones score lower — prefer caution when this is low.'
        ];
        if (confidence !== undefined) {
            parts.push(
                `Evidence confidence ${Math.round(confidence * 100)}%: whether status, history, and relationships give the assistant enough anchors to trust.`
            );
        }
        if (aiRisk) {
            parts.push(`AI risk ${aiRisk}: chance an automated change here surprises dependents.`);
        }
        if (coverage) {
            parts.push(`Relationship coverage ${coverage}.`);
        }
        return parts.join(' ');
    });
</script>

<div class="stability-meter" title={tooltip}>
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
