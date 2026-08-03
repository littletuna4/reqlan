<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import type {
        DiagnosticsFileView,
        DiagnosticsOverviewView,
        DiagnosticsRunView,
        ExtensionToIndexDiagnosticsMessage,
    } from '../../src/diagnostics_module/index-diagnostics-messages.js';
    import { postToExtension } from './lib/vscode.js';

    let baseLabel = $state('');
    let baseRoot = $state('');
    let overview = $state<DiagnosticsOverviewView | undefined>(undefined);
    let runs = $state<DiagnosticsRunView[]>([]);
    let selectedRunId = $state<number | undefined>(undefined);
    let selectedRun = $state<DiagnosticsRunView | undefined>(undefined);
    let files = $state<DiagnosticsFileView[]>([]);
    let fileOrder = $state<'duration_desc' | 'duration_asc' | 'path'>('duration_desc');
    let errorMessage = $state<string | undefined>(undefined);
    let loaded = $state(false);

    function formatMs(ms: number | undefined): string {
        if (ms == null || Number.isNaN(ms)) {
            return '—';
        }
        if (ms < 1) {
            return `${ms.toFixed(2)} ms`;
        }
        if (ms < 1000) {
            return `${ms.toFixed(1)} ms`;
        }
        return `${(ms / 1000).toFixed(2)} s`;
    }

    function formatDepth(depth: number | undefined): string {
        if (depth == null || Number.isNaN(depth)) {
            return '—';
        }
        return depth.toFixed(2);
    }

    function handleMessage(event: MessageEvent<ExtensionToIndexDiagnosticsMessage>): void {
        const message = event.data;
        if (!message || typeof message !== 'object') {
            return;
        }
        if (message.type === 'error') {
            errorMessage = message.message;
            loaded = true;
            return;
        }
        if (message.type === 'snapshot') {
            errorMessage = undefined;
            baseLabel = message.baseLabel;
            baseRoot = message.baseRoot;
            overview = message.overview;
            runs = message.runs;
            selectedRunId = message.selectedRunId;
            selectedRun = message.selectedRun;
            files = message.files;
            fileOrder = message.fileOrder;
            loaded = true;
        }
    }

    function selectRun(runId: number): void {
        postToExtension({ type: 'selectRun', runId });
    }

    function setOrder(order: 'duration_desc' | 'duration_asc' | 'path'): void {
        postToExtension({ type: 'setFileOrder', order });
    }

    function refresh(): void {
        postToExtension({ type: 'refresh' });
    }

    function openFile(fileUri: string): void {
        postToExtension({ type: 'openFile', fileUri });
    }

    onMount(() => {
        window.addEventListener('message', handleMessage);
        postToExtension({ type: 'ready' });
    });

    onDestroy(() => {
        window.removeEventListener('message', handleMessage);
    });
</script>

