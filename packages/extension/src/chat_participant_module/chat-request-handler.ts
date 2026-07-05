import * as vscode from 'vscode';
import type { AnalyserContext, AnalyserRegistry, FileRelatedRequirements, GraphSlice, IdeaSummary, SemanticMatch } from 'reqlan-analytical';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';
import { resolveIndexFileUri, toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';

export interface ChatHandlerDeps {
    index: IndexService;
    analysers: AnalyserRegistry;
    makeContext: () => AnalyserContext;
}

export function createChatRequestHandler(deps: ChatHandlerDeps): vscode.ChatRequestHandler {
    return async (request, _context, stream, _token) => {
        await waitForIndex(deps.index);

        const references = await collectReferenceContext(request, deps);
        if (references.length > 0) {
            stream.progress('Loading referenced context…');
            stream.markdown('**Referenced context**\n\n');
            for (const section of references) {
                stream.markdown(section);
                stream.markdown('\n\n');
            }
        }

        switch (request.command) {
            case 'rq-search':
                return handleSearch(request.prompt, deps, stream);
            case 'rq-context':
                return handleContext(deps, stream);
            case 'rq-graph':
                return handleGraph(deps, stream);
            case 'rq-related':
                return handleRelated(deps, stream);
            default:
                return handleDefault(request.prompt, deps, stream);
        }
    };
}

async function handleSearch(
    prompt: string,
    deps: ChatHandlerDeps,
    stream: vscode.ChatResponseStream
): Promise<vscode.ChatResult> {
    const query = prompt.trim();
    if (!query) {
        stream.markdown('Provide a search query after `/rq-search`, for example: `/rq-search authentication`.');
        return { metadata: { command: 'rq-search' } };
    }

    stream.progress('Searching requirements…');
    const matches = await deps.analysers.run<{ query: string; limit?: number }, SemanticMatch[]>(
        deps.makeContext(),
        'semantic_analysis',
        { query, limit: 8 }
    );

    if (matches.length === 0) {
        stream.markdown(`No requirements matched **${query}**.`);
        return { metadata: { command: 'rq-search', query } };
    }

    stream.markdown(`Found **${matches.length}** requirement(s) for **${query}**:\n\n`);
    for (const match of matches) {
        appendIdeaMarkdown(stream, match.idea, match.reasons.join(', '));
    }
    return { metadata: { command: 'rq-search', query, count: matches.length } };
}

async function handleContext(
    deps: ChatHandlerDeps,
    stream: vscode.ChatResponseStream
): Promise<vscode.ChatResult> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        stream.markdown('Open a file to gather requirement context.');
        return { metadata: { command: 'rq-context' } };
    }

    stream.progress('Gathering file context…');
    const fileUri = toIndexFileUri(editor.document.uri);
    const related = await deps.analysers.run<{ fileUri: string }, FileRelatedRequirements>(
        deps.makeContext(),
        'file_related_requirements',
        { fileUri }
    );

    stream.markdown(`**${vscode.workspace.asRelativePath(fileUri)}**\n\n`);
    renderIdeaGroup(stream, 'Requirements in file', related.ideasInFile);
    renderIdeaGroup(stream, 'Referencing requirements', related.referencingIdeas);
    renderIdeaGroup(stream, 'Comment-linked requirements', related.commentLinkedIdeas);
    stream.reference(editor.document.uri);
    return { metadata: { command: 'rq-context', fileUri } };
}

async function handleGraph(
    deps: ChatHandlerDeps,
    stream: vscode.ChatResponseStream
): Promise<vscode.ChatResult> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'reqlan') {
        stream.markdown('Open a reqlan file to inspect its local requirement graph.');
        return { metadata: { command: 'rq-graph' } };
    }

    stream.progress('Building local graph…');
    const ideas = await deps.index.indexStore.getIdeasInFile(toIndexFileUri(editor.document.uri));
    if (ideas.length === 0) {
        stream.markdown('No requirements found in the current file.');
        return { metadata: { command: 'rq-graph' } };
    }

    const center = ideas[0]!;
    const graph = await deps.analysers.run<{ centerId: string; depth?: number }, GraphSlice>(
        deps.makeContext(),
        'local_graph_analysis',
        { centerId: center.id, depth: 1 }
    );

    stream.markdown(`Local graph around **${center.name}** (${graph.nodes.length} nodes, ${graph.edges.length} edges):\n\n`);
    for (const node of graph.nodes) {
        appendIdeaMarkdown(stream, node);
    }
    if (graph.edges.length > 0) {
        stream.markdown('\n**Edges**\n\n');
        for (const edge of graph.edges.slice(0, 20)) {
            stream.markdown(`- ${edge.kind}: ${edge.sourceId} → ${edge.targetId ?? edge.label ?? '?'}\n`);
        }
    }
    return { metadata: { command: 'rq-graph', centerId: center.id } };
}

