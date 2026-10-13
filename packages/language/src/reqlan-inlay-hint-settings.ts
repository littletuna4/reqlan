/**
 * Workspace settings for reference inlay hints.
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".traceable_inlay_hints]
 */
export const REQLAN_REFERENCE_INLAY_HINTS_SETTING = 'referencesInlayHints';

/** VS Code command invoked when clicking "+N more" on an inbound-reference inlay hint. */
export const REQLAN_INBOUND_REFERENCES_SUMMARY_COMMAND = 'reqlan.openInboundReferencesSummary';

/** VS Code command invoked when clicking the file-top inbound file-reference CodeLens. */
export const REQLAN_INBOUND_FILE_REFERENCES_SUMMARY_COMMAND = 'reqlan.openInboundFileReferencesSummary';

/**
 * Open one inbound referencer from an inlay label click.
 * Uses the same `openIndexFile` path as gotos / activity bar (not raw LSP Location).
 * Arguments: `[fileUri: string, line: number]` (0-based line).
 */
export const REQLAN_OPEN_INBOUND_REFERENCER_COMMAND = 'reqlan.openInboundReferencer';

export interface ReferenceInlayHintsSettings { 
    enabled?: boolean;
}

export function referenceInlayHintsEnabled(settings: ReferenceInlayHintsSettings | undefined): boolean {
    return settings?.enabled === true;
}
