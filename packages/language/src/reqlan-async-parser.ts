/**
 * Per-file parse budget via Langium's worker-thread async parser.
 * Happy path is in-process sync parse; workers enforce a killable wall-clock budget
 * for large files, sticky timeout escalation, or explicit force.
 * rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    type AstNode,
    type LangiumCoreServices,
    type LangiumParser
} from 'langium';
import { WorkerThreadAsyncParser } from 'langium/node';
import {
    CancellationToken,
    CancellationTokenSource
} from 'vscode-languageserver';
import {
    createIncompleteParseResult,
    DEFAULT_PARSE_BUDGET_MS,
    DEFAULT_WORKER_PARSE_THRESHOLD_CHARS,
    type ParseWorkerMode,
    type ReqlanParseResult,
    shouldEscalateToParseWorker
} from './reqlan-parse-budget.js';

export interface ReqlanAsyncParserOptions {
    timeoutMs?: number;
    /** Override worker script path (tests). */
    workerPath?: string;
    /**
     * `auto` (default): sync below size threshold; worker when escalated.
     * `true` / `false`: always / never use workers.
     */
    useWorker?: ParseWorkerMode;
    /** Characters at or above which `auto` mode uses a worker. */
    workerThresholdChars?: number;
    /** Worker pool size (Langium default is 8; keep small for startup). */
    threadCount?: number;
}

export interface ReqlanParseCallOptions {
    /** Force the killable worker path for this call (sticky URI escalate, tests). */
    forceWorker?: boolean;
}

/**
 * Directory of this module (or of the CJS bundle that inlined it).
 * Avoid static `import.meta.url`: esbuild format cjs + target es2017 empties it
 * (see reqlan rq/extension/startup-performance.rq invalid_url_activation_failure).
 */
declare const __dirname: string | undefined;

function moduleDirectory(): string {
    if (typeof __dirname === 'string') {
        return __dirname;
    }
    // Native ESM only — hide from esbuild's empty-import-meta rewrite.
    const metaUrl = (0, eval)('import.meta.url') as string;
    return dirname(fileURLToPath(metaUrl));
}

export function resolveParseWorkerPath(explicit?: string): string {
    if (explicit) {
        return explicit;
    }
    const dir = moduleDirectory();
    const jsPath = join(dir, 'reqlan-parse-worker.js');
    if (existsSync(jsPath)) {
        return jsPath;
    }
    const cjsPath = join(dir, 'reqlan-parse-worker.cjs');
    if (existsSync(cjsPath)) {
        return cjsPath;
    }
    return jsPath;
}

export class ReqlanAsyncParser extends WorkerThreadAsyncParser {
    private readonly timeoutMs: number;
    private readonly useWorker: ParseWorkerMode;
    private readonly workerThresholdChars: number;
    private readonly syncParser: LangiumParser;

    constructor(services: LangiumCoreServices, options: ReqlanAsyncParserOptions = {}) {
        super(services, () => resolveParseWorkerPath(options.workerPath));
        this.syncParser = services.parser.LangiumParser;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_PARSE_BUDGET_MS;
        this.useWorker = options.useWorker ?? 'auto';
        this.workerThresholdChars = options.workerThresholdChars ?? DEFAULT_WORKER_PARSE_THRESHOLD_CHARS;
        this.threadCount = options.threadCount ?? 2;
        // Fail fast after cancel so the budget is close to timeoutMs wall-clock.
        this.terminationDelay = 50;
    }

    override async parse<T extends AstNode>(
        text: string,
        cancelToken: CancellationToken,
        callOptions: ReqlanParseCallOptions = {}
    ): Promise<ReqlanParseResult<T>> {
        if (cancelToken.isCancellationRequested) {
            return createIncompleteParseResult<T>(this.syncParser, {
                reason: 'failure',
                cause: 'cancelled'
            });
        }

        const escalate = shouldEscalateToParseWorker(text, {
            useWorker: this.useWorker,
            forceWorker: callOptions.forceWorker,
            thresholdChars: this.workerThresholdChars
        });
        if (!escalate) {
            return this.parseOnThread<T>(text);
        }

        return this.parseInWorker<T>(text, cancelToken);
    }

    /** Sync entry used by document factory / tests. */
    parseSync<T extends AstNode>(text: string): ReqlanParseResult<T> {
        return this.parseOnThread<T>(text);
    }

    private async parseInWorker<T extends AstNode>(
        text: string,
        cancelToken: CancellationToken
    ): Promise<ReqlanParseResult<T>> {
        const timeoutSource = new CancellationTokenSource();
        const timer = setTimeout(() => timeoutSource.cancel(), this.timeoutMs);
        const callerCancel = cancelToken.onCancellationRequested(() => {
            timeoutSource.cancel();
        });

        try {
            return await super.parse<T>(text, timeoutSource.token) as ReqlanParseResult<T>;
        } catch (error) {
            if (timeoutSource.token.isCancellationRequested) {
                if (cancelToken.isCancellationRequested) {
                    return createIncompleteParseResult<T>(this.syncParser, {
                        reason: 'failure',
                        cause: 'cancelled'
                    });
                }
                return createIncompleteParseResult<T>(this.syncParser, {
                    reason: 'timeout',
                    timeoutMs: this.timeoutMs
                });
            }
            return createIncompleteParseResult<T>(this.syncParser, {
                reason: 'failure',
                cause: error instanceof Error ? error.message : String(error)
            });
        } finally {
            clearTimeout(timer);
            callerCancel.dispose();
            timeoutSource.dispose();
        }
    }

    private parseOnThread<T extends AstNode>(text: string): ReqlanParseResult<T> {
        try {
            return this.syncParser.parse(text) as ReqlanParseResult<T>;
        } catch (error) {
            return createIncompleteParseResult<T>(this.syncParser, {
                reason: 'failure',
                cause: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /** Exposed for tests that need the underlying sync parser. */
    get langiumParser(): LangiumParser {
        return this.syncParser;
    }
}
