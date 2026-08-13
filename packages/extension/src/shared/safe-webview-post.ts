/**
 * Host-side webview I/O that must not throw when VS Code has not claimed the
 * overlay yet (Windows restore / first paint) or has already disposed it.
 */

const UNAVAILABLE_PATTERN = /webview is (disposed|in an invalid state)/i;

export function isWebviewUnavailableError(error: unknown): boolean {
    const text = error instanceof Error ? error.message : String(error ?? '');
    return UNAVAILABLE_PATTERN.test(text);
}

export function safeWebviewPost(
    webview: { postMessage(message: unknown): unknown } | undefined,
    message: unknown
): void {
    if (!webview) {
        return;
    }
    try {
        const result = webview.postMessage(message);
        if (isThenable(result)) {
            void result.then(undefined, (error: unknown) => {
                if (!isWebviewUnavailableError(error)) {
                    console.error('[reqlan] webview postMessage failed:', error);
                }
            });
        }
    } catch (error) {
        if (!isWebviewUnavailableError(error)) {
            console.error('[reqlan] webview postMessage failed:', error);
        }
    }
}

export function safeAssignWebviewHtml(
    webview: { html: string } | undefined,
    html: string
): boolean {
    if (!webview) {
        return false;
    }
    try {
        webview.html = html;
        return true;
    } catch (error) {
        if (!isWebviewUnavailableError(error)) {
            console.error('[reqlan] webview html assignment failed:', error);
        }
        return false;
    }
}

/**
 * Yield so the workbench can claim the overlay webview, then assign HTML.
 * Retry once after a second turn if the first assignment hits an invalid state.
 */
export async function assignWebviewHtmlWithRetry(options: {
    isCurrent: () => boolean;
    isCancelled?: () => boolean;
    assign: () => boolean;
    yieldTurn?: () => Promise<void>;
}): Promise<boolean> {
    const yieldTurn = options.yieldTurn ?? yieldEventLoop;
    const abandoned = (): boolean => Boolean(options.isCancelled?.()) || !options.isCurrent();

    await yieldTurn();
    if (abandoned()) {
        return false;
    }
    if (options.assign()) {
        return true;
    }
    await yieldTurn();
    if (abandoned()) {
        return false;
    }
    return options.assign();
}

export function yieldEventLoop(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
    return Boolean(value) && typeof (value as PromiseLike<unknown>).then === 'function';
}
