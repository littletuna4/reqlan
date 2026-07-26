<script lang="ts">
    import type { IdeaSummary } from 'reqlan-analytical';

    interface Props {
        parentCount: number;
        outboundCount: number;
        inboundCount: number;
        dependentCount: number;
        parents?: IdeaSummary[];
        inbound?: IdeaSummary[];
        outbound?: IdeaSummary[];
        onOpenIdea?: (idea: IdeaSummary) => void;
    }

    let {
        parentCount,
        outboundCount,
        inboundCount,
        dependentCount,
        parents = [],
        inbound = [],
        outbound = [],
        onOpenIdea
    }: Props = $props();

    let open = $state(false);

    let rows = $derived.by(() => {
        const result: { dir: '↑' | '→' | '←' | '↓'; label: string; idea: IdeaSummary }[] = [];
        const seen = new Set<string>();
        for (const idea of parents) {
            seen.add(idea.id);
            result.push({ dir: '↑', label: 'Parent', idea });
        }
        for (const idea of outbound) {
            if (seen.has(idea.id)) {
                continue;
            }
            seen.add(idea.id);
            result.push({ dir: '→', label: 'Outbound', idea });
        }
        for (const idea of inbound) {
            if (seen.has(idea.id)) {
                continue;
            }
            seen.add(idea.id);
            // Non-parent inbound = dependents; show as ↓ to match the star arm.
            result.push({ dir: '↓', label: 'Dependent', idea });
        }
        return result;
    });

    let tooltip = $derived(
        [
            'Dependency pulse: click any arm or the centre to show/hide the reference table.',
            `↑ ${parentCount} parents · → ${outboundCount} outbound · ← ${inboundCount} inbound · ↓ ${dependentCount} dependents.`
        ].join(' ')
    );

    function toggle(): void {
        open = !open;
    }

    function handleRowClick(idea: IdeaSummary, event: MouseEvent): void {
        event.stopPropagation();
        onOpenIdea?.(idea);
    }
</script>

<div class="dependency-pulse-wrap">
    <button
        type="button"
        class="dependency-pulse"
        class:open
        title={tooltip}
        aria-expanded={open}
        aria-controls="dependency-pulse-table"
        onclick={toggle}
    >
        <span
            class="pulse-row"
            title="Parents ({parentCount}): upstream ideas that frame this one."
        >↑ {parentCount}</span>
        <span class="pulse-mid">
            <span title="Inbound ({inboundCount}): ideas that reference this focus.">←{inboundCount}</span>
            <span class="pulse-dot" title="Toggle reference table">●</span>
            <span title="Outbound ({outboundCount}): ideas this focus depends on.">{outboundCount}→</span>
        </span>
        <span
            class="pulse-row"
            title="Dependents ({dependentCount}): inbound referencers that are not parents."
        >↓ {dependentCount}</span>
    </button>

    {#if open}
        <div id="dependency-pulse-table" class="pulse-table-wrap" role="region" aria-label="Focus references">
            {#if rows.length === 0}
                <p class="muted empty">No related references for this focus.</p>
            {:else}
                <table class="pulse-table">
                    <thead>
                        <tr>
                            <th scope="col">Dir</th>
                            <th scope="col">Role</th>
                            <th scope="col">Idea</th>
                            <th scope="col">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each rows as row (row.dir + row.idea.id)}
                            <tr>
                                <td class="dir">{row.dir}</td>
                                <td class="role muted">{row.label}</td>
                                <td>
                                    {#if onOpenIdea}
                                        <button
                                            type="button"
                                            class="link"
                                            onclick={(event) => handleRowClick(row.idea, event)}
                                        >{row.idea.name}</button>
                                    {:else}
                                        {row.idea.name}
                                    {/if}
                                </td>
                                <td class="muted">{row.idea.status ?? '—'}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/if}
        </div>
    {/if}
</div>

<style>
    .dependency-pulse-wrap {
        margin: 4px 0 8px;
    }
    .dependency-pulse {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        font-size: 0.85em;
        margin: 0;
        padding: 4px 8px;
        color: var(--vscode-descriptionForeground);
        background: transparent;
        border: 1px solid transparent;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        line-height: inherit;
    }
    .dependency-pulse:hover,
    .dependency-pulse.open {
        border-color: var(--vscode-focusBorder, var(--vscode-panel-border));
        background: var(--vscode-list-hoverBackground, rgba(127, 127, 127, 0.1));
    }
    .dependency-pulse:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 1px;
    }
    .pulse-mid {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .pulse-dot {
        color: var(--vscode-textLink-foreground);
    }
    .pulse-row {
        text-align: center;
    }
    .pulse-table-wrap {
        margin-top: 6px;
        max-height: 160px;
        overflow: auto;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 2px;
    }
    .pulse-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.75em;
    }
    .pulse-table th,
    .pulse-table td {
        text-align: left;
        padding: 3px 6px;
        border-bottom: 1px solid var(--vscode-panel-border);
        vertical-align: top;
    }
    .pulse-table th {
        position: sticky;
        top: 0;
        background: var(--vscode-sideBar-background, var(--vscode-editor-background));
        color: var(--vscode-descriptionForeground);
        font-weight: 600;
    }
    .pulse-table tr:last-child td {
        border-bottom: none;
    }
    .dir {
        width: 1.5em;
        text-align: center;
        color: var(--vscode-textLink-foreground);
    }
    .role {
        white-space: nowrap;
    }
    .empty {
        margin: 6px 8px;
        font-size: 0.75em;
    }
</style>
