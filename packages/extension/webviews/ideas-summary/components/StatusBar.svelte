<script lang="ts">
    import { getApp } from '../state/context.js';

    const app = getApp();
    let status = $derived(app.index.status);
    let bases = $derived(status?.bases ?? []);
    let discoveryEmpty = $derived(Boolean(status?.discoveryEmpty));
    let activeBaseId = $derived(status?.activeBaseId ?? '');

    function onBaseChange(event: Event): void {
        const value = (event.currentTarget as HTMLSelectElement).value;
        if (value) {
            app.selectBase(value);
        }
    }
</script>

<div class="status-row">
    {#if discoveryEmpty}
        <div class="base-switcher">
            <span class="muted">No base</span>
            <button type="button" class="action-button" onclick={() => app.createBase()}>Create Base</button>
        </div>
    {:else if bases.length > 0}
        <label class="base-switcher">
            <span class="muted">Base</span>
            <select value={activeBaseId} onchange={onBaseChange}>
                {#each bases as base (base.id)}
                    <option value={base.id}>{base.label}</option>
                {/each}
            </select>
        </label>
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
    .base-switcher select {
        max-width: 18rem;
        background: var(--vscode-dropdown-background);
        color: var(--vscode-dropdown-foreground);
        border: 1px solid var(--vscode-dropdown-border, transparent);
        padding: 0.15rem 0.35rem;
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
</style>
