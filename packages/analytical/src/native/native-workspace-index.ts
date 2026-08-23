/**
 * Drop-in workspace sync facade over napi NativeWorkspaceIndex.
 * rq:["../../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 * rq:["../../../../reqlan rq/indexer/indexer.rq".indexer_rust]
 */
import { loadNativeEngine } from './load-native.js';
import type { NativeQuerySurface, NativeSqlDbHandle } from './native-sql-db.js';
import type {
    DocumentUpdate,
    DocumentUpdateIdea,
    FileIndexIssue,
    IndexError,
    IndexEvent,
    IndexState,
    WorkspaceChange,
    WorkspaceFileChange
} from '../core/index-state-types.js';
import type { FileIndexIssueDraft } from '../index-store/index-parse-issues.js';
import type { IndexSyncProgress } from '../index-store/index-status.js';

export interface NativeIndexFileResult {
    fileUri: string;
    diagnostics: string[];
}

/**
 * Raw status snapshot from the native runtime. `fileIssues` / `lastError` carry
 * indexed file URIs; the TS facade maps them to workspace-relative views.
 */
export interface NativeIndexStatusSnapshot {
    state: IndexState;
    ready: boolean;
    ideaCount: number;
    edgeCount: number;
    fileIssueCount: number;
    lastError?: IndexError | null;
    fileIssues: FileIndexIssue[];
    syncProgress?: IndexSyncProgress | null;
    recentDocumentUpdates: DocumentUpdate[];
    recentWorkspaceChanges: WorkspaceFileChange[];
}

/** Extra error context recorded alongside an index failure. */
export interface RecordIndexErrorContext {
    fileUri?: string;
    ideaNames?: string[];
    phase?: string;
    cause?: string;
}

export interface NativeSyncResult {
    processed: number;
    total: number;
    currentFile?: string | null;
    skippedMtime: number;
    indexed: number;
    errors: number;
    cancelled: boolean;
    fileIssues: Array<{ fileUri: string; message: string }>;
}

export interface NativeFuzzySearchHit {
    id: string;
    name: string;
    kind: string;
    fileUri: string;
    summary: string;
    lineStart: number;
    score: number;
}

export interface NativeFuzzySearchResult {
    hits: NativeFuzzySearchHit[];
    total: number;
    truncated: boolean;
}

/**
 * Coverage metrics for the Ideas Summary Overview, computed natively.
 * Shape mirrors the Rust `OverviewCoverageScores` (camelCase serde).
 * rq:["../../../../reqlan rq/extension/module/ideas_summary/webview.rq".overview_coverage_scores]
 */
export interface OverviewCoverageScores {
    ideaCount: number;
    rqFileCount: number;
    eligibleNonRqFileCount: number;
    referencedEligibleFileCount: number;
    /** 0–100; null when there are no eligible non-.rq files. */
    fileCoveragePct: number | null;
    distinctFileReferenceCount: number;
    totalLoc: number;
    /** Ideas per 1000 LOC; null when LOC is 0. */
    ideasPerKLoc: number | null;
    /** True when LOC counting hit size caps (totals are lower bounds). */
    locTruncated: boolean;
    calculatedAt: number;
}

export interface NativeWorkspaceIndexHandle extends NativeQuerySurface {
    ensureReady(): NativeSyncResult;
    syncWorkspace(hardRebuild: boolean): NativeSyncResult;
    cancelSync(): void;
    indexFile(filePathOrUri: string): NativeIndexFileResult;
    deleteDocument(fileUri: string): void;
    shutdown?: () => void;
    clearIdeas(): void;
    ideaCounts(): { ideas: number; edges: number };
    // Index lifecycle FSM + status snapshot (owned by the native runtime).
    statusSnapshot(): NativeIndexStatusSnapshot;
    indexState(): IndexState;
    canDispatchIndex(event: IndexEvent): boolean;
    dispatchIndex(event: IndexEvent): boolean;
    setIndexReady(ideaCount: number, edgeCount: number): void;
    recordIndexError(
        message: string,
        fileUri?: string,
        ideaNames?: string[],
        phase?: string,
        cause?: string
    ): void;
    clearLastError(): void;
    setSyncProgress(progress?: IndexSyncProgress | null): void;
    recordFileIssues(fileUri: string, issues: FileIndexIssueDraft[]): void;
    clearFileIssues(): void;
    clearFileIssuesForFile(fileUri: string): void;
    recordDocumentUpdate(fileUri: string, ideaCount: number, ideas: DocumentUpdateIdea[]): void;
    recordWorkspaceChange(fileUri: string, change: WorkspaceChange): void;
    clearActivity(): void;
    fuzzySearch(
        query: string,
        limit?: number,
        requireQuery?: boolean,
        offset?: number
    ): NativeFuzzySearchResult;
    /** Fill git dates for ideas (all missing when `ideaIds` omitted); returns rows updated. */
    fillGitDates(ideaIds?: string[] | null): number;
    /** Compute Ideas Summary overview coverage over the workspace base. */
    computeOverviewCoverage(): OverviewCoverageScores;
    ideasQuery(sql: string, params?: unknown[]): Record<string, unknown>[];
    ideasExecute(sql: string, params?: unknown[]): number;
    ideasExecuteBatch(sql: string): void;
    ideasLastInsertRowid(): number;
    diagnosticsQuery(sql: string, params?: unknown[]): Record<string, unknown>[];
    diagnosticsExecute(sql: string, params?: unknown[]): number;
    diagnosticsExecuteBatch(sql: string): void;
    diagnosticsLastInsertRowid(): number;
}

