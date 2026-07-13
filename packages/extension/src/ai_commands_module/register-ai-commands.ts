/**
 * AI workflow commands per ["../../../../reqlan rq/extension/features-ai.rq"]
 */
import * as vscode from 'vscode';
import type { IdeaSummary, SemanticMatch } from 'reqlan-analytical';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';
import {
    installCursorSkills,
    workspaceHasCursorSkills
} from './install-cursor-skills.js';

export function registerAiCommandsModule(
    context: vscode.ExtensionContext,
    submodule: AnalyticalSubmodule
): void {
    void maybePromptCursorSkillsInstall(context);

    context.subscriptions.push(
        vscode.commands.registerCommand('reqlan.installCursorSkills', async () => {
            const result = await installCursorSkills(context);
            if (!result) {
                return;
            }
            const skillList = result.skillNames.map(name => `/${name}`).join(', ');
            const mcpNote = result.mcpConfigured
                ? ' MCP config updated in .cursor/mcp.json.'
                : result.mcpSkippedReason
                    ? ` ${result.mcpSkippedReason}`
                    : '';
            const reload = 'Reload Window';
            const picked = await vscode.window.showInformationMessage(
                `Installed ${result.skillNames.length} rq-* skills to .cursor/skills: ${skillList}.${mcpNote} Reload Cursor to pick them up in chat.`,
                reload
            );
            if (picked === reload) {
                await vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        }),

        vscode.commands.registerCommand('reqlan.addAgentCommands', async () => {
            await vscode.commands.executeCommand('reqlan.installCursorSkills');
        }),

        vscode.commands.registerCommand('reqlan.buildRequirement', async () => {
            const intent = await vscode.window.showInputBox({
                prompt: 'Describe the requirement to create',
                placeHolder: 'e.g. webview module with paginated idea tables'
            });
            if (!intent) {
                return;
            }
            await openChatPrompt(context, 'rq-build-requirement', intent);
        }),

        vscode.commands.registerCommand('reqlan.addToContext', async () => {
            const idea = await pickIdea(submodule, 'Select a requirement to add to chat context');
            if (!idea) {
                return;
            }
            const contextText = formatIdeaContext(idea);
            const copied = await copyToClipboard(contextText);
            const opened = await openChatWithText(`#requirement ${idea.name}\n\n${contextText}`);
            if (!opened && copied) {
                void vscode.window.showInformationMessage(
                    'Requirement context copied to clipboard. Paste it into chat.'
                );
            }
        }),

        vscode.commands.registerCommand('reqlan.writePlan', async () => {
            const idea = await pickIdea(submodule, 'Select a requirement to plan');
            if (!idea) {
                return;
            }
            await openChatPrompt(context, 'rq-write-plan', idea.name);
        }),

        vscode.commands.registerCommand('reqlan.runPrompt', async (promptName?: string) => {
            const selected = promptName ?? await vscode.window.showQuickPick([
                { label: 'rq-build-requirement', description: 'Create a requirement from intent' },
                { label: 'rq-add-to-context', description: 'Attach requirement context to chat' },
                { label: 'rq-write-plan', description: 'Draft an @plan attribute' },
                { label: 'rq-search-requirements', description: 'Search the requirement graph' },
                { label: 'rq-file-context', description: 'Summarise requirements for a file' }
            ], { placeHolder: 'Run a reqlan chat prompt (rq-*)' });
            if (!selected) {
                return;
            }
            const name = typeof selected === 'string' ? selected : selected.label;
            const input = await vscode.window.showInputBox({
                prompt: `Input for /${name}`,
                placeHolder: 'Optional prompt argument'
            });
            await openChatPrompt(context, name, input ?? '');
        })
    );
}

async function maybePromptCursorSkillsInstall(context: vscode.ExtensionContext): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return;
    }
    if (await workspaceHasCursorSkills(workspaceFolder)) {
        return;
    }
    const install = 'Install Cursor Skills';
    const picked = await vscode.window.showInformationMessage(
        'Reqlan chat skills are not installed in this workspace. Install them to use /rq-search, /rq-build-requirement, and other slash commands in Cursor Agent chat.',
        install
    );
    if (picked === install) {
        await vscode.commands.executeCommand('reqlan.installCursorSkills');
    }
}

