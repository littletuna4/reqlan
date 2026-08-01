<script lang="ts">
    import type { ReferenceListRow } from '@reqlan/analytical';
    import { getApp } from '../state/context.js';
    import CollapsiblePane from './CollapsiblePane.svelte';
    import NestedSection from './NestedSection.svelte';
    import PaneStatus from './PaneStatus.svelte';

    interface Props {
        expanded: boolean;
        onToggle: (id: string, expanded: boolean) => void;
    }
    let { expanded, onToggle }: Props = $props();

    const app = getApp();
    let payload = $derived(app.references);
    let kinds = $derived(payload ? Object.keys(payload.grouped).sort() : []);

    function openReference(row: ReferenceListRow): void {
        if (!row.isResolved || !row.targetPath) {
            return;
        }
        app.openIdea(row.targetPath, row.targetLine ?? 0);
    }

    function createUnresolved(row: ReferenceListRow): void {
        app.createStubIdea(row.sourceIdeaId, row.label);
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
    <PaneStatus
        loading={app.referencesLoading}
        error={app.referencesError}
        empty={!payload || payload.rows.length === 0}
        loadingText="Loading references…"
        emptyText="No references for the focused idea."
    >
        {#each kinds as kind}
            {@const rows = payload?.grouped[kind] ?? []}
            <NestedSection title={kind} count={rows.length} defaultExpanded={kinds.length <= 2}>
                <ul class="list">
                    {#each rows as row}
                        <li>
                            {#if row.isResolved}
                                <button class="link" onclick={() => openReference(row)}>
                                    {row.direction === 'inbound' ? '← ' : '→ '}{row.label}
                                </button>
                            {:else}
                                <span class="unresolved-label">
                                    {row.direction === 'inbound' ? '← ' : '→ '}{row.label}
                                    <span class="badge">unresolved</span>
                                </span>
                                {#if row.direction === 'outbound'}
                                    <button
                                        type="button"
                                        class="create-idea-button"
                                        title="Create idea"
                                        aria-label="Create idea {row.label}"
                                        onclick={() => createUnresolved(row)}
                                    >+</button>
                                {/if}
                            {/if}
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
            </NestedSection>
        {/each}
    </PaneStatus>
</CollapsiblePane>

<style>
    .unresolved-label {
        display: inline;
        color: var(--vscode-descriptionForeground);
    }

    .create-idea-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.25rem;
        height: 1.25rem;
        margin-left: 0.25rem;
        padding: 0;
        border: 1px solid var(--vscode-button-border, transparent);
        border-radius: 2px;
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        cursor: pointer;
        font-size: 0.85rem;
        line-height: 1;
        vertical-align: middle;
    }

    .create-idea-button:hover {
        background: var(--vscode-button-secondaryHoverBackground);
    }
</style>
