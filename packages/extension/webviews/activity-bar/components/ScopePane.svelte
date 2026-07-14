<script lang="ts">
    import type { ContextDimensionId, ContextFileEntry, ContextFileLensDetail, IdeaSummary, OutlineNode } from 'reqlan-analytical';
    import { getApp } from '../state/context.js';
    import CollapsiblePane from './CollapsiblePane.svelte';
    import StabilityMeter from './widgets/StabilityMeter.svelte';
    import DependencyPulse from './widgets/DependencyPulse.svelte';
    import TimelineRibbon from './widgets/TimelineRibbon.svelte';
    import ChurnHeatBar from './widgets/ChurnHeatBar.svelte';
    import ContextFingerprint from './widgets/ContextFingerprint.svelte';
    import AiReadinessGauge from './widgets/AiReadinessGauge.svelte';

    interface Props {
        expanded: boolean;
        onToggle: (id: string, expanded: boolean) => void;
    }
    let { expanded, onToggle }: Props = $props();

    const app = getApp();
    let context = $derived(app.context);
    let scope = $derived(context?.currentFile);
    let focusIdea = $derived(scope?.focusIdea);
    let synthesis = $derived(context?.synthesis);
    let signals = $derived(context?.signals);
    let lensDimensions = $derived(
        context?.dimensions.filter(dim => dim.id !== 'workspace') ?? []
    );
    let expandedLens = $derived(context?.expandedLens);
    let expandedFileUri = $state<string | undefined>(undefined);

    let ribbonMilestones = $derived.by(() => {
        const milestones: { id: string; label: string; at: Date }[] = [];
        const created = signals?.developmentHistory?.createdAt;
        const modified = signals?.developmentHistory?.modifiedAt;
        if (created) {
            const at = new Date(created);
            if (!Number.isNaN(at.getTime())) {
                milestones.push({ id: 'created', label: 'Created', at });
            }
        }
        if (modified) {
            const at = new Date(modified);
            if (!Number.isNaN(at.getTime())) {
                milestones.push({ id: 'modified', label: 'Last edit', at });
            }
        }
        milestones.push({ id: 'now', label: 'Now', at: new Date() });
        return milestones.sort((a, b) => a.at.getTime() - b.at.getTime());
    });

    let churnIntensity = $derived.by(() => {
        const days = signals?.developmentHistory?.timeSinceTouchedDays;
        if (days === undefined) {
            return 0.15;
        }
        if (days <= 3) {
            return 0.95;
        }
        if (days <= 14) {
            return 0.65;
        }
        if (days <= 60) {
            return 0.35;
        }
        return 0.1;
    });

    function renderOutline(nodes: OutlineNode[], depth = 0): { node: OutlineNode; depth: number }[] {
        const flat: { node: OutlineNode; depth: number }[] = [];
        for (const node of nodes) {
            flat.push({ node, depth });
            flat.push(...renderOutline(node.children, depth + 1));
        }
        return flat;
    }

    let outlineFlat = $derived(scope ? renderOutline(scope.outline) : []);

    function toggleDimension(id: ContextDimensionId, event: MouseEvent): void {
        if (event.altKey) {
            app.setExpandedLens(expandedLens === id ? undefined : id);
            return;
        }
        const dim = context?.dimensions.find(entry => entry.id === id);
        if (!dim || dim.pinned) {
            return;
        }
        app.toggleContextDimension(id, !dim.enabled);
    }

    function lensCount(dimId: ContextDimensionId): number {
        const dim = context?.dimensions.find(entry => entry.id === dimId);
        return (dim?.fileCount ?? 0) + (dim?.ideaCount ?? 0);
    }

    function lensActive(dimId: ContextDimensionId): boolean {
        const dim = context?.dimensions.find(entry => entry.id === dimId);
        return Boolean(dim?.enabled && lensCount(dimId) > 0);
    }

    function fileRows(source: 'open_files' | 'file_history' | 'edit_history' | 'git'): ContextFileEntry[] {
        if (!context) {
            return [];
        }
        switch (source) {
            case 'open_files':
                return context.openFiles;
            case 'file_history':
                return context.fileHistory;
            case 'edit_history':
                return context.editHistory;
            case 'git':
                return context.git?.changedFiles ?? [];
        }
    }

    function handleAnomaly(action?: string): void {
        if (action === 'filter_broken_refs') {
            app.brokenOnly = true;
            app.onReferencesFilterChange();
        }
    }

    function relatedIdeas(scopeFile: NonNullable<typeof scope>): IdeaSummary[] {
        return [
            ...scopeFile.referencingIdeas,
            ...scopeFile.commentLinkedIdeas,
            ...scopeFile.folderReferencingIdeas
        ].filter((idea, index, list) => list.findIndex(entry => entry.id === idea.id) === index);
    }

    function lensDetail(fileUri: string): ContextFileLensDetail | undefined {
        return app.fileLensDetails[fileUri];
    }

    async function toggleFileLens(fileUri: string): Promise<void> {
        expandedFileUri = expandedFileUri === fileUri ? undefined : fileUri;
        if (expandedFileUri && !app.fileLensDetails[fileUri]) {
            await app.loadFileLens(fileUri);
        }
    }
