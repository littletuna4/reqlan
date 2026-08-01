<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import type {
        ExtensionToExportFormMessage,
    } from '../../src/analytical_submodule/export/export-form-messages.js';
    import {
        defaultExportFormSettings,
        type ExportFormSettings,
    } from '../../src/analytical_submodule/export/export-form-settings-types.js';
    import { postToExtension } from './lib/vscode.js';

    let settings = $state<ExportFormSettings | undefined>(undefined);
    let resolvedOutputDir = $state('');
    let workspaceRoot = $state('');
    let canExportCurrentFile = $state(false);
    let activeRqFileName = $state<string | undefined>(undefined);
    let settingsPath = $state('');
    let statusMessage = $state<string | undefined>(undefined);
    let statusOk = $state(true);
    let busy = $state(false);
    let loaded = $state(false);

    function handleMessage(event: MessageEvent<ExtensionToExportFormMessage>): void {
        const message = event.data;
        if (!message || typeof message !== 'object') {
            return;
        }
        switch (message.type) {
            case 'init':
                settings = { ...message.payload.settings };
                resolvedOutputDir = message.payload.resolvedOutputDir;
                workspaceRoot = message.payload.workspaceRoot;
                canExportCurrentFile = message.payload.canExportCurrentFile;
                activeRqFileName = message.payload.activeRqFileName;
                settingsPath = message.payload.settingsPath;
                loaded = true;
                statusMessage = undefined;
                return;
            case 'outputDirPicked':
                if (!settings) {
                    return;
                }
                settings.outputDir = message.outputDir;
                resolvedOutputDir = message.resolvedOutputDir;
                return;
            case 'exportStarted':
                busy = true;
                statusMessage = 'Exporting…';
                statusOk = true;
                return;
            case 'exportFinished':
                busy = false;
                statusOk = message.ok;
                statusMessage = message.message;
                return;
            case 'settingsSaved':
                statusOk = message.ok;
                statusMessage = message.message;
                return;
        }
    }

    function pickOutputDir(): void {
        if (!settings) {
            return;
        }
        postToExtension({ type: 'pickOutputDir', currentOutputDir: settings.outputDir });
    }

    function saveSettings(): void {
        if (!settings || busy) {
            return;
        }
        postToExtension({ type: 'saveSettings', settings: { ...settings } });
    }

    function runExport(): void {
        if (!settings || busy) {
            return;
        }
        postToExtension({ type: 'runExport', settings: { ...settings } });
    }

    function resetDefaults(): void {
        if (!workspaceRoot) {
            return;
        }
        settings = defaultExportFormSettings(workspaceRoot);
        resolvedOutputDir = `${workspaceRoot.replace(/\/$/, '')}/reqlan-export`;
        statusMessage = 'Reset to defaults (not saved yet).';
        statusOk = true;
    }

    onMount(() => {
        window.addEventListener('message', handleMessage);
        postToExtension({ type: 'ready' });
    });

    onDestroy(() => {
        window.removeEventListener('message', handleMessage);
    });
</script>

