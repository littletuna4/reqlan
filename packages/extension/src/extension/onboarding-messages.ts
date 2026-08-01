/** Message types for the onboarding webview panel. */

export type OnboardingResourceLink = {
    id: string;
    label: string;
    href: string;
};

export type ExtensionToOnboardingMessage = {
    type: 'init';
    resources: OnboardingResourceLink[];
    /** Values for {{PLACEHOLDER}} substitution in the example `.rq` template. */
    templateValues: Record<string, string>;
};

export type OnboardingToExtensionMessage = {
    type: 'ready';
} | {
    type: 'openExternal';
    href: string;
} | {
    type: 'openExampleAsDocument';
    content: string;
};
