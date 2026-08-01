<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import type {
        ExtensionToOnboardingMessage,
        OnboardingResourceLink,
    } from '../../src/extension/onboarding-messages.js';
    import { postToExtension } from './lib/vscode.js';
    import { renderRqTemplate } from './lib/rq-highlight.js';
    import RqCode from './components/RqCode.svelte';
    import exampleTemplate from '../../templates/thanks-for-installing.template.rq?raw';

    let resources = $state<OnboardingResourceLink[]>([]);
    let templateValues = $state<Record<string, string> | undefined>(undefined);

    const exampleSource = $derived(
        templateValues
            ? renderRqTemplate(exampleTemplate, templateValues).trimEnd()
            : undefined,
    );

    function handleMessage(event: MessageEvent<ExtensionToOnboardingMessage>): void {
        const message = event.data;
        if (!message || typeof message !== 'object') {
            return;
        }
        if (message.type === 'init') {
            resources = message.resources;
            templateValues = message.templateValues;
        }
    }

    function openLink(href: string): void {
        postToExtension({ type: 'openExternal', href });
    }

    function openExampleInEditor(): void {
        if (!exampleSource) {
            return;
        }
        postToExtension({ type: 'openExampleAsDocument', content: `${exampleSource}\n` });
    }

    onMount(() => {
        window.addEventListener('message', handleMessage);
        postToExtension({ type: 'ready' });
    });

    onDestroy(() => {
        window.removeEventListener('message', handleMessage);
    });
</script>

<main class="onboarding">
    <header class="hero">
        <p class="brand">reqlan</p>
        <h1>Thank you for installing</h1>
        <p class="lede">
            Named ideas, links to code, and a graph you can explore — requirements that stay next to
            the work.
        </p>
    </header>

    <section aria-labelledby="resources-heading">
        <h2 id="resources-heading">Get started</h2>
        {#if resources.length === 0}
            <p class="muted">Loading links…</p>
        {:else}
            <ul class="resource-list">
                {#each resources as link (link.id)}
                    <li>
                        <button type="button" class="resource-link" onclick={() => openLink(link.href)}>
                            <span class="resource-label">{link.label}</span>
                            <span class="resource-href">{link.href}</span>
                        </button>
                    </li>
                {/each}
            </ul>
        {/if}
    </section>

    <section aria-labelledby="example-heading">
        <div class="section-head">
            <h2 id="example-heading">A reqlan file</h2>
            {#if exampleSource}
                <button type="button" class="secondary-button" onclick={openExampleInEditor}>
                    Open in editor
                </button>
            {/if}
        </div>
        <p class="muted">
            Ideas are named blocks. Bodies hold prose and links. Click a URL in the sample, or open
            it beside this page to edit with full language support.
        </p>
        {#if exampleSource}
            <RqCode code={exampleSource} onOpenUrl={openLink} />
        {:else}
            <p class="muted">Preparing example…</p>
        {/if}
    </section>

    <section aria-labelledby="try-heading">
        <h2 id="try-heading">In the editor</h2>
        <ul class="tips">
            <li>
                Open the <strong>Reqlan</strong> activity bar for neighbourhood context, references,
                and graph slices around the idea under the cursor.
            </li>
            <li>
                In chat, use <code>@reqlan</code> with <code>/rq-search</code> to find requirements
                across the workspace.
            </li>
            <li>
                Cross-link ideas with <code>[other_idea]</code> and code with
                <code>["./auth.ts".login]</code>.
            </li>
        </ul>
    </section>

    <section aria-labelledby="thanks-heading">
        <h2 id="thanks-heading">Acknowledgements</h2>
        <ul>
            <li>LLMs</li>
            <li>PKMs</li>
        </ul>
    </section>
</main>

<style>
    .onboarding {
        max-width: min(46rem, 100%);
        min-width: 0;
        margin: 0 auto;
        padding: 28px 20px 48px;
        display: flex;
        flex-direction: column;
        gap: 1.85rem;
    }

    section {
        min-width: 0;
        max-width: 100%;
    }

    .hero {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    .brand {
        margin: 0;
        font-size: 1.4rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--vscode-foreground);
    }

    h1 {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 600;
        color: var(--vscode-foreground);
    }

    h2 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
    }

    .lede,
    p,
    li {
        margin: 0;
        color: var(--vscode-foreground);
    }

    .muted {
        color: var(--vscode-descriptionForeground);
        margin: 0.45rem 0 0.85rem;
    }

    .section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
    }

    .resource-list,
    .tips,
    ul {
        margin: 0;
        padding-left: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
    }

    .tips {
        padding-left: 1.15rem;
        list-style: disc;
    }

    .tips li {
        padding-left: 0.15rem;
    }

    .resource-link {
        appearance: none;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.1rem;
        width: 100%;
        text-align: left;
        background: var(--vscode-list-hoverBackground, transparent);
        border: 1px solid var(--vscode-panel-border, transparent);
        border-radius: 2px;
        padding: 8px 10px;
        cursor: pointer;
        font: inherit;
        color: inherit;
    }

    .resource-link:hover {
        background: var(--vscode-list-activeSelectionBackground, var(--vscode-list-hoverBackground));
        color: var(--vscode-list-activeSelectionForeground, var(--vscode-foreground));
    }

    .resource-label {
        color: var(--vscode-textLink-foreground);
        font-weight: 600;
    }

    .resource-link:hover .resource-label {
        color: inherit;
    }

    .resource-href {
        font-size: 0.85em;
        color: var(--vscode-descriptionForeground);
        word-break: break-all;
    }

    .resource-link:hover .resource-href {
        color: inherit;
        opacity: 0.85;
    }

    .secondary-button {
        appearance: none;
        font: inherit;
        font-size: 0.9em;
        padding: 4px 10px;
        border-radius: 2px;
        border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
        background: var(--vscode-button-secondaryBackground, transparent);
        color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
        cursor: pointer;
    }

    .secondary-button:hover {
        background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground));
    }

    code {
        font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
        font-size: 0.95em;
    }

    strong {
        font-weight: 600;
    }
</style>
