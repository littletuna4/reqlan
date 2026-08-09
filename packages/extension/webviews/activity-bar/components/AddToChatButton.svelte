<script lang="ts">
    import type { IdeaSearchHitView } from '../../../src/activity_bar_module/activity-bar-messages.js';
    import { getApp } from '../state/context.js';

    interface Props {
        hit: IdeaSearchHitView;
    }
    let { hit }: Props = $props();

    const app = getApp();
    let open = $state(false);
    let rootEl = $state<HTMLDivElement | undefined>(undefined);

    function addCurrent(): void {
        open = false;
        app.addToChat(hit, 'current');
    }

    function addNew(): void {
        open = false;
        app.addToChat(hit, 'new');
    }

    function toggleMenu(event: MouseEvent): void {
        event.stopPropagation();
        open = !open;
    }

    function onWindowPointerDown(event: PointerEvent): void {
        if (!open || !rootEl) {
            return;
        }
        if (event.target instanceof Node && rootEl.contains(event.target)) {
            return;
        }
        open = false;
    }

    function onWindowKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            open = false;
        }
    }
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeydown} />

<div class="add-to-chat" bind:this={rootEl}>
    <div class="add-to-chat-split" role="group" aria-label="Add to chat">
        <button
            type="button"
            class="action-button add-to-chat-primary"
            title="Add #requirement {hit.name} to the current chat input"
            onclick={addCurrent}
        >Add to chat</button>
        <button
            type="button"
            class="action-button add-to-chat-toggle"
            title="More options: add to new chat"
            aria-label="Add to chat options"
            aria-haspopup="menu"
            aria-expanded={open}
            onclick={toggleMenu}
        >
            <span aria-hidden="true">▾</span>
        </button>
    </div>
    {#if open}
        <div class="add-to-chat-menu" role="menu" aria-label="Add to chat options">
            <button
                type="button"
                class="add-to-chat-option"
                role="menuitem"
                title="Inject into the current chat input without submitting"
                onclick={addCurrent}
            >Add to current chat</button>
            <button
                type="button"
                class="add-to-chat-option"
                role="menuitem"
                title="Open a new chat and add this requirement"
                onclick={addNew}
            >Add to new chat</button>
        </div>
    {/if}
</div>

<style>
    .add-to-chat {
        position: relative;
        display: inline-flex;
        flex-direction: column;
        align-items: stretch;
        max-width: 100%;
    }

    .add-to-chat-split {
        display: inline-flex;
        align-items: stretch;
        max-width: 100%;
    }

    .add-to-chat-primary {
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
        border-right: 1px solid color-mix(in srgb, var(--vscode-button-secondaryForeground) 22%, transparent);
    }

    .add-to-chat-toggle {
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
        padding-left: 6px;
        padding-right: 6px;
        min-width: 22px;
    }

    .add-to-chat-menu {
        position: absolute;
        top: calc(100% + 2px);
        left: 0;
        z-index: 20;
        min-width: 100%;
        display: flex;
        flex-direction: column;
        padding: 2px;
        border: 1px solid var(--vscode-menu-border, var(--vscode-dropdown-border, var(--vscode-input-border, transparent)));
        border-radius: 2px;
        background: var(--vscode-menu-background, var(--vscode-dropdown-background, var(--vscode-sideBar-background)));
        box-shadow: 0 2px 8px color-mix(in srgb, var(--vscode-widget-shadow, #000) 35%, transparent);
    }

    .add-to-chat-option {
        display: block;
        width: 100%;
        text-align: left;
        border: none;
        border-radius: 2px;
        padding: 4px 8px;
        background: transparent;
        color: var(--vscode-menu-foreground, var(--vscode-foreground));
        font: inherit;
        line-height: 1.3;
        white-space: nowrap;
        cursor: pointer;
    }

    .add-to-chat-option:hover,
    .add-to-chat-option:focus-visible {
        background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
        color: var(--vscode-menu-selectionForeground, var(--vscode-foreground));
        outline: none;
    }
</style>
