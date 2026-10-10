/**
 * Pure jump-stack rules for reqlan go-to-definition navigate-back.
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
 */

/** vscode.TextEditorSelectionChangeKind.Command */
export const SELECTION_KIND_COMMAND = 3;

export interface EditorCaret {
    uri: string;
    line: number;
    character: number;
}

export function caretChanged(before: EditorCaret, after: EditorCaret): boolean {
    return before.uri !== after.uri
        || before.line !== after.line
        || before.character !== after.character;
}

/**
 * A definition JUMP is a Command selection move. Keep the pre-jump caret across an
 * editor switch so a cross-file definition still records the source position.
 * Some hosts omit `kind` on JUMP — treat an undefined-kind line/file move as a JUMP.
 */
export function shouldRecordDefinitionJump(
    kind: number | undefined,
    origin: EditorCaret | undefined,
    after: EditorCaret
): origin is EditorCaret {
    if (origin === undefined || !caretChanged(origin, after)) {
        return false;
    }
    if (kind === SELECTION_KIND_COMMAND) {
        return true;
    }
    return kind === undefined
        && (origin.uri !== after.uri || origin.line !== after.line);
}
