import type { GraphLoadPhase, GraphViewQuery, GraphViewSlice } from '../../../src/webview_module/shared/messages.js';

const GRAPH_LOAD_TIMEOUT_MS = 30_000;

export type GraphLoadUiPhase = GraphLoadPhase | 'rendering' | 'idle';

export interface GraphLoadState {
    query: GraphViewQuery;
    slice: GraphViewSlice | undefined;
    loading: boolean;
    phase: GraphLoadUiPhase;
    detail: string;
}

export interface GraphLoadCallbacks {
    onTimeout: (message: string) => void;
    onStateChange: (state: GraphLoadState) => void;
}

export class GraphLoadController {
    private requestId = 0;
    private activeRequestId = 0;
    private loadTimeout: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly callbacks: GraphLoadCallbacks,
        private state: GraphLoadState
    ) {}

    getState(): GraphLoadState {
        return this.state;
    }

    setSlice(slice: GraphViewSlice): void {
        this.state = { ...this.state, slice };
    }

    load(query: GraphViewQuery): number {
        this.requestId += 1;
        this.activeRequestId = this.requestId;
        const requestId = this.requestId;

        this.clearTimeout();
        this.state = {
            ...this.state,
            query,
            loading: true,
            phase: 'checking-index',
            detail: `Request #${requestId}`
        };
        this.callbacks.onStateChange(this.state);

        this.loadTimeout = setTimeout(() => {
            if (this.state.loading && this.activeRequestId === requestId) {
                this.state = {
                    ...this.state,
                    loading: false,
                    phase: 'failed',
                    detail: `Timed out after ${GRAPH_LOAD_TIMEOUT_MS / 1000}s waiting for extension (request #${requestId})`
                };
                this.callbacks.onStateChange(this.state);
                this.callbacks.onTimeout(this.state.detail);
            }
        }, GRAPH_LOAD_TIMEOUT_MS);

        return requestId;
    }

    applyProgress(phase: GraphLoadPhase, detail: string | undefined, requestId: number | undefined): void {
        if (!this.state.loading) {
            return;
        }
        if (requestId !== undefined && requestId !== this.activeRequestId) {
            return;
        }

        this.state = {
            ...this.state,
            phase,
            detail: detail ?? this.state.detail
        };
        this.callbacks.onStateChange(this.state);
    }

    applySlice(slice: GraphViewSlice, requestId: number | undefined): void {
        const isPassiveUpdate = requestId === undefined || requestId === 0;
        if (!isPassiveUpdate && !this.acceptResponse(requestId)) {
            return;
        }
        if (isPassiveUpdate && this.state.loading && this.activeRequestId > 0) {
            return;
        }

        const wasLoading = this.state.loading;
        this.state = {
            ...this.state,
            query: slice.query,
            slice
        };

        if (wasLoading && !isPassiveUpdate) {
            this.finishLoad(requestId);
        }

        if (slice.waitingForIndex) {
            this.state = {
                ...this.state,
                phase: 'waiting-for-index',
                detail: this.state.detail || 'Index is still building'
            };
        } else if (wasLoading && !isPassiveUpdate) {
            this.state = {
                ...this.state,
                phase: 'rendering',
                detail: 'Building cytoscape graph'
            };
        }

        this.callbacks.onStateChange(this.state);
    }

    applyError(message: string, requestId: number | undefined): boolean {
        if (requestId !== undefined) {
            if (!this.finishLoad(requestId)) {
                return false;
            }
            this.state = {
                ...this.state,
                phase: 'failed',
                detail: message
            };
            this.callbacks.onStateChange(this.state);
            return true;
        }

        if (this.state.loading) {
            this.clearTimeout();
            this.state = {
                ...this.state,
                loading: false,
                phase: 'failed',
                detail: message
            };
            this.callbacks.onStateChange(this.state);
            return true;
        }

        return true;
    }

    onRendered(): void {
        this.state = {
            ...this.state,
            phase: 'idle',
            detail: ''
        };
        this.callbacks.onStateChange(this.state);
    }

    dispose(): void {
        this.clearTimeout();
    }

    private acceptResponse(requestId: number | undefined): boolean {
        const resolved = requestId !== undefined
            ? requestId
            : (this.state.loading ? this.activeRequestId : 0);

        if (resolved === 0) {
            return !this.state.loading;
        }
        return resolved >= this.activeRequestId;
    }

    private finishLoad(requestId: number | undefined): boolean {
        if (!this.acceptResponse(requestId)) {
            return false;
        }
        this.clearTimeout();
        this.state = { ...this.state, loading: false };
        return true;
    }

    private clearTimeout(): void {
        clearTimeout(this.loadTimeout);
        this.loadTimeout = undefined;
    }
}
