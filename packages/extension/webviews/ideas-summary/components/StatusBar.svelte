<script lang="ts">
    import { getApp } from '../state/context.js';

    const app = getApp();
    let status = $derived(app.index.status);
    let bases = $derived(status?.bases ?? []);
    let discoveryEmpty = $derived(Boolean(status?.discoveryEmpty));
    let activeBaseId = $derived(status?.activeBaseId ?? '');
    let activeBase = $derived(bases.find((base) => base.id === activeBaseId) ?? bases[0]);
</script>

<div class="status-row">
    {#if discoveryEmpty}
        <div class="base-switcher">
            <span class="muted">No base</span>
            <button type="button" class="action-button" onclick={() => app.createBase()}>Create Base</button>
        </div>
    {:else if bases.length > 0}
        <div class="base-switcher">
            <span class="muted">Base</span>
            <button
                type="button"
                class="base-select-trigger"
                title="Select base"
                onclick={() => app.openSelectBaseDialog()}
            >
                {activeBase?.label ?? 'Select base…'}
            </button>
            <button
                type="button"
                class="icon-button"
                title="Refresh bases"
                aria-label="Refresh bases"
                onclick={() => app.refreshBases()}
            >
                ↻
            </button>
        </div>
    {/if}
    {#if app.tab.statusText}
        <div
            class="status"
            class:error={app.tab.statusError}
            role={app.tab.statusError ? 'alert' : 'status'}
            aria-live={app.tab.statusError ? 'assertive' : 'polite'}
        >
            {#if app.tab.statusError}
                <span class="status-error-label">Error</span>
            {/if}
            <span class="status-line-text">{app.tab.statusText}</span>
        </div>
    {/if}
</div>

<style>
    .status-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
    }
    .base-switcher {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.9em;
    }
    .base-select-trigger {
        max-width: 18rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        background: var(--vscode-dropdown-background);
        color: var(--vscode-dropdown-foreground);
        border: 1px solid var(--vscode-dropdown-border, transparent);
        padding: 0.15rem 0.45rem;
        cursor: pointer;
        font: inherit;
        text-align: left;
    }
    .base-select-trigger:hover {
        background: color-mix(in srgb, var(--vscode-list-hoverBackground) 70%, var(--vscode-dropdown-background, transparent));
    }
    .icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.5rem;
        height: 1.5rem;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 2px;
        background: transparent;
        color: var(--vscode-foreground);
        cursor: pointer;
        opacity: 0.8;
        font: inherit;
    }
    .icon-button:hover {
        opacity: 1;
        background: var(--vscode-toolbar-hoverBackground, transparent);
    }
    .action-button {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        padding: 0.2rem 0.55rem;
        cursor: pointer;
    }
    .muted {
        opacity: 0.75;
    }
    .status {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.9em;
    }
    .status.error {
        color: var(--vscode-errorForeground, #f44747);
    }
    .status-error-label {
        font-weight: 600;
    }
</style>
