<script lang="ts">
    import type { BaseStatusView } from '../../../src/webview_module/shared/messages.js';
    import { baseOptionMeta, baseStatusHint, filterBases } from '../lib/filter-bases.js';

    interface Props {
        bases: BaseStatusView[];
        activeBaseId?: string;
        /** User-requested base while waiting for host confirmation. */
        pendingBaseId?: string;
        /** Active base is syncing / not ready — show loading on the trigger. */
        syncing?: boolean;
        syncLabel?: string;
        disabled?: boolean;
        onSelect: (baseId: string) => void;
    }

    let {
        bases,
        activeBaseId = '',
        pendingBaseId,
        syncing = false,
        syncLabel,
        disabled = false,
        onSelect
    }: Props = $props();

    let open = $state(false);
    let query = $state('');
    let highlightIndex = $state(0);
    let rootEl: HTMLDivElement | undefined = $state();
    let inputEl: HTMLInputElement | undefined = $state();

    let switching = $derived(Boolean(pendingBaseId));
    let busy = $derived(switching || syncing || disabled);
    let displayBaseId = $derived(pendingBaseId ?? activeBaseId);
    let activeBase = $derived(bases.find((base) => base.id === displayBaseId) ?? bases[0]);
    let filtered = $derived(filterBases(bases, query));
    let triggerHint = $derived.by(() => {
        if (switching && activeBase) {
            return 'Switching…';
        }
        if (syncing) {
            return syncLabel ?? 'Indexing…';
        }
        return activeBase ? baseStatusHint(activeBase) : '';
    });

    $effect(() => {
        void filtered;
        if (highlightIndex >= filtered.length) {
            highlightIndex = Math.max(0, filtered.length - 1);
        }
    });

    $effect(() => {
        if (open && inputEl) {
            inputEl.focus();
            inputEl.select();
        }
    });

    $effect(() => {
        // Close the menu once a switch is in flight so the trigger shows loading.
        if (switching && open) {
            open = false;
            query = '';
        }
    });

    function openPicker(): void {
        if (switching) {
            return;
        }
        query = '';
        const activeIndex = bases.findIndex((base) => base.id === (activeBase?.id ?? ''));
        highlightIndex = Math.max(0, activeIndex);
        open = true;
    }

    function closePicker(): void {
        open = false;
        query = '';
        highlightIndex = 0;
    }

    function toggle(): void {
        if (switching) {
            return;
        }
        if (open) {
            closePicker();
        } else {
            openPicker();
        }
    }

    function selectBase(baseId: string): void {
        if (switching) {
            return;
        }
        if (baseId === activeBaseId && !syncing) {
            closePicker();
            return;
        }
        onSelect(baseId);
        closePicker();
    }

    function onSearchKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.preventDefault();
            closePicker();
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (filtered.length === 0) {
                return;
            }
            highlightIndex = (highlightIndex + 1) % filtered.length;
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (filtered.length === 0) {
                return;
            }
            highlightIndex = (highlightIndex - 1 + filtered.length) % filtered.length;
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            const match = filtered[highlightIndex];
            if (match) {
                selectBase(match.id);
            }
        }
    }

    function onDocumentPointerDown(event: PointerEvent): void {
        if (!open || !rootEl) {
            return;
        }
        const target = event.target;
        if (target instanceof Node && !rootEl.contains(target)) {
            closePicker();
        }
    }
</script>

<svelte:window onpointerdown={onDocumentPointerDown} />

<div class="base-picker" class:busy bind:this={rootEl}>
    <span class="muted base-picker-label" id="base-picker-label">Base</span>
    <button
        type="button"
        class="base-picker-trigger"
        class:switching
        class:syncing
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-busy={busy}
        aria-labelledby="base-picker-label"
        disabled={switching}
        onclick={toggle}
    >
        {#if activeBase}
            <span class="base-picker-trigger-main">
                <span class="base-picker-trigger-label">{activeBase.label}</span>
                <span class="muted base-picker-trigger-hint" role="status">{triggerHint}</span>
            </span>
        {:else}
            <span class="muted">Select base</span>
        {/if}
        {#if busy}
            <span class="base-picker-spinner" aria-hidden="true"></span>
        {:else}
            <span class="base-picker-chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
        {/if}
    </button>

    {#if open}
        <div class="base-picker-panel">
            <input
                bind:this={inputEl}
                class="base-picker-search"
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-controls="base-picker-listbox"
                aria-expanded="true"
                aria-activedescendant={filtered[highlightIndex]
                    ? `base-option-${filtered[highlightIndex].id}`
                    : undefined}
                placeholder="Filter by name or path…"
                bind:value={query}
                onkeydown={onSearchKeydown}
            />
            <ul
                id="base-picker-listbox"
                class="base-picker-list"
                role="listbox"
                aria-label="Bases"
            >
                {#if filtered.length === 0}
                    <li class="muted base-picker-empty">No matching bases</li>
                {:else}
                    {#each filtered as base, index (base.id)}
                        <li role="presentation">
                            <button
                                type="button"
                                id={`base-option-${base.id}`}
                                role="option"
                                class="base-picker-option"
                                class:highlighted={index === highlightIndex}
                                class:selected={base.id === displayBaseId}
                                aria-selected={base.id === displayBaseId}
                                onmouseenter={() => (highlightIndex = index)}
                                onclick={() => selectBase(base.id)}
                            >
                                <span class="base-picker-option-label">{base.label}</span>
                                <span class="muted base-picker-option-path">{base.root}</span>
                                <span class="muted base-picker-option-meta">{baseOptionMeta(base)}</span>
                            </button>
                        </li>
                    {/each}
                {/if}
            </ul>
        </div>
    {/if}
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

    .base-picker-label {
        font-size: 0.85em;
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

    .base-picker-panel {
        position: absolute;
        z-index: 20;
        top: calc(100% + 2px);
        left: 0;
        right: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.3rem;
        border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border, transparent));
        border-radius: 2px;
        background: var(--vscode-dropdown-background, var(--vscode-sideBar-background));
        box-shadow: 0 4px 12px color-mix(in srgb, var(--vscode-widget-shadow, #000) 35%, transparent);
        max-height: min(16rem, 50vh);
    }

    .base-picker-search {
        width: 100%;
        min-width: 0;
        padding: 0.25rem 0.4rem;
        border: 1px solid var(--vscode-input-border, transparent);
        border-radius: 2px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        font: inherit;
    }

    .base-picker-search:focus {
        outline: 1px solid var(--vscode-focusBorder, #007fd4);
        outline-offset: -1px;
    }

    .base-picker-list {
        list-style: none;
        margin: 0;
        padding: 0;
        overflow-y: auto;
        max-height: 12rem;
        display: flex;
        flex-direction: column;
        gap: 1px;
    }

    .base-picker-empty {
        padding: 0.4rem 0.45rem;
        font-size: 0.9em;
    }

    .base-picker-option {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.05rem;
        width: 100%;
        text-align: left;
        padding: 0.35rem 0.45rem;
        border: none;
        border-radius: 2px;
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
    }

    .base-picker-option.highlighted,
    .base-picker-option:hover {
        background: var(--vscode-list-hoverBackground);
    }

    .base-picker-option.selected {
        background: color-mix(in srgb, var(--vscode-list-activeSelectionBackground) 40%, transparent);
    }

    .base-picker-option.selected.highlighted {
        background: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground, inherit);
    }

    .base-picker-option-label {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
    }

    .base-picker-option-path,
    .base-picker-option-meta {
        font-size: 0.85em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
    }
</style>
