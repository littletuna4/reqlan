/**
 * AnalysisApi-compatible facade over the core Rust engine.
 * rq:["../../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 * rq:["../../../../reqlan rq/core_analysis/rust_port.rq".ts_interface]
 */
import type {
    CompletionSummary,
    DeprecationImpact,
    FileRelatedRequirements,
    GraphSlice,
    IdeaSummary
} from '../core/types.js';
import type { ExportProgressCallback, ExportRequest, ExportResult } from '../export/types.js';
import { loadNativeEngine, type NativeAnalysisRuntimeHandle } from './load-native.js';
import type {
    CompletionSummary as NativeCompletionSummary,
    DeprecationImpact as NativeDeprecationImpact,
    ExportRequestDto,
    ExportResultDto,
    FileRelatedRequirements as NativeFileRelated,
    GraphSlice as NativeGraphSlice,
    IdeaSummary as NativeIdeaSummary,
    BrokenReferenceDto as NativeBrokenReference,
    ClickResult as NativeClickResult,
    NameAmbiguity as NativeNameAmbiguity,
    RequirementMatch as NativeRequirementMatch
} from './generated.js';

export interface AnalysisRuntimeOptions {
    workspaceRoot: string;
    storagePath?: string;
}

export interface RequirementMatch {
    idea: IdeaSummary;
    score?: number;
    reasons?: string[];
}

export interface SearchRequirementsOptions {
    /** Relative `.rq` paths, `path#idea` refs, or bare idea names that bias ranking by hop distance. */
    context?: string[];
}

export interface ClickOptions {
    /** Existing click session key; omit to start a new session. */
    sessionKey?: string;
    /** Deprecated hop-depth flag; ignored on the unique path. */
    maxDetail?: number;
    /** Max backlink names listed (default 8). */
    maxBacklinks?: number;
    /** Max sibling names listed (default 8). */
    maxSiblings?: number;
    /** Max outbound names listed (default 8). */
    maxOutbound?: number;
    /** Max search hits and ranked ambiguous matches (default 8). */
    maxCandidates?: number;
}

export type ClickResult = NativeClickResult;
export type NameAmbiguity = NativeNameAmbiguity;

export interface InteractionDescriptor {
    name: string;
    description: string;
    parameters: Record<string, string>;
}

export class NativeAnalysisApi {
    private readonly native: NativeAnalysisRuntimeHandle;

    constructor(options: AnalysisRuntimeOptions) {
        const engine = loadNativeEngine();
        this.native = engine.NativeAnalysisRuntime.open(options.workspaceRoot, options.storagePath);
    }

    async ensureReady(): Promise<void> {
        this.native.ensureReady();
    }

    async searchRequirements(
        query: string,
        limit = 8,
        options?: SearchRequirementsOptions
    ): Promise<RequirementMatch[]> {
        const matches = this.native.searchRequirements(query, limit, options?.context) as NativeRequirementMatch[];
        return matches.map(match => ({
            idea: toIdea(match.idea),
            score: match.score ?? undefined,
            reasons: match.reasons ?? undefined
        }));
    }

    async listRequirements(limit = 50): Promise<IdeaSummary[]> {
        return (this.native.listRequirements(limit) as NativeIdeaSummary[]).map(toIdea);
    }

    async getFileContext(filePath: string): Promise<FileRelatedRequirements> {
        const related = this.native.getFileContext(filePath) as NativeFileRelated;
        return {
            fileUri: related.fileUri,
            ideasInFile: related.ideasInFile.map(toIdea),
            referencingIdeas: related.referencingIdeas.map(toIdea),
            commentLinkedIdeas: related.commentLinkedIdeas.map(toIdea),
            folderReferencingIdeas: related.folderReferencingIdeas.map(toIdea)
        };
    }

    async getLocalGraph(filePath: string, depth = 1): Promise<GraphSlice | undefined> {
        const graph = this.native.getLocalGraph(filePath, depth) as NativeGraphSlice | null;
        return graph ? toGraph(graph) : undefined;
    }

