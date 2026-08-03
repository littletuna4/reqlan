<script lang="ts">
    import { getApp } from '../state/context.js';
    import AttributesTable from './AttributesTable.svelte';
    import BasesTable from './BasesTable.svelte';
    import GraphView from './GraphView.svelte';
    import IdeasTable from './IdeasTable.svelte';
    import IdeasetsTable from './IdeasetsTable.svelte';
    import IndexPanel from './IndexPanel.svelte';
    import OverviewPanel from './OverviewPanel.svelte';
    import ReferencesTable from './ReferencesTable.svelte';
    import TimelinePanel from './TimelinePanel.svelte';

    const app = getApp();
</script>

{#if app.tab.activeTab === 'overview'}
    <OverviewPanel />
{/if}

{#if app.tab.activeTab === 'bases'}
    <BasesTable />
{/if}

{#if app.tab.activeTab === 'ideas'}
    <IdeasTable />
{/if}

{#if app.tab.activeTab === 'ideasets'}
    <IdeasetsTable />
{/if}

{#if app.tab.activeTab === 'attributes'}
    <AttributesTable />
{/if}

{#if app.tab.activeTab === 'references'}
    <ReferencesTable />
{/if}

{#if app.tab.activeTab === 'graph'}
    <GraphView />
{/if}

{#if app.tab.activeTab === 'timeline'}
    <TimelinePanel />
{/if}

{#if app.tab.activeTab === 'index'}
    <IndexPanel />
{/if}
