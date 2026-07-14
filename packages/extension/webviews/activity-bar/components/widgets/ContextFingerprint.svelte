<script lang="ts">
    import type { ContextFingerprintAxes } from 'reqlan-analytical';

    interface Props {
        axes: ContextFingerprintAxes;
    }

    let { axes }: Props = $props();

    const rows: { key: keyof ContextFingerprintAxes; label: string }[] = [
        { key: 'files', label: 'Files' },
        { key: 'requirements', label: 'Requirements' },
        { key: 'history', label: 'History' },
        { key: 'architecture', label: 'Architecture' },
        { key: 'git', label: 'Git' },
        { key: 'diagnostics', label: 'Diagnostics' },
        { key: 'coverage', label: 'Coverage' }
    ];

    function pct(value: number): number {
        return Math.round(Math.min(1, Math.max(0, value)) * 100);
    }
</script>

<div class="context-fingerprint" title="What is in composed context">
    <p class="muted fingerprint-title">Context fingerprint</p>
    {#each rows as row}
        <div class="fp-row">
            <span class="fp-label">{row.label}</span>
            <div class="progress-bar compact" role="progressbar" aria-valuenow={pct(axes[row.key])}>
                <span style="width: {pct(axes[row.key])}%"></span>
            </div>
        </div>
    {/each}
</div>

<style>
    .context-fingerprint {
        margin: 6px 0 8px;
    }
    .fingerprint-title {
        margin: 0 0 4px;
        font-size: 0.85em;
    }
    .fp-row {
        display: grid;
        grid-template-columns: 88px 1fr;
        gap: 6px;
        align-items: center;
        margin-bottom: 3px;
    }
    .fp-label {
        font-size: 0.75em;
        color: var(--vscode-descriptionForeground);
    }
    :global(.progress-bar.compact) {
        height: 4px;
        margin: 0;
    }
</style>