</script>

<CollapsiblePane title="Scope" id="scope" {expanded} {onToggle}>
    {#if !context}
        <p class="muted">Open a workspace file to see scope.</p>
    {:else}
        <div class="scope-focus-hero">
            {#if focusIdea}
                <h3>{focusIdea.name}</h3>
                {#if focusIdea.status}
                    <div class="chip-row"><span class="chip">@{focusIdea.status}</span></div>
                {/if}
                {#if focusIdea.tags.length > 0}
                    <div class="chip-row">
                        {#each focusIdea.tags as tag}
                            <span class="chip">{tag}</span>
                        {/each}
                    </div>
                {/if}
                <p class="muted">
                    <button class="link" onclick={() => app.openIdea(focusIdea!.fileUri, focusIdea!.lineStart)}>
                        {scope?.fileLabel}:{focusIdea.lineStart + 1}
                    </button>
                </p>
                <p class="muted">{focusIdea.summary}</p>
                {#if synthesis}
                    <StabilityMeter
                        stability={synthesis.stability}
                        title={synthesis.stability >= 0.75 ? 'Stable' : synthesis.stability >= 0.45 ? 'Moderate' : 'Unstable'}
                    />
                    <p class="muted synthesis-story">{synthesis.story}</p>
                {/if}
                {#if signals?.relationship}
                    <DependencyPulse
                        parentCount={signals.relationship.parentCount}
                        outboundCount={signals.relationship.outboundCount}
                        inboundCount={signals.relationship.inboundCount}
                        dependentCount={signals.relationship.dependentCount}
                    />
                {/if}
                <TimelineRibbon milestones={ribbonMilestones} />
                <ChurnHeatBar intensity={churnIntensity} title={synthesis?.story ?? 'Churn'} />
                {#if (scope.inboundReferencingIdeas?.length ?? 0) > 0 || (scope.referencedIdeas?.length ?? 0) > 0}
                    <div class="focus-refs">
                        {#if (scope.inboundReferencingIdeas?.length ?? 0) > 0}
                            <p class="muted">Referenced by</p>
                            <ul class="list compact-list">
                                {#each scope.inboundReferencingIdeas ?? [] as idea}
                                    <li>
                                        <button class="link" onclick={() => app.focusIdea(idea.id)}>← {idea.name}</button>
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                        {#if (scope.referencedIdeas?.length ?? 0) > 0}
                            <p class="muted">References</p>
                            <ul class="list compact-list">
                                {#each scope.referencedIdeas ?? [] as idea}
                                    <li>
                                        <button class="link" onclick={() => app.focusIdea(idea.id)}>→ {idea.name}</button>
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </div>
                {/if}
                <div class="section-actions">
                    <button class="action-button" onclick={() => app.pinIdea(focusIdea!.id)}>Pin</button>
                    <button class="action-button" onclick={() => app.copyScopeMarkdown(focusIdea!.id)}>Copy</button>
                </div>
            {:else if scope}
                <h3>{scope.fileLabel}</h3>
                {#if scope.gitChange}
                    <div class="chip-row"><span class="chip">git: {scope.gitChange}</span></div>
                {/if}
                {#if !scope.isRqFile}
                    {@const related = relatedIdeas(scope)}
                    {#if related.length > 0}
                        <p class="muted">{related.length} linked requirement(s)</p>
                        <ul class="list compact-list">
                            {#each related.slice(0, 4) as idea}
                                <li>
                                    <button class="link" onclick={() => app.focusIdea(idea.id)}>{idea.name}</button>
                                </li>
                            {/each}
                        </ul>
                    {:else}
                        <p class="muted">No indexed requirement links for this file yet.</p>
                    {/if}
                {:else}
                    <p class="muted">No idea at caret — showing file context.</p>
                {/if}
                <button class="link" onclick={() => app.openIdea(scope.fileUri, 0)}>Open file</button>
            {:else}
                <p class="muted">No focus — enable a dimension or open a file.</p>
            {/if}
        </div>

        <div class="lens-strip" role="toolbar" aria-label="Context dimensions">
            {#each lensDimensions as dim}
                <button
                    class="lens-chip"
                    class:active={lensActive(dim.id)}
                    class:expanded={expandedLens === dim.id}
                    class:disabled={!dim.enabled}
                    title="{dim.label} — click to toggle, Alt+click to expand"
                    onclick={(event) => toggleDimension(dim.id, event)}
                >
                    <span class="lens-label">{dim.label}</span>
                    <span class="lens-count">{lensCount(dim.id)}</span>
                </button>
            {/each}
        </div>

        <p class="footprint-line muted">{context.footprint.summaryLine}</p>

        {#if context.fingerprint}
            <ContextFingerprint axes={context.fingerprint} />
        {/if}
        {#if context.aiReadiness}
            <AiReadinessGauge readiness={context.aiReadiness} />
        {/if}

        {#each context.anomalies as anomaly}
            <button class="anomaly-strip link" onclick={() => handleAnomaly(anomaly.action)}>
                {anomaly.message}
            </button>
        {/each}

        {#if expandedLens}
            {@const expandedDim = context.dimensions.find(dim => dim.id === expandedLens)}
            {#if expandedDim?.supportsHopControl}
                <div class="lens-hop-row">
                    <span class="muted">{expandedDim.label} hop depth</span>
                    <div class="hop-control">
                        <button
                            class="toolbar-button hop-button"
                            disabled={expandedDim.hopDepth <= context.minHopDepth}
                            onclick={() => app.adjustDimensionHopDepth(expandedLens!, -1)}
                            aria-label="Decrease dimension hop depth"
                        >−</button>
                        <span class="hop-value">{expandedDim.hopDepth}</span>
                        <button
                            class="toolbar-button hop-button"
                            disabled={expandedDim.hopDepth >= context.maxHopDepth}
                            onclick={() => app.adjustDimensionHopDepth(expandedLens!, 1)}
                            aria-label="Increase dimension hop depth"
                        >+</button>
                    </div>
                </div>
            {/if}
        {/if}

        {#if expandedLens === 'current_file' && scope}
            {#if !scope.isRqFile}
                {#if scope.referencingIdeas.length > 0}
                    <h4>Referenced by</h4>
                    <ul class="list">
                        {#each scope.referencingIdeas as idea}
                            <li><button class="link" onclick={() => app.focusIdea(idea.id)}>{idea.name}</button></li>
                        {/each}
                    </ul>
                {/if}
                {#if scope.commentLinkedIdeas.length > 0}
                    <h4>rq:[] in this file</h4>
                    <ul class="list">
                        {#each scope.commentLinkedIdeas as idea}
                            <li><button class="link" onclick={() => app.focusIdea(idea.id)}>{idea.name}</button></li>
                        {/each}
                    </ul>
                {/if}
                {#if scope.folderReferencingIdeas.length > 0}
                    <h4>Folder referenced by</h4>
                    <ul class="list">
                        {#each scope.folderReferencingIdeas as idea}
                            <li><button class="link" onclick={() => app.focusIdea(idea.id)}>{idea.name}</button></li>
                        {/each}
                    </ul>
                {/if}
            {:else}
                {#if scope.unresolvedCount > 0}
                    <p>
                        <button class="link" onclick={() => handleAnomaly('filter_broken_refs')}>
                            <span class="badge">{scope.unresolvedCount} unresolved</span>
                        </button>
                    </p>
                {/if}
                {#if scope.focusIdea && ((scope.inboundReferencingIdeas?.length ?? 0) > 0 || (scope.referencedIdeas?.length ?? 0) > 0)}
                    {#if (scope.inboundReferencingIdeas?.length ?? 0) > 0}
                        <h4>Referenced by</h4>
                        <ul class="list">
                            {#each scope.inboundReferencingIdeas ?? [] as idea}
                                <li><button class="link" onclick={() => app.focusIdea(idea.id)}>← {idea.name}</button></li>
                            {/each}
                        </ul>
                    {/if}
                    {#if (scope.referencedIdeas?.length ?? 0) > 0}
                        <h4>References</h4>
                        <ul class="list">
                            {#each scope.referencedIdeas ?? [] as idea}
                                <li><button class="link" onclick={() => app.focusIdea(idea.id)}>→ {idea.name}</button></li>
                            {/each}
                        </ul>
                    {/if}
                {/if}
                <ul class="list">
                    {#each scope.ideasInFile as idea}
                        <li>
                            <button
                                class="link"
                                onclick={() => app.openIdea(idea.fileUri, idea.lineStart)}
                                ondblclick={() => app.focusIdea(idea.id)}
                            >{idea.name}</button>
                            <span class="muted"> L{idea.lineStart + 1}–{idea.lineEnd + 1}</span>
                        </li>
                    {/each}
                </ul>
                {#if outlineFlat.length > 0}
                    <div class="outline">
                        <h4>Outline</h4>
                        <ul>
                            {#each outlineFlat as entry}
                                <li style={`padding-left: ${entry.depth * 12}px`}>
                                    <button class="link" onclick={() => app.openIdea(entry.node.id.split('#')[0] ?? scope!.fileUri, entry.node.lineStart)}>
                                        {entry.node.name}
                                    </button>
                                </li>
                            {/each}
                        </ul>
                    </div>
                {/if}
            {/if}
        {:else if expandedLens === 'manual'}
            {#if context.manualIdeas.length === 0}
                <p class="muted">Nothing pinned — use Pin on an idea or the context tray.</p>
            {:else}
                <div class="chip-row">
                    {#each context.manualIdeas as idea}
                        <span class="chip">
                            {idea.name}
                            <button onclick={() => app.unpinIdea(idea.id)} aria-label="Remove">×</button>
                        </span>
                    {/each}
                </div>
            {/if}
        {:else if expandedLens === 'workspace'}
            <p class="muted">
                {context.workspace.ideaCount} ideas indexed · {context.workspace.edgeCount} edges
            </p>
            <button class="action-button" onclick={() => app.openIdeasSummary('index')}>Open workspace pane</button>
        {:else if expandedLens && ['open_files', 'file_history', 'edit_history', 'git'].includes(expandedLens)}
            {@const rows = fileRows(expandedLens)}
            {#if rows.length === 0}
                <p class="muted">Nothing in this lens yet.</p>
            {:else}
                <ul class="list lens-file-list">
                    {#each rows.slice(0, 8) as file}
                        <li>
                            <button class="link" onclick={() => app.openIdea(file.fileUri, file.line ?? 0)}>
                                {file.fileLabel}
                                {#if file.gitChange}
                                    <span class="chip">git:{file.gitChange}</span>
                                {/if}
                                {#if file.line !== undefined}
                                    <span class="muted"> :{file.line + 1}</span>
                                {/if}
                            </button>
                            <button class="action-button" onclick={() => toggleFileLens(file.fileUri)}>Refs</button>
                            {#if expandedFileUri === file.fileUri}
                                {@const detail = lensDetail(file.fileUri)}
                                {#if !detail}
                                    <p class="muted">Loading linked requirements…</p>
                                {:else if detail.relatedIdeas.length === 0 && detail.ideasInFile.length === 0}
                                    <p class="muted">No linked requirements.</p>
                                {:else}
                                    <ul class="list compact-list">
                                        {#each detail.relatedIdeas as idea}
                                            <li><button class="link" onclick={() => app.focusIdea(idea.id)}>{idea.name}</button></li>
                                        {/each}
                                        {#each detail.ideasInFile as idea}
                                            <li><button class="link" onclick={() => app.focusIdea(idea.id)}>{idea.name}</button></li>
                                        {/each}
                                    </ul>
                                {/if}
                            {/if}
                        </li>
                    {/each}
                </ul>
            {/if}
        {/if}
    {/if}
</CollapsiblePane>
