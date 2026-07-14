/**
 * AI workflow commands per ["../../../../reqlan rq/extension/features-ai.rq"]
 * and add_to_chat in ["../../../../reqlan rq/extension/features-commands.rq"]
 */
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { IdeaSummary, SemanticMatch } from 'reqlan-analytical';
import type { AnalyticalSubmodule } from '../analytical_submodule/index.js';
import { toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';
import {
    findIdeaAtLine,
    ideasInSelectionRange
} from '../activity_bar_module/file-context-resolver.js';
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
            await vscode.commands.executeCommand('reqlan.addIdeaToChat');
        }),

        vscode.commands.registerCommand('reqlan.addIdeaToChat', async () => {
            const idea = await resolveIdeaForChat(submodule);
            if (!idea) {
                return;
            }
            await sendIdeaToChat(idea);
        }),

        vscode.commands.registerCommand('reqlan.addIdeasetToChat', async () => {
            const ideaset = await resolveIdeasetForChat(submodule);
            if (!ideaset) {
                return;
            }
            await sendIdeasetToChat(submodule, ideaset);
        }),

        vscode.commands.registerCommand('reqlan.addFileToChat', async () => {
            const file = await resolveRqFileForChat(submodule);
            if (!file) {
                return;
            }
            await sendFileToChat(submodule, file);
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

async function ensureIndex(submodule: AnalyticalSubmodule): Promise<void> {
    if (!submodule.index.isReady) {
        await submodule.index.syncWorkspace();
    }
}

interface EditorFocus {
    editor: vscode.TextEditor;
    fileUri: string;
    line: number;
    selectionRange?: { startLine: number; endLine: number };
}

function isRqEditor(editor: vscode.TextEditor | undefined): editor is vscode.TextEditor {
    if (!editor || !vscode.workspace.getWorkspaceFolder(editor.document.uri)) {
        return false;
    }
    return editor.document.languageId === 'reqlan'
        || editor.document.uri.fsPath.replace(/\\/g, '/').endsWith('.rq');
}

function getEditorFocus(): EditorFocus | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!isRqEditor(editor)) {
        return undefined;
    }
    const selection = editor.selection;
    return {
        editor,
        fileUri: toIndexFileUri(editor.document.uri),
        line: selection.active.line,
        selectionRange: selection.isEmpty
            ? undefined
            : { startLine: selection.start.line, endLine: selection.end.line }
    };
}

async function resolveIdeaForChat(submodule: AnalyticalSubmodule): Promise<IdeaSummary | undefined> {
    await ensureIndex(submodule);
    const focus = getEditorFocus();
    if (focus) {
        const ideas = await submodule.index.indexStore.listIdeasInFileWithRanges(focus.fileUri);
        if (focus.selectionRange) {
            const inSelection = ideasInSelectionRange(
                ideas,
                focus.selectionRange.startLine,
                focus.selectionRange.endLine
            );
            if (inSelection.length === 1) {
                return inSelection[0];
            }
            if (inSelection.length > 1) {
                return pickFromIdeas(inSelection, 'Select an idea from the selection');
            }
        }
        const atCursor = findIdeaAtLine(ideas, focus.line)
            ?? await submodule.index.indexStore.getIdeaAtLine(focus.fileUri, focus.line);
        if (atCursor) {
            return atCursor;
        }
        if (ideas.length > 0) {
            const nearCursor = [...ideas].sort(
                (a, b) => Math.abs(a.lineStart - focus.line) - Math.abs(b.lineStart - focus.line)
            );
            return pickFromIdeas(nearCursor, 'Select an idea to add to chat');
        }
    }
    return pickIdea(submodule, 'Select an idea to add to chat');
}

