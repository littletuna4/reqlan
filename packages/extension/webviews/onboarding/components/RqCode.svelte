<script lang="ts">
    import { tokenizeRq } from '../lib/rq-highlight.js';

    type Props = {
        code: string;
        onOpenUrl?: (href: string) => void;
    };

    let { code, onOpenUrl }: Props = $props();

    const tokens = $derived(tokenizeRq(code));

    function openUrl(href: string): void {
        onOpenUrl?.(href);
    }
</script>

<pre class="rq-block" aria-label="reqlan example"><code class="rq-code">{#each tokens as token, index (index)}{#if token.type === 'url'}<button
                type="button"
                class="token url"
                title={token.text}
                onclick={() => openUrl(token.text)}>{token.text}</button
            >{:else}<span class="token {token.type}">{token.text}</span>{/if}{/each}</code></pre>

<style>
    .rq-block {
        margin: 0;
        padding: 12px 14px;
        max-width: 100%;
        min-width: 0;
        overflow-x: auto;
        background: var(--vscode-textCodeBlock-background, var(--vscode-editor-inactiveSelectionBackground));
        border: 1px solid var(--vscode-panel-border, transparent);
        border-radius: 2px;
    }

    .rq-code {
        display: block;
        max-width: 100%;
        font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
        font-size: var(--vscode-editor-font-size, 0.9em);
        line-height: 1.55;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
        color: var(--vscode-editor-foreground);
    }

    .token {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }

    .idea {
        color: var(--vscode-symbolIcon-functionForeground, var(--vscode-charts-blue, #4fc1ff));
        font-weight: 600;
    }

    .keyword {
        color: var(--vscode-symbolIcon-keywordForeground, var(--vscode-charts-orange, #c586c0));
        font-weight: 600;
    }

    .string {
        color: var(--vscode-symbolIcon-stringForeground, var(--vscode-charts-green, #ce9178));
    }

    .attribute {
        color: var(--vscode-symbolIcon-propertyForeground, var(--vscode-charts-yellow, #d7ba7d));
        font-weight: 600;
    }

    .ref,
    .file-ref {
        color: var(--vscode-textLink-foreground);
        text-decoration: underline;
        text-decoration-color: color-mix(in srgb, var(--vscode-textLink-foreground) 45%, transparent);
        text-underline-offset: 0.15em;
    }

    .body {
        color: var(--vscode-descriptionForeground);
    }

    .comment {
        color: var(--vscode-editorLineNumber-foreground, var(--vscode-descriptionForeground));
        font-style: italic;
    }

    .brace,
    .punctuation,
    .diagram {
        color: var(--vscode-editorLineNumber-foreground, var(--vscode-descriptionForeground));
    }

    button.token.url {
        appearance: none;
        display: inline;
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        font: inherit;
        color: var(--vscode-textLink-foreground);
        text-decoration: underline;
        cursor: pointer;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-all;
    }

    button.token.url:hover {
        color: var(--vscode-textLink-activeForeground);
    }
</style>
