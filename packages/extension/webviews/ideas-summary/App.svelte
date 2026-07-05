<script lang="ts">
    import { onMount } from 'svelte';
    import type {
        ExtensionToWebviewMessage,
        GraphViewQuery,
        GraphViewSlice,
        IdeaTableRow,
        IdeasTableQuery,
        IdeasetsTableQuery,
        IdeasetTableRow,
        IndexStatusView,
        ReferencesTableQuery,
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
    import GraphView from './components/GraphView.svelte';

    type Tab = 'index' | 'ideas' | 'ideasets' | 'references' | 'graph';

    const tabs: Array<{ id: Tab; label: string }> = [
        { id: 'index', label: 'Index' },
        { id: 'ideas', label: 'Ideas' },
        { id: 'ideasets', label: 'Ideasets' },
        { id: 'references', label: 'References' },
        { id: 'graph', label: 'Graph' }
    ];

    const defaultIdeasQuery = (): IdeasTableQuery => ({
        page: 0,
        pageSize: IDEAS_PAGE_SIZE,
        sortBy: 'path',
        sortDir: 'asc',
        attributeColumns: [],
        referenceFilters: []
    });

    const defaultIdeasetsQuery = (): IdeasetsTableQuery => ({
        page: 0,
        pageSize: IDEASETS_PAGE_SIZE,
        sortBy: 'path',
        sortDir: 'asc'
    });

    const defaultReferencesQuery = (): ReferencesTableQuery => ({
        page: 0,
        pageSize: REFERENCES_PAGE_SIZE,
        sortBy: 'source',
        sortDir: 'asc'
    });

    const defaultGraphQuery = (): GraphViewQuery => ({
        includeIndirect: false
    });

    let activeTab: Tab = 'index';
    let statusText = 'Loading index…';
    let statusError = false;
    let indexStatus: IndexStatusView | undefined;

    let ideasQuery = defaultIdeasQuery();
    let ideasTotal = 0;
    let ideasRows: IdeaTableRow[] = [];

    let ideasetsQuery = defaultIdeasetsQuery();
    let ideasetsTotal = 0;
    let ideasetsRows: IdeasetTableRow[] = [];

    let referencesQuery = defaultReferencesQuery();
    let referencesTotal = 0;
    let referencesRows: ReferenceTableRow[] = [];

    let graphQuery = defaultGraphQuery();
    let graphSlice: GraphViewSlice | undefined;
    let graphLoading = false;

    let dumpOutput = '';
    let dumpVisible = false;

    let ideasSearchTimer: ReturnType<typeof setTimeout> | undefined;
    let ideasetsSearchTimer: ReturnType<typeof setTimeout> | undefined;
    let referencesSearchTimer: ReturnType<typeof setTimeout> | undefined;

    function setTab(tab: Tab): void {
        activeTab = tab;
        if (tab === 'graph') {
            requestGraph();
        }
    }

    function requestGraph(): void {
        if (graphLoading) {
            return;
        }
        if (!graphSlice || graphSlice.waitingForIndex) {
            loadGraph(graphQuery);
        }
    }

    function openIdea(fileUri: string, line: number, column = 0): void {
        postToExtension({ type: 'openIdea', fileUri, line, column });
    }

    function loadIdeas(query: IdeasTableQuery): void {
        ideasQuery = query;
        postToExtension({ type: 'loadIdeas', query });
    }

    function loadIdeasets(query: IdeasetsTableQuery): void {
        ideasetsQuery = query;
        postToExtension({ type: 'loadIdeasets', query });
    }

    function loadReferences(query: ReferencesTableQuery): void {
        referencesQuery = query;
        postToExtension({ type: 'loadReferences', query });
    }

    function loadGraph(query: GraphViewQuery): void {
        graphQuery = query;
        graphLoading = true;
        postToExtension({ type: 'loadGraph', query });
    }

    function debouncedIdeasSearch(query: IdeasTableQuery): void {
        clearTimeout(ideasSearchTimer);
        ideasSearchTimer = setTimeout(() => loadIdeas(query), 250);
    }

    function debouncedIdeasetsSearch(query: IdeasetsTableQuery): void {
        clearTimeout(ideasetsSearchTimer);
        ideasetsSearchTimer = setTimeout(() => loadIdeasets(query), 250);
    }

    function debouncedReferencesSearch(query: ReferencesTableQuery): void {
        clearTimeout(referencesSearchTimer);
        referencesSearchTimer = setTimeout(() => loadReferences(query), 250);
    }

    function handleIdeasQueryChange(query: IdeasTableQuery): void {
        if (query.search !== ideasQuery.search) {
            ideasQuery = query;
            debouncedIdeasSearch(query);
            return;
        }
        loadIdeas(query);
    }

    function handleIdeasetsQueryChange(query: IdeasetsTableQuery): void {
        if (query.search !== ideasetsQuery.search) {
            ideasetsQuery = query;
            debouncedIdeasetsSearch(query);
            return;
        }
        loadIdeasets(query);
    }

    function handleReferencesQueryChange(query: ReferencesTableQuery): void {
        if (query.search !== referencesQuery.search) {
            referencesQuery = query;
            debouncedReferencesSearch(query);
            return;
        }
        loadReferences(query);
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
                if (message.status.ready && activeTab === 'graph' && graphSlice?.waitingForIndex && !graphLoading) {
                    loadGraph(graphQuery);
                }
                break;
            case 'ideasPage':
                ideasQuery = message.query;
                ideasTotal = message.total;
                ideasRows = message.rows;
                break;
            case 'ideasetsPage':
                ideasetsQuery = message.query;
                ideasetsTotal = message.total;
                ideasetsRows = message.rows;
                break;
            case 'referencesPage':
                referencesQuery = message.query;
                referencesTotal = message.total;
                referencesRows = message.rows;
                break;
            case 'graphSlice':
                graphQuery = message.slice.query;
                graphSlice = message.slice;
                graphLoading = false;
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
                graphLoading = false;
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
        on:clearAndRebuild={() => postToExtension({ type: 'clearAndRebuildIndex' })}
        on:openIssue={(event) => openIdea(event.detail.fileUri, event.detail.line, event.detail.column)}
    />
{/if}

{#if activeTab === 'ideas'}
    <IdeasTable
        rows={ideasRows}
        query={ideasQuery}
        total={ideasTotal}
        on:queryChange={(event) => handleIdeasQueryChange(event.detail)}
        on:open={(event) => openIdea(event.detail.fileUri, event.detail.line)}
        on:openReference={(event) => openIdea(event.detail.fileUri, event.detail.line)}
        on:prev={() => ideasQuery.page > 0 && loadIdeas({ ...ideasQuery, page: ideasQuery.page - 1 })}
        on:next={() => loadIdeas({ ...ideasQuery, page: ideasQuery.page + 1 })}
    />
{/if}

{#if activeTab === 'ideasets'}
    <IdeasetsTable
        rows={ideasetsRows}
        query={ideasetsQuery}
        total={ideasetsTotal}
        on:queryChange={(event) => handleIdeasetsQueryChange(event.detail)}
        on:openMember={(event) => openIdea(event.detail.fileUri, event.detail.line)}
        on:openSource={(event) => openIdea(event.detail.fileUri, event.detail.line)}
        on:prev={() => ideasetsQuery.page > 0 && loadIdeasets({ ...ideasetsQuery, page: ideasetsQuery.page - 1 })}
        on:next={() => loadIdeasets({ ...ideasetsQuery, page: ideasetsQuery.page + 1 })}
    />
{/if}

{#if activeTab === 'references'}
    <ReferencesTable
        rows={referencesRows}
        query={referencesQuery}
        total={referencesTotal}
        on:queryChange={(event) => handleReferencesQueryChange(event.detail)}
        on:open={(event) => openIdea(event.detail.fileUri, event.detail.line)}
        on:prev={() => referencesQuery.page > 0 && loadReferences({ ...referencesQuery, page: referencesQuery.page - 1 })}
        on:next={() => loadReferences({ ...referencesQuery, page: referencesQuery.page + 1 })}
    />
{/if}

{#if activeTab === 'graph'}
    <GraphView
        slice={graphSlice}
        query={graphQuery}
        loading={graphLoading}
        on:queryChange={(event) => loadGraph(event.detail)}
        on:open={(event) => openIdea(event.detail.fileUri, event.detail.line)}
        on:focus={(event) => loadGraph({ ...graphQuery, centerId: event.detail.centerId })}
    />
{/if}

{#if activeTab !== 'index' && activeTab !== 'graph'}
    <div class="actions">
        <button on:click={dumpGraph}>Export full graph (JSON)</button>
    </div>
{/if}

{#if dumpVisible}
    <pre class="dump">{dumpOutput}</pre>
{/if}
