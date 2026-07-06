<script lang="ts">
    import { TABS } from '../lib/tabs.js';
    import { getApp } from '../state/context.js';

    const app = getApp();
</script>

<div class="tabs">
    {#each TABS as tab (tab.id)}
        <button
            class="tab"
            class:active={app.tab.activeTab === tab.id}
            on:click={() => app.setTab(tab.id)}
        >
            {tab.label}
        </button>
    {/each}
</div>
