/**
 * Editor setting for the styled idea-content hover.
 * rq:["../../../../reqlan rq/extension/language/syntax/features-syntax.rq".idea_content_tooltip]
 */
import type { WorkspaceConfiguration } from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';

export const IDEA_CONTENT_TOOLTIP_SETTING = 'reqlan.ideaContentTooltip.enabled';
export const IDEA_CONTENT_TOOLTIP_NOTIFICATION = 'reqlan/settings';

export interface IdeaContentTooltipConfiguration {
    get(section: 'ideaContentTooltip.enabled', defaultValue: boolean): boolean;
}

export function ideaContentTooltipEnabled(configuration: IdeaContentTooltipConfiguration): boolean {
    return configuration.get('ideaContentTooltip.enabled', true);
}

export function pushIdeaContentTooltip(
    client: LanguageClient,
    configuration: WorkspaceConfiguration
): void {
    void client.sendNotification(IDEA_CONTENT_TOOLTIP_NOTIFICATION, {
        ideaContentTooltip: ideaContentTooltipEnabled(configuration)
    });
}
