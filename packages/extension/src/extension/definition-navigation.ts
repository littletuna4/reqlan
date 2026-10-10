/**
 * Navigate-back stack for go-to-definition in `.rq` editors.
 * Cursor often skips a JUMP on same-file definition, so Alt+Left has nothing to restore.
 * Prefer an open workspace tab for the target URI (no detached file:// copy).
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
 */
import * as vscode from 'vscode';
import { pickOpenWorkspaceDocument } from '../analytical_submodule/index-store/open-index-file-pick.js';
import {
    shouldRecordDefinitionJump,
    type EditorCaret
} from './definition-navigation-stack.js';

export const REQLAN_NAVIGATE_BACK_COMMAND = 'reqlan.navigateBack';
export const REQLAN_CAN_NAVIGATE_BACK_CONTEXT = 'reqlan.canNavigateBack';

export {
    caretChanged,
    shouldRecordDefinitionJump,
    type EditorCaret
} from './definition-navigation-stack.js';

export function caretFromEditor(editor: vscode.TextEditor): EditorCaret {
    const active = editor.selection.active;
    return {
        uri: editor.document.uri.toString(),
        line: active.line,
        character: active.character
    };
}

/** Prefer the live workspace tab URI when the path is already open. */
export function preferWorkspaceUri(target: vscode.Uri): vscode.Uri {
    if (target.scheme !== 'file') {
        return target;
    }
    const open = vscode.window.visibleTextEditors
        .map(editor => editor.document)
        .filter(document => vscode.workspace.getWorkspaceFolder(document.uri));
    return pickOpenWorkspaceDocument(open, target)?.uri ?? target;
}

export type DefinitionResult = vscode.Definition | vscode.LocationLink[] | null | undefined;

function isLocationLink(
    item: vscode.Location | vscode.LocationLink
): item is vscode.LocationLink {
    return 'targetUri' in item;
}

export function rewriteDefinitionTargets(result: DefinitionResult): DefinitionResult {
    if (!result) {
        return result;
    }
    if (!Array.isArray(result)) {
        return new vscode.Location(preferWorkspaceUri(result.uri), result.range);
    }
    if (result.length === 0) {
        return result;
    }
    if (isLocationLink(result[0]!)) {
        return (result as vscode.LocationLink[]).map(link => ({
            ...link,
            targetUri: preferWorkspaceUri(link.targetUri)
        }));
    }
    return (result as vscode.Location[]).map(
        location => new vscode.Location(preferWorkspaceUri(location.uri), location.range)
    );
}

export class DefinitionNavigationStack {
    private readonly stack: EditorCaret[] = [];
    /** Last caret the user settled on (mouse/keyboard), or the landing of a JUMP. */
    private origin: EditorCaret | undefined;
    private restoring = false;

    snapshot(editor: vscode.TextEditor | undefined): void {
        this.origin = editor && isReqlanEditor(editor) ? caretFromEditor(editor) : undefined;
    }

    noteSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
        if (!isReqlanEditor(event.textEditor)) {
            return;
        }
        const after = caretFromEditor(event.textEditor);
        if (!this.restoring && shouldRecordDefinitionJump(event.kind, this.origin, after)) {
            this.stack.push(this.origin);
            void vscode.commands.executeCommand('setContext', REQLAN_CAN_NAVIGATE_BACK_CONTEXT, true);
            this.origin = after;
            return;
        }
        if (event.kind !== vscode.TextEditorSelectionChangeKind.Command) {
            this.origin = after;
        }
    }

    noteActiveEditor(editor: vscode.TextEditor | undefined): void {
        if (this.restoring) {
            this.snapshot(editor);
            return;
        }
        // Keep origin across a definition-driven editor switch so the following
        // Command selection still records the source caret. Mouse/keyboard in the
        // new editor updates origin via noteSelectionChange.
        if (!editor || !isReqlanEditor(editor)) {
            return;
        }
        if (!this.origin) {
            this.origin = caretFromEditor(editor);
        }
    }

    async navigateBack(): Promise<void> {
        const previous = this.stack.pop();
        void vscode.commands.executeCommand(
            'setContext',
            REQLAN_CAN_NAVIGATE_BACK_CONTEXT,
            this.stack.length > 0
        );
        if (!previous) {
            await vscode.commands.executeCommand('workbench.action.navigateBack');
            return;
        }
        this.restoring = true;
        try {
            const uri = preferWorkspaceUri(vscode.Uri.parse(previous.uri));
            const position = new vscode.Position(previous.line, previous.character);
            const open = vscode.window.visibleTextEditors
                .map(editor => editor.document)
                .filter(document => vscode.workspace.getWorkspaceFolder(document.uri));
            const existing = pickOpenWorkspaceDocument(open, uri);
            const document = existing ?? await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document, {
                preview: false,
                selection: new vscode.Range(position, position)
            });
            editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenterIfOutsideViewport
            );
            this.origin = caretFromEditor(editor);
        } finally {
            this.restoring = false;
        }
    }
}

function isReqlanEditor(editor: vscode.TextEditor): boolean {
    return editor.document.languageId === 'reqlan'
        || editor.document.fileName.toLowerCase().endsWith('.rq');
}
