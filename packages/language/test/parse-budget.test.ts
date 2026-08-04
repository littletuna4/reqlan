import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { CancellationToken } from 'vscode-languageserver';
import { createReqlanServices } from '../src/reqlan-module.js';
import { ReqlanAsyncParser } from '../src/reqlan-async-parser.js';
import {
    DEFAULT_WORKER_PARSE_THRESHOLD_CHARS,
    isReqlanIncompleteParseResult,
    PARSE_HANG_SENTINEL,
    PARSE_TIMEOUT_WARNING,
    parseTimeoutErrorMessage,
    shouldEscalateToParseWorker,
    type ReqlanParseResult
} from '../src/reqlan-parse-budget.js';

const workerPath = join(dirname(fileURLToPath(import.meta.url)), '../out/reqlan-parse-worker.js');
const missingWorkerPath = join(
    dirname(fileURLToPath(import.meta.url)),
    'fixtures/missing-parse-worker.js'
);

function createParser(
    timeoutMs: number,
    options: { useWorker?: boolean | 'auto'; workerThresholdChars?: number } = {}
): ReqlanAsyncParser {
    const { Reqlan } = createReqlanServices(EmptyFileSystem);
    return new ReqlanAsyncParser(Reqlan, {
        timeoutMs,
        workerPath,
        threadCount: 1,
        useWorker: options.useWorker,
        workerThresholdChars: options.workerThresholdChars
    });
}

describe('Parse budget', () => {
    // rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
    test('times out a hung parse worker with warning and error', async () => {
        const timeoutMs = 400;
        const parser = createParser(timeoutMs);
        const result: ReqlanParseResult = await parser.parse(
            `idea hanging {\n${PARSE_HANG_SENTINEL}\n}`,
            CancellationToken.None
        );

        expect(isReqlanIncompleteParseResult(result)).toBe(true);
        expect(result.reqlanIncomplete?.reason).toBe('timeout');
        expect(result.lexerErrors.some(error => error.message === PARSE_TIMEOUT_WARNING)).toBe(true);
        expect(result.lexerErrors.some(error => error.severity === 'warning')).toBe(true);
        expect(
            result.parserErrors.some(error => error.message === parseTimeoutErrorMessage(timeoutMs))
        ).toBe(true);
    }, 15_000);

    // rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
    test('returns incomplete result when worker parse fails', async () => {
        const { Reqlan } = createReqlanServices(EmptyFileSystem);
        const parser = new ReqlanAsyncParser(Reqlan, {
            timeoutMs: 5_000,
            workerPath: missingWorkerPath,
            threadCount: 1,
            useWorker: true
        });
        const result: ReqlanParseResult = await parser.parse('ok idea {}', CancellationToken.None);

        expect(isReqlanIncompleteParseResult(result)).toBe(true);
        expect(result.reqlanIncomplete?.reason).toBe('failure');
        expect(result.lexerErrors.some(error => error.message === PARSE_TIMEOUT_WARNING)).toBe(true);
        expect(result.parserErrors.some(error => /Lex\/parse aborted for this file/.test(error.message))).toBe(true);
        expect(result.reqlanIncomplete?.cause).toBeTruthy();
    }, 15_000);

    // rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
    test('parses a normal file within budget', async () => {
        const parser = createParser(8_000);
        const result = await parser.parse(
            'budget_ok {\n    a normal idea body\n}',
            CancellationToken.None
        );

        expect(isReqlanIncompleteParseResult(result)).toBe(false);
        expect(result.parserErrors).toHaveLength(0);
        expect(result.value).toBeTruthy();
    }, 15_000);

    // rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
    test('parses small files on the calling thread without a worker', async () => {
        const { Reqlan } = createReqlanServices(EmptyFileSystem);
        const parser = new ReqlanAsyncParser(Reqlan, {
            timeoutMs: 5_000,
            workerPath: missingWorkerPath,
            threadCount: 1,
            useWorker: 'auto'
        });
        const result = await parser.parse(
            'budget_sync {\n    stays on the calling thread\n}',
            CancellationToken.None
        );

        expect(isReqlanIncompleteParseResult(result)).toBe(false);
        expect(result.parserErrors).toHaveLength(0);
        expect(result.value).toBeTruthy();
    });

    // rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
    test('escalates large files to the worker path', async () => {
        expect(shouldEscalateToParseWorker('x'.repeat(DEFAULT_WORKER_PARSE_THRESHOLD_CHARS))).toBe(true);
        expect(shouldEscalateToParseWorker('x'.repeat(DEFAULT_WORKER_PARSE_THRESHOLD_CHARS - 1))).toBe(false);

        const { Reqlan } = createReqlanServices(EmptyFileSystem);
        const parser = new ReqlanAsyncParser(Reqlan, {
            timeoutMs: 5_000,
            workerPath: missingWorkerPath,
            threadCount: 1,
            useWorker: 'auto',
            workerThresholdChars: 32
        });
        const result: ReqlanParseResult = await parser.parse(
            'large_enough_to_force_worker_path {}',
            CancellationToken.None
        );

        expect(isReqlanIncompleteParseResult(result)).toBe(true);
        expect(result.reqlanIncomplete?.reason).toBe('failure');
    }, 15_000);

    // rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
    test('forceWorker escalates a small file', async () => {
        const { Reqlan } = createReqlanServices(EmptyFileSystem);
        const parser = new ReqlanAsyncParser(Reqlan, {
            timeoutMs: 5_000,
            workerPath: missingWorkerPath,
            threadCount: 1,
            useWorker: 'auto'
        });
        const result: ReqlanParseResult = await parser.parse(
            'tiny {}',
            CancellationToken.None,
            { forceWorker: true }
        );

        expect(isReqlanIncompleteParseResult(result)).toBe(true);
        expect(result.reqlanIncomplete?.reason).toBe('failure');
    }, 15_000);
});