    async summarizeSubtree(requirementName: string, depth = 2): Promise<GraphSlice | undefined> {
        const graph = this.native.summarizeSubtree(requirementName, depth) as NativeGraphSlice | null;
        return graph ? toGraph(graph) : undefined;
    }

    /**
     * rq:["../../../../reqlan rq/cli/click.rq".click]
     * rq:["../../../../reqlan rq/cli/click.rq".click_session]
     */
    async click(target: string, options?: ClickOptions): Promise<ClickResult> {
        return this.native.click(
            target,
            options?.sessionKey,
            options?.maxDetail,
            options?.maxBacklinks,
            options?.maxSiblings,
            options?.maxOutbound,
            options?.maxCandidates
        ) as NativeClickResult;
    }

    /**
     * rq:["../../../../reqlan rq/cli/click.rq".click_ambiguity]
     */
    async checkNameAmbiguity(name: string): Promise<NameAmbiguity> {
        return this.native.checkNameAmbiguity(name) as NativeNameAmbiguity;
    }

    async getCompletionStatus(): Promise<CompletionSummary> {
        const summary = this.native.getCompletionStatus() as NativeCompletionSummary;
        return {
            total: summary.total,
            byStatus: toCountRecord(summary.byStatus),
            byTag: toCountRecord(summary.byTag),
            outstanding: summary.outstanding.map(toIdea),
            deprecated: summary.deprecated.map(toIdea)
        };
    }

    async getDeprecationImpact(): Promise<DeprecationImpact[]> {
        const impacts = this.native.getDeprecationImpact() as NativeDeprecationImpact[];
        return impacts.map(impact => ({
            deprecated: toIdea(impact.deprecated),
            dependents: impact.dependents.map(toIdea)
        }));
    }

    async listBrokenReferences(options?: {
        pathGlob?: string;
        includeCommentReferences?: boolean;
    }): Promise<NativeBrokenReference[]> {
        return this.native.listBrokenReferences(
            options?.pathGlob,
            options?.includeCommentReferences ?? false
        ) as NativeBrokenReference[];
    }

    /**
     * rq:["../../../../reqlan rq/core_analysis/check.rq".check]
     * rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
     * rq:["../../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
     * rq:["../../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
     * rq:["../../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
     */
    async check(options?: {
        pathGlob?: string;
        wildcardZero?: string;
        wildcardOne?: string;
        skipTargets?: string[];
        skipGitignoredTargets?: boolean;
    }): Promise<NativeBrokenReference[]> {
        return this.native.checkReferences(
            options?.pathGlob,
            options?.wildcardZero,
            options?.wildcardOne,
            options?.skipTargets,
            options?.skipGitignoredTargets
        ) as NativeBrokenReference[];
    }

    async exportHtml(
        request: Omit<ExportRequest, 'workspaceRoot'> & { workspaceRoot?: string },
        _onProgress?: ExportProgressCallback
    ): Promise<ExportResult> {
        return this.exportFormat('html', request);
    }

    async exportMarkdown(
        request: Omit<ExportRequest, 'workspaceRoot'> & { workspaceRoot?: string },
        _onProgress?: ExportProgressCallback
    ): Promise<ExportResult> {
        return this.exportFormat('markdown', request);
    }

    async exportJson(
        request: Omit<ExportRequest, 'workspaceRoot'> & { workspaceRoot?: string },
        _onProgress?: ExportProgressCallback
    ): Promise<ExportResult> {
        return this.exportFormat('json', request);
    }

    async exportCsv(
        request: Omit<ExportRequest, 'workspaceRoot'> & { workspaceRoot?: string },
        _onProgress?: ExportProgressCallback
    ): Promise<ExportResult> {
        return this.exportFormat('csv', request);
    }

    async resolveRequirementReference(name?: string): Promise<IdeaSummary[]> {
        return (this.native.resolveRequirementReference(name) as NativeIdeaSummary[]).map(toIdea);
    }

    async resolveFileReference(pathPrefix?: string): Promise<Array<{ path: string; ideas: IdeaSummary[] }>> {
        return this.native.resolveFileReference(pathPrefix) as Array<{ path: string; ideas: IdeaSummary[] }>;
    }

