/**
 * Workspace settings for reference inlay hints.
 */
export const REQLAN_REFERENCE_INLAY_HINTS_SETTING = 'referencesInlayHints';

/** VS Code command invoked when clicking "+N more" on an inbound-reference inlay hint. */
export const REQLAN_INBOUND_REFERENCES_SUMMARY_COMMAND = 'reqlan.openInboundReferencesSummary';

export interface ReferenceInlayHintsSettings {
    enabled?: boolean;
}

export function referenceInlayHintsEnabled(settings: ReferenceInlayHintsSettings | undefined): boolean {
    return settings?.enabled === true;
}
