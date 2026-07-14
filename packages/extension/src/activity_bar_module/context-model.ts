/**
 * Builds ReqlanContextModel from index store + VS Code session signals.
 * per ["../../../../reqlan rq/extension/module/context-scope.rq"]
 */
import {
    ACTIVITY_BAR_MAX_NODES,
    buildAiReadiness,
    buildContextFingerprint,
    buildFocusSignals,
    buildGraphViewSlice,
    CONTEXT_DIMENSION_LABELS,
    CONTEXT_DIMENSION_WEIGHTS,
    CONTEXT_MAX_HOP_DEPTH,
    CONTEXT_MIN_HOP_DEPTH,
    formatAiReadinessMarkdown,
    formatFingerprintMarkdown,
    formatSynthesisMarkdown,
    hotspotBandFromRisk,
    resolveBidirectionalIdeaReferences,
    synthesizeFocusContext,
    type AncestorChainResult,
    type ContextAnomaly,
    type ContextDimensionContribution,
    type ContextDimensionId,
    type ContextFileEntry,
    type ContextFocus,
    type ContextFootprint,
    type CurrentFileSlice,
    type GitContextSlice,
    type IdeaSummary,
    type IdeaWithRange,
    type OutlineNode,
    type ReferenceListRow,
    type ReqlanContextModel,
    type SqliteIndexStore,
    type FileRelatedRequirements,
    type ContextSelection,
    type ContextFileLensDetail,
    type ContextReferencesSlice,
    type WorkspaceContextSlice
} from 'reqlan-analytical';
import type { GraphViewQuery, GraphViewSlice } from '../webview_module/shared/messages.js';
import type { ReferenceListsPayload } from './activity-bar-messages.js';
import type { ContextSessionState } from './context-session.js';
import {
    dimensionSupportsHopControl,
    effectiveHopDepth
} from './context-session.js';
import { enrichFileContext, dedupeIdeas, findIdeaAtLine, ideasInSelectionRange } from './file-context-resolver.js';

import {
    buildOutlineFromIdeas,
    filterReferences,
    formatIdeaMarkdown,
    groupReferences
} from './context-helpers.js';

export interface ContextBuildInput {
    session: ContextSessionState;
    fileUri?: string;
    line?: number;
    pinnedFocusId?: string;
    openFileUris: string[];
    git?: GitContextSlice;
    workspace: WorkspaceContextSlice;
    fileText?: string;
    workspaceRoot?: string;
    selectionRange?: { startLine: number; endLine: number };
    activeGitChange?: 'staged' | 'unstaged' | 'both';
    resolveFileRelated?: (fileUri: string) => Promise<FileRelatedRequirements>;
}

export class ContextModelBuilder {
    constructor(
        protected readonly store: SqliteIndexStore,
        protected readonly relativePath: (uri: string) => string
    ) {}

