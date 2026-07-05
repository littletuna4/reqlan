<script lang="ts">
    export let text: string | undefined;
</script>

{#if text}
    <div class="idea-body">{text}</div>
{:else}
    <span class="member-empty">—</span>
{/if}
