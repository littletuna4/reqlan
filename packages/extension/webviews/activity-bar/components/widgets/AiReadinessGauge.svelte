<script lang="ts">
    import type { AiReadiness } from 'reqlan-analytical';

    interface Props {
        readiness: AiReadiness;
    }

    let { readiness }: Props = $props();

    let pct = $derived(Math.round(readiness.score * 100));
</script>

<div class="ai-readiness" title="AI readiness {pct}%">
    <div class="meter-label">
        <span>{readiness.ready ? 'AI ready' : 'AI caution'}</span>
        <span class="muted">{pct}% · risk {readiness.risk}</span>
    </div>
    <div class="progress-bar" role="progressbar" aria-valuenow={pct}>
        <span style="width: {pct}%"></span>
    </div>
    <ul class="check-list">
        {#each readiness.checks as check}
            <li class:ok={check.ok} class:bad={!check.ok}>
                {check.ok ? '✓' : '✕'} {check.label}
            </li>
        {/each}
    </ul>
</div>

<style>
    .ai-readiness {
        margin: 6px 0 8px;
    }
    .meter-label {
        display: flex;
        justify-content: space-between;
        font-size: 0.85em;
        margin-bottom: 2px;
        gap: 8px;
    }
    .check-list {
        list-style: none;
        padding: 0;
        margin: 4px 0 0;
        font-size: 0.75em;
        color: var(--vscode-descriptionForeground);
        display: flex;
        flex-wrap: wrap;
        gap: 4px 10px;
    }
    .check-list .ok {
        color: var(--vscode-testing-iconPassed, #3fb950);
    }
    .check-list .bad {
        color: var(--vscode-errorForeground);
    }
</style>
