/**
 * Chat customization provider APIs used for dynamic agent command registration.
 * Augments @types/vscode until the extension engine baseline includes these types.
 */
import 'vscode';

declare module 'vscode' {
    export interface ChatResource {
        readonly uri: Uri;
    }

    export interface ChatCustomAgentProvider {
        readonly onDidChangeCustomAgents?: Event<void>;
        provideCustomAgents(context: unknown, token: CancellationToken): ProviderResult<ChatResource[]>;
    }

    export interface ChatPromptFileProvider {
        readonly onDidChangePromptFiles?: Event<void>;
        providePromptFiles(context: unknown, token: CancellationToken): ProviderResult<ChatResource[]>;
    }

    export interface ChatSkillProvider {
        readonly onDidChangeSkills?: Event<void>;
        provideSkills(context: unknown, token: CancellationToken): ProviderResult<ChatResource[]>;
    }

    export namespace chat {
        export function registerCustomAgentProvider(provider: ChatCustomAgentProvider): Disposable;
        export function registerPromptFileProvider(provider: ChatPromptFileProvider): Disposable;
        export function registerSkillProvider(provider: ChatSkillProvider): Disposable;
    }
}