async function resolveIdeasetForChat(submodule: AnalyticalSubmodule): Promise<IdeaSummary | undefined> {
    await ensureIndex(submodule);
    const focus = getEditorFocus();
    let preferred: IdeaSummary[] = [];
    if (focus) {
        const ideasets = await submodule.index.indexStore.listIdeasetsInFileWithRanges(focus.fileUri);
        preferred = ideasets;
        if (focus.selectionRange) {
            const inSelection = ideasInSelectionRange(
                ideasets,
                focus.selectionRange.startLine,
                focus.selectionRange.endLine
            );
            if (inSelection.length === 1) {
                return inSelection[0];
            }
            if (inSelection.length > 1) {
                return pickFromIdeas(inSelection, 'Select an ideaset from the selection');
            }
        }
        const atCursor = findIdeaAtLine(ideasets, focus.line)
            ?? await submodule.index.indexStore.getIdeasetAtLine(focus.fileUri, focus.line);
        if (atCursor) {
            return atCursor;
        }
        if (ideasets.length === 1) {
            return ideasets[0];
        }
    }
    return pickIdeaset(submodule, preferred);
}

async function resolveRqFileForChat(
    submodule: AnalyticalSubmodule
): Promise<{ fileUri: string; relativePath: string } | undefined> {
    await ensureIndex(submodule);
    const focus = getEditorFocus();
    if (focus) {
        return {
            fileUri: focus.fileUri,
            relativePath: vscode.workspace.asRelativePath(focus.editor.document.uri)
        };
    }
    return pickRqFile();
}

async function pickFromIdeas(
    ideas: IdeaSummary[],
    placeHolder: string
): Promise<IdeaSummary | undefined> {
    const items = ideas.slice(0, 50).map(idea => ({
        label: idea.name,
        description: vscode.workspace.asRelativePath(idea.fileUri),
        detail: idea.summary,
        idea
    }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder });
    return picked?.idea;
}

async function pickIdea(
    submodule: AnalyticalSubmodule,
    placeHolder: string
): Promise<IdeaSummary | undefined> {
    const { index, analysers } = submodule;
    await ensureIndex(submodule);

    const editor = vscode.window.activeTextEditor;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let ideas: IdeaSummary[] = [];
    if (editor && vscode.workspace.getWorkspaceFolder(editor.document.uri)) {
        const fileUri = toIndexFileUri(editor.document.uri);
        if (isRqEditor(editor)) {
            ideas = (await index.indexStore.getIdeasInFile(fileUri))
                .filter(idea => idea.kind !== 'ideaset');
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
        ideas = (await analysers.run<void, IdeaSummary[]>(
            {
                store: index.indexStore,
                analytical: submodule.store,
                workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            },
            'list_all_ideas',
            undefined
        )).filter(idea => idea.kind !== 'ideaset');
    }

    // Cursor/file already narrowed the set; skip workspace-wide filter unless empty context.
    if (ideas.length > 0 && ideas.length <= 50 && isRqEditor(editor)) {
        return pickFromIdeas(ideas, placeHolder);
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
        filtered = matches.map(match => match.idea).filter(idea => idea.kind !== 'ideaset');
    }

    return pickFromIdeas(filtered, placeHolder);
}

async function pickIdeaset(
    submodule: AnalyticalSubmodule,
    preferred: IdeaSummary[] = []
): Promise<IdeaSummary | undefined> {
    await ensureIndex(submodule);
    const all = (await submodule.index.indexStore.listAllIdeas())
        .filter(idea => idea.kind === 'ideaset');
    const preferredIds = new Set(preferred.map(idea => idea.id));
    const ideasets = [
        ...preferred,
        ...all.filter(idea => !preferredIds.has(idea.id))
    ];
    if (ideasets.length === 0) {
        void vscode.window.showInformationMessage('No ideasets found in the workspace.');
        return undefined;
    }

    if (preferred.length > 0) {
        return pickFromIdeas(ideasets, 'Select an ideaset to add to chat');
    }

    const query = await vscode.window.showInputBox({
        prompt: 'Filter ideasets (optional)',
        placeHolder: 'Select an ideaset to add to chat'
    });
    const needle = query?.trim().toLowerCase() ?? '';
    const filtered = needle
        ? ideasets.filter(idea =>
            idea.name.toLowerCase().includes(needle)
            || idea.summary.toLowerCase().includes(needle)
            || vscode.workspace.asRelativePath(idea.fileUri).toLowerCase().includes(needle))
        : ideasets;

    return pickFromIdeas(filtered, 'Select an ideaset to add to chat');
}

async function pickRqFile(): Promise<{ fileUri: string; relativePath: string } | undefined> {
    const files = await vscode.workspace.findFiles('**/*.rq', '**/node_modules/**', 200);
    if (files.length === 0) {
        void vscode.window.showInformationMessage('No .rq files found in the workspace.');
        return undefined;
    }

    const query = await vscode.window.showInputBox({
        prompt: 'Filter .rq files (optional)',
        placeHolder: 'Select a file to add to chat'
    });
    const needle = query?.trim().toLowerCase() ?? '';
    const entries = files
        .map(uri => ({
            uri,
            relativePath: vscode.workspace.asRelativePath(uri),
            fileUri: toIndexFileUri(uri)
        }))
        .filter(entry => !needle || entry.relativePath.toLowerCase().includes(needle))
        .slice(0, 50);

    const items = entries.map(entry => ({
        label: path.basename(entry.relativePath),
        description: path.dirname(entry.relativePath),
        entry
    }));
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a .rq file to add to chat'
    });
    if (!picked) {
        return undefined;
    }
    return {
        fileUri: picked.entry.fileUri,
        relativePath: picked.entry.relativePath
    };
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

