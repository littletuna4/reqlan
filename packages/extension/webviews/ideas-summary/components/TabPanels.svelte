<script lang="ts">
    import { getApp } from '../state/context.js';
    import GraphView from './GraphView.svelte';
    import IdeasTable from './IdeasTable.svelte';
    import IdeasetsTable from './IdeasetsTable.svelte';
    import IndexPanel from './IndexPanel.svelte';
    import ReferencesTable from './ReferencesTable.svelte';

    const app = getApp();
</script>

{#if app.tab.activeTab === 'index'}
    <IndexPanel />
{/if}

{#if app.tab.activeTab === 'ideas'}
    <IdeasTable />
{/if}

{#if app.tab.activeTab === 'ideasets'}
    <IdeasetsTable />
{/if}

{#if app.tab.activeTab === 'references'}
    <ReferencesTable />
{/if}

{#if app.tab.activeTab === 'graph'}
    <GraphView />
{/if}
