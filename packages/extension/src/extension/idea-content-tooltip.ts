/**
 * Editor settings pushed to the language server.
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax.rq".idea_content_tooltip]
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".view_references_as_inlay_hints]
 */
import type { WorkspaceConfiguration } from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';

export const IDEA_CONTENT_TOOLTIP_SETTING = 'reqlan.ideaContentTooltip.enabled';
export const IDEA_CONTENT_TOOLTIP_NOTIFICATION = 'reqlan/settings';

export interface IdeaContentTooltipConfiguration {
    get(section: 'ideaContentTooltip.enabled', defaultValue: boolean): boolean;
    get(section: 'referencesInlayHints.enabled', defaultValue: boolean): boolean;
}

export function ideaContentTooltipEnabled(configuration: IdeaContentTooltipConfiguration): boolean {
    return configuration.get('ideaContentTooltip.enabled', true);
}

export function referenceInlayHintsEnabled(configuration: IdeaContentTooltipConfiguration): boolean {
    return configuration.get('referencesInlayHints.enabled', false);
}

export function pushIdeaContentTooltip(
    client: LanguageClient,
    configuration: WorkspaceConfiguration
): void {
    void client.sendNotification(IDEA_CONTENT_TOOLTIP_NOTIFICATION, {
        ideaContentTooltip: ideaContentTooltipEnabled(configuration),
        referenceInlayHints: referenceInlayHintsEnabled(configuration)
    });
}
