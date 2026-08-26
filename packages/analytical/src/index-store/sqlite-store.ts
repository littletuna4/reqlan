/**
 * SQLite-backed persistence for the workspace idea graph index.
 * Backed by rusqlite via the core native engine (NativeSqlDb).
 */
import { unlink } from 'node:fs/promises';
import { basename } from 'node:path';
import { NativeSqlConnection } from '../native/native-sql-db.js';
import type {
    EdgeKind,
    EdgeRecord,
    IdeaRecord,
    IdeaReferenceChip,
    IdeaSummary,
    IdeaWithRange,
    IdeasetKind,
    IdeasetMemberRow,
    IdeasetTableRow,
    IdeaTableRow,
    ReferenceListRow,
    ReferenceTableRow,
    ReferenceViewType,
    AncestorChainResult,
    TodoIdeaListResult,
    TodoIdeaRow
} from '../core/types.js';
import {
    ACTIVITY_BAR_TODO_LIMIT,
    BLOCKING_STATUSES,
    ideaStatus,
    ideaTags,
    parseAttributes
} from '../core/types.js';
import {
    statusFilterKeyFromAttributes,
    tagsFilterKeysFromAttributes,
    todoNoteFromAttributes
} from '../core/filter-specials.js';
import { resolveReferencedFilePath } from '../core/file-reference-resolve.js';
import type {
    AttributesTableQuery,
    AttributeTableRow,
    IdeasTableQuery,
    IdeasetsTableQuery,
    ReferencesTableQuery
} from './webview-table-queries.js';
import type { GitIdeaTimelineEvent } from './webview-table-queries.js';
import type { GraphViewQuery } from './webview-graph-queries.js';
import {
    aggregateAttributesFromRows,
    attributeValuesForKeys,
    filterAndPageAttributes
} from './webview-table-queries.js';

interface SqliteDatabase {
    conn: NativeSqlConnection;
}

export class SqliteIndexStore {
    private readonly db: SqliteDatabase;

    private constructor(db: SqliteDatabase) {
        this.db = db;
    }

    static async open(dbPath: string): Promise<SqliteIndexStore> {
        const conn = await NativeSqlConnection.open(dbPath);
        return SqliteIndexStore.fromConnection(conn);
    }

    /** Wrap an already-open native connection (e.g. NativeWorkspaceIndex ideas DB). */
    static async fromConnection(conn: NativeSqlConnection): Promise<SqliteIndexStore> {
        const store = new SqliteIndexStore({ conn });
        await store.migrate();
        return store;
    }

    async close(): Promise<void> {
        this.db.conn.close();
    }

    /** Close without extra flush work (file-backed rusqlite already durable). */
    closeWithoutPersist(): void {
        this.db.conn.close();
    }

    static async deleteDatabaseFile(dbPath: string): Promise<void> {
        for (const suffix of ['', '-wal', '-shm']) {
            try {
                await unlink(`${dbPath}${suffix}`);
            } catch (error) {
                if (!isMissingFileError(error)) {
                    throw error;
                }
            }
        }
    }

    async getDocumentHash(fileUri: string): Promise<string | undefined> {
        return this.db.conn.getDocumentHash(fileUri) ?? undefined;
    }

    async getDocumentMtimeMs(fileUri: string): Promise<number | undefined> {
        const value = this.db.conn.getDocumentMtimeMs(fileUri);
        return value == null ? undefined : value;
    }

    async updateDocumentMtime(fileUri: string, mtimeMs: number): Promise<void> {
        this.db.conn.updateDocumentMtime(fileUri, mtimeMs);
    }

    async listDocumentMtimes(): Promise<Map<string, number | undefined>> {
        const rows = this.db.conn.listDocumentMtimeRows() as Array<{
            file_uri: string;
            mtime_ms: number | null;
        }>;
        const result = new Map<string, number | undefined>();
        for (const row of rows) {
            result.set(row.file_uri, row.mtime_ms == null ? undefined : row.mtime_ms);
        }
        return result;
    }

    async listDocumentUris(): Promise<string[]> {
        // rq:["../../../../reqlan rq/core_analysis/search.rq".file_search]
        return this.db.conn.listDocumentUris();
    }

    async upsertDocument(
        fileUri: string,
        contentHash: string,
        ideas: IdeaRecord[],
        edges: EdgeRecord[],
        mtimeMs?: number
    ): Promise<void> {
        // Native transaction preserves analyser-populated git dates across the reindex.
        this.db.conn.upsertDocument(fileUri, contentHash, ideas, edges, mtimeMs);
    }

