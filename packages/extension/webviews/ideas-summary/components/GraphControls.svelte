<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { GraphViewQuery } from '../../../src/webview_module/shared/messages.js';
    import {
        DEFAULT_LAYOUT_ID,
        GRAPH_LAYOUT_OPTIONS,
        GRAPH_COMPOUND_BASIS_OPTIONS
    } from '../lib/graph-cytoscape.js';

    export let query: GraphViewQuery;
    export let layoutId = DEFAULT_LAYOUT_ID;
    export let animatePhysics = false;
    export let useCompound = false;
    export let compoundBasisId = 'folder-path';
    export let showKey = false;

    const dispatch = createEventDispatcher<{
        search: string;
        pathFilter: string;
        statusFilter: string;
        tagFilter: string;
        toggleIndirect: void;
        layoutChange: string;
        toggleAnimatePhysics: void;
        toggleCompound: void;
        compoundBasisChange: string;
        clearCenter: void;
        toggleKey: void;
        reframeView: void;
    }>();

    const layoutOptions = GRAPH_LAYOUT_OPTIONS;
    const compoundBasisOptions = GRAPH_COMPOUND_BASIS_OPTIONS;

    function emitInput(field: 'pathFilter' | 'statusFilter' | 'tagFilter', event: Event): void {
        dispatch(field, (event.currentTarget as HTMLInputElement).value);
    }

    function handleLayoutChange(event: Event): void {
        dispatch('layoutChange', (event.currentTarget as HTMLSelectElement).value);
    }

    function handleCompoundBasisChange(event: Event): void {
        dispatch('compoundBasisChange', (event.currentTarget as HTMLSelectElement).value);
    }
</script>

<div class="graph-controls">
    <section class="graph-controls-section" aria-label="Filters">
        <input
            class="graph-filter"
            type="search"
            placeholder="Path filter…"
            value={query.pathFilter ?? ''}
            on:input={(event) => emitInput('pathFilter', event)}
        />
        <input
            class="graph-filter"
            type="search"
            placeholder="Status…"
            value={query.statusFilter ?? ''}
            on:input={(event) => emitInput('statusFilter', event)}
        />
        <input
            class="graph-filter"
            type="search"
            placeholder="Tag…"
            value={query.tagFilter ?? ''}
            on:input={(event) => emitInput('tagFilter', event)}
        />
        <button
            type="button"
            class="graph-chip"
            class:active={query.includeIndirect}
            aria-pressed={query.includeIndirect}
            on:click={() => dispatch('toggleIndirect')}
        >
            Indirect refs
        </button>
    </section>

    <span class="graph-controls-sep" aria-hidden="true"></span>

    <section class="graph-controls-section" aria-label="Layout">
        <label class="graph-control">
            <span class="graph-control-label">Layout</span>
            <select class="graph-select" value={layoutId} on:change={handleLayoutChange}>
                {#each layoutOptions as option (option.id)}
                    <option value={option.id}>{option.label}</option>
                {/each}
            </select>
        </label>
        <button
            type="button"
            class="graph-chip"
            class:active={animatePhysics}
            aria-pressed={animatePhysics}
            title="Keep force-directed layout animating continuously"
            on:click={() => dispatch('toggleAnimatePhysics')}
        >
            Animate
        </button>
        <button
            type="button"
            class="graph-chip"
            class:active={useCompound}
            aria-pressed={useCompound}
            on:click={() => dispatch('toggleCompound')}
        >
            Compound
        </button>
        {#if useCompound}
            <label class="graph-control">
                <span class="graph-control-label">Group by</span>
                <select class="graph-select" value={compoundBasisId} on:change={handleCompoundBasisChange}>
                    {#each compoundBasisOptions as option (option.id)}
                        <option value={option.id}>{option.label}</option>
                    {/each}
                </select>
            </label>
        {/if}
    </section>

    <span class="graph-controls-sep" aria-hidden="true"></span>

    <section class="graph-controls-section graph-controls-actions" aria-label="View">
        {#if query.centerId}
            <button type="button" class="graph-action" on:click={() => dispatch('clearCenter')}>
                Clear focus
            </button>
        {/if}
        <button
            type="button"
            class="graph-action"
            class:active={showKey}
            aria-pressed={showKey}
            on:click={() => dispatch('toggleKey')}
        >
            Key
        </button>
        <button
            type="button"
            class="graph-action"
            title="Fit all nodes into the viewport and center the camera"
            on:click={() => dispatch('reframeView')}
        >
            Fit to view
        </button>
    </section>
</div>
