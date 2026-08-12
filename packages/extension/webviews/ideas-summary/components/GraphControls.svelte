<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { GraphViewQuery } from '../../../src/webview_module/shared/messages.js';
    import type {
        GraphUiFileTreatment,
        GraphUiLabelMode
    } from '../../../src/webview_module/shared/graph-ui-state.js';
    import SearchableCheckboxDropdown from './SearchableCheckboxDropdown.svelte';
    import FileTreatmentSelect from './FileTreatmentSelect.svelte';

    export let query: GraphViewQuery;
    export let showKey = false;
    export let showControls = false;
    export let labelMode: GraphUiLabelMode = 'auto';
    export let fileTreatment: GraphUiFileTreatment = 'linked';
    export let statusOptions: string[] = [];
    export let tagOptions: string[] = [];
    export let statusOptionCounts: Record<string, number> = {};
    export let tagOptionCounts: Record<string, number> = {};
    export let filtersLoading = false;

    const dispatch = createEventDispatcher<{
        search: string;
        pathFilter: string;
        statusFilter: string[];
        tagFilter: string[];
        toggleIndirect: void;
        toggleWildcardRefs: void;
        clearCenter: void;
        toggleKey: void;
        toggleControls: void;
        cycleLabelMode: void;
        fileTreatmentChange: GraphUiFileTreatment;
        reframeView: void;
    }>();

    function emitInput(field: 'pathFilter', event: Event): void {
        dispatch(field, (event.currentTarget as HTMLInputElement).value);
    }

    function labelModeText(mode: GraphUiLabelMode): string {
        return mode === 'auto' ? 'Labels: auto' : mode === 'on' ? 'Labels: on' : 'Labels: off';
    }

    $: labelPressed = labelMode === 'auto' ? 'mixed' : labelMode === 'on' ? 'true' : 'false';
</script>

<div class="graph-controls">
    <section class="graph-controls-section" aria-label="Filters">
        <input
            class="graph-filter"
            type="search"
            placeholder="Path filter…"
            value={query.pathFilter ?? ''}
            oninput={(event) => emitInput('pathFilter', event)}
        />
        <SearchableCheckboxDropdown
            label="Status"
            options={statusOptions}
            optionCounts={statusOptionCounts}
            selected={query.statusFilter ?? []}
            placeholder="Search statuses…"
            loading={filtersLoading}
            on:change={(event) => dispatch('statusFilter', event.detail)}
        />
        <SearchableCheckboxDropdown
            label="Tags"
            options={tagOptions}
            optionCounts={tagOptionCounts}
            selected={query.tagFilter ?? []}
            placeholder="Search tags…"
            loading={filtersLoading}
            on:change={(event) => dispatch('tagFilter', event.detail)}
        />
        <button
            type="button"
            class="graph-chip"
            class:active={query.includeIndirect}
            aria-pressed={query.includeIndirect}
            onclick={() => dispatch('toggleIndirect')}
        >
            Indirect refs
        </button>
        <button
            type="button"
            class="graph-chip"
            class:active={query.includeWildcardRefs !== false}
            aria-pressed={query.includeWildcardRefs !== false}
            title="Show edges expanded from path+idea wildcard references"
            onclick={() => dispatch('toggleWildcardRefs')}
        >
            Wildcard refs
        </button>
    </section>

    <span class="graph-controls-sep" aria-hidden="true"></span>

    <section class="graph-controls-section graph-controls-actions" aria-label="View">
        {#if query.centerId}
            <button type="button" class="graph-action" onclick={() => dispatch('clearCenter')}>
                Clear focus
            </button>
        {/if}
        <button
            type="button"
            class="graph-action"
            class:active={labelMode !== 'off'}
            aria-pressed={labelPressed}
            data-label-mode={labelMode}
            title="Cycle label visibility: auto (fade when zoomed out), on, off"
            onclick={() => dispatch('cycleLabelMode')}
        >
            {labelModeText(labelMode)}
        </button>
        <FileTreatmentSelect
            value={fileTreatment}
            on:change={(event) => dispatch('fileTreatmentChange', event.detail)}
        />
        <button
            type="button"
            class="graph-action"
            class:active={showControls}
            aria-pressed={showControls}
            onclick={() => dispatch('toggleControls')}
        >
            Controls
        </button>
        <button
            type="button"
            class="graph-action"
            class:active={showKey}
            aria-pressed={showKey}
            onclick={() => dispatch('toggleKey')}
        >
            Key
        </button>
        <button
            type="button"
            class="graph-action"
            title="Fit all nodes into the viewport and center the camera"
            onclick={() => dispatch('reframeView')}
        >
            Fit to view
        </button>
    </section>
</div>