    async build(input: ContextBuildInput): Promise<ReqlanContextModel> {
        const { session, pinnedFocusId } = input;
        const enabled = session.dimensionEnabled;

        let currentFile: CurrentFileSlice | undefined;
        let focus: ContextFocus = { kind: 'none' };

        if (input.fileUri && enabled.current_file) {
            currentFile = await this.loadCurrentFileSlice(input.fileUri, input.line ?? 0, {
                pinnedFocusId,
                fileText: input.fileText,
                workspaceRoot: input.workspaceRoot,
                activeGitChange: input.activeGitChange,
                resolveFileRelated: input.resolveFileRelated
            });
            if (pinnedFocusId && currentFile.focusIdea) {
                focus = {
                    kind: 'idea',
                    ideaId: currentFile.focusIdea.id,
                    fileUri: currentFile.fileUri,
                    line: currentFile.focusIdea.lineStart
                };
            } else if (currentFile.focusIdea) {
                focus = {
                    kind: 'idea',
                    ideaId: currentFile.focusIdea.id,
                    fileUri: currentFile.fileUri,
                    line: input.line
                };
            } else if (currentFile.fileUri) {
                focus = { kind: 'file', fileUri: currentFile.fileUri, line: input.line };
            }
        }

        let selection: ContextSelection | undefined;
        if (
            input.fileUri &&
            input.selectionRange &&
            currentFile?.isRqFile &&
            input.selectionRange.startLine !== input.selectionRange.endLine
        ) {
            const selectedIdeas = ideasInSelectionRange(
                currentFile.ideasInFile,
                input.selectionRange.startLine,
                input.selectionRange.endLine
            );
            if (selectedIdeas.length > 0) {
                selection = {
                    fileUri: input.fileUri,
                    startLine: input.selectionRange.startLine,
                    endLine: input.selectionRange.endLine,
                    ideaIds: selectedIdeas.map(idea => idea.id),
                    ideas: selectedIdeas
                };
                if (!pinnedFocusId) {
                    focus = {
                        kind: 'selection',
                        fileUri: input.fileUri,
                        line: input.selectionRange.startLine,
                        selectionIdeaIds: selection.ideaIds,
                        ideaId: selection.ideaIds[0]
                    };
                }
            }
        }

        const openFiles = enabled.open_files
            ? this.fileEntries(input.openFileUris.filter(uri => uri !== input.fileUri), 'open_files')
            : [];

        const fileHistory = enabled.file_history
            ? this.fileEntries(
                session.fileHistory.filter(uri => uri !== input.fileUri),
                'file_history'
            )
            : [];

        const editHistory = enabled.edit_history
            ? session.editHistory.map(entry => ({
                fileUri: entry.fileUri,
                fileLabel: this.relativePath(entry.fileUri),
                line: entry.line,
                touchedAt: entry.at,
                sources: ['edit_history'] as ContextDimensionId[]
            }))
            : [];

        const manualIdeas =
            enabled.manual || session.manualIdeas.length > 0 ? [...session.manualIdeas] : [];

        const dimensions = this.buildDimensionContributions({
            session,
            enabled,
            currentFile,
            openFiles,
            fileHistory,
            editHistory,
            manualIdeas,
            git: input.git,
            workspace: input.workspace
        });

        const footprint = this.buildFootprint({
            focus,
            currentFile,
            openFiles,
            fileHistory,
            editHistory,
            manualIdeas,
            git: input.git,
            dimensions,
            selection
        });

        const anomalies: ContextAnomaly[] = [];
        if (currentFile && currentFile.unresolvedCount > 0) {
            anomalies.push({
                kind: 'unresolved_refs',
                message: `${currentFile.unresolvedCount} unresolved reference(s) in this file`,
                action: 'filter_broken_refs'
            });
        }

        const centerId = footprint.effectiveCenterId;
        const currentFileHop = effectiveHopDepth(session, 'current_file');
        let references: ContextReferencesSlice | undefined;
        if (centerId) {
            const rows = await this.store.listReferencesWithinHopDepth(centerId, currentFileHop);
            references = { ideaId: centerId, rows };
            const related = await resolveBidirectionalIdeaReferences(this.store, centerId);
            if (currentFile) {
                currentFile = {
                    ...currentFile,
                    inboundReferencingIdeas: related.inbound,
                    referencedIdeas: related.outbound,
                    unresolvedCount: await this.store.countUnresolvedForIdea(centerId)
                };
            }
        }

        const focusIdea =
            currentFile?.focusIdea ??
            (centerId ? await this.store.getIdea(centerId) : undefined);
        const parentCount = centerId
            ? (await this.store.listAncestorChain(centerId, 1)).length
            : 0;
        const signals = buildFocusSignals({
            focusIdeaId: centerId,
            status: focusIdea?.status,
            parentCount,
            inboundCount: currentFile?.inboundReferencingIdeas?.length ?? 0,
            outboundCount: currentFile?.referencedIdeas?.length ?? 0,
            unresolvedCount: currentFile?.unresolvedCount ?? 0,
            createdAt: focusIdea?.gitCreatedAt,
            modifiedAt: focusIdea?.gitModifiedAt
        });
        const synthesis = centerId ? synthesizeFocusContext(signals) : undefined;
        const fingerprint = buildContextFingerprint({
            fileCount: footprint.fileUris.length,
            ideaCount: footprint.ideaIds.length,
            historyCount: fileHistory.length + editHistory.length,
            hasArchitectureHint: (currentFile?.referencedIdeas?.length ?? 0) > 0 || parentCount > 0,
            gitChangeCount: input.git?.changedFiles.length ?? 0,
            anomalyCount: anomalies.length,
            coverage: synthesis?.coverage ?? 'unknown'
        });
        const aiReadiness = synthesis ? buildAiReadiness(signals, synthesis) : undefined;

        return {
            revision: session.revision,
            focus,
            dimensions,
            footprint,
            expandedLens: session.expandedLens,
            globalHopDepth: session.globalHopDepth,
            minHopDepth: CONTEXT_MIN_HOP_DEPTH,
            maxHopDepth: CONTEXT_MAX_HOP_DEPTH,
            dimensionHopDepth: { ...session.dimensionHopDepth },
            currentFile,
            openFiles,
            fileHistory,
            editHistory,
            manualIdeas,
            git: enabled.git ? input.git : undefined,
            workspace: input.workspace,
            anomalies,
            selection,
            references,
            signals: centerId ? signals : undefined,
            synthesis,
            fingerprint,
            aiReadiness
        };
    }