<main class="page">
    <header class="header">
        <div>
            <h1>Index Diagnostics</h1>
            <p class="muted">
                {#if baseLabel}
                    Base <strong>{baseLabel}</strong>
                    <span class="path">{baseRoot}</span>
                {:else}
                    Waiting for active base…
                {/if}
            </p>
        </div>
        <button type="button" class="btn" onclick={refresh}>Refresh</button>
    </header>

    {#if errorMessage}
        <p class="error" role="alert">{errorMessage}</p>
    {:else if !loaded}
        <p class="muted">Loading diagnostics…</p>
    {:else}
        <section class="summary" aria-label="Base timing summary">
            <article>
                <h2>Total time (retained runs)</h2>
                <p class="metric">{formatMs(overview?.totalDurationMs)}</p>
                <p class="muted">{overview?.runCount ?? 0} runs · avg {formatMs(overview?.averageRunDurationMs)}</p>
            </article>
            <article>
                <h2>Latest run</h2>
                <p class="metric">{formatMs(overview?.latestRun?.durationMs)}</p>
                <p class="muted">
                    {overview?.latestRun?.totalFiles ?? 0} files ·
                    avg depth {formatDepth(overview?.latestRun?.avgPathDepth)} ·
                    {overview?.latestRun?.trigger ?? '—'}
                </p>
            </article>
            <article>
                <h2>File work (sum)</h2>
                <p class="metric">{formatMs(overview?.totalFileDurationMs)}</p>
                <p class="muted">avg path depth {formatDepth(overview?.averagePathDepth)}</p>
            </article>
        </section>

        <div class="split">
            <section class="panel" aria-label="Recent sync runs">
                <h2>Runs</h2>
                {#if runs.length === 0}
                    <p class="muted">No timing samples yet. Index or refresh the base first.</p>
                {:else}
                    <ul class="run-list">
                        {#each runs as run (run.id)}
                            <li>
                                <button
                                    type="button"
                                    class="run"
                                    class:selected={run.id === selectedRunId}
                                    onclick={() => selectRun(run.id)}
                                >
                                    <span class="run-top">
                                        <span>#{run.id} · {run.trigger}</span>
                                        <strong>{formatMs(run.durationMs)}</strong>
                                    </span>
                                    <span class="muted">
                                        {run.totalFiles} files ·
                                        {run.skippedMtime} mtime-skip ·
                                        {run.indexedFiles} indexed ·
                                        depth {formatDepth(run.avgPathDepth)}
                                        {run.cancelled ? ' · cancelled' : ''}
                                    </span>
                                </button>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </section>

            <section class="panel" aria-label="Per-file timings">
                <div class="panel-head">
                    <h2>
                        Files
                        {#if selectedRun}
                            <span class="muted">run #{selectedRun.id}</span>
                        {/if}
                    </h2>
                    <label class="order">
                        Rank
                        <select
                            value={fileOrder}
                            onchange={(event) => {
                                const value = (event.currentTarget as HTMLSelectElement).value;
                                if (value === 'duration_desc' || value === 'duration_asc' || value === 'path') {
                                    setOrder(value);
                                }
                            }}
                        >
                            <option value="duration_desc">Slowest first</option>
                            <option value="duration_asc">Fastest first</option>
                            <option value="path">Path</option>
                        </select>
                    </label>
                </div>

                {#if !selectedRun}
                    <p class="muted">Select a run to drill into file timings.</p>
                {:else if files.length === 0}
                    <p class="muted">No file rows for this run.</p>
                {:else}
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Duration</th>
                                    <th>Depth</th>
                                    <th>Outcome</th>
                                    <th>File</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each files as row (row.id)}
                                    <tr>
                                        <td class="num">{formatMs(row.durationMs)}</td>
                                        <td class="num">{row.pathDepth}</td>
                                        <td><code>{row.outcome}</code></td>
                                        <td>
                                            <button type="button" class="link" onclick={() => openFile(row.fileUri)}>
                                                {row.fileUri}
                                            </button>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}
            </section>
        </div>
    {/if}
</main>

<style>
    .page {
        padding: 1rem 1.25rem 2rem;
        display: grid;
        gap: 1rem;
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
    }

    h1 {
        margin: 0 0 0.25rem;
        font-size: 1.25rem;
        font-weight: 600;
    }

    h2 {
        margin: 0 0 0.5rem;
        font-size: 0.85rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--vscode-descriptionForeground);
    }

    .muted {
        color: var(--vscode-descriptionForeground);
        margin: 0;
        font-size: 0.9rem;
    }

    .path {
        display: inline-block;
        margin-left: 0.35rem;
        opacity: 0.85;
        word-break: break-all;
    }

    .error {
        color: var(--vscode-errorForeground);
        margin: 0;
    }

    .btn,
    .run,
    .link,
    select {
        border: 1px solid var(--vscode-button-border, var(--vscode-input-border));
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border-radius: 2px;
        padding: 0.35rem 0.7rem;
        cursor: pointer;
    }

    .link {
        border: none;
        background: transparent;
        color: var(--vscode-textLink-foreground);
        padding: 0;
        text-align: left;
        word-break: break-all;
    }

    .summary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.75rem;
    }

    .summary article {
        border: 1px solid var(--vscode-widget-border, var(--vscode-input-border));
        padding: 0.75rem 0.9rem;
        background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-foreground) 12%);
    }

    .metric {
        margin: 0;
        font-size: 1.35rem;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
    }

    .split {
        display: grid;
        grid-template-columns: minmax(14rem, 0.9fr) minmax(0, 1.4fr);
        gap: 0.75rem;
        align-items: start;
    }

    .panel {
        border: 1px solid var(--vscode-widget-border, var(--vscode-input-border));
        padding: 0.75rem;
        min-height: 12rem;
    }

    .panel-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
    }

    .panel-head h2 {
        margin: 0;
    }

    .order {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.85rem;
        color: var(--vscode-descriptionForeground);
    }

    .run-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.4rem;
        max-height: 28rem;
        overflow: auto;
    }

    .run {
        width: 100%;
        text-align: left;
        display: grid;
        gap: 0.2rem;
        background: transparent;
        color: inherit;
    }

    .run.selected {
        outline: 1px solid var(--vscode-focusBorder);
        background: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
    }

    .run-top {
        display: flex;
        justify-content: space-between;
        gap: 0.75rem;
        font-variant-numeric: tabular-nums;
    }

    .table-wrap {
        overflow: auto;
        max-height: 28rem;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        font-variant-numeric: tabular-nums;
    }

    th,
    td {
        text-align: left;
        padding: 0.35rem 0.45rem;
        border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-input-border));
        vertical-align: top;
    }

    th {
        color: var(--vscode-descriptionForeground);
        font-weight: 600;
        font-size: 0.8rem;
    }

    .num {
        white-space: nowrap;
    }

    code {
        font-size: 0.85em;
    }

    @media (max-width: 900px) {
        .summary,
        .split {
            grid-template-columns: 1fr;
        }
    }
</style>
