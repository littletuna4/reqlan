<script lang="ts">
    import { createEventDispatcher, onDestroy, onMount } from 'svelte';
    import type { GraphUiFileTreatment } from '../../../src/webview_module/shared/graph-ui-state.js';
    import {
        FILE_TREATMENT_OPTIONS,
        fileTreatmentLabel,
        type FileTreatment
    } from '../../shared/graph/file-treatment.js';
    import {
        announceScdOpened,
        subscribeScdOpened
    } from '../lib/searchable-checkbox-dropdown.js';

    export let value: GraphUiFileTreatment = 'linked';

    const dispatch = createEventDispatcher<{ change: GraphUiFileTreatment }>();

    let open = false;
    let rootEl: HTMLDivElement | undefined;
    let listenersBound = false;
    let unsubscribeOpen: (() => void) | undefined;

    function close(): void {
        if (!open) {
            return;
        }
        open = false;
        unbindOutsideListeners();
    }

    function openPanel(): void {
        open = true;
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

    function select(mode: FileTreatment): void {
        dispatch('change', mode);
        close();
    }

    function onDocumentPointerDown(event: PointerEvent): void {
        if (!rootEl || rootEl.contains(event.target as Node)) {
            return;
        }
        close();
    }

    function onDocumentKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            close();
        }
    }

    function bindOutsideListeners(): void {
        if (listenersBound) {
            return;
        }
        listenersBound = true;
        document.addEventListener('pointerdown', onDocumentPointerDown, true);
        document.addEventListener('keydown', onDocumentKeyDown, true);
    }

    function unbindOutsideListeners(): void {
        if (!listenersBound) {
            return;
        }
        listenersBound = false;
        document.removeEventListener('pointerdown', onDocumentPointerDown, true);
        document.removeEventListener('keydown', onDocumentKeyDown, true);
    }

    onMount(() => {
        unsubscribeOpen = subscribeScdOpened(el => {
            if (el !== rootEl) {
                close();
            }
        });
    });

    onDestroy(() => {
        unsubscribeOpen?.();
        unbindOutsideListeners();
    });
</script>

<div class="ftd" class:is-open={open} class:is-active={value !== 'invisible'} bind:this={rootEl}>
    <button
        type="button"
        class="ftd-trigger graph-action"
        class:active={value !== 'invisible'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-pressed={value !== 'invisible'}
        title="How hosting .rq files appear in the graph"
        onclick={toggleOpen}
    >
        <span class="ftd-trigger-label">{fileTreatmentLabel(value)}</span>
        <span class="ftd-chevron" aria-hidden="true">▾</span>
    </button>
    {#if open}
        <div class="ftd-panel" role="listbox" aria-label="File treatment">
            {#each FILE_TREATMENT_OPTIONS as option (option.id)}
                <button
                    type="button"
                    class="ftd-option"
                    class:is-selected={value === option.id}
                    role="option"
                    aria-selected={value === option.id}
                    title={option.description}
                    onclick={() => select(option.id)}
                >
                    <span class="ftd-option-main">
                        <span class="ftd-option-label">{option.label}</span>
                        <span
                            class="ftd-option-info"
                            title={option.description}
                            aria-label={option.description}
                        >ⓘ</span>
                    </span>
                    <span class="ftd-option-hint">{option.description}</span>
                </button>
            {/each}
        </div>
    {/if}
</div>