    async loadCurrentFileSlice(
        fileUri: string,
        line: number,
        options?: {
            pinnedFocusId?: string;
            fileText?: string;
            workspaceRoot?: string;
            activeGitChange?: 'staged' | 'unstaged' | 'both';
            resolveFileRelated?: (fileUri: string) => Promise<FileRelatedRequirements>;
        }
    ): Promise<CurrentFileSlice> {
        const isRqFile = fileUri.endsWith('.rq');
        const ideasInFile = isRqFile ? await this.store.listIdeasInFileWithRanges(fileUri) : [];
        const focusIdea = isRqFile
            ? (options?.pinnedFocusId
                ? await this.store.getIdea(options.pinnedFocusId)
                : undefined) ??
              findIdeaAtLine(ideasInFile, line) ??
              (await this.store.getIdeaAtLine(fileUri, line))
            : undefined;

        let referencingIdeas: IdeaSummary[] = [];
        let inboundReferencingIdeas: IdeaSummary[] = [];
        let referencedIdeas: IdeaSummary[] = [];
        let commentLinkedIdeas: IdeaSummary[] = [];
        let folderReferencingIdeas: IdeaSummary[] = [];

        if (options?.resolveFileRelated) {
            const fileRelated = await options.resolveFileRelated(fileUri);
            const enriched = await enrichFileContext(this.store, fileUri, fileRelated, {
                fileText: options.fileText,
                workspaceRoot: options.workspaceRoot
            });
            referencingIdeas = enriched.referencingIdeas;
            commentLinkedIdeas = enriched.commentLinkedIdeas;
            folderReferencingIdeas = enriched.folderReferencingIdeas;
        }

        if (focusIdea) {
            const related = await resolveBidirectionalIdeaReferences(this.store, focusIdea.id);
            inboundReferencingIdeas = related.inbound;
            referencedIdeas = related.outbound;
        }

        const centerId =
            focusIdea?.id ??
            referencingIdeas[0]?.id ??
            commentLinkedIdeas[0]?.id ??
            folderReferencingIdeas[0]?.id ??
            ideasInFile[0]?.id;
        const unresolvedCount = centerId ? await this.store.countUnresolvedForIdea(centerId) : 0;

        return {
            fileUri,
            fileLabel: this.relativePath(fileUri),
            isRqFile,
            focusIdea,
            ideasInFile,
            outline: buildOutlineFromIdeas(ideasInFile),
            unresolvedCount,
            referencingIdeas,
            inboundReferencingIdeas,
            referencedIdeas,
            commentLinkedIdeas,
            folderReferencingIdeas,
            gitChange: options?.activeGitChange
        };
    }

    async loadFileLensDetail(
        fileUri: string,
        options: {
            fileText?: string;
            workspaceRoot?: string;
            resolveFileRelated: (fileUri: string) => Promise<FileRelatedRequirements>;
        }
    ): Promise<ContextFileLensDetail> {
        const isRqFile = fileUri.endsWith('.rq');
        const ideasInFile = isRqFile ? await this.store.listIdeasInFileWithRanges(fileUri) : [];
        const fileRelated = await options.resolveFileRelated(fileUri);
        const enriched = await enrichFileContext(this.store, fileUri, fileRelated, {
            fileText: options?.fileText,
            workspaceRoot: options?.workspaceRoot
        });
        const relatedIdeas = dedupeIdeas([
            ...enriched.referencingIdeas,
            ...enriched.commentLinkedIdeas,
            ...enriched.folderReferencingIdeas,
            ...(await Promise.all(
                ideasInFile.map(idea => resolveBidirectionalIdeaReferences(this.store, idea.id))
            )).flatMap(related => [...related.inbound, ...related.outbound])
        ]);

        return {
            fileUri,
            fileLabel: this.relativePath(fileUri),
            ideasInFile,
            relatedIdeas
        };
    }

