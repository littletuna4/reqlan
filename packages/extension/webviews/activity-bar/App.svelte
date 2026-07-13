<script lang="ts">
    import { onDestroy } from 'svelte';
    import { app } from './state/app.svelte.js';
    import { setAppContext } from './state/context.js';
    import HeaderBar from './components/HeaderBar.svelte';
    import ScopePane from './components/ScopePane.svelte';
    import SelectionPane from './components/SelectionPane.svelte';
    import ReferenceListsPane from './components/ReferenceListsPane.svelte';
    import MiniatureGraphPane from './components/MiniatureGraphPane.svelte';
    import ParentNodesPane from './components/ParentNodesPane.svelte';
    import ContextTray from './components/ContextTray.svelte';
    import WorkspacePane from './components/WorkspacePane.svelte';

    setAppContext(app);

    const defaultPaneState: Record<string, boolean> = {
        workspace: true,
        scope: true,
        selection: true,
        references: true,
        graph: false,
        parents: true,
        tray: true
    };

    const restored = app.restorePaneState();
    let paneState = $state<Record<string, boolean>>({
        ...defaultPaneState,
        ...restored
    });

    function handlePaneToggle(id: string, expanded: boolean): void {
        paneState = { ...paneState, [id]: expanded };
        app.persistPaneState(paneState);
    }

    const disposeApp = app.init();
    onDestroy(disposeApp);
</script>

<div class="activity-bar">
    <HeaderBar />
    <WorkspacePane expanded={paneState.workspace} onToggle={handlePaneToggle} />
    <ScopePane expanded={paneState.scope} onToggle={handlePaneToggle} />
    <SelectionPane expanded={paneState.selection ?? true} onToggle={handlePaneToggle} />
    <ReferenceListsPane expanded={paneState.references} onToggle={handlePaneToggle} />
    <MiniatureGraphPane expanded={paneState.graph} onToggle={handlePaneToggle} />
    <ParentNodesPane expanded={paneState.parents} onToggle={handlePaneToggle} />
    <ContextTray expanded={paneState.tray} onToggle={handlePaneToggle} />
</div>
