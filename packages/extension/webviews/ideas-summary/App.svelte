<script lang="ts">
    import { onMount } from 'svelte';
    import { app } from './state/app.svelte.js';
    import { setAppContext } from './state/context.js';
    import StatusBar from './components/StatusBar.svelte';
    import TabBar from './components/TabBar.svelte';
    import TabPanels from './components/TabPanels.svelte';
    import GraphDumpPanel from './components/GraphDumpPanel.svelte';

    setAppContext(app);

    onMount(() => app.init());
</script>

<h1>Ideas Summary</h1>
<StatusBar />
<TabBar />
<TabPanels />
<GraphDumpPanel />
