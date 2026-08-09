/**
 * Host chat open helpers for add_to_chat / activity-bar affordances.
 * per ["../../../../reqlan rq/extension/features-commands.rq"]
 *
 * Cursor vs VS Code (verified against Cursor workbench.desktop.main.js):
 * - `workbench.action.chat.open` in Cursor ALWAYS `createComposer({ openInNewTab: true })`
 *   with `partialState.text` from `query` — it never targets the current chat.
 * - Current chat: `composer.focusComposer` (selected composer + focusMainInputBox), then paste.
 * - New chat: `composer.createNew` with `{ openInNewTab: true, partialState: { text, richText } }`
 *   (same pattern as Cursor's own "Add Files to New Chat" / deeplink prefill).
 * - VS Code Copilot: `workbench.action.chat.open` + `isPartialQuery` for current;
 *   `workbench.action.chat.newChat` then open for new.
 *
 * Refs:
 * - https://github.com/microsoft/vscode-discussions/discussions/2480 (isPartialQuery)
 * - https://forum.cursor.com/t/a-command-for-passing-a-prompt-to-the-chat/138049
 */
import * as vscode from 'vscode';

export type ChatOpenTarget = 'current' | 'new';

export interface OpenChatOptions {
    /**
     * When true, place `query` in the chat input without submitting.
     * Honored on VS Code Copilot; Cursor paste/createNew paths are non-submitting.
     */
    isPartialQuery?: boolean;
    /**
     * `current` (default): inject into the active chat input.
     * `new`: open a new chat/agent session, then add the context.
     */
    target?: ChatOpenTarget;
}

const PASTE_SETTLE_MS = 80;
const CLIPBOARD_RESTORE_MS = 250;

/**
 * Open the host chat UI with the given text.
 */
export async function openChatWithText(
    text: string,
    options?: OpenChatOptions
): Promise<boolean> {
    const isPartialQuery = options?.isPartialQuery ?? true;
    const target = options?.target ?? 'current';

    if (target === 'new') {
        return openNewChatWithText(text, isPartialQuery);
    }
    return openCurrentChatWithText(text, isPartialQuery);
}

async function openCurrentChatWithText(
    text: string,
    isPartialQuery: boolean
): Promise<boolean> {
    // Cursor: never use workbench.action.chat.open here — it always opens a new tab.
    if (await focusCursorCurrentComposer()) {
        return pasteTextIntoFocusedInput(text);
    }

    // VS Code Copilot / hosts that honor isPartialQuery on the current widget.
    try {
        const payload: { query: string; message: string; isPartialQuery?: boolean } = {
            query: text,
            message: text
        };
        if (isPartialQuery) {
            payload.isPartialQuery = true;
        }
        await vscode.commands.executeCommand('workbench.action.chat.open', payload);
        return true;
    } catch {
        return false;
    }
}

async function openNewChatWithText(
    text: string,
    isPartialQuery: boolean
): Promise<boolean> {
    // Cursor: create a new composer tab with the prompt prefilled (do not call chat.open afterward).
    try {
        await vscode.commands.executeCommand('composer.createNew', {
            openInNewTab: true,
            unifiedMode: 'agent',
            partialState: {
                text,
                richText: text
            }
        });
        return true;
    } catch {
        // fall through
    }

    // Cursor fallback: new agent chat, then paste (forum workaround).
    try {
        await vscode.commands.executeCommand('composer.newAgentChat');
        await delay(PASTE_SETTLE_MS);
        if (await pasteTextIntoFocusedInput(text)) {
            return true;
        }
        return true;
    } catch {
        // fall through
    }

    try {
        await vscode.commands.executeCommand('aichat.newchataction');
        await delay(PASTE_SETTLE_MS);
        if (await pasteTextIntoFocusedInput(text)) {
            return true;
        }
        return true;
    } catch {
        // fall through
    }

    // VS Code: new chat session, then seed input.
    try {
        await vscode.commands.executeCommand('workbench.action.chat.newChat');
    } catch {
        // optional
    }
    try {
        const payload: { query: string; message: string; isPartialQuery?: boolean } = {
            query: text,
            message: text
        };
        if (isPartialQuery) {
            payload.isPartialQuery = true;
        }
        await vscode.commands.executeCommand('workbench.action.chat.open', payload);
        return true;
    } catch {
        return false;
    }
}

/** Focus the selected Cursor composer input without creating a new chat. */
async function focusCursorCurrentComposer(): Promise<boolean> {
    try {
        await vscode.commands.executeCommand('composer.focusComposer');
        await delay(PASTE_SETTLE_MS);
        return true;
    } catch {
        // try alternate open/focus commands
    }
    for (const command of ['composer.startComposerPrompt'] as const) {
        try {
            await vscode.commands.executeCommand(command);
            await delay(PASTE_SETTLE_MS);
            return true;
        } catch {
            // try next
        }
    }
    return false;
}

async function pasteTextIntoFocusedInput(text: string): Promise<boolean> {
    let previous: string | undefined;
    try {
        previous = await vscode.env.clipboard.readText();
    } catch {
        previous = undefined;
    }
    try {
        await vscode.env.clipboard.writeText(text);
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        return true;
    } catch {
        return false;
    } finally {
        if (previous !== undefined) {
            const restore = previous;
            setTimeout(() => {
                void vscode.env.clipboard.writeText(restore);
            }, CLIPBOARD_RESTORE_MS);
        }
    }
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
