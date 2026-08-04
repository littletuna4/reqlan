/**
 * Document factory that never lets a sync lex/parse throw escape into workspace init.
 * Async path uses [ReqlanAsyncParser]: sync fast path by default, killable worker when escalated.
 * rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
 */
import {
    DefaultLangiumDocumentFactory,
    type AstNode,
    type LangiumDocument,
    type LangiumSharedCoreServices,
    type ParseResult,
    type ParserOptions,
    URI
} from 'langium';
import type { CancellationToken } from 'vscode-languageserver';
import { CancellationToken as CancelToken } from 'vscode-languageserver';
import { ReqlanAsyncParser } from './reqlan-async-parser.js';
import {
    createIncompleteParseResult,
    type ReqlanParseResult
} from './reqlan-parse-budget.js';

export class ReqlanLangiumDocumentFactory extends DefaultLangiumDocumentFactory {
    /** URIs that previously hit the parse budget — keep using a killable worker. */
    private readonly workerEscalateUris = new Set<string>();

    constructor(services: LangiumSharedCoreServices) {
        super(services);
    }

    protected override parse<T extends AstNode>(
        uri: URI,
        text: string,
        options?: ParserOptions
    ): ParseResult<T> {
        const services = this.serviceRegistry.getServices(uri);
        try {
            return services.parser.LangiumParser.parse(text, options);
        } catch (error) {
            return createIncompleteParseResult<T>(services.parser.LangiumParser, {
                reason: 'failure',
                cause: error instanceof Error ? error.message : String(error)
            });
        }
    }

    protected override async parseAsync<T extends AstNode>(
        uri: URI,
        text: string,
        cancellationToken: CancellationToken = CancelToken.None
    ): Promise<ParseResult<T>> {
        const services = this.serviceRegistry.getServices(uri);
        const asyncParser = services.parser.AsyncParser;
        const uriKey = uri.toString();
        const forceWorker = this.workerEscalateUris.has(uriKey);

        const result = asyncParser instanceof ReqlanAsyncParser
            ? await asyncParser.parse<T>(text, cancellationToken, { forceWorker })
            : await asyncParser.parse<T>(text, cancellationToken);

        const reqlanResult = result as ReqlanParseResult<T>;
        if (reqlanResult.reqlanIncomplete?.reason === 'timeout') {
            this.workerEscalateUris.add(uriKey);
        } else if (!reqlanResult.reqlanIncomplete) {
            this.workerEscalateUris.delete(uriKey);
        }

        return result;
    }

    /** Test helper: expose incomplete marker after async parse. */
    static isIncompleteDocument(document: LangiumDocument): boolean {
        return Boolean((document.parseResult as ReqlanParseResult).reqlanIncomplete);
    }
}
