/** Lightweight reqlan tokenizer for webview code samples (adapted from site/src/lib/rq-highlight.ts). */

export type RqTokenType =
    | 'comment'
    | 'keyword'
    | 'string'
    | 'attribute'
    | 'ref'
    | 'file-ref'
    | 'idea'
    | 'body'
    | 'brace'
    | 'punctuation'
    | 'diagram'
    | 'plain'
    | 'url';

export interface RqToken {
    type: RqTokenType;
    text: string;
}

const IDEA_NAME = /^(?:"(?:[^"\\]|\\.)*"|[A-Za-z_]\w*)/;
const URL_IN_TEXT = /https?:\/\/[^\s)\]}>'"]+/g;

export function tokenizeRq(code: string): RqToken[] {
    const lines = code.split('\n');
    const tokens: RqToken[] = [];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        if (lineIndex > 0) {
            tokens.push({ type: 'plain', text: '\n' });
        }
        tokens.push(...tokenizeLine(lines[lineIndex]));
    }

    return splitUrlTokens(tokens);
}

/** Split body/plain tokens so http(s) URLs become dedicated clickable tokens. */
function splitUrlTokens(tokens: RqToken[]): RqToken[] {
    const out: RqToken[] = [];
    for (const token of tokens) {
        if (token.type !== 'body' && token.type !== 'plain') {
            out.push(token);
            continue;
        }
        URL_IN_TEXT.lastIndex = 0;
        let last = 0;
        let match: RegExpExecArray | null;
        while ((match = URL_IN_TEXT.exec(token.text)) !== null) {
            if (match.index > last) {
                out.push({ type: token.type, text: token.text.slice(last, match.index) });
            }
            out.push({ type: 'url', text: match[0] });
            last = match.index + match[0].length;
        }
        if (last < token.text.length) {
            out.push({ type: token.type, text: token.text.slice(last) });
        } else if (last === 0) {
            out.push(token);
        }
    }
    return out;
}

function tokenizeLine(line: string): RqToken[] {
    const indent = line.match(/^\s*/)?.[0] ?? '';
    const content = line.slice(indent.length);
    const tokens: RqToken[] = [];

    if (indent) {
        tokens.push({ type: 'plain', text: indent });
    }

    if (!content) {
        return tokens;
    }

    if (content.startsWith('#') || content.startsWith('//')) {
        tokens.push({ type: 'comment', text: content });
        return tokens;
    }

    tokens.push(
        ...scanInline(content, {
            atLineStart: true,
            inBlock: indent.length > 0,
            inList: false,
            importLine: false,
        }),
    );

    return tokens;
}

type ScanContext = {
    atLineStart: boolean;
    inBlock: boolean;
    inList: boolean;
    /** Top-level line began with `from` / `import` — enables mid-line `import` / `as`. */
    importLine: boolean;
};

function scanInline(text: string, context: ScanContext): RqToken[] {
    const tokens: RqToken[] = [];
    let index = 0;
    let ctx = context;

    while (index < text.length) {
        const remaining = text.slice(index);

        const whitespace = remaining.match(/^\s+/);
        if (whitespace) {
            tokens.push({ type: 'plain', text: whitespace[0] });
            index += whitespace[0].length;
            ctx = { ...ctx, atLineStart: false };
            continue;
        }

        const next = scanToken(remaining, ctx);
        if (!next) {
            tokens.push({
                type: ctx.inBlock ? 'body' : 'plain',
                text: remaining[0],
            });
            index += 1;
            ctx = { ...ctx, atLineStart: false };
            continue;
        }

        tokens.push(next.token);
        index += next.length;

        if (
            next.token.type === 'keyword' &&
            (next.token.text === 'from' || next.token.text === 'import')
        ) {
            ctx = { ...ctx, importLine: true, atLineStart: false };
            continue;
        }

        if (next.token.text === '(') {
            ctx = { ...ctx, inList: true, atLineStart: false };
            continue;
        }

        if (next.token.text === ')') {
            ctx = { ...ctx, inList: false, atLineStart: false };
            continue;
        }

        ctx = { ...ctx, atLineStart: false };
    }

    return tokens;
}