    async removeDocument(fileUri: string): Promise<void> {
        await this.removeDocuments([fileUri]);
    }

    /** Delete many document rows (and their ideas/edges) in one transaction. */
    async removeDocuments(fileUris: string[]): Promise<void> {
        if (fileUris.length === 0) {
            return;
        }
        this.db.conn.removeDocuments(fileUris);
    }

    async clearAll(): Promise<void> {
        this.db.conn.clearAll();
    }

    async listAllIdeas(): Promise<IdeaSummary[]> {
        const rows = this.db.conn.listAllIdeaRows() as unknown as SummaryRow[];
        const ideas: IdeaSummary[] = [];
        for (let index = 0; index < rows.length; index += 1) {
            if (index > 0 && index % 250 === 0) {
                await new Promise<void>(resolve => setTimeout(resolve, 0));
            }
            ideas.push(this.toSummary(rows[index]!));
        }
        return ideas;
    }

    async getIdea(id: string): Promise<IdeaSummary | undefined> {
        const row = this.db.conn.getIdeaRow(id) as unknown as SummaryRow | null;
        return row ? this.toSummary(row) : undefined;
    }

    async getIdeasInFile(fileUri: string): Promise<IdeaSummary[]> {
        const rows = this.db.conn.getIdeasInFileRows(fileUri) as unknown as SummaryRow[];
        return rows.map(row => this.toSummary(row));
    }

    /**
     * Inbound edges targeting ideas in `fileUri`, plus comment/file refs to that file.
     * rq:["../../../../reqlan rq/indexer/cache-reuse.rq".unify_inbound_indexes]
     */
    async getInboundForFile(fileUri: string): Promise<InboundForFileRow[]> {
        const rows = this.db.conn.getInboundForFileRows(fileUri) as unknown as InboundForFileSqlRow[];
        return rows.map(row => ({
            id: String(row.id),
            sourceId: String(row.source_id),
            targetId: row.target_id != null ? String(row.target_id) : undefined,
            targetFile: row.target_file != null ? String(row.target_file) : undefined,
            kind: String(row.kind),
            label: row.label != null ? String(row.label) : undefined,
            sourceLine: typeof row.source_line === 'number' ? row.source_line : undefined,
            snippet: row.snippet != null ? String(row.snippet) : undefined,
            isResolved: typeof row.is_resolved === 'number'
                ? row.is_resolved !== 0
                : typeof row.is_resolved === 'boolean'
                    ? row.is_resolved
                    : undefined,
            sourceName: row.source_name != null ? String(row.source_name) : undefined,
            sourceFileUri: row.source_file_uri != null ? String(row.source_file_uri) : undefined,
            sourceIdeaLine: typeof row.source_idea_line === 'number' ? row.source_idea_line : undefined,
            targetName: row.target_name != null ? String(row.target_name) : undefined
        }));
    }

    async getIdeaAtLine(fileUri: string, line: number): Promise<IdeaSummary | undefined> {
        const row = this.db.conn.getIdeaAtLineRow(fileUri, line) as unknown as SummaryRow | null;
        return row ? this.toSummary(row) : undefined;
    }

    /** Innermost ideaset whose line range contains `line` (0-based). */
    async getIdeasetAtLine(fileUri: string, line: number): Promise<IdeaSummary | undefined> {
        const row = this.db.conn.getIdeasetAtLineRow(fileUri, line) as unknown as SummaryRow | null;
        return row ? this.toSummary(row) : undefined;
    }

    async listIdeasInFileWithRanges(fileUri: string): Promise<IdeaWithRange[]> {
        const rows = this.db.conn.listIdeasInFileWithRangeRows(
            fileUri
        ) as unknown as SummaryRowWithEnd[];
        return rows.map(row => ({
            ...this.toSummary(row),
            lineEnd: row.line_end
        }));
    }

    async listIdeasetsInFileWithRanges(fileUri: string): Promise<IdeaWithRange[]> {
        const rows = this.db.conn.listIdeasetsInFileWithRangeRows(
            fileUri
        ) as unknown as SummaryRowWithEnd[];
        return rows.map(row => ({
            ...this.toSummary(row),
            lineEnd: row.line_end
        }));
    }

    async listReferencesForIdea(ideaId: string): Promise<ReferenceListRow[]> {
        const { outbound, inbound } = this.db.conn.listReferencesForIdea(ideaId) as unknown as {
            outbound: ReferenceListSqlRow[];
            inbound: ReferenceListSqlRow[];
        };
        const rows: ReferenceListRow[] = [];
        for (const row of outbound) {
            rows.push(toOutboundReferenceListRow(row));
        }
        for (const row of inbound) {
            rows.push(toInboundReferenceListRow(row));
        }
        return rows;
    }