    private fileEntries(fileUris: string[], source: ContextDimensionId): ContextFileEntry[] {
        return fileUris.map(fileUri => ({
            fileUri,
            fileLabel: this.relativePath(fileUri),
            sources: [source]
        }));
    }

    private buildDimensionContributions(input: {
        session: ContextSessionState;
        enabled: Record<ContextDimensionId, boolean>;
        currentFile?: CurrentFileSlice;
        openFiles: ContextFileEntry[];
        fileHistory: ContextFileEntry[];
        editHistory: ContextFileEntry[];
        manualIdeas: IdeaSummary[];
        git?: GitContextSlice;
        workspace: WorkspaceContextSlice;
    }): ContextDimensionContribution[] {
        const ids: ContextDimensionId[] = [
            'workspace',
            'current_file',
            'open_files',
            'file_history',
            'edit_history',
            'manual',
            'git'
        ];

        return ids.map(id => {
            const enabled = input.enabled[id];
            let ideaCount = 0;
            let fileCount = 0;
            let summary = '';

            switch (id) {
                case 'workspace':
                    fileCount = 0;
                    ideaCount = input.workspace.ideaCount;
                    summary = input.workspace.ready
                        ? `${input.workspace.ideaCount} ideas indexed`
                        : 'Indexing…';
                    break;
                case 'current_file': {
                    const file = input.currentFile;
                    const relatedCount = file
                        ? file.focusIdea
                            ? dedupeIdeas([
                                  ...file.inboundReferencingIdeas,
                                  ...file.referencedIdeas
                              ]).length +
                              file.commentLinkedIdeas.length +
                              file.folderReferencingIdeas.length
                            : file.referencingIdeas.length +
                              file.commentLinkedIdeas.length +
                              file.folderReferencingIdeas.length
                        : 0;
                    ideaCount = (input.currentFile?.ideasInFile.length ?? 0) + relatedCount;
                    fileCount = input.currentFile ? 1 : 0;
                    if (!input.currentFile) {
                        summary = 'No file';
                    } else if (input.currentFile.isRqFile) {
                        summary = input.currentFile.fileLabel;
                    } else if (relatedCount > 0) {
                        summary = `${input.currentFile.fileLabel} · ${relatedCount} linked`;
                    } else {
                        summary = input.currentFile.fileLabel;
                    }
                    break;
                }
                case 'open_files':
                    fileCount = input.openFiles.length;
                    summary = fileCount === 0 ? 'No other tabs' : `${fileCount} open tab(s)`;
                    break;
                case 'file_history':
                    fileCount = input.fileHistory.length;
                    summary = fileCount === 0 ? 'No history' : `${fileCount} visited`;
                    break;
                case 'edit_history':
                    fileCount = input.editHistory.length;
                    summary = fileCount === 0 ? 'No edits' : `${fileCount} edited`;
                    break;
                case 'manual':
                    ideaCount = input.manualIdeas.length;
                    summary = ideaCount === 0 ? 'Nothing pinned' : `${ideaCount} pinned`;
                    break;
                case 'git':
                    fileCount = input.git?.changedFiles.length ?? 0;
                    summary = input.git
                        ? `${input.git.unstagedCount + input.git.stagedCount} changed`
                        : 'No repo';
                    break;
            }

            return {
                id,
                label: CONTEXT_DIMENSION_LABELS[id],
                enabled: id === 'manual' ? enabled || input.manualIdeas.length > 0 : enabled,
                pinned: id === 'current_file',
                weight: CONTEXT_DIMENSION_WEIGHTS[id],
                ideaCount,
                fileCount,
                summary,
                hopDepth: effectiveHopDepth(input.session, id),
                supportsHopControl: dimensionSupportsHopControl(id)
            };
        });
    }

