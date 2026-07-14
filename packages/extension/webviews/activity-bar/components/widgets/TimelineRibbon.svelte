<script lang="ts">
    interface Milestone {
        id: string;
        label: string;
        at: Date;
    }

    interface Props {
        milestones: Milestone[];
    }

    let { milestones }: Props = $props();

    let range = $derived.by(() => {
        if (milestones.length < 2) {
            return { start: 0, span: 1 };
        }
        const times = milestones.map(m => m.at.getTime());
        const start = Math.min(...times);
        const end = Math.max(...times);
        return { start, span: Math.max(1, end - start) };
    });

    function leftPct(at: Date): number {
        return ((at.getTime() - range.start) / range.span) * 100;
    }
</script>

{#if milestones.length > 0}
    <div class="timeline-ribbon" title="Lifecycle milestones">
        <div class="ribbon-track"></div>
        {#each milestones as milestone (milestone.id)}
            <div class="ribbon-mark" style="left: {leftPct(milestone.at)}%" title="{milestone.label}">
                <span class="ribbon-tick">▲</span>
                <span class="ribbon-label">{milestone.label}</span>
            </div>
        {/each}
    </div>
{/if}

<style>
    .timeline-ribbon {
        position: relative;
        height: 36px;
        margin: 8px 0 4px;
    }
    .ribbon-track {
        position: absolute;
        top: 10px;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--vscode-panel-border);
    }
    .ribbon-mark {
        position: absolute;
        top: 0;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        max-width: 64px;
    }
    .ribbon-tick {
        color: var(--vscode-textLink-foreground);
        font-size: 0.7em;
        line-height: 1;
    }
    .ribbon-label {
        font-size: 0.65em;
        color: var(--vscode-descriptionForeground);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 64px;
    }
</style>
