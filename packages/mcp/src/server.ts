import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
    activateAnalysisRuntime,
    AnalysisApi,
    createAnalysisRuntime,
    deactivateAnalysisRuntime,
    type IdeaSummary
} from 'reqlan-analytical';

function resolveWorkspaceRoot(): string {
    const fromEnv = process.env.REQLAN_WORKSPACE?.trim();
    if (fromEnv) {
        return fromEnv;
    }
    return process.cwd();
}

function textContent(text: string) {
    return { content: [{ type: 'text' as const, text }] };
}

export async function startMcpServer(): Promise<void> {
    const workspaceRoot = resolveWorkspaceRoot();
    const runtime = createAnalysisRuntime({
        workspaceRoot,
        storagePath: process.env.REQLAN_INDEX_PATH
    });
    await activateAnalysisRuntime(runtime);
    const api = new AnalysisApi(runtime);

    const server = new McpServer({
        name: 'reqlan',
        version: '0.0.1'
    });

    server.tool(
        'search_requirements',
        'Search requirements by keyword across names, summaries, tags, and references.',
        {
            query: z.string().describe('Search text'),
            limit: z.number().int().positive().max(50).optional().describe('Maximum number of matches')
        },
        async ({ query, limit }) => {
            const matches = await api.searchRequirements(query, limit ?? 8);
            if (matches.length === 0) {
                return textContent(`No requirements matched "${query}".`);
            }
            const body = matches.map(match => {
                const reasons = match.reasons?.length ? `\nReasons: ${match.reasons.join(', ')}` : '';
                const score = match.score !== undefined ? `\nScore: ${match.score}` : '';
                return `${api.formatIdea(match.idea)}${score}${reasons}`;
            }).join('\n\n');
            return textContent(body);
        }
    );

    server.tool(
        'list_requirements',
        'List indexed requirements in the workspace.',
        {
            limit: z.number().int().positive().max(100).optional().describe('Maximum number of requirements')
        },
        async ({ limit }) => {
            const ideas = await api.listRequirements(limit ?? 50);
            if (ideas.length === 0) {
                return textContent('No requirements indexed in the workspace.');
            }
            return textContent(ideas.map(idea => api.formatIdea(idea)).join('\n\n'));
        }
    );

    server.tool(
        'file_context',
        'Get requirements in, referencing, or comment-linked to a file.',
        {
            filePath: z.string().describe('Relative or absolute path to a .rq file')
        },
        async ({ filePath }) => {
            const related = await api.getFileContext(filePath);
            const sections = [
                `File: ${filePath}`,
                formatGroup('In file', related.ideasInFile, api),
                formatGroup('Referencing', related.referencingIdeas, api),
                formatGroup('Comment-linked', related.commentLinkedIdeas, api)
            ];
            return textContent(sections.join('\n\n'));
        }
    );

    server.tool(
        'local_graph',
        'Get the local requirement graph around the first requirement in a file.',
        {
            filePath: z.string().describe('Relative or absolute path to a .rq file'),
            depth: z.number().int().positive().max(5).optional().describe('Graph hop depth')
        },
        async ({ filePath, depth }) => {
            const graph = await api.getLocalGraph(filePath, depth ?? 1);
            if (!graph) {
                return textContent(`No requirements found in ${filePath}.`);
            }
            const nodes = graph.nodes.map(node => api.formatIdea(node)).join('\n\n');
            const edges = graph.edges
                .slice(0, 30)
                .map(edge => `- ${edge.kind}: ${edge.sourceId} -> ${edge.targetId ?? edge.label ?? '?'}`)
                .join('\n');
            return textContent(
                `Graph around ${graph.centerId} (${graph.nodes.length} nodes, ${graph.edges.length} edges)\n\n${nodes}\n\nEdges:\n${edges || '(none)'}`
            );
        }
    );

    server.tool(
        'summarize_subtree',
        'Summarise a requirement subtree rooted at a named requirement.',
        {
            requirementName: z.string().describe('Requirement name or search text'),
            depth: z.number().int().positive().max(5).optional().describe('Graph hop depth')
        },
        async ({ requirementName, depth }) => {
            const graph = await api.summarizeSubtree(requirementName, depth ?? 2);
            if (!graph) {
                return textContent(`No requirement matched "${requirementName}".`);
            }
            const nodes = graph.nodes.map(node => api.formatIdea(node)).join('\n\n');
            return textContent(
                `Subtree summary for ${requirementName} (${graph.nodes.length} nodes, depth ${graph.depth})\n\n${nodes}`
            );
        }
    );

    server.tool(
        'requirement_reference',
        'Resolve a requirement by name for compact AI context.',
        {
            name: z.string().optional().describe('Requirement name or search text')
        },
        async ({ name }) => {
            const ideas = await api.resolveRequirementReference(name);
            if (ideas.length === 0) {
                return textContent('No matching requirements found.');
            }
            return textContent(ideas.map(idea => api.formatIdea(idea)).join('\n\n'));
        }
    );

    server.tool(
        'file_reference',
        'Resolve requirements indexed in matching .rq files.',
        {
            path: z.string().optional().describe('Optional path fragment filter')
        },
        async ({ path }) => {
            const files = await api.resolveFileReference(path);
            if (files.length === 0) {
                return textContent('No matching .rq files found.');
            }
            const body = files.map(file => {
                const ideas = file.ideas.map(idea => `- ${idea.name}: ${idea.summary || '(no summary)'}`).join('\n');
                return `## ${file.path}\n${ideas || '- (no requirements indexed)'}`;
            }).join('\n\n');
            return textContent(body);
        }
    );

    server.tool(
        'completion_status',
        'Summarise completion and deprecation status across the workspace graph.',
        {},
        async () => {
            const summary = await api.getCompletionStatus();
            return textContent([
                `Total ideas: ${summary.total}`,
                `Outstanding: ${summary.outstanding.length}`,
                `Deprecated: ${summary.deprecated.length}`,
                `Statuses: ${Object.entries(summary.byStatus).map(([key, value]) => `${key}=${value}`).join(', ')}`
            ].join('\n'));
        }
    );

    server.tool(
        'list_interactions',
        'Discover available requirement graph interactions and parameters.',
        {},
        async () => {
            const interactions = api.listInteractions();
            const body = interactions.map(item => {
                const params = Object.entries(item.parameters)
                    .map(([key, value]) => `  - ${key}: ${value}`)
                    .join('\n');
                return `## ${item.name}\n${item.description}\nParameters:\n${params || '  (none)'}`;
            }).join('\n\n');
            return textContent(body);
        }
    );

    server.tool(
        'prompt',
        'Prompt-oriented entry point for working with the requirement graph.',
        {
            intent: z.string().describe('What you want to know or do with the requirement graph'),
            filePath: z.string().optional().describe('Optional .rq file to scope the prompt'),
            requirementName: z.string().optional().describe('Optional requirement name to scope the prompt')
        },
        async ({ intent, filePath, requirementName }) => {
            const sections: string[] = [`Intent: ${intent}`];

            if (requirementName) {
                const ideas = await api.resolveRequirementReference(requirementName);
                sections.push(
                    'Requirement scope:',
                    ideas.length > 0
                        ? ideas.map(idea => api.formatIdea(idea)).join('\n\n')
                        : `No requirement matched "${requirementName}".`
                );
            }

            if (filePath) {
                const related = await api.getFileContext(filePath);
                sections.push(
                    `File scope: ${filePath}`,
                    formatGroup('In file', related.ideasInFile, api),
                    formatGroup('Referencing', related.referencingIdeas, api)
                );
            }

            const matches = await api.searchRequirements(intent, 5);
            sections.push(
                'Relevant requirements:',
                matches.length > 0
                    ? matches.map(match => api.formatIdea(match.idea)).join('\n\n')
                    : 'No direct matches found.'
            );

            return textContent(sections.join('\n\n'));
        }
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);

    const shutdown = async () => {
        await deactivateAnalysisRuntime(runtime);
        await server.close();
    };
    process.on('SIGINT', () => {
        void shutdown().finally(() => process.exit(0));
    });
    process.on('SIGTERM', () => {
        void shutdown().finally(() => process.exit(0));
    });
}

function formatGroup(title: string, ideas: IdeaSummary[], api: AnalysisApi): string {
    if (ideas.length === 0) {
        return `${title} (0)\nNone`;
    }
    return `${title} (${ideas.length})\n${ideas.map(idea => api.formatIdea(idea)).join('\n\n')}`;
}
