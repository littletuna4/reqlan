<script lang="ts">
    import type { BaseStatusView } from '../../../src/webview_module/shared/messages.js';
    import { baseStatusHint } from '../lib/filter-bases.js';

    interface Props {
        bases: BaseStatusView[];
        activeBaseId?: string;
        /** User-requested base while waiting for host confirmation. */
        pendingBaseId?: string;
        /** Active base is syncing / not ready — show loading on the trigger. */
        syncing?: boolean;
        syncLabel?: string;
        disabled?: boolean;
        basesRefreshing?: boolean;
        /** Open the host QuickPick dialog to choose a base. */
        onOpenDialog: () => void;
        /** Rediscover bases (prune + marker find) without soft-syncing the index. */
        onRefreshBases: () => void;
    }

    let {
        bases,
        activeBaseId = '',
        pendingBaseId,
        syncing = false,
        syncLabel,
        disabled = false,
        basesRefreshing = false,
        onOpenDialog,
        onRefreshBases
    }: Props = $props();

    let switching = $derived(Boolean(pendingBaseId));
    let busy = $derived(switching || syncing || disabled || basesRefreshing);
    let displayBaseId = $derived(pendingBaseId ?? activeBaseId);
    let activeBase = $derived(bases.find((base) => base.id === displayBaseId) ?? bases[0]);
    let triggerHint = $derived.by(() => {
        if (basesRefreshing) {
            return 'Refreshing bases…';
        }
        if (switching && activeBase) {
            return 'Switching…';
        }
        if (syncing) {
            return syncLabel ?? 'Indexing…';
        }
        return activeBase ? baseStatusHint(activeBase) : '';
    });

    function openDialog(): void {
        if (switching || basesRefreshing) {
            return;
        }
        onOpenDialog();
    }
</script>

<div class="base-picker" class:busy>
    <div class="base-picker-header">
        <span class="muted base-picker-label" id="base-picker-label">Base</span>
        <button
            type="button"
            class="base-picker-refresh"
            title="Refresh bases"
            aria-label="Refresh bases"
            disabled={basesRefreshing || switching}
            onclick={() => onRefreshBases()}
        >
            {#if basesRefreshing}
                <span class="base-picker-spinner" aria-hidden="true"></span>
            {:else}
                ↻
            {/if}
        </button>
    </div>
    <button
        type="button"
        class="base-picker-trigger"
        class:switching
        class:syncing
        aria-haspopup="dialog"
        aria-busy={busy}
        aria-labelledby="base-picker-label"
        disabled={switching || basesRefreshing}
        onclick={openDialog}
    >
        {#if activeBase}
            <span class="base-picker-trigger-main">
                <span class="base-picker-trigger-label">{activeBase.label}</span>
                <span class="muted base-picker-trigger-hint" role="status">{triggerHint}</span>
            </span>
        {:else}
            <span class="muted">Select base…</span>
        {/if}
        {#if busy}
            <span class="base-picker-spinner" aria-hidden="true"></span>
        {:else}
            <span class="base-picker-chevron" aria-hidden="true">▾</span>
        {/if}
    </button>
</div>

<style>
    .base-picker {
        position: relative;
        margin: 0 0 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
    }

    .base-picker-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.35rem;
        min-width: 0;
    }

    .base-picker-label {
        font-size: 0.85em;
    }

    .base-picker-refresh {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.4rem;
        height: 1.4rem;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 2px;
        background: transparent;
        color: var(--vscode-foreground);
        font: inherit;
        font-size: 0.95em;
        line-height: 1;
        cursor: pointer;
        opacity: 0.8;
    }

    .base-picker-refresh:hover:not(:disabled) {
        opacity: 1;
        background: var(--vscode-toolbar-hoverBackground, transparent);
    }

    .base-picker-refresh:focus-visible {
        outline: 1px solid var(--vscode-focusBorder, #007fd4);
        outline-offset: -1px;
    }

    .base-picker-refresh:disabled {
        cursor: progress;
        opacity: 0.6;
    }

    .base-picker-trigger {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        width: 100%;
        min-width: 0;
        text-align: left;
        padding: 0.3rem 0.45rem;
        border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border, transparent));
        border-radius: 2px;
        background: var(--vscode-dropdown-background, var(--vscode-input-background));
        color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
        font: inherit;
        cursor: pointer;
    }

    .base-picker-trigger:hover:not(:disabled) {
        background: color-mix(in srgb, var(--vscode-list-hoverBackground) 70%, var(--vscode-dropdown-background, transparent));
    }

    .base-picker-trigger:focus-visible {
        outline: 1px solid var(--vscode-focusBorder, #007fd4);
        outline-offset: -1px;
    }

    .base-picker-trigger:disabled,
    .base-picker-trigger.switching {
        cursor: progress;
        opacity: 0.85;
    }

    .base-picker-trigger.syncing {
        border-color: var(--vscode-focusBorder, #007fd4);
    }

    .base-picker-trigger-main {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.05rem;
        min-width: 0;
        flex: 1;
    }

    .base-picker-trigger-label {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
    }

    .base-picker-trigger-hint {
        font-size: 0.85em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
    }

    .base-picker-chevron {
        flex-shrink: 0;
        opacity: 0.7;
        font-size: 0.75em;
    }

    .base-picker-spinner {
        flex-shrink: 0;
        width: 0.75rem;
        height: 0.75rem;
        border: 2px solid color-mix(in srgb, var(--vscode-foreground) 25%, transparent);
        border-top-color: var(--vscode-foreground);
        border-radius: 50%;
        animation: base-picker-spin 0.7s linear infinite;
    }

    @keyframes base-picker-spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
