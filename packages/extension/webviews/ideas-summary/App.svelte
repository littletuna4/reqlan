<script lang="ts">
    import { onDestroy } from 'svelte';
    import { app } from './state/app.svelte.js';
    import { setAppContext } from './state/context.js';
    import StatusBar from './components/StatusBar.svelte';
    import TabBar from './components/TabBar.svelte';
    import TabPanels from './components/TabPanels.svelte';
    import GraphDumpPanel from './components/GraphDumpPanel.svelte';

    setAppContext(app);

    // Register messaging before children mount. Svelte runs child onMount before
    // parent onMount; GraphView must not post loadGraph into a void.
    const disposeApp = app.init();
    onDestroy(disposeApp);
</script>

<h1>Ideas Summary</h1>
<StatusBar />
<TabBar />
<TabPanels />
<GraphDumpPanel />