interface NativeWorkspaceIndexCtor {
    open(workspaceRoot: string, storagePath?: string): NativeWorkspaceIndexHandle;
}

export class NativeWorkspaceIndex {
    /**
     * Once closed, the underlying Rust handle rejects every call. Diagnostic
     * mutations from a lagging soft-sync task must no-op rather than throw.
     * rq:["../../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
     */
    private closed = false;

    private constructor(private readonly handle: NativeWorkspaceIndexHandle) {}

    static open(workspaceRoot: string, storagePath?: string): NativeWorkspaceIndex {
        const engine = loadNativeEngine() as { NativeWorkspaceIndex: NativeWorkspaceIndexCtor };
        if (!engine.NativeWorkspaceIndex) {
            throw new Error(
                'NativeWorkspaceIndex is missing from the native engine; rebuild reqlan-napi.'
            );
        }
        return new NativeWorkspaceIndex(engine.NativeWorkspaceIndex.open(workspaceRoot, storagePath));
    }

    ensureReady(): NativeSyncResult {
        return this.handle.ensureReady();
    }

    syncWorkspace(hardRebuild = false): NativeSyncResult {
        return this.handle.syncWorkspace(hardRebuild);
    }

    cancelSync(): void {
        this.handle.cancelSync();
    }

    indexFile(filePathOrUri: string): NativeIndexFileResult {
        const result = this.handle.indexFile(filePathOrUri);
        return {
            fileUri: result.fileUri,
            diagnostics: result.diagnostics ?? []
        };
    }

    close(): void {
        this.closed = true;
        const shutdown = this.handle.shutdown;
        if (typeof shutdown === 'function') {
            shutdown.call(this.handle);
        }
    }

    get isClosed(): boolean {
        return this.closed;
    }

    deleteDocument(fileUri: string): void {
        this.handle.deleteDocument(fileUri);
    }

    clearIdeas(): void {
        this.handle.clearIdeas();
    }

    ideaCounts(): { ideas: number; edges: number } {
        return this.handle.ideaCounts();
    }

    // ---- index lifecycle FSM + status snapshot --------------------------------

    statusSnapshot(): NativeIndexStatusSnapshot {
        return this.handle.statusSnapshot();
    }

    indexState(): IndexState {
        return this.handle.indexState();
    }

    canDispatchIndex(event: IndexEvent): boolean {
        if (this.closed) {
            return false;
        }
        return this.handle.canDispatchIndex(event);
    }

    dispatchIndex(event: IndexEvent): boolean {
        if (this.closed) {
            return false;
        }
        return this.handle.dispatchIndex(event);
    }

    setIndexReady(ideaCount: number, edgeCount: number): void {
        if (this.closed) {
            return;
        }
        this.handle.setIndexReady(ideaCount, edgeCount);
    }

    recordIndexError(message: string, context?: RecordIndexErrorContext): void {
        if (this.closed) {
            return;
        }
        this.handle.recordIndexError(
            message,
            context?.fileUri,
            context?.ideaNames,
            context?.phase,
            context?.cause
        );
    }

    clearLastError(): void {
        if (this.closed) {
            return;
        }
        this.handle.clearLastError();
    }

    setSyncProgress(progress?: IndexSyncProgress): void {
        if (this.closed) {
            return;
        }
        this.handle.setSyncProgress(progress ?? null);
    }

    recordFileIssues(fileUri: string, issues: FileIndexIssueDraft[]): void {
        if (this.closed) {
            return;
        }
        this.handle.recordFileIssues(fileUri, issues);
    }

