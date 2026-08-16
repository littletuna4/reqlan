<script lang="ts">
    import type { ContextDimensionId, ContextFileEntry, ContextFileLensDetail } from '../../../../src/activity_bar_module/lib/context-model.js';
    import type { IdeaSummary, OutlineNode } from '@reqlan/analytical';
    import { getApp } from '../state/context.js';
    import CollapsiblePane from './CollapsiblePane.svelte';
    import NestedSection from './NestedSection.svelte';
    import StabilityMeter from './widgets/StabilityMeter.svelte';
    import DependencyPulse from './widgets/DependencyPulse.svelte';
    import TimelineRibbon from './widgets/TimelineRibbon.svelte';
    import ChurnHeatBar from './widgets/ChurnHeatBar.svelte';
    import ContextFingerprint from './widgets/ContextFingerprint.svelte';
    import AiReadinessGauge from './widgets/AiReadinessGauge.svelte';

    interface Props {
        expanded: boolean;
        fill?: boolean;
        height?: number;
        resizable?: boolean;
        onToggle: (id: string, expanded: boolean) => void;
        onResize?: (id: string, height: number) => void;
    }
    let { expanded, fill = false, height, resizable = false, onToggle, onResize }: Props = $props();

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

    function fileRows(source: 'open_files' | 'file_history' | 'edit_history'): ContextFileEntry[] {
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
        }
    }

    function commitRelative(iso: string): string {
        const at = new Date(iso);
        if (Number.isNaN(at.getTime())) {
            return '';
        }
        const days = Math.floor((Date.now() - at.getTime()) / (24 * 60 * 60 * 1000));
        if (days <= 0) {
            return 'today';
        }
        if (days === 1) {
            return '1d';
        }
        if (days < 30) {
            return `${days}d`;
        }
        const months = Math.floor(days / 30);
        if (months < 12) {
            return `${months}mo`;
        }
        return `${Math.floor(days / 365)}y`;
    }

    function rateLabel(value?: number): string {
        if (value === undefined || !Number.isFinite(value)) {
            return 'n/a';
        }
        return value >= 1 ? value.toFixed(1) : value.toFixed(2);
    }

    function relativeChurnLabel(
        value?: number,
        band?: 'cold' | 'typical' | 'hot' | 'very_hot'
    ): string | undefined {
        if (value === undefined || !band) {
            return undefined;
        }
        const adjective =
            band === 'very_hot'
                ? 'very hot'
                : band === 'hot'
                    ? 'hot'
                    : band === 'cold'
                        ? 'cold'
                        : 'typical';
        return `${value.toFixed(1)}x peer median · ${adjective}`;
    }

    async function copyCommitHash(hash: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(hash);
        } catch {
            // Clipboard may be unavailable in some hosts.
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

<CollapsiblePane title="Scope" id="scope" {expanded} {fill} {height} {resizable} {onToggle} {onResize}>
    {#if app.contextError}
        <p class="error-text" role="alert">{app.contextError}</p>
    {:else if !context}
        <p class="muted pane-status">Open a workspace file to see scope.</p>
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
                        confidence={synthesis.confidence}
                        aiRisk={synthesis.aiRisk}
                        coverage={synthesis.coverage}
                        title={synthesis.stability >= 0.75 ? 'Stable' : synthesis.stability >= 0.45 ? 'Moderate' : 'Unstable'}
                    />
                    <p
                        class="muted synthesis-story"
                        title="Short synthesis of stability, recency, fanout, and broken refs — use it as a gut-check before asking AI to rewrite this idea."
                    >{synthesis.story}</p>
                {/if}
                {#if signals?.relationship}
                    <DependencyPulse
                        parentCount={signals.relationship.parentCount}
                        outboundCount={signals.relationship.outboundCount}
                        inboundCount={signals.relationship.inboundCount}
                        dependentCount={signals.relationship.dependentCount}
                        parents={(app.ancestors?.ancestors ?? []).slice(0, signals.relationship.parentCount)}
                        inbound={scope.inboundReferencingIdeas ?? []}
                        outbound={scope.referencedIdeas ?? []}
                        onOpenIdea={(idea) => app.focusIdea(idea.id)}
                    />
                {/if}
                <TimelineRibbon milestones={ribbonMilestones} />
                <ChurnHeatBar intensity={churnIntensity} title={synthesis?.story ?? 'Churn'} />
                {#if context.git?.historyCue}
                    <div class="chip-row">
                        <span class="chip" title="Recent git history for this focus">git: {context.git.historyCue}</span>
                    </div>
                {/if}
                {#if context.git?.focusStats}
                    <div class="chip-row">
                        {#if context.git.focusStats.createdBy || context.git.focusStats.createdAt}
                            <span class="chip" title="Who introduced this symbol, and when">
                                created {context.git.focusStats.createdBy ?? 'unknown'}
                                {#if context.git.focusStats.createdAt}
                                    · {commitRelative(context.git.focusStats.createdAt)}
                                {/if}
                            </span>
                        {/if}
                        {#if context.git.focusStats.relativeChangeRate !== undefined}
                            <span class="chip" title="Relative change rate versus peer symbols in this file">
                                {relativeChurnLabel(context.git.focusStats.relativeChangeRate, context.git.focusStats.relativeChangeLabel)}
                            </span>
                        {/if}
                    </div>
                {/if}
                <div class="section-actions">
                    <button class="action-button" onclick={() => app.pinIdea(focusIdea!.id)}>Pin</button>
                    <button class="action-button" onclick={() => app.copyScopeMarkdown(focusIdea!.id)}>Copy</button>
                </div>
            {:else if scope}
                <h3>{scope.fileLabel}</h3>
                {#if context.git?.historyCue}
                    <div class="chip-row">
                        <span class="chip" title="Recent git history for this file">git: {context.git.historyCue}</span>
                    </div>
                {/if}
                {#if !scope.isRqFile}
                    {@const related = relatedIdeas(scope)}
                    {#if related.length > 0}
                        <NestedSection title="Linked requirements" count={related.length} defaultExpanded={true}>
                            <ul class="list compact-list">
                                {#each related as idea}
                                    <li>
                                        <button class="link" onclick={() => app.focusIdea(idea.id)}>{idea.name}</button>
                                    </li>
                                {/each}
                            </ul>
                        </NestedSection>
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
                    title="{dim.label}: {dim.summary} Enabled lenses contribute their ideas/files to composed AI context (weight {dim.weight}). Click toggles inclusion in the footprint; Alt+click expands detail."
                    onclick={(event) => toggleDimension(dim.id, event)}
                >
                    <span class="lens-label">{dim.label}</span>
                    <span class="lens-count">{lensCount(dim.id)}</span>
                </button>
            {/each}
        </div>

        <p
            class="footprint-line muted"
            title="Composed context from every enabled lens (current file, open tabs, history, pins, git, …). This is what Copy Context / @reqlan actually ships to the assistant — centre idea: {context.footprint.effectiveCenterId ?? 'none'}."
        >{context.footprint.summaryLine}</p>

        {#if context.fingerprint}
            <ContextFingerprint
                axes={context.fingerprint}
                model={context}
                parents={(app.ancestors?.ancestors ?? []).slice(0, signals?.relationship?.parentCount ?? 4)}
                onOpenIdea={(ideaId) => app.focusIdea(ideaId)}
                onOpenFile={(fileUri, line) => app.openIdea(fileUri, line ?? 0)}
                onAnomaly={(action) => handleAnomaly(action)}
            />
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
                    <NestedSection title="Referenced by" count={scope.referencingIdeas.length} defaultExpanded={true}>
                        <ul class="list">
                            {#each scope.referencingIdeas as idea}
                                <li><button class="link" onclick={() => app.focusIdea(idea.id)}>{idea.name}</button></li>
                            {/each}
                        </ul>
                    </NestedSection>
                {/if}
                {#if scope.commentLinkedIdeas.length > 0}
                    <NestedSection title="rq:[] in this file" count={scope.commentLinkedIdeas.length} defaultExpanded={true}>
                        <ul class="list">
                            {#each scope.commentLinkedIdeas as idea}
                                <li><button class="link" onclick={() => app.focusIdea(idea.id)}>{idea.name}</button></li>
                            {/each}
                        </ul>
                    </NestedSection>
                {/if}
                {#if scope.folderReferencingIdeas.length > 0}
                    <NestedSection title="Folder referenced by" count={scope.folderReferencingIdeas.length}>
                        <ul class="list">
                            {#each scope.folderReferencingIdeas as idea}
                                <li><button class="link" onclick={() => app.focusIdea(idea.id)}>{idea.name}</button></li>
                            {/each}
                        </ul>
                    </NestedSection>
                {/if}
            {:else}
                {#if scope.unresolvedCount > 0}
                    <p>
                        <button class="link" onclick={() => handleAnomaly('filter_broken_refs')}>
                            <span class="badge">{scope.unresolvedCount} unresolved</span>
                        </button>
                    </p>
                {/if}
                {#if scope.focusIdea && (scope.inboundReferencingIdeas?.length ?? 0) > 0}
                    <NestedSection title="Referenced by" count={scope.inboundReferencingIdeas!.length}>
                        <ul class="list">
                            {#each scope.inboundReferencingIdeas ?? [] as idea}
                                <li><button class="link" onclick={() => app.focusIdea(idea.id)}>← {idea.name}</button></li>
                            {/each}
                        </ul>
                    </NestedSection>
                {/if}
                {#if scope.focusIdea && (scope.referencedIdeas?.length ?? 0) > 0}
                    <NestedSection title="References" count={scope.referencedIdeas!.length}>
                        <ul class="list">
                            {#each scope.referencedIdeas ?? [] as idea}
                                <li><button class="link" onclick={() => app.focusIdea(idea.id)}>→ {idea.name}</button></li>
                            {/each}
                        </ul>
                    </NestedSection>
                {/if}
                {#if scope.ideasInFile.length > 0}
                    <NestedSection title="Ideas in file" count={scope.ideasInFile.length} defaultExpanded={true}>
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
                    </NestedSection>
                {/if}
                {#if outlineFlat.length > 0}
                    <NestedSection title="Outline" count={outlineFlat.length} defaultExpanded={outlineFlat.length <= 12}>
                        <ul class="list outline">
                            {#each outlineFlat as entry}
                                <li style={`padding-left: ${entry.depth * 12}px`}>
                                    <button class="link" onclick={() => app.openIdea(entry.node.id.split('#')[0] ?? scope!.fileUri, entry.node.lineStart)}>
                                        {entry.node.name}
                                    </button>
                                </li>
                            {/each}
                        </ul>
                    </NestedSection>
                {/if}
            {/if}
        {:else if expandedLens === 'manual'}
            {#if context.manualIdeas.length === 0}
                <p class="muted">Nothing pinned — use Pin on an idea or the context tray.</p>
            {:else}
                <NestedSection title="Pinned" count={context.manualIdeas.length} defaultExpanded={true} scrollable={false}>
                    <div class="chip-row">
                        {#each context.manualIdeas as idea}
                            <span class="chip">
                                {idea.name}
                                <button onclick={() => app.unpinIdea(idea.id)} aria-label="Remove">×</button>
                            </span>
                        {/each}
                    </div>
                </NestedSection>
            {/if}
        {:else if expandedLens === 'workspace'}
            <p class="muted">
                {context.workspace.ideaCount} ideas indexed · {context.workspace.edgeCount} edges
            </p>
            <button class="action-button" onclick={() => app.openIdeasSummary('index')}>Open workspace pane</button>
        {:else if expandedLens === 'git'}
            {@const git = context.git}
            {#if !git}
                <p class="muted">No git repository detected.</p>
            {:else}
                <p class="muted git-history-header" title="Branch and HEAD for the workspace repository">
                    {#if git.branch}{git.branch}{:else}detached{/if}
                    {#if git.headShort}<span class="chip">{git.headShort}</span>{/if}
                    · {git.summary}
                </p>
                {#if git.focusStats}
                    <div class="git-stats-grid">
                        {#if git.focusStats.createdBy || git.focusStats.createdAt}
                            <p class="muted">
                                Created
                                {#if git.focusStats.createdBy} by {git.focusStats.createdBy}{/if}
                                {#if git.focusStats.createdAt} · {commitRelative(git.focusStats.createdAt)}{/if}
                            </p>
                        {/if}
                        {#if git.focusStats.modifiedBy || git.focusStats.modifiedAt}
                            <p class="muted">
                                Last changed
                                {#if git.focusStats.modifiedBy} by {git.focusStats.modifiedBy}{/if}
                                {#if git.focusStats.modifiedAt} · {commitRelative(git.focusStats.modifiedAt)}{/if}
                            </p>
                        {/if}
                        {#if git.focusStats.commitCount !== undefined}
                            <p class="muted">
                                {git.focusStats.commitCount} change{git.focusStats.commitCount === 1 ? '' : 's'}
                                {#if git.focusStats.changeRate !== undefined}
                                    · {rateLabel(git.focusStats.changeRate)}/day
                                {/if}
                            </p>
                        {/if}
                        {#if git.focusStats.relativeChangeRate !== undefined}
                            <p class="muted">
                                Relative churn
                                {relativeChurnLabel(git.focusStats.relativeChangeRate, git.focusStats.relativeChangeLabel)}
                            </p>
                        {/if}
                    </div>
                {/if}
                {#if (git.focusCommits?.length ?? 0) === 0}
                    <p class="muted">No commit history for this focus yet.</p>
                {:else}
                    <NestedSection title="Focus history" count={git.focusCommits.length} defaultExpanded={true}>
                        <ul class="list compact-list">
                            {#each git.focusCommits ?? [] as commit (commit.hash)}
                                <li>
                                    <button
                                        class="link git-commit-row"
                                        title="{commit.hash} — click to copy hash"
                                        onclick={() => copyCommitHash(commit.shortHash)}
                                    >
                                        <span class="muted">{commitRelative(commit.authoredAt)}</span>
                                        <span class="chip">{commit.shortHash}</span>
                                        <span>{commit.subject}</span>
                                        <span class="muted">{commit.author}</span>
                                    </button>
                                </li>
                            {/each}
                        </ul>
                    </NestedSection>
                {/if}
                {#if (git.topAuthors?.length ?? 0) > 0}
                    <div class="chip-row" title="Top authors for this focus path">
                        {#each git.topAuthors ?? [] as author}
                            <span class="chip">{author.name} · {author.commitCount}</span>
                        {/each}
                    </div>
                {/if}
                {#if git.changedFiles.length > 0}
                    <NestedSection
                        title="Working tree"
                        count={git.changedFiles.length}
                        defaultExpanded={false}
                    >
                        <ul class="list">
                            {#each git.changedFiles as file}
                                <li>
                                    <button class="link" onclick={() => app.openIdea(file.fileUri, file.line ?? 0)}>
                                        {file.fileLabel}
                                        {#if file.gitChange}
                                            <span class="chip">git:{file.gitChange}</span>
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
                    </NestedSection>
                {/if}
            {/if}
        {:else if expandedLens && ['open_files', 'file_history', 'edit_history'].includes(expandedLens)}
            {@const rows = fileRows(expandedLens as 'open_files' | 'file_history' | 'edit_history')}
            {#if rows.length === 0}
                <p class="muted">Nothing in this lens yet.</p>
            {:else}
                <NestedSection
                    title={context.dimensions.find(dim => dim.id === expandedLens)?.label ?? 'Files'}
                    count={rows.length}
                    defaultExpanded={true}
                >
                    <ul class="list">
                        {#each rows as file}
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
                </NestedSection>
            {/if}
        {/if}
    {/if}
</CollapsiblePane>