    async listReferencesWithinHopDepth(ideaId: string, hopDepth: number): Promise<ReferenceListRow[]> {
        const depth = Math.max(1, Math.round(hopDepth));
        const edgeIds = new Set<string>();
        const rows: ReferenceListRow[] = [];
        const visited = new Set<string>();
        let frontier = [ideaId];

        for (let level = 0; level < depth && frontier.length > 0; level += 1) {
            const nextFrontier = new Set<string>();
            for (const id of frontier) {
                if (visited.has(id)) {
                    continue;
                }
                visited.add(id);
                for (const row of await this.listReferencesForIdea(id)) {
                    if (!edgeIds.has(row.edgeId)) {
                        edgeIds.add(row.edgeId);
                        rows.push(row);
                    }
                    const neighbor =
                        row.direction === 'inbound' ? row.sourceIdeaId : row.targetIdeaId;
                    if (neighbor && !visited.has(neighbor)) {
                        nextFrontier.add(neighbor);
                    }
                }
            }
            frontier = [...nextFrontier];
        }

        return rows;
    }

    async countUnresolvedForIdea(ideaId: string): Promise<number> {
        return this.db.conn.countUnresolvedForIdea(ideaId);
    }

    async countEdgesFromFile(fileUri: string): Promise<number> {
        return this.db.conn.countEdgesFromFile(fileUri);
    }

    async listAncestorChain(ideaId: string, maxDepth = 8): Promise<IdeaSummary[]> {
        const ancestors: IdeaSummary[] = [];
        const visited = new Set<string>([ideaId]);
        let frontier = [ideaId];

        for (let depth = 0; depth < maxDepth; depth++) {
            const nextFrontier: string[] = [];
            for (const currentId of frontier) {
                for (const edge of await this.getEdgesFrom(currentId)) {
                    if ((edge.kind !== 'references' && edge.kind !== 'wildcard_reference') || !edge.targetId || visited.has(edge.targetId)) {
                        continue;
                    }
                    visited.add(edge.targetId);
                    const idea = await this.getIdea(edge.targetId);
                    if (idea) {
                        ancestors.push(idea);
                        nextFrontier.push(edge.targetId);
                    }
                }
            }
            if (nextFrontier.length === 0) {
                break;
            }
            frontier = nextFrontier;
        }

        return ancestors;
    }

    async buildAncestorChainResult(ideaId: string, maxDepth = 8): Promise<AncestorChainResult> {
        const ancestors = await this.listAncestorChain(ideaId, maxDepth);
        const statusRollup: Record<string, number> = {};
        const blocking: IdeaSummary[] = [];
        for (const ancestor of ancestors) {
            const status = (ancestor.status ?? 'unspecified').toLowerCase();
            statusRollup[status] = (statusRollup[status] ?? 0) + 1;
            if (BLOCKING_STATUSES.has(status)) {
                blocking.push(ancestor);
            }
        }
        return { ideaId, ancestors, statusRollup, blocking };
    }

    async getEdgesFrom(sourceId: string): Promise<EdgeRecord[]> {
        const rows = this.db.conn.getEdgesFromRows(sourceId) as unknown as SqliteEdgeRow[];
        return rows.map(mapEdgeRow);
    }

    async getEdgesTo(targetId: string): Promise<EdgeRecord[]> {
        const rows = this.db.conn.getEdgesToRows(targetId) as unknown as SqliteEdgeRow[];
        return rows.map(mapEdgeRow);
    }

    /** Batched fetch of every edge touching any of the given node ids (source or target). */
    async getEdgesForNodes(nodeIds: readonly string[]): Promise<EdgeRecord[]> {
        if (nodeIds.length === 0) {
            return [];
        }
        const rows = this.db.conn.getEdgesForNodesRows([...nodeIds]) as unknown as SqliteEdgeRow[];
        return rows.map(mapEdgeRow);
    }

    /** Batched fetch of idea summaries by id, preserving no particular order. */
    async getIdeasByIds(ids: readonly string[]): Promise<IdeaSummary[]> {
        if (ids.length === 0) {
            return [];
        }
        const rows = this.db.conn.getIdeasByIdsRows([...ids]) as unknown as SummaryRow[];
        return rows.map(row => this.toSummary(row));
    }