async function handleRelated(
    deps: ChatHandlerDeps,
    stream: vscode.ChatResponseStream
): Promise<vscode.ChatResult> {
    return handleContext(deps, stream);
}

async function handleDefault(
    prompt: string,
    deps: ChatHandlerDeps,
    stream: vscode.ChatResponseStream
): Promise<vscode.ChatResult> {
    const query = prompt.trim();
    if (!query) {
        stream.markdown(
            'Ask about your requirements, or use `/rq-search`, `/rq-context`, `/rq-graph`, or `/rq-related`.\n\n' +
            'Attach context with `#requirement` or `#file` references, or Cursor skills like `/rq-search-requirements`.'
        );
        return { metadata: { command: 'default' } };
    }

    stream.progress('Finding relevant requirements…');
    const matches = await deps.analysers.run<{ query: string; limit?: number }, SemanticMatch[]>(
        deps.makeContext(),
        'semantic_analysis',
        { query, limit: 5 }
    );

    if (matches.length === 0) {
        stream.markdown(`I could not find requirements related to **${query}**. Try \`/rq-search ${query}\`.`);
        return { metadata: { command: 'default', query } };
    }

    stream.markdown(`Here is focused context for **${query}**:\n\n`);
    for (const match of matches) {
        appendIdeaMarkdown(stream, match.idea, match.reasons.join(', '));
    }
    stream.markdown(
        '\nUse `/rq-context` for the active file, `/rq-graph` for neighbourhood structure, or `/rq-search-requirements` / MCP tools to attach more context.'
    );
    return { metadata: { command: 'default', query, count: matches.length } };
}

async function collectReferenceContext(
    request: vscode.ChatRequest,
    deps: ChatHandlerDeps
): Promise<string[]> {
    const sections: string[] = [];
    for (const reference of request.references) {
        const value = reference.value;
        if (value instanceof vscode.Uri) {
            sections.push(await describeFileReference(value, deps));
            continue;
        }
        if (value instanceof vscode.Location) {
            sections.push(await describeFileReference(value.uri, deps, value.range.start.line));
            continue;
        }
        if (typeof value === 'string' && value.trim()) {
            sections.push(value.trim());
        }
    }
    return sections;
}

async function describeFileReference(
    uri: vscode.Uri,
    deps: ChatHandlerDeps,
    line?: number
): Promise<string> {
    const fileUri = toIndexFileUri(uri);
    const related = await deps.analysers.run<{ fileUri: string }, FileRelatedRequirements>(
        deps.makeContext(),
        'file_related_requirements',
        { fileUri }
    ).catch(() => undefined);

    const header = line !== undefined
        ? `**${vscode.workspace.asRelativePath(uri)}:${line + 1}**`
        : `**${vscode.workspace.asRelativePath(uri)}**`;

    if (!related) {
        return header;
    }

    const ideas = related.ideasInFile.slice(0, 4).map(idea => `- ${idea.name}: ${idea.summary || '(no summary)'}`).join('\n');
    return `${header}\n${ideas || '- (no indexed requirements)'}`;
}

function renderIdeaGroup(
    stream: vscode.ChatResponseStream,
    title: string,
    ideas: IdeaSummary[]
): void {
    stream.markdown(`**${title}** (${ideas.length})\n\n`);
    if (ideas.length === 0) {
        stream.markdown('_None_\n\n');
        return;
    }
    for (const idea of ideas.slice(0, 8)) {
        appendIdeaMarkdown(stream, idea);
    }
}

function appendIdeaMarkdown(
    stream: vscode.ChatResponseStream,
    idea: IdeaSummary,
    detail?: string
): void {
    const location = `${vscode.workspace.asRelativePath(idea.fileUri)}:${idea.lineStart + 1}`;
    const suffix = detail ? ` _(${detail})_` : '';
    stream.markdown(`- **${idea.name}** — ${location}${suffix}\n`);
    if (idea.summary) {
        stream.markdown(`  ${idea.summary}\n`);
    }
    stream.reference(resolveIndexFileUri(idea.fileUri));
}

async function waitForIndex(index: IndexService): Promise<void> {
    if (index.isReady) {
        return;
    }
    await index.syncWorkspace();
}