    private buildFootprint(input: {
        focus: ContextFocus;
        currentFile?: CurrentFileSlice;
        openFiles: ContextFileEntry[];
        fileHistory: ContextFileEntry[];
        editHistory: ContextFileEntry[];
        manualIdeas: IdeaSummary[];
        git?: GitContextSlice;
        dimensions: ContextDimensionContribution[];
        selection?: ContextSelection;
    }): ContextFootprint {
        const ideaSources: Record<string, ContextDimensionId[]> = {};
        const fileSources: Record<string, ContextDimensionId[]> = {};
        const fileUris = new Set<string>();
        const ideaIds = new Set<string>();

        const addFile = (uri: string, source: ContextDimensionId) => {
            fileUris.add(uri);
            fileSources[uri] = [...(fileSources[uri] ?? []), source];
        };
        const addIdea = (id: string, source: ContextDimensionId) => {
            ideaIds.add(id);
            ideaSources[id] = [...(ideaSources[id] ?? []), source];
        };

        if (input.currentFile) {
            addFile(input.currentFile.fileUri, 'current_file');
            for (const idea of input.currentFile.ideasInFile) {
                addIdea(idea.id, 'current_file');
            }
            for (const idea of [
                ...input.currentFile.referencingIdeas,
                ...input.currentFile.inboundReferencingIdeas,
                ...input.currentFile.referencedIdeas,
                ...input.currentFile.commentLinkedIdeas,
                ...input.currentFile.folderReferencingIdeas
            ]) {
                addIdea(idea.id, 'current_file');
            }
        }
        for (const idea of input.selection?.ideas ?? []) {
            addIdea(idea.id, 'current_file');
        }
        for (const file of input.openFiles) {
            addFile(file.fileUri, 'open_files');
        }
        for (const file of input.fileHistory) {
            addFile(file.fileUri, 'file_history');
        }
        for (const file of input.editHistory) {
            addFile(file.fileUri, 'edit_history');
        }
        for (const idea of input.manualIdeas) {
            addIdea(idea.id, 'manual');
            addFile(idea.fileUri, 'manual');
        }
        for (const file of input.git?.changedFiles ?? []) {
            addFile(file.fileUri, 'git');
        }

        const effectiveCenterId =
            input.focus.ideaId ??
            input.selection?.ideaIds[0] ??
            input.currentFile?.focusIdea?.id ??
            input.manualIdeas[0]?.id ??
            input.currentFile?.referencingIdeas[0]?.id ??
            input.currentFile?.commentLinkedIdeas[0]?.id ??
            input.currentFile?.folderReferencingIdeas[0]?.id ??
            input.currentFile?.ideasInFile[0]?.id;

        const parts: string[] = [];
        const enabledDims = input.dimensions.filter(dim => dim.enabled && dim.id !== 'workspace');
        for (const dim of enabledDims) {
            if (dim.fileCount > 0 || dim.ideaCount > 0) {
                if (dim.id === 'current_file' && input.currentFile) {
                    parts.push('this file');
                } else if (dim.summary && !dim.summary.startsWith('No ')) {
                    parts.push(dim.summary);
                }
            }
        }

        return {
            ideaIds: [...ideaIds],
            fileUris: [...fileUris],
            effectiveCenterId,
            summaryLine: parts.length > 0 ? parts.join(' · ') : 'No context',
            provenance: { ideaSources, fileSources }
        };
    }
}

/** @deprecated Use ContextModelBuilder — kept for gradual migration */
export class ActivityBarDataService extends ContextModelBuilder {
    async loadScope(fileUri: string, line: number, pinnedFocusId?: string): Promise<CurrentFileSlice> {
        return this.loadCurrentFileSlice(fileUri, line, { pinnedFocusId });
    }

