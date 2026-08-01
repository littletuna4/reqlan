<script lang="ts">
    import type {
        ContextAnomaly,
        ContextDimensionId,
        ContextFileEntry,
        ContextFingerprintAxes,
        IdeaSummary,
        ReqlanContextModel
    } from '@reqlan/analytical';
    import { CONTEXT_DIMENSION_LABELS } from '@reqlan/analytical/context-model';
    import {
        CONTEXT_FINGERPRINT_AXIS_HELP,
        CONTEXT_FINGERPRINT_HELP,
        fingerprintAxisTooltip
    } from '@reqlan/analytical/context-signals';

    interface Props {
        axes: ContextFingerprintAxes;
        model: ReqlanContextModel;
        /** Upstream parents for the architecture axis (from ancestor chain). */
        parents?: IdeaSummary[];
        onOpenIdea?: (ideaId: string) => void;
        onOpenFile?: (fileUri: string, line?: number) => void;
        onAnomaly?: (action?: ContextAnomaly['action']) => void;
    }

    let { axes, model, parents = [], onOpenIdea, onOpenFile, onAnomaly }: Props = $props();

    let helpOpen = $state(false);
    let expandedAxis = $state<keyof ContextFingerprintAxes | undefined>(undefined);

    const rows: { key: keyof ContextFingerprintAxes; label: string }[] = [
        { key: 'files', label: 'Files' },
        { key: 'requirements', label: 'Requirements' },
        { key: 'history', label: 'History' },
        { key: 'architecture', label: 'Architecture' },
        { key: 'git', label: 'Git' },
        { key: 'diagnostics', label: 'Diagnostics' },
        { key: 'coverage', label: 'Coverage' }
    ];

    type DrillRow = {
        id: string;
        source: string;
        item: string;
        detail: string;
        ideaId?: string;
        fileUri?: string;
        line?: number;
        anomalyAction?: ContextAnomaly['action'];
    };

    function pct(value: number): number {
        return Math.round(Math.min(1, Math.max(0, value)) * 100);
    }

    function fileLabel(uri: string): string {
        const known = [
            ...(model.currentFile ? [{ fileUri: model.currentFile.fileUri, fileLabel: model.currentFile.fileLabel }] : []),
            ...model.openFiles,
            ...model.fileHistory,
            ...model.editHistory,
            ...(model.git?.changedFiles ?? [])
        ].find(entry => entry.fileUri === uri);
        if (known?.fileLabel) {
            return known.fileLabel;
        }
        try {
            const path = decodeURIComponent(uri.replace(/^file:\/\//, ''));
            const parts = path.split(/[/\\]/).filter(Boolean);
            return parts[parts.length - 1] ?? uri;
        } catch {
            return uri;
        }
    }

    function dimLabel(id: ContextDimensionId): string {
        return CONTEXT_DIMENSION_LABELS[id] ?? id;
    }

    function sourcesForFile(uri: string): string {
        const sources = model.footprint.provenance.fileSources[uri] ?? [];
        return sources.length > 0 ? sources.map(dimLabel).join(', ') : '—';
    }

    function sourcesForIdea(id: string): string {
        const sources = model.footprint.provenance.ideaSources[id] ?? [];
        return sources.length > 0 ? sources.map(dimLabel).join(', ') : '—';
    }

    let ideaIndex = $derived.by(() => {
        const map = new Map<string, IdeaSummary>();
        const add = (idea?: IdeaSummary) => {
            if (idea) {
                map.set(idea.id, idea);
            }
        };
        const slice = model.currentFile;
        if (slice) {
            add(slice.focusIdea);
            for (const idea of [
                ...slice.ideasInFile,
                ...slice.referencingIdeas,
                ...slice.inboundReferencingIdeas,
                ...slice.referencedIdeas,
                ...slice.commentLinkedIdeas,
                ...slice.folderReferencingIdeas
            ]) {
                add(idea);
            }
        }
        for (const idea of model.manualIdeas) {
            add(idea);
        }
        for (const idea of model.selection?.ideas ?? []) {
            add(idea);
        }
        return map;
    });

    function historyKind(file: ContextFileEntry): string {
        if (file.sources.includes('edit_history')) {
            return 'Edited';
        }
        if (file.sources.includes('file_history')) {
            return 'Visited';
        }
        return file.sources.map(dimLabel).join(', ') || 'History';
    }

    function whenLabel(touchedAt?: number): string {
        if (touchedAt === undefined) {
            return '—';
        }
        try {
            return new Date(touchedAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return '—';
        }
    }

    let drillRows = $derived.by((): DrillRow[] => {
        if (!expandedAxis) {
            return [];
        }
        const slice = model.currentFile;
        switch (expandedAxis) {
            case 'files':
                return model.footprint.fileUris.map(uri => ({
                    id: `file:${uri}`,
                    source: sourcesForFile(uri),
                    item: fileLabel(uri),
                    detail: uri === slice?.fileUri ? 'Active editor' : 'In footprint',
                    fileUri: uri
                }));
            case 'requirements':
                return model.footprint.ideaIds.map(id => {
                    const idea = ideaIndex.get(id);
                    return {
                        id: `idea:${id}`,
                        source: sourcesForIdea(id),
                        item: idea?.name ?? id.split('#').pop() ?? id,
                        detail: idea?.status ? `@${idea.status}` : 'In footprint',
                        ideaId: id,
                        fileUri: idea?.fileUri,
                        line: idea?.lineStart
                    };
                });
            case 'history': {
                const seen = new Set<string>();
                const out: DrillRow[] = [];
                for (const file of [...model.editHistory, ...model.fileHistory]) {
                    if (seen.has(file.fileUri)) {
                        continue;
                    }
                    seen.add(file.fileUri);
                    out.push({
                        id: `hist:${file.fileUri}`,
                        source: historyKind(file),
                        item: file.fileLabel,
                        detail: whenLabel(file.touchedAt),
                        fileUri: file.fileUri,
                        line: file.line
                    });
                }
                return out;
            }
            case 'architecture': {
                const out: DrillRow[] = [];
                const seen = new Set<string>();
                for (const idea of parents) {
                    seen.add(idea.id);
                    out.push({
                        id: `arch-parent:${idea.id}`,
                        source: 'Parent',
                        item: idea.name,
                        detail: idea.status ? `@${idea.status}` : 'Upstream',
                        ideaId: idea.id,
                        fileUri: idea.fileUri,
                        line: idea.lineStart
                    });
                }
                for (const idea of slice?.referencedIdeas ?? []) {
                    if (seen.has(idea.id)) {
                        continue;
                    }
                    seen.add(idea.id);
                    out.push({
                        id: `arch-out:${idea.id}`,
                        source: 'Outbound',
                        item: idea.name,
                        detail: idea.status ? `@${idea.status}` : 'Depends on',
                        ideaId: idea.id,
                        fileUri: idea.fileUri,
                        line: idea.lineStart
                    });
                }
                return out;
            }
            case 'git': {
                const rows: DrillRow[] = [];
                for (const commit of model.git?.focusCommits ?? []) {
                    rows.push({
                        id: `git-commit:${commit.hash}`,
                        source: commit.shortHash,
                        item: commit.subject,
                        detail: `${commit.author}${model.git?.branch ? ` · ${model.git.branch}` : ''}`
                    });
                }
                for (const author of model.git?.topAuthors ?? []) {
                    rows.push({
                        id: `git-author:${author.name}`,
                        source: 'Author',
                        item: author.name,
                        detail: `${author.commitCount} commit${author.commitCount === 1 ? '' : 's'}`
                    });
                }
                for (const file of model.git?.changedFiles ?? []) {
                    rows.push({
                        id: `git-dirty:${file.fileUri}`,
                        source: file.gitChange ?? 'dirty',
                        item: file.fileLabel,
                        detail: 'Working tree',
                        fileUri: file.fileUri,
                        line: file.line
                    });
                }
                return rows;
            }
            case 'diagnostics':
                return model.anomalies.map((anomaly, index) => ({
                    id: `anom:${index}:${anomaly.kind}`,
                    source: anomaly.kind.replace(/_/g, ' '),
                    item: anomaly.message,
                    detail: anomaly.action ? 'Click to act' : '—',
                    fileUri: anomaly.fileUri,
                    anomalyAction: anomaly.action
                }));
            case 'coverage': {
                const out: DrillRow[] = [];
                for (const idea of slice?.inboundReferencingIdeas ?? []) {
                    out.push({
                        id: `cov-in:${idea.id}`,
                        source: '← Inbound',
                        item: idea.name,
                        detail: idea.status ? `@${idea.status}` : 'References focus',
                        ideaId: idea.id,
                        fileUri: idea.fileUri,
                        line: idea.lineStart
                    });
                }
                for (const idea of slice?.referencedIdeas ?? []) {
                    out.push({
                        id: `cov-out:${idea.id}`,
                        source: '→ Outbound',
                        item: idea.name,
                        detail: idea.status ? `@${idea.status}` : 'Focus depends on',
                        ideaId: idea.id,
                        fileUri: idea.fileUri,
                        line: idea.lineStart
                    });
                }
                return out;
            }
        }
    });

    function toggleAxis(key: keyof ContextFingerprintAxes): void {
        expandedAxis = expandedAxis === key ? undefined : key;
    }

    function handleDrillClick(row: DrillRow): void {
        if (row.anomalyAction) {
            onAnomaly?.(row.anomalyAction);
            return;
        }
        if (row.ideaId) {
            onOpenIdea?.(row.ideaId);
            return;
        }
        if (row.fileUri) {
            onOpenFile?.(row.fileUri, row.line);
        }
    }

    function emptyMessage(key: keyof ContextFingerprintAxes): string {
        switch (key) {
            case 'files':
                return 'No files in composed footprint yet — enable lenses or open related files.';
            case 'requirements':
                return 'No requirements in footprint — focus an idea or pin related ones.';
            case 'history':
                return 'No session history yet — navigate or edit files to build a trail.';
            case 'architecture':
                return 'No structural anchors — add parents or outbound refs to ground this idea.';
            case 'git':
                return 'No focus history yet — open a tracked file or enable the git lens.';
            case 'diagnostics':
                return 'No anomalies — context looks clean.';
            case 'coverage':
                return 'No relationship edges around focus — coverage is thin.';
        }
    }
</script>

<div class="context-fingerprint">
    <div class="fingerprint-header">
        <p class="muted fingerprint-title">Context fingerprint</p>
        <button
            type="button"
            class="toolbar-button info-button fingerprint-info"
            aria-expanded={helpOpen}
            aria-controls="context-fingerprint-help"
            title="Why these bars matter for AI context"
            aria-label="Why these bars matter for AI context"
            onclick={() => (helpOpen = !helpOpen)}
        >ⓘ</button>
    </div>

    {#if helpOpen}
        <div id="context-fingerprint-help" class="fingerprint-help" role="region" aria-label="Fingerprint scoring help">
            <p>{CONTEXT_FINGERPRINT_HELP}</p>
            <ul>
                {#each rows as row}
                    <li>{CONTEXT_FINGERPRINT_AXIS_HELP[row.key]}</li>
                {/each}
            </ul>
        </div>
    {/if}

    {#each rows as row}
        <div class="fp-axis">
            <button
                type="button"
                class="fp-row"
                class:open={expandedAxis === row.key}
                title="{fingerprintAxisTooltip(row.key, axes[row.key])} Click to show what contributes."
                aria-expanded={expandedAxis === row.key}
                aria-controls="fp-drill-{row.key}"
                onclick={() => toggleAxis(row.key)}
            >
                <span class="fp-chevron" aria-hidden="true">{expandedAxis === row.key ? '▾' : '▸'}</span>
                <span class="fp-label">{row.label}</span>
                <div class="progress-bar compact" role="progressbar" aria-valuenow={pct(axes[row.key])} aria-label="{row.label} {pct(axes[row.key])}%">
                    <span style="width: {pct(axes[row.key])}%"></span>
                </div>
                <span class="fp-pct muted">{pct(axes[row.key])}%</span>
            </button>

            {#if expandedAxis === row.key}
                <div id="fp-drill-{row.key}" class="fp-drill" role="region" aria-label="{row.label} contributors">
                    {#if drillRows.length === 0}
                        <p class="muted empty">{emptyMessage(row.key)}</p>
                    {:else}
                        <table class="fp-table">
                            <thead>
                                <tr>
                                    <th scope="col">Source</th>
                                    <th scope="col">Item</th>
                                    <th scope="col">Detail</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each drillRows as drill (drill.id)}
                                    <tr>
                                        <td class="muted source">{drill.source}</td>
                                        <td>
                                            {#if drill.ideaId || drill.fileUri || drill.anomalyAction}
                                                <button
                                                    type="button"
                                                    class="link"
                                                    onclick={() => handleDrillClick(drill)}
                                                >{drill.item}</button>
                                            {:else}
                                                {drill.item}
                                            {/if}
                                        </td>
                                        <td class="muted detail">{drill.detail}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    {/if}
                </div>
            {/if}
        </div>
    {/each}
</div>

<style>
    .context-fingerprint {
        margin: 6px 0 8px;
    }
    .fingerprint-header {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-bottom: 4px;
    }
    .fingerprint-title {
        margin: 0;
        font-size: 0.85em;
        flex: 1;
    }
    .fingerprint-info {
        margin-left: 0;
        min-width: 22px;
        height: 22px;
        padding: 0 4px;
        line-height: 1;
        flex-shrink: 0;
    }
    .fingerprint-help {
        margin: 0 0 8px;
        padding: 6px 8px;
        font-size: 0.75em;
        color: var(--vscode-descriptionForeground);
        background: var(--vscode-textBlockQuote-background, rgba(127, 127, 127, 0.12));
        border-left: 2px solid var(--vscode-textLink-foreground, var(--vscode-focusBorder));
        border-radius: 2px;
    }
    .fingerprint-help p {
        margin: 0 0 6px;
    }
    .fingerprint-help ul {
        margin: 0;
        padding-left: 1.1em;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .fp-axis {
        margin-bottom: 2px;
    }
    .fp-row {
        display: grid;
        grid-template-columns: 12px 76px 1fr auto;
        gap: 6px;
        align-items: center;
        width: 100%;
        margin: 0;
        padding: 2px 4px;
        border: 1px solid transparent;
        border-radius: 3px;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
    }
    .fp-row:hover,
    .fp-row.open {
        border-color: var(--vscode-focusBorder, var(--vscode-panel-border));
        background: var(--vscode-list-hoverBackground, rgba(127, 127, 127, 0.1));
    }
    .fp-row:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 1px;
    }
    .fp-chevron {
        font-size: 0.7em;
        color: var(--vscode-descriptionForeground);
        text-align: center;
    }
    .fp-label {
        font-size: 0.75em;
        color: var(--vscode-descriptionForeground);
    }
    .fp-pct {
        font-size: 0.7em;
        min-width: 2.4em;
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
    .fp-drill {
        margin: 2px 0 6px 12px;
        max-height: 160px;
        overflow: auto;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 2px;
    }
    .fp-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.75em;
    }
    .fp-table th,
    .fp-table td {
        text-align: left;
        padding: 3px 6px;
        border-bottom: 1px solid var(--vscode-panel-border);
        vertical-align: top;
    }
    .fp-table th {
        position: sticky;
        top: 0;
        background: var(--vscode-sideBar-background, var(--vscode-editor-background));
        color: var(--vscode-descriptionForeground);
        font-weight: 600;
    }
    .fp-table tr:last-child td {
        border-bottom: none;
    }
    .source {
        white-space: nowrap;
        max-width: 7em;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .detail {
        max-width: 8em;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .empty {
        margin: 6px 8px;
        font-size: 0.75em;
    }
    :global(.progress-bar.compact) {
        height: 4px;
        margin: 0;
    }
</style>
