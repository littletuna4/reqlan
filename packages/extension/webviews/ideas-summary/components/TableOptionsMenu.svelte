<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    export interface ColumnOption {
        id: string;
        label: string;
    }

    export let columns: ColumnOption[] = [];
    export let visibleColumns: string[] = [];

    const dispatch = createEventDispatcher<{ change: string[] }>();

    let open = false;

    function toggle(): void {
        open = !open;
    }

    function isVisible(id: string): boolean {
        return visibleColumns.includes(id);
    }

    function setVisible(id: string, visible: boolean): void {
        if (visible) {
            if (!visibleColumns.includes(id)) {
                dispatch('change', [...visibleColumns, id]);
            }
            return;
        }
        // Keep at least one column.
        if (visibleColumns.length <= 1) {
            return;
        }
        dispatch('change', visibleColumns.filter(column => column !== id));
    }

    function onWindowClick(event: MouseEvent): void {
        if (!open) {
            return;
        }
        const path = event.composedPath();
        const inside = path.some(node => node instanceof HTMLElement && node.classList?.contains('table-options'));
        if (!inside) {
            open = false;
        }
    }
</script>

<svelte:window on:click={onWindowClick} />

<div class="table-options">
    <button type="button" class="secondary options-button" on:click|stopPropagation={toggle}>
        Options
    </button>
    {#if open}
        <div class="options-menu" role="group" aria-label="Column visibility">
            <div class="options-title">Columns</div>
            {#each columns as column (column.id)}
                <label class="options-row">
                    <input
                        type="checkbox"
                        checked={isVisible(column.id)}
                        on:change={(event) => setVisible(column.id, (event.currentTarget as HTMLInputElement).checked)}
                    />
                    <span>{column.label}</span>
                </label>
            {/each}
        </div>
    {/if}
</div>