    listInteractions(): InteractionDescriptor[] {
        return [
            {
                name: 'search_requirements',
                description: 'Search requirements by keyword across names, summaries, tags, and references.',
                parameters: { query: 'Search text', limit: 'Optional maximum number of matches' }
            },
            {
                name: 'list_requirements',
                description: 'List indexed requirements in the workspace.',
                parameters: { limit: 'Optional maximum number of requirements' }
            },
            {
                name: 'file_context',
                description: 'Get requirements in, referencing, or comment-linked to a file.',
                parameters: { filePath: 'Relative or absolute path to a .rq file' }
            },
            {
                name: 'local_graph',
                description: 'Get the local requirement graph around the first requirement in a file.',
                parameters: { filePath: 'Relative or absolute path to a .rq file', depth: 'Optional hop depth' }
            },
            {
                name: 'click',
                description:
                    'Return closest ideas for an idea, file, or path. Pass sessionKey on later calls to avoid resurfacing.',
                parameters: {
                    target: 'Idea name, path#idea, .rq file, or indexed path',
                    sessionKey: 'Optional click session key from a prior click',
                    maxDetail: 'Optional hop depth (default 1)'
                }
            },
            {
                name: 'summarize_subtree',
                description: 'Summarise a requirement subtree rooted at a named requirement.',
                parameters: { requirementName: 'Requirement name or search text', depth: 'Optional hop depth' }
            },
            {
                name: 'requirement_reference',
                description: 'Resolve a requirement by name for compact chat or MCP context.',
                parameters: { name: 'Optional requirement name or search text' }
            },
            {
                name: 'file_reference',
                description: 'Resolve requirements indexed in matching .rq files.',
                parameters: { path: 'Optional path fragment filter' }
            },
            {
                name: 'completion_status',
                description: 'Summarise completion and deprecation status across the workspace graph.',
                parameters: {}
            },
            {
                name: 'list_broken_references',
                description:
                    'List unresolved idea references. Optional path glob scopes the base; comment references are included only when requested.',
                parameters: {
                    pathGlob: 'Optional path glob over a subset of the base',
                    includeCommentReferences: 'Optional: include unresolved rq:[…] comment references'
                }
            },
            {
                name: 'check',
                description:
                    'Check idea, comment, and file references. Skip lines after //rq-ignore-error.',
                // rq:["../../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
                parameters: {
                    pathGlob: 'Optional path glob over a subset of the base'
                }
            },
            {
                name: 'export_html',
                description: 'Export the requirement graph as a multi-file static HTML site.',
                parameters: {
                    outputDir: 'Parent directory for the export folder',
                    exportName: 'Export folder name',
                    excludeSecretFiles: 'Optional: omit *.secret.rq files',
                    excludeIgnoredFiles: 'Optional: omit .rqignore-matched files'
                }
            },
            {
                name: 'list_interactions',
                description: 'Discover available requirement graph interactions and parameters.',
                parameters: {}
            }
        ];
    }

    formatIdea(idea: IdeaSummary): string {
        const location = `${idea.fileUri}:${idea.lineStart + 1}`;
        const tags = idea.tags.length > 0 ? `\nTags: ${idea.tags.join(', ')}` : '';
        const status = idea.status ? `\nStatus: ${idea.status}` : '';
        return `### ${idea.name} (${location})\n${idea.summary || '(no summary)'}${status}${tags}`;
    }