    async buildContextMarkdown(model: ReqlanContextModel): Promise<string> {
        const sections: string[] = [];
        const centerId = model.footprint.effectiveCenterId;
        if (centerId) {
            sections.push(await this.buildScopeMarkdown(centerId));
        }
        if (model.synthesis) {
            sections.push(formatSynthesisMarkdown(model.synthesis));
        }
        if (model.fingerprint) {
            sections.push(formatFingerprintMarkdown(model.fingerprint));
        }
        if (model.aiReadiness) {
            sections.push(formatAiReadinessMarkdown(model.aiReadiness));
        }
        if (model.currentFile && !model.currentFile.isRqFile) {
            const file = model.currentFile;
            sections.push(
                [
                    `## File: ${file.fileLabel}`,
                    '',
                    '### Referenced by requirements',
                    ...file.referencingIdeas.map(idea => `- ${idea.name}`),
                    '',
                    '### rq:[] comment links',
                    ...file.commentLinkedIdeas.map(idea => `- ${idea.name}`),
                    '',
                    '### Folder references',
                    ...file.folderReferencingIdeas.map(idea => `- ${idea.name}`)
                ].join('\n')
            );
        }
        if (model.selection && model.selection.ideas.length > 0) {
            sections.push(
                [
                    '## Selection',
                    ...model.selection.ideas.map(idea => `- ${idea.name}`)
                ].join('\n')
            );
        }
        if (model.manualIdeas.length > 0) {
            sections.push(
                [
                    '## Pinned',
                    ...model.manualIdeas.map(idea => formatIdeaMarkdown(idea, uri => this.relativePath(uri)))
                ].join('\n\n')
            );
        }
        sections.push(`\n---\n${model.footprint.summaryLine}`);
        return sections.filter(section => section.trim().length > 0).join('\n\n');
    }

    async loadReferences(
        ideaId: string,
        options?: { search?: string; brokenOnly?: boolean; hopDepth?: number }
    ): Promise<ReferenceListsPayload> {
        const hopDepth = options?.hopDepth ?? CONTEXT_MIN_HOP_DEPTH;
        const rows = filterReferences(
            await this.store.listReferencesWithinHopDepth(ideaId, hopDepth),
            options
        );
        return { ideaId, rows, grouped: groupReferences(rows) };
    }

    async loadGraph(centerId: string, hopDepth: number): Promise<GraphViewSlice> {
        const query: GraphViewQuery = {
            centerId,
            includeIndirect: hopDepth >= 2,
            hopDepth,
            maxNodes: ACTIVITY_BAR_MAX_NODES
        };
        const slice = await buildGraphViewSlice(this.store, query);
        const center = await this.store.getIdea(centerId);
        const inbound = (await this.store.listReferencesForIdea(centerId)).filter(
            row => row.direction === 'inbound'
        ).length;
        const outbound = (await this.store.listReferencesForIdea(centerId)).filter(
            row => row.direction === 'outbound'
        ).length;
        const unresolved = await this.store.countUnresolvedForIdea(centerId);
        const parents = (await this.store.listAncestorChain(centerId, 1)).length;
        const synthesis = synthesizeFocusContext(
            buildFocusSignals({
                focusIdeaId: centerId,
                status: center?.status,
                parentCount: parents,
                inboundCount: inbound,
                outboundCount: outbound,
                unresolvedCount: unresolved,
                createdAt: center?.gitCreatedAt,
                modifiedAt: center?.gitModifiedAt
            })
        );
        const hotspotBand = hotspotBandFromRisk(synthesis.aiRisk);
        return {
            ...slice,
            nodes: slice.nodes.map(node => ({
                ...node,
                path: node.isExternal ? node.fileUri : this.relativePath(node.fileUri),
                hotspotBand: node.id === centerId ? hotspotBand : undefined
            }))
        };
    }

    async loadAncestors(ideaId: string, maxDepth = 8): Promise<AncestorChainResult> {
        return this.store.buildAncestorChainResult(ideaId, maxDepth);
    }

    async buildScopeMarkdown(ideaId: string): Promise<string> {
        const idea = await this.store.getIdea(ideaId);
        if (!idea) {
            return '';
        }
        const refs = await this.store.listReferencesForIdea(ideaId);
        const ancestors = await this.store.buildAncestorChainResult(ideaId);
        return [
            formatIdeaMarkdown(idea, uri => this.relativePath(uri)),
            '',
            '## Parents',
            ...ancestors.ancestors.map(entry => `- ${entry.name} (${entry.status ?? 'unspecified'})`),
            '',
            '## Inbound',
            ...refs.filter(row => row.direction === 'inbound').map(row => `- ${row.label} (${row.kind})`),
            '',
            '## Outbound',
            ...refs.filter(row => row.direction === 'outbound').map(row => `- ${row.label} (${row.kind})`)
        ].join('\n');
    }
}

export type { IdeaWithRange, OutlineNode, ReferenceListRow };
