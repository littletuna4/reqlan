/**
 * Host chat open helpers for add_to_chat / activity-bar affordances.
 * per ["../../../../reqlan rq/extension/features-commands.rq"]
 */
import * as vscode from 'vscode';

export interface OpenChatOptions {
    /**
     * When true, place `query` in the chat input without submitting
     * (`workbench.action.chat.open` `isPartialQuery`).
     */
    isPartialQuery?: boolean;
}

/**
 * Open the host chat UI with the given text.
 * Prefers `workbench.action.chat.open`; falls back to Cursor/composer commands.
 */
export async function openChatWithText(
    text: string,
    options?: OpenChatOptions
): Promise<boolean> {
    const payload: { query: string; message: string; isPartialQuery?: boolean } = {
        query: text,
        message: text
    };
    if (options?.isPartialQuery) {
        payload.isPartialQuery = true;
    }
    const commands = [
        'workbench.action.chat.open',
        'aichat.newchataction',
        'composer.newAgentChat'
    ];
    for (const command of commands) {
        try {
            await vscode.commands.executeCommand(command, payload);
            return true;
        } catch {
            // try next host-specific chat command
        }
    }
    return false;
}