    /**
     * rq:["../../../../reqlan rq/cli/click.rq".click_output]
     * rq:["../../../../reqlan rq/cli/click.rq".agent_advisory]
     */
    formatClickResult(result: ClickResult): string {
        const lines = [`sessionKey: ${result.sessionKey}`, `kind: ${result.kind}`, ''];
        if (result.target) {
            const target = result.target;
            const label = target.kind === 'file' ? 'file' : 'idea';
            lines.push(`${label}: ${target.name} (${target.fileUri})`);
            if (target.content) {
                lines.push(`content: ${target.content}`);
            }
            if (target.status) {
                lines.push(`status: ${target.status}`);
            }
            lines.push('');
        }
        pushNameList(lines, 'outbound', result.outbound);
        pushNameList(lines, 'backlinks', result.backlinks);
        pushNameList(lines, 'commentRefs', result.commentRefs);
        pushNameList(lines, 'siblings', result.siblings);
        if (result.connected && result.connected.length > 0) {
            lines.push('connected:');
            for (const item of result.connected) {
                lines.push(`- ${item.name} (${item.fileUri})`);
                if (item.content) {
                    lines.push(`  ${item.content}`);
                }
            }
            lines.push('');
        }
        if (result.candidates && result.candidates.length > 0) {
            lines.push('candidates:');
            for (const item of result.candidates) {
                const hops = item.hops !== undefined && item.hops !== null ? ` hops=${item.hops}` : '';
                lines.push(`- ${item.name} (${item.fileUri})${hops}`);
            }
            lines.push('');
        }
        lines.push('Pass sessionKey on the next click.');
        return lines.join('\n');
    }

    private exportFormat(
        format: string,
        request: Omit<ExportRequest, 'workspaceRoot'> & { workspaceRoot?: string }
    ): ExportResult {
        const dto: ExportRequestDto = {
            format,
            outputDir: request.outputDir,
            exportName: request.exportName,
            workspaceRoot: request.workspaceRoot,
            templateId: request.templateId,
            scope: request.scope,
            sourceFileUri: request.sourceFileUri,
            includeRequirementsPage: request.includeRequirementsPage ?? false,
            includeGraphPage: request.includeGraphPage ?? false,
            printEntryFileName: request.printEntryFileName,
            excludeSecretFiles: request.excludeSecretFiles ?? false,
            excludeIgnoredFiles: request.excludeIgnoredFiles ?? false,
            runtimeMode: request.runtimeMode,
            clusterStrategy: request.clusterStrategy,
            includeIdeaPages: request.includeIdeaPages ?? true,
            includeFilePages: request.includeFilePages ?? true,
            includeCodeFilePages: request.includeCodeFilePages ?? true,
            includeClusterPages: request.includeClusterPages ?? true,
            includeAttributePages: request.includeAttributePages ?? true,
            includePrintPages: request.includePrintPages ?? true,
            maxGraphNodes: request.maxGraphNodes,
            urlBase: request.urlBase,
            headerLink: request.headerLink
        };
        const result = this.native.exportGraph(dto) as ExportResultDto;
        return {
            outputDir: result.outputDir,
            indexFilePath: result.indexFilePath,
            printFilePath: result.printFilePath,
            dataFilePath: result.dataFilePath
        };
    }
}

function toCountRecord(counts: Partial<Record<string, number>> | undefined): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(counts ?? {})) {
        if (typeof value === 'number') {
            result[key] = value;
        }
    }
    return result;
}

function toIdea(idea: NativeIdeaSummary): IdeaSummary {
    return {
        id: idea.id,
        name: idea.name,
        kind: idea.kind as IdeaSummary['kind'],
        fileUri: idea.fileUri,
        lineStart: idea.lineStart,
        summary: idea.summary,
        status: idea.status ?? undefined,
        statusKey: idea.statusKey,
        tags: idea.tags,
        tagsKeys: idea.tagsKeys
    };
}

function toGraph(graph: NativeGraphSlice): GraphSlice {
    return {
        centerId: graph.centerId,
        depth: graph.depth,
        nodes: graph.nodes.map(toIdea),
        edges: graph.edges.map(edge => ({
            id: edge.id,
            sourceId: edge.sourceId,
            targetId: edge.targetId ?? undefined,
            targetFile: edge.targetFile ?? undefined,
            kind: edge.kind as GraphSlice['edges'][number]['kind'],
            label: edge.label ?? undefined
        }))
    };
}

function pushNameList(
    lines: string[],
    title: string,
    list: ClickResult['outbound'] | undefined
): void {
    if (!list) {
        return;
    }
    lines.push(`${title} (${list.total}):`);
    for (const item of list.items) {
        const file = item.fileUri ? ` (${item.fileUri})` : '';
        lines.push(`- ${item.name}${file}`);
    }
    if (list.omitted > 0) {
        lines.push(`+ ${list.omitted} more`);
    }
    lines.push('');
}
