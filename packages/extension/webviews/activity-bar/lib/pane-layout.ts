/** Relative flex weights for expanded panes (also used as resize “height” units). */
export const DEFAULT_PANE_HEIGHTS: Readonly<Record<string, number>> = {
    workspace: 220,
    search: 200,
    todos: 200,
    scope: 280,
    selection: 160,
    references: 220,
    graph: 240,
    parents: 180,
    tray: 140
};

export const MIN_PANE_HEIGHT = 80;
export const MAX_PANE_HEIGHT = 720;

export function clampPaneHeight(height: number): number {
    if (!Number.isFinite(height)) {
        return MIN_PANE_HEIGHT;
    }
    return Math.min(MAX_PANE_HEIGHT, Math.max(MIN_PANE_HEIGHT, Math.round(height)));
}

export function countExpanded(paneState: Record<string, boolean>): number {
    return Object.values(paneState).filter(Boolean).length;
}

/** When exactly one pane is expanded, resize handles are unnecessary (it already fills). */
export function shouldFillAlone(paneState: Record<string, boolean>): boolean {
    return countExpanded(paneState) === 1;
}

export function mergePaneHeights(
    defaults: Readonly<Record<string, number>>,
    saved: Record<string, number> | undefined
): Record<string, number> {
    const merged: Record<string, number> = { ...defaults };
    if (!saved) {
        return merged;
    }
    for (const [id, value] of Object.entries(saved)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            merged[id] = clampPaneHeight(value);
        }
    }
    return merged;
}

/** Flex-grow weight for an expanded pane; collapsed panes do not grow. */
export function paneFlexGrow(
    id: string,
    expanded: boolean,
    heights: Record<string, number>
): number | undefined {
    if (!expanded) {
        return undefined;
    }
    return heights[id] ?? DEFAULT_PANE_HEIGHTS[id] ?? 200;
}

/** @deprecated Prefer paneFlexGrow — expanded panes fill via flex, not fixed body height. */
export function paneBodyHeight(
    id: string,
    expanded: boolean,
    fillAlone: boolean,
    heights: Record<string, number>
): number | undefined {
    if (!expanded || fillAlone) {
        return undefined;
    }
    return paneFlexGrow(id, expanded, heights);
}
