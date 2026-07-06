<script lang="ts">
    import { getApp } from '../state/context.js';

    const app = getApp();
</script>

<div class="status" class:error={app.tab.statusError}>{app.tab.statusText}</div>
