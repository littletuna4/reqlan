/**
 * Parse one `.rq` file and upsert ideas/edges into the index store.
 *
 * rq:["../../../reqlan rq/indexer/indexer.rq".index]
 * rq:["../../../reqlan rq/indexer/indexer.rq".nonblocking_index]
 * rq:["../../../reqlan rq/extension/features-graph-analysers.rq".indexing_incrementality]
 * rq:["../../../reqlan rq/extension/features-index-diagnostics.rq".index_diagnostics_metrics]
 */
import type { LangiumDocument } from 'langium';
import { stat } from 'node:fs/promises';
import type { AnalyticalStore } from '../core/analytical-store.js';
import { normalizeIndexedDocument } from '../core/workspace-paths.js';
import type { IndexFileOutcome } from './index-diagnostics-store.js';
import { pathDepthFromUri } from './index-diagnostics-store.js';
import { extractIndexedDocument } from './idea-extractor.js';
import { collectParseIssues, fileIssue, fileIssueFromError, unnamedIdeaIssues, validIdeas } from './index-parse-issues.js';
import type { SqliteIndexStore } from './sqlite-store.js';

export interface IndexOneFileDeps {
    sqlite: SqliteIndexStore;
    analytical: AnalyticalStore;
    workspaceRoot: string;
    toIndexedUri: (filePath: string) => string;
    parseDocument: (filePath: string) => Promise<LangiumDocument>;
    notifyCatalogUpdated: () => void;
}

export interface IndexOneFileResult {
    fileUri: string;
    durationMs: number;
    outcome: IndexFileOutcome;
    pathDepth: number;
}

export async function indexOneFile(deps: IndexOneFileDeps, filePath: string): Promise<IndexOneFileResult> {
    const started = performance.now();
    const fileUri = deps.toIndexedUri(filePath);
    const pathDepth = pathDepthFromUri(fileUri);
    const analytical = deps.analytical.getState();

    const finish = (outcome: IndexFileOutcome): IndexOneFileResult => ({
        fileUri,
        durationMs: performance.now() - started,
        outcome,
        pathDepth
    });

    let fileMtimeMs: number | undefined;
    try {
        fileMtimeMs = Math.trunc((await stat(filePath)).mtimeMs);
    } catch {
        fileMtimeMs = undefined;
    }

    let document: LangiumDocument;
    try {
        document = await deps.parseDocument(filePath);
    } catch (error) {
        analytical.recordFileIndexIssues(fileUri, [
            fileIssueFromError('parse', error, 'Could not read or build document')
        ]);
        return finish('error');
    }

    const parseIssues = collectParseIssues(document);
    const extractedRaw = extractIndexedDocument(document);
    if (!extractedRaw) {
        const issues = parseIssues.length > 0
            ? parseIssues
            : [fileIssue('No reqlan model found in file', 'extract')];
        analytical.recordFileIndexIssues(fileUri, issues);
        return finish('error');
    }

    const extracted = deps.workspaceRoot
        ? normalizeIndexedDocument(extractedRaw, deps.workspaceRoot)
        : extractedRaw;
    const ideaNames = extracted.ideas.map(idea => idea.name).filter(Boolean);

    const existingHash = await deps.sqlite.getDocumentHash(fileUri);
    const indexingIssues = [...parseIssues, ...unnamedIdeaIssues(extracted.ideas)];
    const ideasToPersist = validIdeas(extracted.ideas);

    if (existingHash === extracted.contentHash && indexingIssues.length === 0) {
        const storedEdges = await deps.sqlite.countEdgesFromFile(fileUri);
        if (storedEdges >= extracted.edges.length) {
            // Refresh stored mtime even when content is unchanged so soft sync can skip next time.
            if (fileMtimeMs !== undefined) {
                await deps.sqlite.updateDocumentMtime(fileUri, fileMtimeMs);
            }
            analytical.clearFileIndexIssuesForFile(fileUri);
            return finish('mtime_refresh');
        }
    }

    for (const idea of ideasToPersist) {
        idea.contentHash = extracted.contentHash;
    }

    let persistFailed = false;
    if (ideasToPersist.length > 0) {
        try {
            await deps.sqlite.upsertDocument(
                fileUri,
                extracted.contentHash,
                ideasToPersist,
                extracted.edges,
                fileMtimeMs
            );
        } catch (error) {
            persistFailed = true;
            indexingIssues.push(
                fileIssueFromError(
                    'persist',
                    error,
                    'Failed to persist ideas to index',
                    0,
                    0,
                    ideaNames
                )
            );
        }
    } else if (existingHash !== undefined) {
        // File no longer hosts ideas (e.g. after delete/move) — clear stale rows.
        await deps.sqlite.removeDocument(fileUri);
    }

    if (indexingIssues.length > 0) {
        analytical.recordFileIndexIssues(fileUri, indexingIssues);
        if (ideasToPersist.length === 0 || persistFailed) {
            deps.notifyCatalogUpdated();
            return finish('error');
        }
    } else {
        analytical.clearFileIndexIssuesForFile(fileUri);
    }

    analytical.recordDocumentUpdate(
        fileUri,
        ideasToPersist.length,
        ideasToPersist
            .filter(idea => idea.kind !== 'ideaset')
            .map(idea => ({
                id: idea.id,
                name: idea.name,
                lineStart: idea.lineStart
            }))
    );
    deps.notifyCatalogUpdated();
    return finish('persisted');
}
