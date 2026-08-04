<script lang="ts">
    import { createEventDispatcher, onDestroy, onMount } from 'svelte';
    import {
        announceScdOpened,
        filterOptionsByQuery,
        optionClassName,
        partitionFilterOptions,
        subscribeScdOpened,
        summarizeFilterSelection,
        type CheckboxFilterOption
    } from '../lib/searchable-checkbox-dropdown.js';

    export let label = 'Filter';
    export let options: string[] = [];
    export let selected: string[] = [];
    export let optionCounts: Record<string, number> = {};
    export let placeholder = 'Search…';
    /** When true, show a placeholder trigger and defer heavy option work. */
    export let loading = false;

    const dispatch = createEventDispatcher<{ change: string[] }>();

    let open = false;
    /** Search focus / typed query — distinct from merely having the panel open. */
    let searching = false;
    let query = '';
    let rootEl: HTMLDivElement | undefined;
    let searchEl: HTMLInputElement | undefined;
    let listenersBound = false;
    let unsubscribeOpen: (() => void) | undefined;

    let openSpecials: CheckboxFilterOption[] = [];
    let openConcretes: CheckboxFilterOption[] = [];

    function rebuildOpenOptions(): void {
        const parts = partitionFilterOptions(options, optionCounts);
        openSpecials = filterOptionsByQuery(parts.specials, query);
        openConcretes = filterOptionsByQuery(parts.concretes, query);
    }

    function toggleValue(value: string): void {
        const next = selected.includes(value)
            ? selected.filter(entry => entry !== value)
            : [...selected, value];
        dispatch('change', next);
    }

    function clearAll(): void {
        dispatch('change', []);
    }

    function endSearching(): void {
        searching = false;
        query = '';
        if (searchEl && document.activeElement === searchEl) {
            searchEl.blur();
        }
    }

    function close(): void {
        if (!open) {
            return;
        }
        open = false;
        endSearching();
        unbindOutsideListeners();
    }

    function openPanel(): void {
        open = true;
        searching = false;
        rebuildOpenOptions();
        bindOutsideListeners();
        if (rootEl) {
            announceScdOpened(rootEl);
        }
    }

    function toggleOpen(): void {
        if (open) {
            close();
        } else {
            openPanel();
        }
    }

    function onSearchFocus(): void {
        searching = true;
    }

    function onSearchBlur(): void {
        if (!query.trim()) {
            searching = false;
        }
    }

    function onDocPointerDown(event: PointerEvent): void {
        if (!rootEl?.contains(event.target as Node)) {
            close();
        }
    }

    function onKeyDown(event: KeyboardEvent): void {
        if (event.key !== 'Escape' || !open) {
            return;
        }
        if (searching || query.trim()) {
            endSearching();
            rebuildOpenOptions();
            event.stopPropagation();
            return;
        }
        close();
    }

    function bindOutsideListeners(): void {
        if (listenersBound || typeof document === 'undefined') {
            return;
        }
        document.addEventListener('pointerdown', onDocPointerDown);
        document.addEventListener('keydown', onKeyDown);
        listenersBound = true;
    }

    function unbindOutsideListeners(): void {
        if (!listenersBound || typeof document === 'undefined') {
            return;
        }
        document.removeEventListener('pointerdown', onDocPointerDown);
        document.removeEventListener('keydown', onKeyDown);
        listenersBound = false;
    }

    onMount(() => {
        unsubscribeOpen = subscribeScdOpened(source => {
            if (open && source && source !== rootEl) {
                close();
            }
        });
    });

    onDestroy(() => {
        unbindOutsideListeners();
        unsubscribeOpen?.();
    });

    $: selectedSet = new Set(selected);
    $: triggerText = loading && selected.length === 0
        ? `${label}…`
        : summarizeFilterSelection(label, selected);
    $: if (open) {
        void options;
        void optionCounts;
        void query;
        rebuildOpenOptions();
    }
</script>

<div
    class="scd"
    class:is-open={open}
    class:is-searching={searching}
    class:has-selection={selected.length > 0}
    class:is-loading={loading}
    bind:this={rootEl}
>
    <button
        type="button"
        class="scd-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-busy={loading}
        onclick={toggleOpen}
    >
        <span class="scd-trigger-label">{triggerText}</span>
        <span class="scd-chevron" aria-hidden="true"></span>
    </button>

    {#if open}
        <div class="scd-panel" role="listbox" aria-label={label} aria-multiselectable="true">
            <div class="scd-search-row" class:is-active={searching}>
                <input
                    bind:this={searchEl}
                    class="scd-search"
                    type="search"
                    {placeholder}
                    bind:value={query}
                    aria-label="Search {label}"
                    onfocus={onSearchFocus}
                    onblur={onSearchBlur}
                    oninput={() => {
                        if (query.trim()) {
                            searching = true;
                        }
                    }}
                />
                {#if selected.length > 0}
                    <button type="button" class="scd-clear" onclick={clearAll}>Clear</button>
                {/if}
            </div>

            <div class="scd-list">
                {#if openSpecials.length}
                    <div class="scd-group-label">Special</div>
                    {#each openSpecials as option (option.value)}
                        <label class={optionClassName(option.kind)}>
                            <input
                                type="checkbox"
                                checked={selectedSet.has(option.value)}
                                onchange={() => toggleValue(option.value)}
                            />
                            <span class="scd-option-label">{option.label}</span>
                            {#if typeof option.count === 'number'}
                                <span class="scd-option-count">{option.count}</span>
                            {/if}
                        </label>
                    {/each}
                {/if}

                {#if openConcretes.length}
                    <div class="scd-group-label">{label}</div>
                    {#each openConcretes as option (option.value)}
                        <label class={optionClassName(option.kind)}>
                            <input
                                type="checkbox"
                                checked={selectedSet.has(option.value)}
                                onchange={() => toggleValue(option.value)}
                            />
                            <span class="scd-option-label">{option.label}</span>
                            {#if typeof option.count === 'number'}
                                <span class="scd-option-count">{option.count}</span>
                            {/if}
                        </label>
                    {/each}
                {/if}

                {#if loading && openConcretes.length === 0}
                    <p class="scd-empty">Loading options…</p>
                {:else if openSpecials.length === 0 && openConcretes.length === 0}
                    <p class="scd-empty">No matches</p>
                {/if}
            </div>
        </div>
    {/if}
</div>
