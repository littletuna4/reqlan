/**
 * Langium worker-thread parse entry: sync lex/parse, dehydrate, postMessage.
 * The parent enforces the wall-clock budget via worker.terminate().
 * rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
 */
import { parentPort } from 'node:worker_threads';
import { EmptyFileSystem } from 'langium';
import { createReqlanServices } from './reqlan-module.js';
import { PARSE_HANG_SENTINEL } from './reqlan-parse-budget.js';

if (!parentPort) {
    throw new Error('reqlan-parse-worker must run as a worker thread');
}

const { Reqlan } = createReqlanServices(EmptyFileSystem);
const parser = Reqlan.parser.LangiumParser;
const hydrator = Reqlan.serializer.Hydrator;

parentPort.on('message', (text: unknown) => {
    const input = typeof text === 'string' ? text : '';
    if (input.includes(PARSE_HANG_SENTINEL)) {
        // Intentional hang for tests — parent terminates on budget expiry.
        for (;;) {
            /* spin */
        }
    }
    try {
        const result = parser.parse(input);
        parentPort!.postMessage(hydrator.dehydrate(result));
    } catch (error) {
        // Surface as worker 'error' so ParserWorker rejects instead of hydrating garbage.
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`reqlan parse worker failed: ${message}`);
    }
});