<main class="export-form">
    <header class="hero">
        <h1>Export HTML</h1>
        <p class="lede">
            Build a multi-file static site from the requirement graph. Simple options first; expand
            advanced settings when you need page families, mount prefixes, or cluster strategy.
        </p>
    </header>

    {#if !loaded || !settings}
        <p class="muted">Loading export settings…</p>
    {:else}
        <form
            class="form"
            onsubmit={(event) => {
                event.preventDefault();
                runExport();
            }}
        >
            <section class="simple" aria-labelledby="simple-heading">
                <h2 id="simple-heading">Export options</h2>

                <label class="field">
                    <span class="label">Scope</span>
                    <select bind:value={settings.scope}>
                        <option value="workspace">Workspace</option>
                        <option value="currentFile" disabled={!canExportCurrentFile}>
                            Current file{activeRqFileName ? ` (${activeRqFileName})` : ''}
                        </option>
                    </select>
                    {#if !canExportCurrentFile}
                        <span class="hint">Open a .rq file to enable current-file scope.</span>
                    {/if}
                </label>

                <label class="field">
                    <span class="label">Output folder</span>
                    <div class="row">
                        <input
                            type="text"
                            bind:value={settings.outputDir}
                            placeholder="reqlan-export"
                            spellcheck="false"
                        />
                        <button type="button" class="secondary" onclick={pickOutputDir}>Browse…</button>
                    </div>
                    {#if resolvedOutputDir}
                        <span class="hint mono">{resolvedOutputDir}</span>
                    {/if}
                </label>

                <label class="field">
                    <span class="label">Export name</span>
                    <input
                        type="text"
                        bind:value={settings.exportName}
                        placeholder="reqlan-export"
                        spellcheck="false"
                    />
                    <span class="hint">Creates a subfolder under the output folder.</span>
                </label>

                <label class="field">
                    <span class="label">Runtime mode</span>
                    <select bind:value={settings.runtimeMode}>
                        <option value="interactive">Interactive — search, graph, rich navigation</option>
                        <option value="document">Document — lean pages</option>
                        <option value="print">Print — printable-first output</option>
                    </select>
                </label>
            </section>

            <section class="advanced" aria-labelledby="advanced-heading">
                <button
                    type="button"
                    class="advanced-toggle"
                    aria-expanded={settings.advancedExpanded}
                    onclick={() => {
                        if (settings) {
                            settings.advancedExpanded = !settings.advancedExpanded;
                        }
                    }}
                >
                    <span id="advanced-heading">Advanced settings</span>
                    <span class="chevron" aria-hidden="true">{settings.advancedExpanded ? '−' : '+'}</span>
                </button>

                {#if settings.advancedExpanded}
                    <div class="advanced-body">
                        <label class="field">
                            <span class="label">Template</span>
                            <select bind:value={settings.templateId}>
                                <option value="default">Default multi-page site</option>
                            </select>
                        </label>

                        <label class="field">
                            <span class="label">Cluster strategy</span>
                            <select bind:value={settings.clusterStrategy}>
                                <option value="hybrid">Hybrid — deterministic + communities</option>
                                <option value="deterministic">Deterministic — file, folder, tag, status</option>
                            </select>
                        </label>

                        <fieldset class="fieldset">
                            <legend>Page families</legend>
                            <label class="check">
                                <input type="checkbox" bind:checked={settings.includeIdeaPages} />
                                Idea pages
                            </label>
                            <label class="check">
                                <input type="checkbox" bind:checked={settings.includeFilePages} />
                                Requirement file pages
                            </label>
                            <label class="check">
                                <input type="checkbox" bind:checked={settings.includeCodeFilePages} />
                                Code file pages
                            </label>
                            <label class="check">
                                <input type="checkbox" bind:checked={settings.includeClusterPages} />
                                Cluster pages
                            </label>
                            <label class="check">
                                <input type="checkbox" bind:checked={settings.includeAttributePages} />
                                Attribute pages
                            </label>
                            <label class="check">
                                <input type="checkbox" bind:checked={settings.includePrintPages} />
                                Print pages
                            </label>
                            <label class="check">
                                <input type="checkbox" bind:checked={settings.includeRequirementsPage} />
                                Requirements overview page
                            </label>
                            <label class="check">
                                <input type="checkbox" bind:checked={settings.includeGraphPage} />
                                Graph page
                            </label>
                        </fieldset>

                        <label class="check block">
                            <input type="checkbox" bind:checked={settings.excludeSecretFiles} />
                            Exclude <code>*.secret.rq</code> ideas
                        </label>

                        <label class="field">
                            <span class="label">URL base (mount prefix)</span>
                            <input
                                type="text"
                                bind:value={settings.urlBase}
                                placeholder="/spec"
                                spellcheck="false"
                            />
                            <span class="hint">Optional. Root-relative hrefs for static hosts.</span>
                        </label>

                        <div class="grid-two">
                            <label class="field">
                                <span class="label">Header link href</span>
                                <input
                                    type="text"
                                    bind:value={settings.headerHref}
                                    placeholder="/"
                                    spellcheck="false"
                                />
                            </label>
                            <label class="field">
                                <span class="label">Header link label</span>
                                <input
                                    type="text"
                                    bind:value={settings.headerLabel}
                                    placeholder="Home"
                                    spellcheck="false"
                                />
                            </label>
                        </div>

                        <div class="grid-two">
                            <label class="field">
                                <span class="label">Print entry file</span>
                                <input
                                    type="text"
                                    bind:value={settings.printEntryFileName}
                                    spellcheck="false"
                                />
                            </label>
                            <label class="field">
                                <span class="label">Max neighbourhood graph nodes</span>
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    bind:value={settings.maxGraphNodes}
                                />
                            </label>
                        </div>
                    </div>
                {/if}
            </section>

            <div class="actions">
                <button type="submit" class="primary" disabled={busy}>
                    {busy ? 'Exporting…' : 'Export'}
                </button>
                <button type="button" class="secondary" disabled={busy} onclick={saveSettings}>
                    Save settings
                </button>
                <button type="button" class="ghost" disabled={busy} onclick={resetDefaults}>
                    Reset defaults
                </button>
            </div>

            {#if statusMessage}
                <p class="status" class:error={!statusOk} role="status">{statusMessage}</p>
            {/if}

            {#if settingsPath}
                <p class="footer-hint mono">Settings: {settingsPath}</p>
            {/if}
        </form>
    {/if}
</main>

<style>
    .export-form {
        max-width: min(40rem, 100%);
        margin: 0 auto;
        padding: 24px 20px 48px;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .hero {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }

    h1 {
        margin: 0;
        font-size: 1.2rem;
        font-weight: 600;
    }

    h2 {
        margin: 0 0 0.75rem;
        font-size: 0.95rem;
        font-weight: 600;
    }

    .lede,
    .muted,
    .hint,
    .footer-hint {
        margin: 0;
        color: var(--vscode-descriptionForeground);
    }

    .lede {
        font-size: 0.95em;
    }

    .form {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
    }

    .simple,
    .advanced {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
    }

    .label {
        font-size: 0.9em;
        font-weight: 600;
    }

    .hint {
        font-size: 0.85em;
    }

    .mono {
        font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
        word-break: break-all;
    }

    .row {
        display: flex;
        gap: 0.5rem;
        align-items: stretch;
    }

    .row input {
        flex: 1;
        min-width: 0;
    }

    .grid-two {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
    }

    @media (max-width: 520px) {
        .grid-two {
            grid-template-columns: 1fr;
        }
    }

    input[type='text'],
    input[type='number'],
    select {
        width: 100%;
        padding: 6px 8px;
        border-radius: 2px;
        border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, transparent));
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
    }

    input:focus,
    select:focus {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: -1px;
    }

    .fieldset {
        margin: 0;
        padding: 0.65rem 0.75rem;
        border: 1px solid var(--vscode-panel-border, transparent);
        border-radius: 2px;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }

    .fieldset legend {
        padding: 0 0.25rem;
        font-size: 0.9em;
        font-weight: 600;
    }

    .check {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        font-size: 0.92em;
    }

    .check.block {
        margin-top: 0.15rem;
    }

    .advanced-toggle {
        appearance: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 8px 10px;
        border-radius: 2px;
        border: 1px solid var(--vscode-panel-border, transparent);
        background: var(--vscode-list-hoverBackground, transparent);
        cursor: pointer;
        text-align: left;
        font-weight: 600;
    }

    .advanced-toggle:hover {
        background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
    }

    .chevron {
        font-size: 1.1em;
        line-height: 1;
        color: var(--vscode-descriptionForeground);
    }

    .advanced-body {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        padding: 0.75rem 0 0.15rem;
    }

    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
    }

    .primary,
    .secondary,
    .ghost {
        appearance: none;
        padding: 6px 14px;
        border-radius: 2px;
        cursor: pointer;
        border: 1px solid transparent;
    }

    .primary {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border-color: var(--vscode-button-border, transparent);
    }

    .primary:hover:not(:disabled) {
        background: var(--vscode-button-hoverBackground);
    }

    .secondary {
        background: var(--vscode-button-secondaryBackground, transparent);
        color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
        border-color: var(--vscode-button-border, var(--vscode-panel-border));
    }

    .secondary:hover:not(:disabled) {
        background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground));
    }

    .ghost {
        background: transparent;
        color: var(--vscode-foreground);
        border-color: transparent;
    }

    .ghost:hover:not(:disabled) {
        background: var(--vscode-toolbar-hoverBackground);
    }

    button:disabled {
        opacity: 0.55;
        cursor: default;
    }

    .status {
        margin: 0;
        font-size: 0.92em;
        color: var(--vscode-foreground);
    }

    .status.error {
        color: var(--vscode-errorForeground, #f14c4c);
    }

    .footer-hint {
        font-size: 0.8em;
    }

    code {
        font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
        font-size: 0.95em;
    }
</style>
