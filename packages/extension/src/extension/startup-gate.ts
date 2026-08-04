/**
 * One-shot signal used to keep index startup behind the activity-bar's first
 * rendered frame. The promise resolves once and remains resolved for retries or
 * restored webview instances.
 */
export class StartupGate {
    readonly ready: Promise<void>;
    private resolveReady!: () => void;
    private signalled = false;

    constructor() {
        this.ready = new Promise(resolve => {
            this.resolveReady = resolve;
        });
    }

    signal(): void {
        if (this.signalled) {
            return;
        }
        this.signalled = true;
        this.resolveReady();
    }

    waitOrTimeout(timeoutMs: number): Promise<void> {
        return new Promise(resolve => {
            const timer = setTimeout(resolve, timeoutMs);
            void this.ready.then(() => {
                clearTimeout(timer);
                resolve();
            });
        });
    }
}
