<script lang="ts">
    import type { IdeaTableRow } from '../../../src/webview_module/shared/messages.js';
    import { createEventDispatcher } from 'svelte';
    import Pager from './Pager.svelte';

    export let rows: IdeaTableRow[] = [];
    export let page = 0;
    export let total = 0;
    export let pageSize = 50;

    const dispatch = createEventDispatcher<{
        open: { fileUri: string; line: number };
        prev: void;
        next: void;
    }>();
</script>

<table>
    <thead>
        <tr>
            <th style="width:18%">Title</th>
            <th style="width:22%">Path</th>
            <th style="width:14%">Body</th>
            <th style="width:28%">Other attributes</th>
            <th style="width:8%">Refs</th>
        </tr>
    </thead>
    <tbody>
        {#each rows as row (row.id)}
            <tr
                class="clickable"
                on:click={() => dispatch('open', { fileUri: row.fileUri, line: row.lineStart })}
            >
                <td>{row.title}</td>
                <td>{row.path}</td>
                <td>{row.mainAttribute ?? '—'}</td>
                <td>{row.otherAttributes || '—'}</td>
                <td>{row.referenceCount}</td>
            </tr>
        {/each}
    </tbody>
</table>

<Pager {page} {total} {pageSize} label="ideas" on:prev on:next />
