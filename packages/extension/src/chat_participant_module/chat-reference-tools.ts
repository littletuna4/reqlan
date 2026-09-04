import * as vscode from 'vscode';
import type { IdeaSummary } from '@reqlan/analytical';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';

export interface RequirementReferenceInput {
    name?: string;
}

export interface FileReferenceInput {
    path?: string;
}

export class RequirementReferenceTool implements vscode.LanguageModelTool<RequirementReferenceInput> {
    constructor(private readonly index: IndexService) {}

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<RequirementReferenceInput>
    ): Promise<vscode.LanguageModelToolResult> {
        await waitForIndex(this.index);
        const query = options.input.name?.trim() ?? '';
        const ideas = await this.index.withAnalysisApi(async api =>
            query ? api.resolveRequirementReference(query) : api.listRequirements(12)
        );

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
    constructor(private readonly index: IndexService) {}

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<FileReferenceInput>
    ): Promise<vscode.LanguageModelToolResult> {
        await waitForIndex(this.index);
        const prefix = options.input.path?.trim() ?? '';
        const matches = (await this.index.withAnalysisApi(api => api.resolveFileReference(prefix))).slice(0, 12);

        if (matches.length === 0) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('No matching .rq files found.')
            ]);
        }

        const sections: string[] = [];
        for (const match of matches) {
            const ideaLines = match.ideas
                .slice(0, 4)
                .map(idea => `- ${idea.name}: ${idea.summary || '(no summary)'}`)
                .join('\n');
            sections.push(`## ${match.path}\n${ideaLines || '- (no requirements indexed)'}`);
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
