/**
 * Index lifecycle state types shared by the TS facade and the native runtime.
 *
 * The lifecycle FSM, counts, problem list, and activity rings now live in the
 * Rust `WorkspaceIndexRuntime` (surfaced via `NativeWorkspaceIndex.statusSnapshot`).
 * These are the plain shapes the TS side reads back from that snapshot.
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 * rq:["../../../reqlan rq/codestyle/typescript.rq".zustand_boundary]
 */

export type IndexState =
    | 'uninitialized'
    | 'opening'
    | 'idle'
    | 'syncing'
    | 'ready'
    | 'error'
    | 'closing';

export type IndexEvent = 'activate' | 'opened' | 'sync' | 'synced' | 'fail' | 'deactivate' | 'closed';

export type WorkspaceChange = 'created' | 'changed' | 'deleted';

export type IndexErrorPhase = 'open' | 'parse' | 'extract' | 'persist' | 'sync' | 'transition';

export interface IndexError {
    message: string;
    fileUri?: string;
    ideaNames?: string[];
    phase?: IndexErrorPhase;
    cause?: unknown;
}

export interface FileIndexIssue {
    fileUri: string;
    line: number;
    column: number;
    message: string;
    phase: IndexErrorPhase;
    ideaNames?: string[];
    cause?: string;
    at: number;
}

export interface DocumentUpdateIdea {
    id: string;
    name: string;
    lineStart: number;
}

export interface DocumentUpdate {
    fileUri: string;
    ideaCount: number;
    /** Ideas persisted in this update — used for idea-centric Timeline events. */
    ideas?: DocumentUpdateIdea[];
    at: number;
}

export interface WorkspaceFileChange {
    fileUri: string;
    change: WorkspaceChange;
    at: number;
}