function scanToken(
    text: string,
    context: ScanContext,
): { token: RqToken; length: number } | null {
    const patterns: Array<{
        match: RegExp;
        build: (value: string) => RqToken;
        when?: (context: ScanContext) => boolean;
    }> = [
        {
            match: /^https?:\/\/[^\s)\]}>'"]+/,
            build: (value) => ({ type: 'url', text: value }),
        },
        {
            match: /^(?:→|──►|└──►)/,
            build: (value) => ({ type: 'diagram', text: value }),
        },
        {
            match: /^\["[^"]+"(?:\.[A-Za-z_][\w.]*)?\]/,
            build: (value) => ({ type: 'file-ref', text: value }),
        },
        {
            match: /^\[(?!"[^"]+")[^\]]+\]/,
            build: (value) => ({ type: 'ref', text: value }),
        },
        {
            // Attributes only at line start; mid-line `@foo` is prose.
            match: /^@\w+/,
            when: (ctx) => ctx.atLineStart,
            build: (value) => ({ type: 'attribute', text: value }),
        },
        {
            // `from` / leading `import` only at top-level line start.
            match: /^(from|import)\b/,
            when: (ctx) => ctx.atLineStart && !ctx.inBlock,
            build: (value) => ({ type: 'keyword', text: value }),
        },
        {
            // Mid-line `import` / `as` only on an import statement line.
            match: /^(import|as)\b/,
            when: (ctx) => ctx.importLine && !ctx.inBlock,
            build: (value) => ({ type: 'keyword', text: value }),
        },
        {
            match: /^"(?:[^"\\]|\\.)*"/,
            build: (value) => ({ type: 'string', text: value }),
        },
        {
            match: /^[{}()]/,
            build: (value) => ({ type: 'brace', text: value }),
        },
        {
            match: /^[:,]/,
            build: (value) => ({ type: 'punctuation', text: value }),
        },
        {
            match: IDEA_NAME,
            build: (value) => ideaToken(value, text, context),
        },
        {
            match: /^[A-Za-z_][\w.]*/,
            build: (value) => {
                if (context.inList) {
                    return { type: 'idea', text: value };
                }
                return { type: context.inBlock ? 'body' : 'plain', text: value };
            },
        },
        {
            match: /^[^\s\w"@\[{}\],:→─└]+/,
            build: (value) => ({
                type: context.inBlock ? 'body' : 'plain',
                text: value,
            }),
        },
    ];

    for (const pattern of patterns) {
        if (pattern.when && !pattern.when(context)) {
            continue;
        }
        const match = text.match(pattern.match);
        if (match) {
            return {
                token: pattern.build(match[0]),
                length: match[0].length,
            };
        }
    }

    return null;
}

function ideaToken(value: string, text: string, context: ScanContext): RqToken {
    if (context.inList) {
        return { type: 'idea', text: value };
    }

    if (!context.atLineStart) {
        return { type: context.inBlock ? 'body' : 'plain', text: value };
    }

    const after = text.slice(value.length);

    if (/^\s*\{/.test(after) || /^\s+\(/.test(after)) {
        return { type: 'idea', text: value };
    }

    if (context.inBlock) {
        return { type: 'body', text: value };
    }

    if (/^\s+\S/.test(after) && !/^\s+@/.test(after)) {
        return { type: 'idea', text: value };
    }

    return { type: 'idea', text: value };
}

export function renderRqTemplate(
    template: string,
    values: Record<string, string>,
): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
        const value = values[key];
        if (value === undefined) {
            throw new Error(`Missing template value for {{${key}}}`);
        }
        return value;
    });
}
