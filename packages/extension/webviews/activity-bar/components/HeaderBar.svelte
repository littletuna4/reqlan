<script lang="ts">
    import { getApp } from '../state/context.js';

    const app = getApp();
</script>

<header class="header-bar">
    <button
        class="toolbar-button"
        class:active={app.syncWithEditor}
        onclick={() => app.setSyncWithEditor(!app.syncWithEditor)}
        title="Follow active editor"
    >Sync</button>
    <div class="hop-control" title="Graph hop depth for context and panes">
        <button
            class="toolbar-button hop-button"
            disabled={app.globalHopDepth <= app.minHopDepth}
            onclick={() => app.adjustGlobalHopDepth(-1)}
            aria-label="Decrease hop depth"
        >−</button>
        <span class="hop-value" aria-live="polite">{app.globalHopDepth}</span>
        <button
            class="toolbar-button hop-button"
            disabled={app.globalHopDepth >= app.maxHopDepth}
            onclick={() => app.adjustGlobalHopDepth(1)}
            aria-label="Increase hop depth"
        >+</button>
    </div>
    <button class="toolbar-button" onclick={() => app.openIdeasSummary('ideas')}>Ideas</button>
    <button class="toolbar-button" onclick={() => app.openIdeasSummary('graph')}>Graph</button>
    {#if app.scope?.focusIdea}
        <button class="toolbar-button" onclick={() => app.copyScopeMarkdown(app.scope!.focusIdea!.id)}>Copy</button>
    {/if}
    <button class="toolbar-button" onclick={() => app.refreshIndex()} title="Refresh index">↻</button>
    {#if app.siteLink}
        <button
            class="toolbar-button info-button"
            onclick={() => app.openSiteLink()}
            title={`Open ${app.siteLink.label} (${app.siteLink.href})`}
            aria-label={`Open ${app.siteLink.label}`}
        >ⓘ</button>
    {/if}
    <button class="toolbar-button" onclick={() => app.copyContextMarkdown()} title="Copy composed context">
        Context
    </button>
</header>
{#if app.statusText}
    <div class="status-line" class:error={app.statusError}>{app.statusText}</div>
{/if}
