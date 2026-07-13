<script lang="ts">
    import type { ReferenceListRow } from 'reqlan-analytical';
    import { getApp } from '../state/context.js';
    import CollapsiblePane from './CollapsiblePane.svelte';

    interface Props {
        expanded: boolean;
        onToggle: (id: string, expanded: boolean) => void;
    }
    let { expanded, onToggle }: Props = $props();

    const app = getApp();
    let payload = $derived(app.references);
    let kinds = $derived(payload ? Object.keys(payload.grouped).sort() : []);

    function openReference(row: ReferenceListRow): void {
        if (row.targetPath.startsWith('file:') || row.targetPath.includes('/')) {
            app.openIdea(row.targetPath, row.targetLine ?? 0);
            return;
        }
        const fileUri = row.direction === 'inbound' ? row.targetPath : row.targetPath;
        app.openIdea(fileUri, row.targetLine ?? 0);
    }
</script>

<CollapsiblePane title="References" id="references" {expanded} {onToggle}>
    <input
        class="filter-input"
        placeholder="Filter references…"
        bind:value={app.referenceSearch}
        oninput={() => app.onReferencesFilterChange()}
    />
    <label class="filter-checkbox">
        <input type="checkbox" bind:checked={app.brokenOnly} onchange={() => app.onReferencesFilterChange()} />
        Broken only
    </label>
    {#if !payload || payload.rows.length === 0}
        <p class="muted">No references for the focused idea.</p>
    {:else}
        {#each kinds as kind}
            <div class="ref-group">
                <h4>{kind} ({payload.grouped[kind]?.length ?? 0})</h4>
                <ul class="list">
                    {#each payload.grouped[kind] ?? [] as row}
                        <li>
                            <button class="link" onclick={() => openReference(row)}>
                                {row.direction === 'inbound' ? '← ' : '→ '}{row.label}
                                {#if !row.isResolved}<span class="badge">unresolved</span>{/if}
                            </button>
                            {#if row.snippet}
                                <div class="muted">{row.snippet}</div>
                            {/if}
                            <div class="section-actions">
                                {#if row.direction === 'inbound' ? row.sourceIdeaId : row.targetIdeaId}
                                    <button
                                        class="action-button"
                                        onclick={() => app.pinIdea((row.direction === 'inbound' ? row.sourceIdeaId : row.targetIdeaId)!)}
                                    >Pin</button>
                                {/if}
                            </div>
                        </li>
                    {/each}
                </ul>
            </div>
        {/each}
    {/if}
</CollapsiblePane>