    async getEdgesReferencingFile(filePath: string): Promise<EdgeRecord[]> {
        const rows = this.db.conn.getEdgesReferencingFileRows(
            filePath
        ) as unknown as SqliteEdgeRow[];
        return rows.map(mapEdgeRow);
    }

    async getAllEdges(): Promise<EdgeRecord[]> {
        const rows = this.db.conn.getAllEdgeRows() as unknown as SqliteEdgeRow[];
        return rows.map(mapEdgeRow);
    }

    /** Outbound file_reference targets for coverage metrics (source id + authored path). */
    async listFileReferenceTargets(): Promise<Array<{ sourceId: string; targetFile: string }>> {
        const rows = this.db.conn.listFileReferenceTargetRows() as Array<{
            source_id: string;
            target_file: string;
        }>;
        return rows.map(row => ({
            sourceId: row.source_id,
            targetFile: row.target_file
        }));
    }

    async getAllIdeasRaw(): Promise<IdeaRecord[]> {
        const rows = this.db.conn.allIdeaRawRows() as unknown as SqliteIdeaRow[];
        return rows.map(mapIdeaRow);
    }

    async updateGitDates(
        id: string,
        createdAt?: string,
        modifiedAt?: string,
        changeCount?: number
    ): Promise<void> {
        this.db.conn.updateGitDates(id, createdAt, modifiedAt, changeCount);
    }

    async counts(): Promise<{ ideas: number; edges: number }> {
        return this.db.conn.counts();
    }

    async getAttributeCatalog(): Promise<{ keys: string[]; valuesByKey: Record<string, string[]> }> {
        const ideas = await this.getAllIdeasRaw();
        const keys = new Set<string>();
        const valuesByKey = new Map<string, Set<string>>();
        for (const idea of ideas) {
            const attributes = parseAttributes(idea.attributesJson);
            for (const [key, value] of Object.entries(attributes)) {
                keys.add(key);
                if (!valuesByKey.has(key)) {
                    valuesByKey.set(key, new Set());
                }
                const bucket = valuesByKey.get(key)!;
                if (typeof value === 'string' && value) {
                    bucket.add(value);
                } else if (Array.isArray(value)) {
                    for (const entry of value) {
                        if (entry) {
                            bucket.add(String(entry));
                        }
                    }
                }
            }
        }
        return {
            keys: [...keys].sort((left, right) => left.localeCompare(right)),
            valuesByKey: Object.fromEntries(
                [...valuesByKey.entries()].map(([key, values]) => [key, [...values].sort()])
            )
        };
    }

    async searchByNameOrSummary(query: string): Promise<IdeaSummary[]> {
        const rows = this.db.conn.searchIdeaRows(query) as unknown as SummaryRow[];
        return rows.map(row => this.toSummary(row));
    }

    /**
     * Ideas that carry a `@todo` attribute (bare or valued), not `@status todo`.
     * Caps returned rows; `total` is the uncapped match count for overflow UI.
     */
    async listTodoIdeas(limit: number = ACTIVITY_BAR_TODO_LIMIT): Promise<TodoIdeaListResult> {
        const cappedLimit = Math.max(0, Math.min(Math.floor(limit), 500));
        // Coarse prefilter: `"todo":` matches the attribute key, not `@status todo`.
        const rows = this.db.conn.listTodoIdeaRows() as unknown as SummaryRow[];
        const ideas: TodoIdeaRow[] = [];
        for (const row of rows) {
            const attributes = parseAttributes(row.attributes_json);
            if (!Object.prototype.hasOwnProperty.call(attributes, 'todo')) {
                continue;
            }
            const todoNote = todoNoteFromAttributes(attributes);
            ideas.push({
                id: row.id,
                name: row.name,
                kind: row.kind as TodoIdeaRow['kind'],
                fileUri: row.file_uri,
                lineStart: row.line_start,
                summary: row.summary,
                ...(todoNote !== undefined ? { todoNote } : {})
            });
        }
        return {
            total: ideas.length,
            ideas: ideas.slice(0, cappedLimit)
        };
    }

    async listIdeasForGraphQuery(
        query: GraphViewQuery,
        limit: number
    ): Promise<{ candidates: IdeaSummary[]; totalMatching: number }> {
        const { rows, totalMatching } = this.db.conn.listIdeasForGraphQuery(query, limit);
        return {
            candidates: (rows as unknown as SummaryRow[]).map(row => this.toSummary(row)),
            totalMatching
        };
    }

    async countIdeas(query: IdeasTableQuery = { page: 0, pageSize: 50, attributeColumns: [], referenceFilters: [] }): Promise<number> {
        return this.db.conn.countIdeas(query);
    }

