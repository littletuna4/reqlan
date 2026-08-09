/**
 * Host chat open helpers for add_to_chat / activity-bar affordances.
 * per ["../../../../reqlan rq/extension/features-commands.rq"]
 */
import * as vscode from 'vscode';

export type ChatOpenTarget = 'current' | 'new';

export interface OpenChatOptions {
    /**
     * When true, place `query` in the chat input without submitting
     * (`workbench.action.chat.open` `isPartialQuery`).
     * Defaults to true for add-to-chat flows.
     */
    isPartialQuery?: boolean;
    /**
     * `current` (default): inject into the active chat input.
     * `new`: open a new chat/agent session, then add the context.
     */
    target?: ChatOpenTarget;
}

/**
 * Open the host chat UI with the given text.
 * Prefers current-chat open for `target: 'current'`; uses new-session
 * commands only when `target: 'new'`.
 */
export async function openChatWithText(
    text: string,
    options?: OpenChatOptions
): Promise<boolean> {
    const isPartialQuery = options?.isPartialQuery ?? true;
    const target = options?.target ?? 'current';
    const payload: { query: string; message: string; isPartialQuery?: boolean } = {
        query: text,
        message: text
    };
    if (isPartialQuery) {
        payload.isPartialQuery = true;
    }

    if (target === 'new') {
        return openNewChatWithText(payload);
    }
    return openCurrentChatWithText(payload);
}

async function openCurrentChatWithText(
    payload: { query: string; message: string; isPartialQuery?: boolean }
): Promise<boolean> {
    // Do not fall back to new-chat commands — that would violate "current by default".
    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', payload);
        return true;
    } catch {
        return false;
    }
}

async function openNewChatWithText(
    payload: { query: string; message: string; isPartialQuery?: boolean }
): Promise<boolean> {
    const newSessionCommands = [
        'composer.newAgentChat',
        'aichat.newchataction',
        'workbench.action.chat.newChat'
    ];
    let openedSession = false;
    for (const command of newSessionCommands) {
        try {
            await vscode.commands.executeCommand(command, payload);
            openedSession = true;
            break;
        } catch {
            // try next host-specific new-chat command
        }
    }
    if (!openedSession) {
        return false;
    }
    // Many hosts ignore the payload on new-session commands; seed the new chat input after.
    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', payload);
    } catch {
        // Session opened; input seed optional when unsupported
    }
    return true;
}
