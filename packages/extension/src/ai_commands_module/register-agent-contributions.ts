/**
 * Dynamic chat skills, prompts, and agents per ["../../../../reqlan rq/extension/features-ai.rq"]
 */
import * as vscode from 'vscode';

const PROMPT_FILES = [
    'rq-build-requirement.prompt.md',
    'rq-add-to-context.prompt.md',
    'rq-write-plan.prompt.md',
    'rq-search-requirements.prompt.md',
    'rq-file-context.prompt.md'
] as const;

const SKILL_FILES = [
    'rq-requirements/SKILL.md',
    'rq-search/SKILL.md'
] as const;

const AGENT_FILES = ['reqlan.agent.md'] as const;

let registered = false;

export function registerReqlanAgentContributions(
    context: vscode.ExtensionContext
): boolean {
    if (registered) {
        return true;
    }

    const chatApi = vscode.chat as typeof vscode.chat & {
        registerPromptFileProvider?: (provider: vscode.ChatPromptFileProvider) => vscode.Disposable;
        registerSkillProvider?: (provider: vscode.ChatSkillProvider) => vscode.Disposable;
        registerCustomAgentProvider?: (provider: vscode.ChatCustomAgentProvider) => vscode.Disposable;
    };

    if (
        typeof chatApi.registerPromptFileProvider !== 'function'
        && typeof chatApi.registerSkillProvider !== 'function'
        && typeof chatApi.registerCustomAgentProvider !== 'function'
    ) {
        return false;
    }

    const toResources = (relativePaths: readonly string[]) =>
        relativePaths.map(relativePath =>
            ({ uri: vscode.Uri.joinPath(context.extensionUri, relativePath) })
        );

    if (typeof chatApi.registerPromptFileProvider === 'function') {
        const provider: vscode.ChatPromptFileProvider = {
            providePromptFiles: () => toResources(
                PROMPT_FILES.map(name => `prompts/${name}`)
            )
        };
        context.subscriptions.push(chatApi.registerPromptFileProvider(provider));
    }

    if (typeof chatApi.registerSkillProvider === 'function') {
        const provider: vscode.ChatSkillProvider = {
            provideSkills: () => toResources(
                SKILL_FILES.map(name => `skills/${name}`)
            )
        };
        context.subscriptions.push(chatApi.registerSkillProvider(provider));
    }

    if (typeof chatApi.registerCustomAgentProvider === 'function') {
        const provider: vscode.ChatCustomAgentProvider = {
            provideCustomAgents: () => toResources(
                AGENT_FILES.map(name => `agents/${name}`)
            )
        };
        context.subscriptions.push(chatApi.registerCustomAgentProvider(provider));
    }

    registered = true;
    return true;
}

export function listReqlanAgentContributionPaths(context: vscode.ExtensionContext): string[] {
    return [
        ...PROMPT_FILES.map(name => vscode.Uri.joinPath(context.extensionUri, 'prompts', name).fsPath),
        ...SKILL_FILES.map(name => vscode.Uri.joinPath(context.extensionUri, 'skills', name).fsPath),
        ...AGENT_FILES.map(name => vscode.Uri.joinPath(context.extensionUri, 'agents', name).fsPath)
    ];
}
