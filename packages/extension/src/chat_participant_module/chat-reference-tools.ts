import * as vscode from 'vscode';
import type { AnalyserContext, AnalyserRegistry, IdeaSummary, SemanticMatch } from 'reqlan-analytical';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';
import { toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';

export interface RequirementReferenceInput {
    name?: string;
}

export interface FileReferenceInput {
    path?: string;
}

export class RequirementReferenceTool implements vscode.LanguageModelTool<RequirementReferenceInput> {
    constructor(
        private readonly index: IndexService,
        private readonly analysers: AnalyserRegistry,
        private readonly makeContext: () => AnalyserContext
    ) {}

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<RequirementReferenceInput>
    ): Promise<vscode.LanguageModelToolResult> {
        await waitForIndex(this.index);
        const query = options.input.name?.trim() ?? '';
        const ideas = query
            ? (await this.analysers.run<{ query: string; limit?: number }, SemanticMatch[]>(
                this.makeContext(),
                'semantic_analysis',
                { query, limit: 8 }
            )).map(match => match.idea)
            : await this.analysers.run<void, IdeaSummary[]>(this.makeContext(), 'list_all_ideas', undefined);

        const filtered = query
            ? ideas
            : ideas.slice(0, 12);

        if (filtered.length === 0) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('No matching requirements found.')
            ]);
        }

        const body = filtered.map(formatIdeaForModel).join('\n\n');
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(body)
        ]);
    }
}

export class FileReferenceTool implements vscode.LanguageModelTool<FileReferenceInput> {
    constructor(
        private readonly index: IndexService,
        private readonly analysers: AnalyserRegistry,
        private readonly makeContext: () => AnalyserContext
    ) {}

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<FileReferenceInput>
    ): Promise<vscode.LanguageModelToolResult> {
        await waitForIndex(this.index);
        const prefix = options.input.path?.trim() ?? '';
        const files = await vscode.workspace.findFiles('**/*.rq', '**/node_modules/**', 200);
        const matches = files
            .map(uri => ({ uri, relativePath: vscode.workspace.asRelativePath(uri) }))
            .filter(entry => !prefix || entry.relativePath.includes(prefix))
            .slice(0, 12);

        if (matches.length === 0) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('No matching .rq files found.')
            ]);
        }

        const sections: string[] = [];
        for (const match of matches) {
            const related = await this.analysers.run<{ fileUri: string }, {
                ideasInFile: IdeaSummary[];
            }>(
                this.makeContext(),
                'file_related_requirements',
                { fileUri: toIndexFileUri(match.uri) }
            ).catch(() => ({ ideasInFile: [] as IdeaSummary[] }));

            const ideaLines = related.ideasInFile
                .slice(0, 4)
                .map(idea => `- ${idea.name}: ${idea.summary || '(no summary)'}`)
                .join('\n');
            sections.push(`## ${match.relativePath}\n${ideaLines || '- (no requirements indexed)'}`);
        }

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(sections.join('\n\n'))
        ]);
    }
}

function formatIdeaForModel(idea: IdeaSummary): string {
    const location = `${vscode.workspace.asRelativePath(idea.fileUri)}:${idea.lineStart + 1}`;
    const tags = idea.tags.length > 0 ? `\nTags: ${idea.tags.join(', ')}` : '';
    const status = idea.status ? `\nStatus: ${idea.status}` : '';
    return `### ${idea.name} (${location})\n${idea.summary || '(no summary)'}${status}${tags}`;
}

async function waitForIndex(index: IndexService): Promise<void> {
    if (index.isReady) {
        return;
    }
    await index.syncWorkspace();
}
