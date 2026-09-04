/**
 * Per-file parse/lex budget: if a document cannot finish within the budget,
 * return an empty model plus warning + error diagnostics instead of hanging the host.
 * That empty model is the Langium AST until a later successful parse.
 * rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".ast_lifecycle]
 */
import type { AstNode, LangiumParser, ParseResult } from 'langium';

/** Default wall-clock budget for lex+parse of one file (worker-enforced). */
export const DEFAULT_PARSE_BUDGET_MS = 8_000;

/**
 * Prefer in-process sync parse below this size. Worker threads (killable budget)
 * are reserved for larger inputs, hang-sentinel tests, sticky timeout escalation,
 * or an explicit force.
 */
export const DEFAULT_WORKER_PARSE_THRESHOLD_CHARS = 64_000;

/** Test-only sentinel: a worker that sees this marker hangs until terminated. */
export const PARSE_HANG_SENTINEL = '__REQLAN_PARSE_HANG__';

export const PARSE_TIMEOUT_WARNING =
    'Parse budget exceeded for this file; semantic features may be incomplete until the file is simplified or the budget is raised.';

export function parseTimeoutErrorMessage(timeoutMs: number): string {
    return `Failed to lex/parse this file within ${timeoutMs}ms; left unloaded so the rest of the workspace can continue.`;
}

export function parseFailureErrorMessage(cause: string): string {
    return `Lex/parse aborted for this file (${cause}); left unloaded so the rest of the workspace can continue.`;
}

export type ParseWorkerMode = boolean | 'auto';

export interface ParseWorkerEscalationOptions {
    /** `auto` (default): sync below threshold; worker for large / sentinel / force. */
    useWorker?: ParseWorkerMode;
    forceWorker?: boolean;
    thresholdChars?: number;
}

/** Whether this parse should run in a killable worker thread. */
export function shouldEscalateToParseWorker(
    text: string,
    options: ParseWorkerEscalationOptions = {}
): boolean {
    const mode = options.useWorker ?? 'auto';
    if (mode === false) {
        return false;
    }
    if (mode === true || options.forceWorker) {
        return true;
    }
    if (text.includes(PARSE_HANG_SENTINEL)) {
        return true;
    }
    const threshold = options.thresholdChars ?? DEFAULT_WORKER_PARSE_THRESHOLD_CHARS;
    return text.length >= threshold;
}

/** Lexer error plus optional severity used for budget-timeout warnings. */
export type ReqlanLexerError = ParseResult['lexerErrors'][number] & {
    severity?: 'warning' | 'error' | 'info' | 'hint';
};

export interface ReqlanParseResult<T extends AstNode = AstNode> extends Omit<ParseResult<T>, 'lexerErrors'> {
    lexerErrors: ReqlanLexerError[];
    /** Set when lex/parse did not complete successfully within budget (timeout or crash). */
    reqlanIncomplete?: {
        reason: 'timeout' | 'failure';
        timeoutMs?: number;
        cause?: string;
    };
}

export function isReqlanIncompleteParseResult(
    result: ParseResult
): result is ReqlanParseResult & {
    reqlanIncomplete: NonNullable<ReqlanParseResult['reqlanIncomplete']>
} {
    return 'reqlanIncomplete' in result && result.reqlanIncomplete !== undefined;
}

interface PlaceholderToken {
    image: string;
    startOffset: number;
    endOffset: number;
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
    tokenTypeIdx: number;
    tokenType: { name: string };
}

function placeholderToken(): PlaceholderToken {
    return {
        image: '',
        startOffset: Number.NaN,
        endOffset: Number.NaN,
        startLine: Number.NaN,
        endLine: Number.NaN,
        startColumn: Number.NaN,
        endColumn: Number.NaN,
        tokenTypeIdx: -1,
        tokenType: { name: 'EOF' }
    };
}

function timeoutParserError(message: string) {
    return {
        name: 'ReqlanParseTimeout',
        message,
        token: placeholderToken(),
        resyncedTokens: [],
        context: {
            ruleStack: [],
            ruleOccurrenceStack: []
        }
    };
}

function timeoutLexerWarning(message: string): ReqlanLexerError {
    return {
        offset: 0,
        line: 1,
        column: 1,
        length: 1,
        message,
        severity: 'warning'
    };
}

/**
 * Empty model with a lexer warning and a parser error so the editor shows both severities.
 */
export function createIncompleteParseResult<T extends AstNode>(
    parser: LangiumParser,
    options: {
        reason: 'timeout' | 'failure';
        timeoutMs?: number;
        cause?: string;
    }
): ReqlanParseResult<T> {
    const empty = parser.parse('') as ReqlanParseResult<T>;
    const errorMessage = options.reason === 'timeout'
        ? parseTimeoutErrorMessage(options.timeoutMs ?? DEFAULT_PARSE_BUDGET_MS)
        : parseFailureErrorMessage(options.cause ?? 'unexpected error');
    // Casts: Chevrotain exception shapes are structural; Langium only needs message + token positions.
    empty.parserErrors = [timeoutParserError(errorMessage) as ReqlanParseResult<T>['parserErrors'][number]];
    empty.lexerErrors = [timeoutLexerWarning(PARSE_TIMEOUT_WARNING)];
    empty.reqlanIncomplete = {
        reason: options.reason,
        timeoutMs: options.timeoutMs,
        cause: options.cause
    };
    return empty;
}