    clearFileIssues(): void {
        if (this.closed) {
            return;
        }
        this.handle.clearFileIssues();
    }

    clearFileIssuesForFile(fileUri: string): void {
        if (this.closed) {
            return;
        }
        this.handle.clearFileIssuesForFile(fileUri);
    }

    recordDocumentUpdate(fileUri: string, ideaCount: number, ideas: DocumentUpdateIdea[] = []): void {
        if (this.closed) {
            return;
        }
        this.handle.recordDocumentUpdate(fileUri, ideaCount, ideas);
    }

    recordWorkspaceChange(fileUri: string, change: WorkspaceChange): void {
        if (this.closed) {
            return;
        }
        this.handle.recordWorkspaceChange(fileUri, change);
    }

    clearActivity(): void {
        if (this.closed) {
            return;
        }
        this.handle.clearActivity();
    }

    fuzzySearch(
        query: string,
        limit?: number,
        requireQuery = false,
        offset?: number
    ): NativeFuzzySearchResult {
        return this.handle.fuzzySearch(query, limit, requireQuery, offset);
    }

    /** Fill git dates for ideas (all missing when `ideaIds` omitted); returns rows updated. */
    fillGitDates(ideaIds?: string[]): number {
        if (this.closed) {
            return 0;
        }
        return this.handle.fillGitDates(ideaIds ?? null);
    }

    /** Compute Ideas Summary overview coverage over the workspace base. */
    computeOverviewCoverage(): OverviewCoverageScores {
        return this.handle.computeOverviewCoverage();
    }

    /** Shared ideas-DB SQL surface; NativeWorkspaceIndex owns the connection. */
    ideasSqlHandle(): NativeSqlDbHandle {
        const { handle } = this;
        return {
            query: (sql, params) => handle.ideasQuery(sql, params),
            execute: (sql, params) => handle.ideasExecute(sql, params),
            executeBatch: sql => handle.ideasExecuteBatch(sql),
            lastInsertRowid: () => handle.ideasLastInsertRowid(),
            close() {
                // Connection lifetime is owned by NativeWorkspaceIndex.
            },
            // Typed webview query surface delegates to the ideas-DB store methods.
            countIdeas: query => handle.countIdeas(query),
            listIdeasPageRows: query => handle.listIdeasPageRows(query),
            listReferenceChipRows: ideaIds => handle.listReferenceChipRows(ideaIds),
            countIdeasets: query => handle.countIdeasets(query),
            listIdeasetsPageRows: query => handle.listIdeasetsPageRows(query),
            listIdeasetMemberRows: (ideasetId, kind, fileUri) =>
                handle.listIdeasetMemberRows(ideasetId, kind, fileUri),
            countReferences: query => handle.countReferences(query),
            listReferencesPageRows: query => handle.listReferencesPageRows(query),
            listTodoIdeaRows: () => handle.listTodoIdeaRows(),
            listIdeasForGraphQuery: (query, limit) => handle.listIdeasForGraphQuery(query, limit),
            listRecentGitIdeaRows: limit => handle.listRecentGitIdeaRows(limit),
            listIdeaIdsMissingGitDates: (limit, fileUri, preferFileUri) =>
                handle.listIdeaIdsMissingGitDates(limit, fileUri, preferFileUri),
            listAttributeIdeaRows: () => handle.listAttributeIdeaRows(),
            // Typed domain read/write surface delegates to the ideas-DB store methods.
            migrateIdeasSchema: () => handle.migrateIdeasSchema(),
            getDocumentHash: fileUri => handle.getDocumentHash(fileUri),
            getDocumentMtimeMs: fileUri => handle.getDocumentMtimeMs(fileUri),
            listDocumentMtimeRows: () => handle.listDocumentMtimeRows(),
            listDocumentUris: () => handle.listDocumentUris(),
            listAllIdeaRows: () => handle.listAllIdeaRows(),
            getIdeaRow: id => handle.getIdeaRow(id),
            getIdeasInFileRows: fileUri => handle.getIdeasInFileRows(fileUri),
            getIdeaAtLineRow: (fileUri, line) => handle.getIdeaAtLineRow(fileUri, line),
            getIdeasetAtLineRow: (fileUri, line) => handle.getIdeasetAtLineRow(fileUri, line),
            listIdeasInFileWithRangeRows: fileUri => handle.listIdeasInFileWithRangeRows(fileUri),
            listIdeasetsInFileWithRangeRows: fileUri =>
                handle.listIdeasetsInFileWithRangeRows(fileUri),
            getIdeasByIdsRows: ids => handle.getIdeasByIdsRows(ids),
            searchIdeaRows: search => handle.searchIdeaRows(search),
            listReferencesForIdea: ideaId => handle.listReferencesForIdea(ideaId),
            countUnresolvedForIdea: ideaId => handle.countUnresolvedForIdea(ideaId),
            countEdgesFromFile: fileUri => handle.countEdgesFromFile(fileUri),
            getEdgesFromRows: sourceId => handle.getEdgesFromRows(sourceId),
            getEdgesToRows: targetId => handle.getEdgesToRows(targetId),
            getEdgesForNodesRows: nodeIds => handle.getEdgesForNodesRows(nodeIds),
            getEdgesReferencingFileRows: filePath => handle.getEdgesReferencingFileRows(filePath),
            getAllEdgeRows: () => handle.getAllEdgeRows(),
            listFileReferenceTargetRows: () => handle.listFileReferenceTargetRows(),
            allIdeaRawRows: () => handle.allIdeaRawRows(),
            counts: () => handle.counts(),
            updateDocumentMtime: (fileUri, mtimeMs) => handle.updateDocumentMtime(fileUri, mtimeMs),
            updateGitDates: (id, createdAt, modifiedAt, changeCount) =>
                handle.updateGitDates(id, createdAt, modifiedAt, changeCount),
            clearAll: () => handle.clearAll(),
            removeDocuments: fileUris => handle.removeDocuments(fileUris),
            upsertDocument: (fileUri, contentHash, ideas, edges, mtimeMs) =>
                handle.upsertDocument(fileUri, contentHash, ideas, edges, mtimeMs)
        };
    }

