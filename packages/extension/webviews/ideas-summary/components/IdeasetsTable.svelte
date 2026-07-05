<script lang="ts">
    import type { IdeasetTableRow } from '../../../src/webview_module/shared/messages.js';
    import { createEventDispatcher } from 'svelte';
    import Pager from './Pager.svelte';

    export let rows: IdeasetTableRow[] = [];
    export let page = 0;
    export let total = 0;
    export let pageSize = 50;

    const dispatch = createEventDispatcher<{
        openMember: { fileUri: string; line: number };
        prev: void;
        next: void;
    }>();

    function memberPlaceholder(row: IdeasetTableRow): string {
        const count = row.members?.length ?? row.memberCount ?? 0;
        return count === 0 ? 'No members' : `Open member (${count})…`;
    }

    function handleMemberSelect(event: Event, row: IdeasetTableRow): void {
        const select = event.currentTarget as HTMLSelectElement;
        const index = Number(select.value);
        if (Number.isNaN(index) || index < 0) {
            return;
        }
        const member = row.members[index];
        if (!member) {
            return;
        }
        dispatch('openMember', { fileUri: member.fileUri, line: member.lineStart });
        select.value = '';
    }
</script>

<table>
    <thead>
        <tr>
            <th style="width:22%">Name</th>
            <th style="width:28%">Path</th>
            <th style="width:14%">Kind</th>
            <th style="width:36%">Members</th>
        </tr>
    </thead>
    <tbody>
        {#each rows as row (row.id)}
            {@const memberCount = row.members?.length ?? row.memberCount ?? 0}
            <tr>
                <td>{row.name}</td>
                <td>{row.path}</td>
                <td>{row.kind === 'file' ? 'file (implicit)' : 'explicit'}</td>
                <td>
                    <select
                        class="member-select"
                        disabled={memberCount === 0}
                        on:change={(event) => handleMemberSelect(event, row)}
                    >
                        <option value="">{memberPlaceholder(row)}</option>
                        {#each row.members ?? [] as member, index (member.fileUri + member.lineStart)}
                            <option value={index}>{member.name}</option>
                        {/each}
                    </select>
                </td>
            </tr>
        {/each}
    </tbody>
</table>

<Pager {page} {total} {pageSize} label="ideasets" on:prev on:next />
