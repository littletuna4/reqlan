<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { GraphViewQuery } from '../../../src/webview_module/shared/messages.js';

    export let query: GraphViewQuery;
    export let showKey = false;
    export let showControls = false;

    const dispatch = createEventDispatcher<{
        search: string;
        pathFilter: string;
        statusFilter: string;
        tagFilter: string;
        toggleIndirect: void;
        clearCenter: void;
        toggleKey: void;
        toggleControls: void;
        reframeView: void;
    }>();

    function emitInput(field: 'pathFilter' | 'statusFilter' | 'tagFilter', event: Event): void {
        dispatch(field, (event.currentTarget as HTMLInputElement).value);
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

    <section class="graph-controls-section graph-controls-actions" aria-label="View">
        {#if query.centerId}
            <button type="button" class="graph-action" on:click={() => dispatch('clearCenter')}>
                Clear focus
            </button>
        {/if}
        <button
            type="button"
            class="graph-action"
            class:active={showControls}
            aria-pressed={showControls}
            on:click={() => dispatch('toggleControls')}
        >
            Controls
        </button>
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
