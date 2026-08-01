import { Command, Option } from 'clipanion';
import type { CompletionSummary, FileRelatedRequirements, GraphSlice, IdeaSummary } from '@reqlan/analytical';
import { withAnalysisApi } from '../runtime.js';
import { emit } from '../output.js';

function formatIdeaList(apiFormat: (idea: IdeaSummary) => string, ideas: IdeaSummary[], heading: string): string {
    if (ideas.length === 0) {
        return `${heading}\n(none)`;
    }
    return `${heading}\n${ideas.map(idea => apiFormat(idea)).join('\n\n')}`;
}

function formatFileContext(
    formatIdea: (idea: IdeaSummary) => string,
    related: FileRelatedRequirements
): string {
    return [
        formatIdeaList(formatIdea, related.ideasInFile, '## Ideas in file'),
        formatIdeaList(formatIdea, related.referencingIdeas, '## Referencing ideas'),
        formatIdeaList(formatIdea, related.commentLinkedIdeas, '## Comment-linked ideas'),
        formatIdeaList(formatIdea, related.folderReferencingIdeas, '## Folder-referencing ideas')
    ].join('\n\n');
}

function formatGraph(formatIdea: (idea: IdeaSummary) => string, slice: GraphSlice): string {
    const nodes = slice.nodes.map(idea => formatIdea(idea)).join('\n\n');
    const edges = slice.edges
        .map(edge => `${edge.sourceId} -[${edge.kind}]-> ${edge.targetId ?? edge.targetFile ?? '?'}`)
        .join('\n');
    return `## Graph (center ${slice.centerId}, depth ${slice.depth})\n\n### Nodes\n${nodes || '(none)'}\n\n### Edges\n${edges || '(none)'}`;
}

function formatCompletion(formatIdea: (idea: IdeaSummary) => string, summary: CompletionSummary): string {
    const byStatus = Object.entries(summary.byStatus)
        .map(([status, count]) => `  ${status}: ${count}`)
        .join('\n');
    return [
        `## Workspace completion`,
        `Total: ${summary.total}`,
        `By status:\n${byStatus || '  (none)'}`,
        formatIdeaList(formatIdea, summary.outstanding.slice(0, 12), '## Outstanding (sample)'),
        formatIdeaList(formatIdea, summary.deprecated.slice(0, 12), '## Deprecated (sample)')
    ].join('\n\n');
}

export class AnalyseCommand extends Command {
    static override paths = [['analyse'], ['analyze']];

    static override usage = Command.Usage({
        description: 'Analyse a file, idea, or the whole workspace requirement graph.',
        details: `
            Without flags, reports workspace completion status.
            Use --file for file-related requirements, or --idea for a named requirement subtree.
        `,
        examples: [
            ['Workspace completion', '$0 analyse'],
            ['File context', '$0 analyse --file ./reqlan\\ rq/cli/cli_package.rq'],
            ['Idea subtree', '$0 analyze --idea cli_package']
        ]
    });

    file = Option.String('-f,--file', {
        description: 'Analyse requirements related to a file path'
    });
    idea = Option.String('-i,--idea', {
        description: 'Analyse the local graph around a named requirement'
    });
    depth = Option.String('--depth', '2', {
        description: 'Hop depth for --idea graph (default 2)'
    });
    cwd = Option.String('--cwd', {
        description: 'Workspace root (default: walk from cwd, or REQLAN_WORKSPACE)'
    });
    json = Option.Boolean('--json', false, {
        description: 'Emit machine-readable JSON'
    });

    async execute(): Promise<number> {
        if (this.file && this.idea) {
            this.context.stderr.write('Specify only one of --file or --idea.\n');
            return 1;
        }

        try {
            await withAnalysisApi(this.cwd, async api => {
                if (this.file) {
                    const related = await api.getFileContext(this.file);
                    if (this.json) {
                        emit(related, true);
                    } else {
                        emit(formatFileContext(idea => api.formatIdea(idea), related), false);
                    }
                    return;
                }

                if (this.idea) {
                    const depth = Number.parseInt(this.depth, 10);
                    const slice = await api.summarizeSubtree(this.idea, Number.isFinite(depth) ? depth : 2);
                    if (!slice) {
                        if (this.json) {
                            emit({ idea: this.idea, found: false }, true);
                        } else {
                            this.context.stdout.write(`No requirement matched "${this.idea}".\n`);
                        }
                        return;
                    }
                    if (this.json) {
                        emit(slice, true);
                    } else {
                        emit(formatGraph(idea => api.formatIdea(idea), slice), false);
                    }
                    return;
                }

                const summary = await api.getCompletionStatus();
                if (this.json) {
                    emit(summary, true);
                } else {
                    emit(formatCompletion(idea => api.formatIdea(idea), summary), false);
                }
            });
            return 0;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.context.stderr.write(`${message}\n`);
            return 1;
        }
    }
}
