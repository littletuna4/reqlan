import { Command, Option } from 'clipanion';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import type { CompletionSummary, FileRelatedRequirements, GraphSlice, IdeaSummary } from '@reqlan/analytical/core';
import {
    analyzeLocalSymbolic,
    localSymbolicReferencesForIdea,
    type LocalSymbolicDocument
} from '@reqlan/analytical/core';
import { withAnalysisApi } from '../runtime.js';
import { emit } from '../output.js';
import { formatBrokenRefs } from '../format-broken-refs.js';

/**
 * rq:["../../../../reqlan rq/core_analysis/core.rq".test_references]
 * rq:["../../../../reqlan rq/cli/cli_package.rq".commands]
 * rq:["../../../../reqlan rq/indexer/indexer.rq".local_symbolic_analysis]
 */

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

function formatLocalSymbolic(doc: LocalSymbolicDocument): string {
    const ideaBlocks = doc.ideas.map(idea => {
        const { outbound, inbound } = localSymbolicReferencesForIdea(doc, idea.id);
        const outLines =
            outbound.length === 0
                ? ['  (none)']
                : outbound.map(
                      edge =>
                          `  → ${edge.label ?? edge.targetId ?? edge.targetFile ?? '?'} [${edge.kind}]`
                  );
        const inLines =
            inbound.length === 0
                ? ['  (none)']
                : inbound.map(edge => {
                      const sourceName = edge.sourceId.includes('#')
                          ? edge.sourceId.slice(edge.sourceId.indexOf('#') + 1)
                          : edge.sourceId;
                      return `  ← ${sourceName} [${edge.kind}]`;
                  });
        return [
            `### ${idea.name}`,
            `Outbound (${outbound.length})`,
            ...outLines,
            `Inbound / backlinks (${inbound.length})`,
            ...inLines
        ].join('\n');
    });
    return [
        `## Local symbolic analysis (${doc.fileUri})`,
        `Ideas: ${doc.ideas.length} · outbound edges: ${doc.edges.length} · same-file inbound: ${doc.inbound.length}`,
        '',
        ...ideaBlocks
    ].join('\n');
}

export class AnalyseCommand extends Command {
    static override paths = [['analyse'], ['analyze']];

    static override usage = Command.Usage({
        description: 'Analyse a file, idea, or the whole workspace requirement graph.',
        details: `
            Without flags, reports workspace completion status.
            Use --file for file-related requirements, --idea for a named requirement subtree,
            --local-symbolic for open-buffer outbound + same-file inbound analysis (no index),
            or --broken-refs to list unresolved references (optional --glob and --include-comments).
        `,
        examples: [
            ['Workspace completion', '$0 analyse'],
            ['File context', '$0 analyse --file ./reqlan\\ rq/cli/cli_package.rq'],
            ['Idea subtree', '$0 analyze --idea cli_package'],
            ['Local symbolic (outbound + same-file inbound)', '$0 analyse --local-symbolic ./path/to/file.rq'],
            ['Broken references', '$0 analyse --broken-refs'],
            ['Broken refs in a glob, including comments', '$0 analyse --broken-refs --glob "src/**" --include-comments']
        ]
    });

    file = Option.String('-f,--file', {
        description: 'Analyse requirements related to a file path'
    });
    idea = Option.String('-i,--idea', {
        description: 'Analyse the local graph around a named requirement'
    });
    localSymbolic = Option.String('--local-symbolic', {
        description:
            'File-local symbolic analysis: outbound edges and same-file inbound backlinks (no SQLite / catalog)'
    });
    brokenRefs = Option.Boolean('--broken-refs', false, {
        description: 'List unresolved (broken) references in the base'
    });
    glob = Option.String('--glob', {
        description: 'Optional path glob that limits --broken-refs to a subset of the base'
    });
    includeComments = Option.Boolean('--include-comments', false, {
        description: 'With --broken-refs, also list unresolved rq:[…] comment references'
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
        const modeCount = [
            this.file,
            this.idea,
            this.localSymbolic,
            this.brokenRefs ? 'broken' : undefined
        ].filter(Boolean).length;
        if (modeCount > 1) {
            this.context.stderr.write(
                'Specify only one of --file, --idea, --local-symbolic, or --broken-refs.\n'
            );
            return 1;
        }

        try {
            if (this.localSymbolic) {
                if (extname(this.localSymbolic) !== '.rq') {
                    throw new Error('Please choose a file with one of these extensions: .rq.');
                }
                const absolute = resolve(this.localSymbolic);
                if (!existsSync(absolute)) {
                    throw new Error(`File ${this.localSymbolic} does not exist.`);
                }
                const source = readFileSync(absolute, 'utf8');
                const doc = analyzeLocalSymbolic(this.localSymbolic, source);
                if (this.json) {
                    emit(doc, true);
                } else {
                    emit(formatLocalSymbolic(doc), false);
                }
                return 0;
            }

            await withAnalysisApi(this.cwd, async api => {
                if (this.brokenRefs) {
                    const rows = await api.listBrokenReferences({
                        pathGlob: this.glob,
                        includeCommentReferences: this.includeComments
                    });
                    if (this.json) {
                        emit(rows, true);
                    } else {
                        emit(formatBrokenRefs(rows), false);
                    }
                    return;
                }
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