    async listIdeasPage(query: IdeasTableQuery): Promise<IdeaTableRow[]> {
        const rows = this.db.conn.listIdeasPageRows(query) as unknown as IdeaPageRow[];
        const ideaIds = rows.map(row => row.id);
        const referencesByIdea = await this.listReferenceChipsForIdeas(ideaIds);
        return rows.map(row => {
            const references = referencesByIdea.get(row.id) ?? { outbound: [], inbound: [] };
            return toIdeaTableRow(row, query.attributeColumns, references.outbound, references.inbound);
        });
    }

    async listReferenceChipsForIdeas(
        ideaIds: string[]
    ): Promise<Map<string, { outbound: IdeaReferenceChip[]; inbound: IdeaReferenceChip[] }>> {
        const result = new Map<string, { outbound: IdeaReferenceChip[]; inbound: IdeaReferenceChip[] }>();
        if (ideaIds.length === 0) {
            return result;
        }
        const rows = this.db.conn.listReferenceChipRows(ideaIds) as unknown as ReferenceChipRow[];
        for (const ideaId of ideaIds) {
            result.set(ideaId, { outbound: [], inbound: [] });
        }
        for (const row of rows) {
            if (ideaIds.includes(row.source_id)) {
                result.get(row.source_id)!.outbound.push(toOutgoingReferenceChip(row));
            }
            if (row.target_id && ideaIds.includes(row.target_id)) {
                result.get(row.target_id)!.inbound.push(toIncomingReferenceChip(row));
            }
        }
        return result;
    }

    async countIdeasets(query: IdeasetsTableQuery = { page: 0, pageSize: 50 }): Promise<number> {
        return this.db.conn.countIdeasets(query);
    }

    async listIdeasetsPage(query: IdeasetsTableQuery): Promise<IdeasetTableRow[]> {
        const rows = this.db.conn.listIdeasetsPageRows(query) as unknown as IdeasetPageRow[];
        const ideasets = rows.map(row => toIdeasetTableRow(row));
        return Promise.all(ideasets.map(async ideaset => ({
            ...ideaset,
            members: await this.listIdeasetMembers(ideaset.id, ideaset.kind, ideaset.fileUri)
        })));
    }

    async listIdeasetMembers(
        ideasetId: string,
        kind: IdeasetKind,
        fileUri: string
    ): Promise<IdeasetMemberRow[]> {
        const rows = this.db.conn.listIdeasetMemberRows(
            ideasetId,
            kind,
            fileUri
        ) as unknown as IdeasetMemberPageRow[];
        return rows.map(row => ({
            name: row.name,
            fileUri: row.file_uri,
            lineStart: row.line_start
        }));
    }

    async countReferences(query: ReferencesTableQuery = { page: 0, pageSize: 50 }): Promise<number> {
        return this.db.conn.countReferences(query);
    }

    async listReferencesPage(query: ReferencesTableQuery): Promise<ReferenceTableRow[]> {
        const rows = this.db.conn.listReferencesPageRows(query) as unknown as ReferencePageRow[];
        return rows.map(row => toReferenceTableRow(row));
    }

    /**
     * Aggregate attribute keys for the Ideas Summary attributes tab.
     * per ["../../../../reqlan rq/extension/module/ideas_summary/webview.rq".attributes_tab]
     */
    async countAttributes(query: AttributesTableQuery): Promise<number> {
        const { total } = await this.queryAttributesPage(query);
        return total;
    }

    async listAttributesPage(query: AttributesTableQuery): Promise<AttributeTableRow[]> {
        const { rows } = await this.queryAttributesPage(query);
        return rows;
    }

    private async queryAttributesPage(
        query: AttributesTableQuery
    ): Promise<{ total: number; rows: AttributeTableRow[] }> {
        const rows = this.db.conn.listAttributeIdeaRows() as Array<{ id: string; attributes_json: string }>;
        return filterAndPageAttributes(aggregateAttributesFromRows(rows), query);
    }

    /**
     * Idea ids that still need git date / change-count backfill.
     * Missing when both dates are null, or when change count has not been indexed yet.
     * - `fileUri`: only ideas in that file (active-editor priority queue)
     * - `preferFileUri`: list that file's ideas first, then the rest of the backlog
     * rq:["../../../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
     * rq:["../../../../reqlan rq/extension/git-codelens.rq".git_idea_timeline_analysis]
     * rq:["../../../../reqlan rq/extension/features-graph-analysers.rq".git_dates]
     * rq:["../../../../reqlan rq/extension/module/ideas_summary/webview.rq".timeline_page]
     * rq:["../../../../reqlan rq/extension/module/ideas_summary/webview.rq".ideas_list]
     */
    async listIdeaIdsMissingGitDates(
        limit = 40,
        options?: { fileUri?: string; preferFileUri?: string }
    ): Promise<string[]> {
        return this.db.conn.listIdeaIdsMissingGitDates(
            limit,
            options?.fileUri?.trim() || undefined,
            options?.preferFileUri?.trim() || undefined
        );
    }