async function formatIdeasetContext(
    submodule: AnalyticalSubmodule,
    ideaset: IdeaSummary
): Promise<string> {
    const base = formatIdeaContext(ideaset);
    const members = await submodule.index.indexStore
        .listIdeasetMembers(ideaset.id, 'explicit', ideaset.fileUri)
        .catch(() => []);
    if (members.length === 0) {
        return `${base}\nKind: ideaset`;
    }
    const memberLines = members
        .slice(0, 12)
        .map(member => `- ${member.name} (${vscode.workspace.asRelativePath(member.fileUri)})`)
        .join('\n');
    return `${base}\nKind: ideaset\nMembers:\n${memberLines}`;
}

async function formatFileContext(
    submodule: AnalyticalSubmodule,
    fileUri: string,
    relativePath: string
): Promise<string> {
    const ideas = (await submodule.index.indexStore.getIdeasInFile(fileUri))
        .filter(idea => idea.kind !== 'ideaset');
    const ideaLines = ideas
        .slice(0, 12)
        .map(idea => `- ${idea.name}: ${idea.summary || '(no summary)'}`)
        .join('\n');
    return [
        `**${relativePath}**`,
        `${ideas.length} requirement(s) indexed`,
        ideaLines || '- (no requirements indexed)'
    ].join('\n');
}

async function sendIdeaToChat(idea: IdeaSummary): Promise<void> {
    const contextText = formatIdeaContext(idea);
    const copied = await copyToClipboard(contextText);
    const opened = await openChatWithText(`#requirement ${idea.name}\n\n${contextText}`);
    if (!opened && copied) {
        void vscode.window.showInformationMessage(
            'Idea context copied to clipboard. Paste it into chat.'
        );
    }
}

async function sendIdeasetToChat(
    submodule: AnalyticalSubmodule,
    ideaset: IdeaSummary
): Promise<void> {
    const contextText = await formatIdeasetContext(submodule, ideaset);
    const copied = await copyToClipboard(contextText);
    const opened = await openChatWithText(`#requirement ${ideaset.name}\n\n${contextText}`);
    if (!opened && copied) {
        void vscode.window.showInformationMessage(
            'Ideaset context copied to clipboard. Paste it into chat.'
        );
    }
}

async function sendFileToChat(
    submodule: AnalyticalSubmodule,
    file: { fileUri: string; relativePath: string }
): Promise<void> {
    const contextText = await formatFileContext(submodule, file.fileUri, file.relativePath);
    const copied = await copyToClipboard(contextText);
    const opened = await openChatWithText(`#file ${file.relativePath}\n\n${contextText}`);
    if (!opened && copied) {
        void vscode.window.showInformationMessage(
            'File context copied to clipboard. Paste it into chat.'
        );
    }
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
