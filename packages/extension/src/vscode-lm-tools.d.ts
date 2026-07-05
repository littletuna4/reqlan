/**
 * Minimal Language Model Tool API surface used by the chat participant module.
 * Augments @types/vscode until the extension engine baseline includes these types.
 */
import 'vscode';

declare module 'vscode' {
    export interface LanguageModelTextPart {
        value: string;
    }

    export class LanguageModelTextPart {
        constructor(value: string);
    }

    export class LanguageModelToolResult {
        constructor(content: Array<LanguageModelTextPart>);
    }

    export interface LanguageModelToolInvocationOptions<T> {
        input: T;
    }

    export interface LanguageModelToolInvocationPrepareOptions<T> {
        input: T;
    }

    export interface LanguageModelTool<T> {
        invoke?(
            options: LanguageModelToolInvocationOptions<T>,
            token: CancellationToken
        ): ProviderResult<LanguageModelToolResult>;
        prepareInvocation?(
            options: LanguageModelToolInvocationPrepareOptions<T>,
            token: CancellationToken
        ): ProviderResult<{ invocationMessage?: string }>;
    }

    export namespace lm {
        export function registerTool<T>(
            name: string,
            tool: LanguageModelTool<T>
        ): Disposable;
    }
}
