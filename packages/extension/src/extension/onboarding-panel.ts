/**
 * First-run / Show Onboarding webview panel.
 * per ["../../../../reqlan rq/extension/onboarding/page-thanks-for-installing.rq"]
 */
import * as vscode from 'vscode';
import { getPhonebookLink } from '../shared/phonebook.js';
import { getOnboardingHtml } from './get-onboarding-html.js';
import type {
    ExtensionToOnboardingMessage,
    OnboardingResourceLink,
    OnboardingToExtensionMessage,
} from './onboarding-messages.js';

const VIEW_TYPE = 'reqlan.onboarding';

export class OnboardingPanel {
    private static current?: OnboardingPanel;

    static show(context: vscode.ExtensionContext): void {
        if (OnboardingPanel.current) {
            OnboardingPanel.current.panel.reveal(vscode.ViewColumn.One);
            OnboardingPanel.current.postInit();
            return;
        }
        OnboardingPanel.current = new OnboardingPanel(context);
    }

    static forceDispose(): void {
        OnboardingPanel.current?.panel.dispose();
        OnboardingPanel.current = undefined;
    }

    readonly panel: vscode.WebviewPanel;

    private constructor(context: vscode.ExtensionContext) {
        this.panel = vscode.window.createWebviewPanel(
            VIEW_TYPE,
            'Welcome to Reqlan',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'media', 'webviews', 'onboarding'),
                ],
            },
        );

        this.panel.webview.html = getOnboardingHtml(this.panel.webview, context.extensionUri);

        this.panel.webview.onDidReceiveMessage(
            (message: OnboardingToExtensionMessage) => {
                void this.handleMessage(message);
            },
            undefined,
            context.subscriptions,
        );

        this.panel.onDidDispose(
            () => {
                OnboardingPanel.current = undefined;
            },
            undefined,
            context.subscriptions,
        );
    }

    private buildResources(): OnboardingResourceLink[] {
        const site = getPhonebookLink('site');
        const quickstartHref = new URL('quickstart', `${site.href.replace(/\/?$/, '/')}`).href;

        return [
            { id: 'site', label: 'Project site', href: site.href },
            { id: 'quickstart', label: 'Documentation and quickstart', href: quickstartHref },
            { id: 'github', label: 'Source repository', href: getPhonebookLink('github').href },
            { id: 'vsc', label: 'Visual Studio Marketplace', href: getPhonebookLink('vsc').href },
            { id: 'openvsx', label: 'Open VSX Registry', href: getPhonebookLink('openvsx').href },
        ];
    }

    private buildTemplateValues(): Record<string, string> {
        const resources = this.buildResources();
        const byId = Object.fromEntries(resources.map(link => [link.id, link.href]));
        return {
            SITE_URL: byId.site,
            QUICKSTART_URL: byId.quickstart,
            GITHUB_URL: byId.github,
            VSC_URL: byId.vsc,
            OPENVSX_URL: byId.openvsx,
        };
    }

    private postInit(): void {
        const message: ExtensionToOnboardingMessage = {
            type: 'init',
            resources: this.buildResources(),
            templateValues: this.buildTemplateValues(),
        };
        void this.panel.webview.postMessage(message);
    }

    private async handleMessage(message: OnboardingToExtensionMessage): Promise<void> {
        if (!message || typeof message !== 'object') {
            return;
        }
        switch (message.type) {
            case 'ready':
                this.postInit();
                return;
            case 'openExternal':
                await vscode.env.openExternal(vscode.Uri.parse(message.href));
                return;
            case 'openExampleAsDocument': {
                const document = await vscode.workspace.openTextDocument({
                    content: message.content,
                    language: 'reqlan',
                });
                await vscode.window.showTextDocument(document, {
                    viewColumn: vscode.ViewColumn.Beside,
                    preview: false,
                });
                return;
            }
        }
    }
}
