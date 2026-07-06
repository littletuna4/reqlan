<script lang="ts">
    import { getApp } from '../state/context.js';

    const app = getApp();
</script>

{#if app.tab.activeTab !== 'index' && app.tab.activeTab !== 'graph'}
    <div class="actions">
        <button on:click={app.exportGraph}>Export full graph (JSON)</button>
    </div>
{/if}

{#if app.dump.visible}
    <pre class="dump">{app.dump.output}</pre>
{/if}