    /**
     * Recent idea evolution events from indexed git dates for the Timeline tab.
     * Emits separate created / modified entries when both timestamps exist and differ.
     * per ["../../../../reqlan rq/extension/module/ideas_summary/webview.rq".timeline_page]
     */
    async listRecentGitIdeaEvents(limit = 50): Promise<GitIdeaTimelineEvent[]> {
        const rows = this.db.conn.listRecentGitIdeaRows(limit) as Array<{
            id: string;
            name: string;
            kind: string;
            file_uri: string;
            line_start: number;
            summary: string;
            attributes_json: string;
            git_created_at: string | null;
            git_modified_at: string | null;
        }>;

        const events: GitIdeaTimelineEvent[] = [];
        for (const row of rows) {
            const attributes = parseAttributes(row.attributes_json);
            const created = row.git_created_at ?? undefined;
            const modified = row.git_modified_at ?? undefined;
            const base = {
                ideaId: row.id,
                name: row.name,
                fileUri: row.file_uri,
                lineStart: row.line_start,
                summary: row.summary || undefined,
                status: ideaStatus(attributes),
                ideaKind: row.kind,
                tags: ideaTags(attributes),
                gitCreatedAt: created,
                gitModifiedAt: modified
            };

            if (modified && created && modified === created) {
                events.push({ ...base, at: created, kind: 'created' as const });
            } else {
                if (modified) {
                    events.push({ ...base, at: modified, kind: 'modified' as const });
                }
                if (created) {
                    events.push({ ...base, at: created, kind: 'created' as const });
                }
            }
        }

        return events
            .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
            .slice(0, Math.max(1, Math.min(limit, 200)));
    }

    private toSummary(row: SummaryRow): IdeaSummary {
        const attributes = parseAttributes(row.attributes_json);
        return {
            id: row.id,
            name: row.name,
            kind: row.kind as IdeaSummary['kind'],
            fileUri: row.file_uri,
            lineStart: row.line_start,
            summary: row.summary,
            status: ideaStatus(attributes),
            statusKey: statusFilterKeyFromAttributes(attributes),
            tags: ideaTags(attributes),
            tagsKeys: tagsFilterKeysFromAttributes(attributes),
            gitCreatedAt: row.git_created_at ?? undefined,
            gitModifiedAt: row.git_modified_at ?? undefined,
            gitChangeCount: row.git_change_count ?? undefined
        };
    }

    private async migrate(): Promise<void> {
        this.db.conn.migrateIdeasSchema();
    }
}

function isMissingFileError(error: unknown): boolean {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'ENOENT';
}

interface SummaryRow {
    id: string;
    name: string;
    kind: string;
    file_uri: string;
    line_start: number;
    summary: string;
    attributes_json: string;
    git_created_at?: string | null;
    git_modified_at?: string | null;
    git_change_count?: number | null;
}

interface IdeaPageRow {
    id: string;
    name: string;
    kind: string;
    file_uri: string;
    line_start: number;
    summary: string;
    attributes_json: string;
    outbound_count: number;
    inbound_count: number;
    reference_count: number;
    git_created_at: string | null;
    git_modified_at: string | null;
    git_change_count: number | null;
}

interface IdeasetPageRow {
    id: string;
    kind: 'file' | 'explicit';
    file_uri: string;
    line_start: number;
    name: string | null;
    member_count: number;
}

interface IdeasetMemberPageRow {
    name: string;
    file_uri: string;
    line_start: number;
}

interface ReferencePageRow {
    kind: string;
    source_id: string;
    target_id: string | null;
    target_file: string | null;
    label: string | null;
    source_name: string;
    source_uri: string;
    source_line: number;
    target_name: string | null;
    target_uri: string | null;
}

