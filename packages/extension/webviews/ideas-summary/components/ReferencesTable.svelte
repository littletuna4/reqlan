<script lang="ts">
    import type { ReferenceTableRow } from '../../../src/webview_module/shared/messages.js';
    import { createEventDispatcher } from 'svelte';
    import Pager from './Pager.svelte';

    export let rows: ReferenceTableRow[] = [];
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
            <th style="width:24%">Source</th>
            <th style="width:24%">Target</th>
            <th style="width:10%">In .rq</th>
            <th style="width:14%">Type</th>
        </tr>
    </thead>
    <tbody>
        {#each rows as row (`${row.sourceFileUri}:${row.sourceLineStart}:${row.targetName}`)}
            <tr
                class="clickable"
                on:click={() => dispatch('open', { fileUri: row.sourceFileUri, line: row.sourceLineStart })}
            >
                <td>{row.sourcePath} · {row.sourceName}</td>
                <td>{row.targetPath} · {row.targetName}</td>
                <td>{row.isInRq ? 'yes' : 'no'}</td>
                <td>{row.referenceType}</td>
            </tr>
        {/each}
    </tbody>
</table>

<Pager {page} {total} {pageSize} label="references" on:prev on:next />
