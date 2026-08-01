/**
 * Workspace settings for reference CodeLens classification buttons.
 */
export const REQLAN_REFERENCE_CODE_LENS_SETTING = 'referencesCodeLens';

/** VS Code command invoked when clicking a reference classification CodeLens. */
export const REQLAN_OPEN_REFERENCE_CODE_LENS_COMMAND = 'reqlan.openReferenceCodeLens';

/** VS Code command palette toggle for reference CodeLens. */
export const REQLAN_TOGGLE_REFERENCE_CODE_LENS_COMMAND = 'reqlan.toggleReferenceCodeLens';

export interface ReferenceCodeLensSettings {
    enabled?: boolean;
}

export function referenceCodeLensEnabled(settings: ReferenceCodeLensSettings | undefined): boolean {
    return settings?.enabled === true;
}

export type ReferenceCodeLensKind = 'idea' | 'reqlan-file' | 'file' | 'folder';

/**
 * Payload for the CodeLens click handler. Opens a reference card (not direct navigation —
 * references already act as editor links).
 */
export interface ReferenceCodeLensPayload {
    kind: ReferenceCodeLensKind;
    /** Classification label, e.g. `open idea` / `open ts file`. */
    classification: string;
    /** Short target name shown on the card. */
    displayName: string;
    targetUri: string;
    line?: number;
    character?: number;
    folderFiles?: string[];
    /** File extension without leading dot, used for `open {extension} file` labels. */
    extension?: string;
    /** Idea body / path summary for the card. */
    summary?: string;
    /** Stats lines shown on the card (referencers, last edited, etc.). */
    stats: string[];
}
