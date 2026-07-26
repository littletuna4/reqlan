/** Shared helpers for draggable overlay panels on the graph surface wrap. */

export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export interface SurfaceBounds {
    width: number;
    height: number;
    left: number;
    top: number;
}

export function readSurfaceBounds(panelEl: HTMLElement | undefined): SurfaceBounds | undefined {
    const surface = panelEl?.parentElement;
    if (!surface) {
        return undefined;
    }
    const rect = surface.getBoundingClientRect();
    return { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
}

/** Keep a positioned panel fully inside its surface wrap after resize or drag. */
export function clampPanelPosition(
    panelEl: HTMLElement,
    panelX: number,
    panelY: number,
    bounds: SurfaceBounds
): { x: number; y: number } {
    const panelRect = panelEl.getBoundingClientRect();
    return {
        x: clamp(panelX, 0, Math.max(0, bounds.width - panelRect.width)),
        y: clamp(panelY, 0, Math.max(0, bounds.height - panelRect.height))
    };
}

/**
 * Observe the surface wrap and reclamp panel coordinates when it shrinks.
 * Returns a disconnect function.
 */
export function observeSurfaceResize(
    panelEl: HTMLElement,
    getPosition: () => { x: number | undefined; y: number | undefined },
    setPosition: (x: number, y: number) => void
): () => void {
    const surface = panelEl.parentElement;
    if (!surface) {
        return () => undefined;
    }

    const reclamp = (): void => {
        const { x, y } = getPosition();
        if (x === undefined || y === undefined) {
            return;
        }
        const bounds = readSurfaceBounds(panelEl);
        if (!bounds) {
            return;
        }
        const next = clampPanelPosition(panelEl, x, y, bounds);
        if (next.x !== x || next.y !== y) {
            setPosition(next.x, next.y);
        }
    };

    const observer = new ResizeObserver(reclamp);
    observer.observe(surface);
    return () => observer.disconnect();
}
