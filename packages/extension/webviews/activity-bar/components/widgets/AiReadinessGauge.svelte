<script lang="ts">
    import type { AiReadiness } from '@reqlan/analytical';

    interface Props {
        readiness: AiReadiness;
    }

    let { readiness }: Props = $props();

    let pct = $derived(Math.round(readiness.score * 100));
    let tooltip = $derived(
        readiness.ready
            ? `AI ready (${pct}%): enough focused requirement, relationships, history, and quality signals to assist without high blast-radius risk (${readiness.risk}).`
            : `AI caution (${pct}%): one or more readiness checks are weak, or risk is elevated (${readiness.risk}). Expand context or fix failing checks before trusting a large AI edit.`
    );

    const checkHelp: Record<string, { pass: string; fail: string }> = {
        Requirements: {
            pass: 'A focus idea is selected — answers can target written intent.',
            fail: 'No focus idea — the assistant lacks a requirement anchor; open a .rq block or focus a linked idea.'
        },
        Relationships: {
            pass: 'Inbound/outbound refs exist — impact and neighbours are knowable.',
            fail: 'No graph neighbours — the idea is isolated; link parents/deps so AI does not invent structure.'
        },
        History: {
            pass: 'Created/modified timestamps exist — recency and age can inform caution.',
            fail: 'No lifecycle timestamps — the assistant cannot tell how fresh or stale this idea is.'
        },
        Quality: {
            pass: 'No unresolved refs on focus — context is not poisoned by broken links.',
            fail: 'Unresolved references — fix or filter broken refs before exporting context to AI.'
        },
        Risk: {
            pass: 'Synthesized AI risk is not high — safer to apply automated edits.',
            fail: 'High AI risk — fanout, churn, or instability suggests reviewing manually first.'
        }
    };
</script>

<div class="ai-readiness" title={tooltip}>
    <div class="meter-label">
        <span>{readiness.ready ? 'AI ready' : 'AI caution'}</span>
        <span class="muted">{pct}% · risk {readiness.risk}</span>
    </div>
    <div class="progress-bar" role="progressbar" aria-valuenow={pct}>
        <span style="width: {pct}%"></span>
    </div>
    <ul class="check-list">
        {#each readiness.checks as check}
            {@const help = checkHelp[check.label]}
            <li
                class:ok={check.ok}
                class:bad={!check.ok}
                title={help ? (check.ok ? help.pass : help.fail) : check.label}
            >
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
