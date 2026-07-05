import type {
    CompletionSummary,
    DeprecationImpact,
    FileRelatedRequirements,
    GraphSlice,
    IdeaSummary,
    SemanticMatch
} from './core/types.js';
import type { AnalysisRuntime } from './create-runtime.js';

export interface RequirementMatch {
    idea: IdeaSummary;
    score?: number;
    reasons?: string[];
}

export interface InteractionDescriptor {
    name: string;
    description: string;
    parameters: Record<string, string>;
}

export class AnalysisApi {
    constructor(private readonly runtime: AnalysisRuntime) {}

    async ensureReady(): Promise<void> {
        if (this.runtime.index.isReady) {
            return;
        }
        await this.runtime.index.syncWorkspace();
    }

    async searchRequirements(query: string, limit = 8): Promise<RequirementMatch[]> {
        await this.ensureReady();
        const matches = await this.runtime.analysers.run<{ query: string; limit?: number }, SemanticMatch[]>(
            this.runtime.makeContext(),
            'semantic_analysis',
            { query, limit }
        );
        return matches.map(match => ({
            idea: match.idea,
            score: match.score,
            reasons: match.reasons
        }));
    }

    async listRequirements(limit = 50): Promise<IdeaSummary[]> {
        await this.ensureReady();
        const ideas = await this.runtime.analysers.run<void, IdeaSummary[]>(
            this.runtime.makeContext(),
            'list_all_ideas',
            undefined
        );
        return ideas.slice(0, limit);
    }

    async getFileContext(filePath: string): Promise<FileRelatedRequirements> {
        await this.ensureReady();
        const fileUri = this.runtime.index.resolveFileUri(filePath);
        return this.runtime.analysers.run<{ fileUri: string }, FileRelatedRequirements>(
            this.runtime.makeContext(),
            'file_related_requirements',
            { fileUri }
        );
    }

    async getLocalGraph(filePath: string, depth = 1): Promise<GraphSlice | undefined> {
        await this.ensureReady();
        const fileUri = this.runtime.index.resolveFileUri(filePath);
        const ideas = await this.runtime.index.indexStore.getIdeasInFile(fileUri);
        if (ideas.length === 0) {
            return undefined;
        }
        const center = ideas[0]!;
        return this.runtime.analysers.run<{ centerId: string; depth?: number }, GraphSlice>(
            this.runtime.makeContext(),
            'local_graph_analysis',
            { centerId: center.id, depth }
        );
    }

    async summarizeSubtree(requirementName: string, depth = 2): Promise<GraphSlice | undefined> {
        await this.ensureReady();
        const matches = await this.searchRequirements(requirementName, 1);
        const center = matches[0]?.idea;
        if (!center) {
            return undefined;
        }
        return this.runtime.analysers.run<{ centerId: string; depth?: number }, GraphSlice>(
            this.runtime.makeContext(),
            'local_graph_analysis',
            { centerId: center.id, depth }
        );
    }

    async getCompletionStatus(): Promise<CompletionSummary> {
        await this.ensureReady();
        return this.runtime.analysers.run<void, CompletionSummary>(
            this.runtime.makeContext(),
            'completion_tracking',
            undefined
        );
    }

    async getDeprecationImpact(): Promise<DeprecationImpact[]> {
        await this.ensureReady();
        return this.runtime.analysers.run<void, DeprecationImpact[]>(
            this.runtime.makeContext(),
            'deprecation_impact_analysis',
            undefined
        );
    }

    async resolveRequirementReference(name?: string): Promise<IdeaSummary[]> {
        await this.ensureReady();
        const query = name?.trim() ?? '';
        if (query) {
            const matches = await this.searchRequirements(query, 8);
            return matches.map(match => match.idea);
        }
        return this.listRequirements(12);
    }

    async resolveFileReference(pathPrefix?: string): Promise<Array<{ path: string; ideas: IdeaSummary[] }>> {
        await this.ensureReady();
        const prefix = pathPrefix?.trim() ?? '';
        const files = await this.runtime.index.listRqFiles(prefix).slice(0, 12);

        const results: Array<{ path: string; ideas: IdeaSummary[] }> = [];
        for (const path of files) {
            const related = await this.getFileContext(path).catch(() => undefined);
            results.push({
                path,
                ideas: related?.ideasInFile.slice(0, 4) ?? []
            });
        }
        return results;
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
                name: 'list_interactions',
                description: 'Discover available requirement graph interactions and parameters.',
                parameters: {}
            }
        ];
    }

    formatIdea(idea: IdeaSummary): string {
        const location = `${this.runtime.index.relativePath(idea.fileUri)}:${idea.lineStart + 1}`;
        const tags = idea.tags.length > 0 ? `\nTags: ${idea.tags.join(', ')}` : '';
        const status = idea.status ? `\nStatus: ${idea.status}` : '';
        return `### ${idea.name} (${location})\n${idea.summary || '(no summary)'}${status}${tags}`;
    }
}
