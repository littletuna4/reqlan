/**
 * Chat skills, prompts, and agents are contributed once via package.json
 * (chatSkills, chatPromptFiles, chatAgents) per chat_participant_skills.
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

export function listReqlanAgentContributionPaths(context: vscode.ExtensionContext): string[] {
    return [
        ...PROMPT_FILES.map(name => vscode.Uri.joinPath(context.extensionUri, 'prompts', name).fsPath),
        ...SKILL_FILES.map(name => vscode.Uri.joinPath(context.extensionUri, 'skills', name).fsPath),
        ...AGENT_FILES.map(name => vscode.Uri.joinPath(context.extensionUri, 'agents', name).fsPath)
    ];
}
