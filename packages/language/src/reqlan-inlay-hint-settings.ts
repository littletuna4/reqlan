/**
 * Workspace settings for reference inlay hints.
 */
export const REQLAN_REFERENCE_INLAY_HINTS_SETTING = 'referencesInlayHints';

export interface ReferenceInlayHintsSettings {
    enabled?: boolean;
}

export function referenceInlayHintsEnabled(settings: ReferenceInlayHintsSettings | undefined): boolean {
    return settings?.enabled === true;
}
