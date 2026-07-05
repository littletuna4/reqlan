<script lang="ts">
    import { onMount } from 'svelte';
    import type {
        ExtensionToWebviewMessage,
        IdeaTableRow,
        IdeasetTableRow,
        IndexStatusView,
        ReferenceTableRow
    } from '../../src/webview_module/shared/messages.js';
    import {
        IDEAS_PAGE_SIZE,
        IDEASETS_PAGE_SIZE,
        REFERENCES_PAGE_SIZE
    } from '../../src/webview_module/shared/messages.js';
    import { postToExtension } from './lib/vscode.js';
    import IndexPanel from './components/IndexPanel.svelte';
    import IdeasTable from './components/IdeasTable.svelte';
    import IdeasetsTable from './components/IdeasetsTable.svelte';
    import ReferencesTable from './components/ReferencesTable.svelte';

    type Tab = 'index' | 'ideas' | 'ideasets' | 'references';

    const tabs: Array<{ id: Tab; label: string }> = [
        { id: 'index', label: 'Index' },
        { id: 'ideas', label: 'Ideas' },
        { id: 'ideasets', label: 'Ideasets' },
        { id: 'references', label: 'References' }
    ];

    let activeTab: Tab = 'index';
    let statusText = 'Loading index…';
    let statusError = false;
    let indexStatus: IndexStatusView | undefined;

    let ideasPage = 0;
    let ideasTotal = 0;
    let ideasRows: IdeaTableRow[] = [];

    let ideasetsPage = 0;
    let ideasetsTotal = 0;
    let ideasetsRows: IdeasetTableRow[] = [];

    let referencesPage = 0;
    let referencesTotal = 0;
    let referencesRows: ReferenceTableRow[] = [];

    let dumpOutput = '';
    let dumpVisible = false;

    function setTab(tab: Tab): void {
        activeTab = tab;
    }

    function openIdea(fileUri: string, line: number, column = 0): void {
        postToExtension({ type: 'openIdea', fileUri, line, column });
    }

    function updateStatusFromIndex(status: IndexStatusView): void {
        indexStatus = status;
        const issueCount = status.fileIssueCount ?? 0;
        const isGlobalError = Boolean(status.lastError && !status.lastError.file);

        if (status.ready) {
            const issueHint = issueCount > 0 ? `, ${issueCount} issue(s) from last index` : '';
            statusText = `${status.ideaCount} ideas, ${status.edgeCount} references indexed${issueHint}`;
            statusError = issueCount > 0;
        } else if (isGlobalError && status.lastError) {
            statusText = status.lastError.summary;
            statusError = true;
        } else if (issueCount > 0) {
            statusText = `${issueCount} issue(s) from last index`;
            statusError = true;
        } else if (status.syncProgress) {
            statusText = `Indexing workspace… ${status.syncProgress.processed}/${status.syncProgress.total} files`;
            statusError = false;
        } else {
            statusText = `Index state: ${status.state}`;
            statusError = false;
        }
    }

    function handleExtensionMessage(message: ExtensionToWebviewMessage): void {
        switch (message.type) {
            case 'indexStatus':
                updateStatusFromIndex(message.status);
                break;
            case 'ideasPage':
                ideasPage = message.page;
                ideasTotal = message.total;
                ideasRows = message.rows;
                break;
            case 'ideasetsPage':
                ideasetsPage = message.page;
                ideasetsTotal = message.total;
                ideasetsRows = message.rows;
                break;
            case 'referencesPage':
                referencesPage = message.page;
                referencesTotal = message.total;
                referencesRows = message.rows;
                break;
            case 'fullGraph':
                dumpVisible = true;
                dumpOutput = JSON.stringify({
                    ideaCount: message.ideaCount,
                    edgeCount: message.edgeCount,
                    ideas: JSON.parse(message.ideasJson),
                    edges: JSON.parse(message.edgesJson)
                }, null, 2);
                break;
            case 'error':
                statusText = message.message;
                statusError = true;
                break;
        }
    }

    function dumpGraph(): void {
        dumpOutput = 'Loading full graph…';
        dumpVisible = true;
        postToExtension({ type: 'dumpFullGraph' });
    }

    onMount(() => {
        window.addEventListener('message', event => {
            handleExtensionMessage(event.data as ExtensionToWebviewMessage);
        });
        postToExtension({ type: 'ready' });
    });
</script>

<h1>Ideas Summary</h1>
<div class="status" class:error={statusError}>{statusText}</div>

<div class="tabs">
    {#each tabs as tab (tab.id)}
        <button class="tab" class:active={activeTab === tab.id} on:click={() => setTab(tab.id)}>
            {tab.label}
        </button>
    {/each}
</div>

{#if activeTab === 'index'}
    <IndexPanel
        status={indexStatus}
        on:refresh={() => postToExtension({ type: 'refreshIndex' })}
        on:openIssue={(event) => openIdea(event.detail.fileUri, event.detail.line, event.detail.column)}
    />
{/if}

{#if activeTab === 'ideas'}
    <IdeasTable
        rows={ideasRows}
        page={ideasPage}
        total={ideasTotal}
        pageSize={IDEAS_PAGE_SIZE}
        on:open={(event) => openIdea(event.detail.fileUri, event.detail.line)}
        on:prev={() => ideasPage > 0 && postToExtension({ type: 'loadIdeas', page: ideasPage - 1 })}
        on:next={() => postToExtension({ type: 'loadIdeas', page: ideasPage + 1 })}
    />
{/if}

{#if activeTab === 'ideasets'}
    <IdeasetsTable
        rows={ideasetsRows}
        page={ideasetsPage}
        total={ideasetsTotal}
        pageSize={IDEASETS_PAGE_SIZE}
        on:openMember={(event) => openIdea(event.detail.fileUri, event.detail.line)}
        on:prev={() => ideasetsPage > 0 && postToExtension({ type: 'loadIdeasets', page: ideasetsPage - 1 })}
        on:next={() => postToExtension({ type: 'loadIdeasets', page: ideasetsPage + 1 })}
    />
{/if}

{#if activeTab === 'references'}
    <ReferencesTable
        rows={referencesRows}
        page={referencesPage}
        total={referencesTotal}
        pageSize={REFERENCES_PAGE_SIZE}
        on:open={(event) => openIdea(event.detail.fileUri, event.detail.line)}
        on:prev={() => referencesPage > 0 && postToExtension({ type: 'loadReferences', page: referencesPage - 1 })}
        on:next={() => postToExtension({ type: 'loadReferences', page: referencesPage + 1 })}
    />
{/if}

{#if activeTab !== 'index'}
    <div class="actions">
        <button on:click={dumpGraph}>Export full graph (JSON)</button>
    </div>
{/if}

{#if dumpVisible}
    <pre class="dump">{dumpOutput}</pre>
{/if}