    /** Shared diagnostics-DB SQL surface; NativeWorkspaceIndex owns the connection. */
    diagnosticsSqlHandle(): NativeSqlDbHandle {
        const { handle } = this;
        return {
            query: (sql, params) => handle.diagnosticsQuery(sql, params),
            execute: (sql, params) => handle.diagnosticsExecute(sql, params),
            executeBatch: sql => handle.diagnosticsExecuteBatch(sql),
            lastInsertRowid: () => handle.diagnosticsLastInsertRowid(),
            close() {
                // Connection lifetime is owned by NativeWorkspaceIndex.
            },
            // The idea-graph query surface does not apply to the diagnostics DB.
            ...unsupportedQuerySurface('diagnostics')
        };
    }
}

/** Idea-graph query surface method names, used to stub the diagnostics connection. */
const IDEA_QUERY_SURFACE_METHODS: (keyof NativeQuerySurface)[] = [
    'countIdeas',
    'listIdeasPageRows',
    'listReferenceChipRows',
    'countIdeasets',
    'listIdeasetsPageRows',
    'listIdeasetMemberRows',
    'countReferences',
    'listReferencesPageRows',
    'listTodoIdeaRows',
    'listIdeasForGraphQuery',
    'listRecentGitIdeaRows',
    'listIdeaIdsMissingGitDates',
    'listAttributeIdeaRows',
    'migrateIdeasSchema',
    'getDocumentHash',
    'getDocumentMtimeMs',
    'listDocumentMtimeRows',
    'listDocumentUris',
    'listAllIdeaRows',
    'getIdeaRow',
    'getIdeasInFileRows',
    'getIdeaAtLineRow',
    'getIdeasetAtLineRow',
    'listIdeasInFileWithRangeRows',
    'listIdeasetsInFileWithRangeRows',
    'getIdeasByIdsRows',
    'searchIdeaRows',
    'listReferencesForIdea',
    'countUnresolvedForIdea',
    'countEdgesFromFile',
    'getEdgesFromRows',
    'getEdgesToRows',
    'getEdgesForNodesRows',
    'getEdgesReferencingFileRows',
    'getAllEdgeRows',
    'listFileReferenceTargetRows',
    'allIdeaRawRows',
    'counts',
    'updateDocumentMtime',
    'updateGitDates',
    'clearAll',
    'removeDocuments',
    'upsertDocument'
];

/** Query-surface stubs for connections that do not host the idea graph (diagnostics DB). */
function unsupportedQuerySurface(context: string): NativeQuerySurface {
    const fail = (): never => {
        throw new Error(`Idea-graph query surface is not available on the ${context} connection.`);
    };
    const surface: Record<string, unknown> = {};
    for (const name of IDEA_QUERY_SURFACE_METHODS) {
        surface[name] = fail;
    }
    return surface as unknown as NativeQuerySurface;
}
