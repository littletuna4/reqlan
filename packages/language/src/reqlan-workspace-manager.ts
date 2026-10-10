import {
    DefaultWorkspaceManager,
    type LangiumDocument,
    type LangiumSharedCoreServices,
    type Stream,
    type URI
} from 'langium';
import type { RqConfig } from './reqlan-path-resolve.js';

/**
 * How many workspace files may parse at the same time during startup.
 * rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".workspace_parse_concurrency]
 */
export const WORKSPACE_PARSE_CONCURRENCY = 8;

let workspaceParseInFlight = 0;
let workspaceParseMaxInFlight = 0;

export function resetWorkspaceParseStats(): void {
    workspaceParseInFlight = 0;
    workspaceParseMaxInFlight = 0;
}

export function workspaceParsePeakInFlight(): number {
    return workspaceParseMaxInFlight;
}

/**
 * Run `task` on each item. At most `limit` tasks are in flight.
 */
export async function forEachWithConcurrency<T>(
    items: readonly T[],
    limit: number,
    task: (item: T) => Promise<void>
): Promise<void> {
    if (items.length === 0 || limit <= 0) {
        return;
    }
    let next = 0;
    const workerCount = Math.min(limit, items.length);

    const runSlot = async (): Promise<void> => {
        for (;;) {
            const index = next;
            if (index >= items.length) {
                return;
            }
            next += 1;
            const item = items[index];
            if (item === undefined) {
                continue;
            }
            await task(item);
        }
    };

    const workers: Promise<void>[] = [];
    for (let slot = 0; slot < workerCount; slot += 1) {
        workers.push(runSlot());
    }
    await Promise.all(workers);
}

/**
 * Loads workspace documents independently so one catastrophic parse failure
 * (for example Chevrotain recovery stack overflow) cannot abort LSP workspace init.
 * Each `getOrCreateDocument` populates that file's Langium AST.
 * This background load must not gate open-file outbound links.
 * At most {@link WORKSPACE_PARSE_CONCURRENCY} files parse at once.
 * rq:["../../../reqlan rq/language/syntax.rq".no_name_idea_safe_warning]
 * rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
 * rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".ast_lifecycle]
 * rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".workspace_parse_concurrency]
 */
export class ReqlanWorkspaceManager extends DefaultWorkspaceManager {
    /**
     * Per-directory cache for resolved `.reqlan/config.json` results.
     * Keyed by directory URI string. `undefined` values mean the directory tree has no `.reqlan/` base.
     * Cleared on workspace reinitialisation so config changes take effect on the next reload.
     */
    readonly rqConfigCache: Map<string, RqConfig | undefined> = new Map();

    constructor(services: LangiumSharedCoreServices) {
        super(services);
    }

    protected override async loadWorkspaceDocuments(
        uris: Stream<URI>,
        collector: (document: LangiumDocument) => void
    ): Promise<void> {
        this.rqConfigCache.clear();
        resetWorkspaceParseStats();
        const pending = uris.toArray();
        await forEachWithConcurrency(pending, WORKSPACE_PARSE_CONCURRENCY, async uri => {
            workspaceParseInFlight += 1;
            if (workspaceParseInFlight > workspaceParseMaxInFlight) {
                workspaceParseMaxInFlight = workspaceParseInFlight;
            }
            try {
                const document = await this.langiumDocuments.getOrCreateDocument(uri);
                collector(document);
            } catch (error) {
                console.error(
                    `[reqlan] Skipping document that failed to load during workspace init: ${uri.toString()}`,
                    error
                );
            } finally {
                workspaceParseInFlight -= 1;
            }
        });
    }
}