async function pickIdea(
    submodule: AnalyticalSubmodule,
    placeHolder: string
): Promise<IdeaSummary | undefined> {
    const { index, analysers } = submodule;
    if (!index.isReady) {
        await index.syncWorkspace();
    }

    const editor = vscode.window.activeTextEditor;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let ideas: IdeaSummary[] = [];
    if (editor && vscode.workspace.getWorkspaceFolder(editor.document.uri)) {
        const fileUri = toIndexFileUri(editor.document.uri);
        if (editor.document.languageId === 'reqlan') {
            ideas = await index.indexStore.getIdeasInFile(fileUri);
        } else {
            const related = await analysers.run<{ fileUri: string }, import('reqlan-analytical').FileRelatedRequirements>(
                {
                    store: index.indexStore,
                    analytical: submodule.store,
                    workspaceRoot
                },
                'file_related_requirements',
                { fileUri }
            );
            ideas = [
                ...related.referencingIdeas,
                ...related.commentLinkedIdeas,
                ...related.folderReferencingIdeas
            ].filter((idea, idx, list) => list.findIndex(entry => entry.id === idea.id) === idx);
        }
    }
    if (ideas.length === 0) {
        ideas = await analysers.run<void, IdeaSummary[]>(
            {
                store: index.indexStore,
                analytical: submodule.store,
                workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            },
            'list_all_ideas',
            undefined
        );
    }

    const query = await vscode.window.showInputBox({
        prompt: 'Filter requirements (optional)',
        placeHolder
    });
    let filtered = ideas;
    if (query?.trim()) {
        const matches = await analysers.run<{ query: string; limit?: number }, SemanticMatch[]>(
            {
                store: index.indexStore,
                analytical: submodule.store,
                workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            },
            'semantic_analysis',
            { query: query.trim(), limit: 20 }
        );
        filtered = matches.map(match => match.idea);
    }

    const items = filtered.slice(0, 50).map(idea => ({
        label: idea.name,
        description: vscode.workspace.asRelativePath(idea.fileUri),
        detail: idea.summary,
        idea
    }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder });
    return picked?.idea;
}

function formatIdeaContext(idea: IdeaSummary): string {
    const location = `${vscode.workspace.asRelativePath(idea.fileUri)}:${idea.lineStart + 1}`;
    const status = idea.status ? `Status: ${idea.status}\n` : '';
    const tags = idea.tags.length > 0 ? `Tags: ${idea.tags.join(', ')}\n` : '';
    return [
        `**${idea.name}**`,
        location,
        status + tags,
        idea.summary || '(no summary)'
    ].filter(Boolean).join('\n');
}

async function copyToClipboard(text: string): Promise<boolean> {
    await vscode.env.clipboard.writeText(text);
    return true;
}

async function openChatWithText(text: string): Promise<boolean> {
    const commands = [
        'workbench.action.chat.open',
        'aichat.newchataction',
        'composer.newAgentChat'
    ];
    for (const command of commands) {
        try {
            await vscode.commands.executeCommand(command, { query: text, message: text });
            return true;
        } catch {
            // try next host-specific chat command
        }
    }
    return false;
}

async function openChatPrompt(
    context: vscode.ExtensionContext,
    promptName: string,
    argument: string
): Promise<void> {
    const promptUri = vscode.Uri.joinPath(context.extensionUri, 'prompts', `${promptName}.prompt.md`);
    const slashPrompt = `/${promptName}${argument ? ` ${argument}` : ''}`;
    const opened = await openChatWithText(slashPrompt);
    if (!opened) {
        try {
            await vscode.commands.executeCommand('vscode.open', promptUri);
        } catch {
            void vscode.window.showInformationMessage(
                `Run ${slashPrompt} in chat, or open ${promptUri.fsPath}.`
            );
        }
    }
}
