<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { app } from './state/app.svelte.js';
    import { setAppContext } from './state/context.js';
    import {
        DEFAULT_PANE_HEIGHTS,
        mergePaneHeights,
        paneFlexGrow,
        shouldFillAlone
    } from './lib/pane-layout.js';
    import HeaderBar from './components/HeaderBar.svelte';
    import BootstrapStatus from './components/BootstrapStatus.svelte';
    import WorkspacePane from './components/WorkspacePane.svelte';
    import SearchPane from './components/SearchPane.svelte';
    import TodoPane from './components/TodoPane.svelte';
    import ScopePane from './components/ScopePane.svelte';
    import SelectionPane from './components/SelectionPane.svelte';
    import ReferenceListsPane from './components/ReferenceListsPane.svelte';
    import MiniatureGraphPane from './components/MiniatureGraphPane.svelte';
    import ParentNodesPane from './components/ParentNodesPane.svelte';
    import ContextTray from './components/ContextTray.svelte';

    setAppContext(app);

    const defaultPaneState: Record<string, boolean> = {
        workspace: true,
        search: true,
        todos: true,
        scope: true,
        selection: true,
        references: true,
        graph: false,
        parents: true,
        tray: true
    };

    const restored = app.restoreViewState();
    let paneState = $state<Record<string, boolean>>({
        ...defaultPaneState,
        ...restored.panes
    });
    let paneHeights = $state<Record<string, number>>(
        mergePaneHeights(DEFAULT_PANE_HEIGHTS, restored.heights)
    );

    let fillAlone = $derived(shouldFillAlone(paneState));

    function handlePaneToggle(id: string, expanded: boolean): void {
        paneState = { ...paneState, [id]: expanded };
        app.persistViewState({ panes: paneState, heights: paneHeights });
    }

    function handlePaneResize(id: string, height: number): void {
        paneHeights = { ...paneHeights, [id]: height };
        app.persistViewState({ panes: paneState, heights: paneHeights });
    }

    function layoutProps(id: string): {
        fill: boolean;
        height: number | undefined;
        resizable: boolean;
        onResize: (id: string, height: number) => void;
    } {
        const expanded = Boolean(paneState[id]);
        return {
            fill: expanded,
            height: paneFlexGrow(id, expanded, paneHeights),
            resizable: expanded && !fillAlone,
            onResize: handlePaneResize
        };
    }

    const disposeApp = app.init();
    onDestroy(disposeApp);
    onMount(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const frame = requestAnimationFrame(() => {
            // A task queued from the first animation frame runs after the shell
            // has had an opportunity to paint.
            timer = setTimeout(() => app.signalFirstPaint(), 0);
        });
        return () => {
            cancelAnimationFrame(frame);
            if (timer !== undefined) {
                clearTimeout(timer);
            }
        };
    });

    let phase = $derived(app.contentPhase);
</script>

<div class="activity-bar">
    <HeaderBar />
    {#if phase !== 'ready'}
        <BootstrapStatus {phase} />
    {/if}
    <!-- Panes persist across phases; invalid/unready states hide content inside each pane. -->
    <div class="pane-stack">
        <WorkspacePane
            expanded={paneState.workspace}
            onToggle={handlePaneToggle}
            {...layoutProps('workspace')}
        />
        <SearchPane
            expanded={paneState.search ?? true}
            onToggle={handlePaneToggle}
            {...layoutProps('search')}
        />
        <TodoPane
            expanded={paneState.todos ?? true}
            onToggle={handlePaneToggle}
            {...layoutProps('todos')}
        />
        <ScopePane
            expanded={paneState.scope}
            onToggle={handlePaneToggle}
            {...layoutProps('scope')}
        />
        <SelectionPane
            expanded={paneState.selection ?? true}
            onToggle={handlePaneToggle}
            {...layoutProps('selection')}
        />
        <ReferenceListsPane
            expanded={paneState.references}
            onToggle={handlePaneToggle}
            {...layoutProps('references')}
        />
        <MiniatureGraphPane
            expanded={paneState.graph}
            onToggle={handlePaneToggle}
            {...layoutProps('graph')}
        />
        <ParentNodesPane
            expanded={paneState.parents}
            onToggle={handlePaneToggle}
            {...layoutProps('parents')}
        />
        <ContextTray
            expanded={paneState.tray}
            onToggle={handlePaneToggle}
            {...layoutProps('tray')}
        />
    </div>
</div>