function toIdeaTableRow(
    row: IdeaPageRow,
    attributeColumns: string[],
    outboundReferences: IdeaReferenceChip[],
    inboundReferences: IdeaReferenceChip[]
): IdeaTableRow {
    const attributes = parseAttributes(row.attributes_json);
    const otherAttributeItems = formatOtherAttributeItems(attributes);
    const fanout = row.inbound_count + row.outbound_count;
    const stabilityCue = Math.min(1, Math.max(0, 1 - fanout / 24));
    const stabilityLabel =
        stabilityCue >= 0.75 ? 'Stable' : stabilityCue >= 0.45 ? 'Active' : 'High churn risk';
    return {
        id: row.id,
        title: row.name,
        path: row.file_uri,
        kind: row.kind === 'oneliner' ? 'oneliner' : 'block',
        mainAttribute: row.summary || undefined,
        otherAttributes: otherAttributeItems.join('; '),
        otherAttributeItems,
        attributeValues: attributeValuesForKeys(row.attributes_json, attributeColumns),
        referenceCount: row.reference_count,
        outboundCount: row.outbound_count,
        inboundCount: row.inbound_count,
        outboundReferences,
        inboundReferences,
        fileUri: row.file_uri,
        lineStart: row.line_start,
        gitCreatedAt: row.git_created_at ?? undefined,
        gitModifiedAt: row.git_modified_at ?? undefined,
        gitChangeCount: row.git_change_count ?? undefined,
        stabilityCue,
        stabilityLabel
    };
}

function toIdeasetTableRow(row: IdeasetPageRow): IdeasetTableRow {
    const name = row.kind === 'explicit' && row.name
        ? row.name
        : implicitIdeasetName(row.file_uri);
    return {
        id: row.id,
        name,
        path: row.file_uri,
        kind: row.kind,
        memberCount: row.member_count,
        members: [],
        fileUri: row.file_uri,
        lineStart: row.line_start
    };
}

function implicitIdeasetName(fileUri: string): string {
    const fileName = basename(fileUri);
    return fileName.endsWith('.rq') ? fileName.slice(0, -3) : fileName;
}

function formatOtherAttributeItems(attributes: ReturnType<typeof parseAttributes>): string[] {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(attributes)) {
        let rendered: string | undefined;
        if (typeof value === 'string' && value) {
            rendered = `${key}: ${value}`;
        } else if (Array.isArray(value) && value.length > 0) {
            rendered = `${key}: ${value.join(', ')}`;
        } else if (value === true) {
            rendered = key;
        }
        if (rendered) {
            parts.push(rendered);
        }
    }
    return parts;
}

interface ReferenceChipRow {
    id: string;
    kind: string;
    source_id: string;
    target_id: string | null;
    target_file: string | null;
    label: string | null;
    source_name: string;
    source_uri: string;
    source_line: number;
    target_name: string | null;
    target_uri: string | null;
    target_line: number | null;
}

function toOutgoingReferenceChip(row: ReferenceChipRow): IdeaReferenceChip {
    const targetName = row.target_name ?? row.label ?? row.target_file ?? '—';
    const filterKey = row.target_id
        ? `outbound:idea:${row.target_id}`
        : `outbound:file:${row.target_file ?? row.label ?? ''}`;
    const fileUri = row.target_uri
        ?? (row.target_file
            ? resolveReferencedFilePath(row.target_file, row.source_id)
            : row.source_uri);
    return {
        label: targetName,
        fileUri,
        line: row.target_line ?? row.source_line,
        direction: 'outbound',
        filterKey
    };
}

function toIncomingReferenceChip(row: ReferenceChipRow): IdeaReferenceChip {
    return {
        label: row.source_name,
        fileUri: row.source_uri,
        line: row.source_line,
        direction: 'inbound',
        filterKey: `inbound:idea:${row.source_id}`
    };
}

function toReferenceTableRow(row: ReferencePageRow): ReferenceTableRow {
    const rawTargetPath = row.target_uri ?? row.target_file ?? '';
    const targetPath =
        !row.target_uri && row.target_file
            ? resolveReferencedFilePath(row.target_file, row.source_id)
            : rawTargetPath;
    const targetName = row.target_name ?? row.label ?? row.target_file ?? '—';
    return {
        sourcePath: row.source_uri,
        sourceName: row.source_name,
        targetPath,
        targetName,
        isInRq: row.target_id !== null,
        referenceType: toReferenceViewType(row.kind as EdgeKind),
        sourceFileUri: row.source_uri,
        sourceLineStart: row.source_line,
        targetFileUri: targetPath || undefined
    };
}

function toReferenceViewType(kind: EdgeKind): ReferenceViewType {
    switch (kind) {
        case 'file_reference':
            return 'file';
        case 'comment_link':
            return 'comment';
        default:
            return 'sub-idea';
    }
}

interface SummaryRowWithEnd extends SummaryRow {
    line_end: number;
}
interface ReferenceListSqlRow {
    edge_id: string;
    kind: string;
    source_id: string;
    target_id: string | null;
    target_file: string | null;
    label: string | null;
    source_line: number | null;
    snippet: string | null;
    is_resolved: number | null;
    target_name?: string | null;
    target_uri?: string | null;
    target_line?: number | null;
    source_name?: string | null;
    source_uri?: string | null;
    source_line_idea?: number | null;
}

function toOutboundReferenceListRow(row: ReferenceListSqlRow): ReferenceListRow {
    const targetName = row.target_name ?? row.label ?? row.target_file ?? 'unknown';
    const rawTargetPath = row.target_uri ?? row.target_file ?? '';
    const targetPath =
        !row.target_uri && row.target_file
            ? resolveReferencedFilePath(row.target_file, row.source_id)
            : rawTargetPath;
    return {
        edgeId: row.edge_id,
        direction: 'outbound',
        kind: row.kind as EdgeKind,
        label: row.label ?? targetName,
        targetName,
        targetPath,
        targetLine: row.target_line ?? undefined,
        sourceLine: row.source_line ?? undefined,
        snippet: row.snippet ?? undefined,
        isResolved: row.is_resolved !== 0,
        sourceIdeaId: row.source_id,
        targetIdeaId: row.target_id ?? undefined
    };
}

function toInboundReferenceListRow(row: ReferenceListSqlRow): ReferenceListRow {
    const targetName = row.source_name ?? 'unknown';
    const targetPath = row.source_uri ?? '';
    return {
        edgeId: row.edge_id,
        direction: 'inbound',
        kind: row.kind as EdgeKind,
        label: row.label ?? targetName,
        targetName,
        targetPath,
        targetLine: row.source_line_idea ?? undefined,
        sourceLine: row.source_line ?? undefined,
        snippet: row.snippet ?? undefined,
        isResolved: row.is_resolved !== 0,
        sourceIdeaId: row.source_id,
        targetIdeaId: row.target_id ?? undefined
    };
}

interface SqliteEdgeRow {
    id: string;
    source_id: string;
    target_id: string | null;
    target_file: string | null;
    kind: string;
    label: string | null;
    source_line?: number | null;
    snippet?: string | null;
    is_resolved?: number | null;
}

interface InboundForFileSqlRow {
    id: string;
    source_id: string;
    target_id: string | null;
    target_file: string | null;
    kind: string;
    label: string | null;
    source_line?: number | boolean | null;
    snippet?: string | null;
    is_resolved?: number | boolean | null;
    source_name?: string | null;
    source_file_uri?: string | null;
    source_idea_line?: number | null;
    target_name?: string | null;
}

/** Row from {@link SqliteIndexStore.getInboundForFile}. */
export interface InboundForFileRow {
    id: string;
    sourceId: string;
    targetId?: string;
    targetFile?: string;
    kind: string;
    label?: string;
    sourceLine?: number;
    snippet?: string;
    isResolved?: boolean;
    sourceName?: string;
    sourceFileUri?: string;
    sourceIdeaLine?: number;
    targetName?: string;
}

interface SqliteIdeaRow {
    id: string;
    name: string;
    kind: string;
    file_uri: string;
    line_start: number;
    line_end: number;
    summary: string;
    attributes_json: string;
    content_hash: string;
    git_created_at: string | null;
    git_modified_at: string | null;
    git_change_count?: number | null;
}

function mapEdgeRow(row: SqliteEdgeRow): EdgeRecord {
    return {
        id: row.id,
        sourceId: row.source_id,
        targetId: row.target_id ?? undefined,
        targetFile: row.target_file ?? undefined,
        kind: row.kind as EdgeKind,
        label: row.label ?? undefined,
        sourceLine: row.source_line ?? undefined,
        snippet: row.snippet ?? undefined,
        isResolved: row.is_resolved === undefined || row.is_resolved === null
            ? true
            : row.is_resolved !== 0
    };
}

function mapIdeaRow(row: SqliteIdeaRow): IdeaRecord {
    return {
        id: row.id,
        name: row.name,
        kind: row.kind as IdeaRecord['kind'],
        fileUri: row.file_uri,
        lineStart: row.line_start,
        lineEnd: row.line_end,
        summary: row.summary,
        attributesJson: row.attributes_json,
        contentHash: row.content_hash,
        gitCreatedAt: row.git_created_at ?? undefined,
        gitModifiedAt: row.git_modified_at ?? undefined,
        gitChangeCount: row.git_change_count ?? undefined
    };
}
