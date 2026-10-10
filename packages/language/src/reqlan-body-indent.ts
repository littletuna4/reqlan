/**
 * Relative dedent of block body lines.
 * The base indent is the space/tab prefix of the first body line.
 * A later line keeps only the whitespace after that prefix.
 * Space and tab match the lexer WS terminal.
 * rq:["../../../reqlan rq/language/syntax_whitespace.rq".idea-leading-whitespace]
 */
import {
    LangiumParser,
    LeafCstNodeImpl,
    createParser,
    isCompositeCstNode,
    type AstNode,
    type CstNode,
    type LangiumCoreServices,
    type ParseResult,
    type ParserOptions
} from 'langium';
import {
    isAnonymousBlock,
    isAttribute,
    isBlockLine,
    isBlockValue,
    isBodyLine,
    isIdea,
    isListValue,
    isModel,
    isNamedBlockListItem,
    isNamedList,
    isNestedList,
    isRichTextPart,
    type BlockLine,
    type BodyLine
} from './generated/ast.js';

type IndentedLine = BodyLine | BlockLine;

export function createReqlanLangiumParser(services: LangiumCoreServices): ReqlanLangiumParser {
    const parser = new ReqlanLangiumParser(services);
    createParser(services.Grammar, parser, services.parser.Lexer.definition);
    parser.finalize();
    return parser;
}

export class ReqlanLangiumParser extends LangiumParser {
    override parse<T extends AstNode = AstNode>(input: string, options: ParserOptions = {}): ParseResult<T> {
        const result = super.parse<T>(input, options);
        if (result.value) {
            const tokenType = this.lexer.definition.OTHER;
            if (!tokenType) {
                throw new Error('The OTHER token is missing.');
            }
            applyRelativeBodyIndent(result.value, input, tokenType);
        }
        return result;
    }
}

type IndentToken = ConstructorParameters<typeof LeafCstNodeImpl>[3];

export function applyRelativeBodyIndent(root: AstNode, source: string, tokenType: IndentToken): void {
    walkNode(root, source, tokenType);
}

function walkNode(node: AstNode, source: string, tokenType: IndentToken): void {
    if (isModel(node)) {
        for (const element of node.elements) {
            walkNode(element, source, tokenType);
        }
        return;
    }
    if (isIdea(node) || isAnonymousBlock(node) || isNamedBlockListItem(node)) {
        dedentOwnedLines(node.elements, source, tokenType);
        for (const element of node.elements) {
            walkNode(element, source, tokenType);
        }
        return;
    }
    if (isBlockValue(node)) {
        dedentOwnedLines(node.elements, source, tokenType);
        for (const element of node.elements) {
            walkNode(element, source, tokenType);
        }
        return;
    }
    if (isAttribute(node)) {
        if (node.value) {
            walkNode(node.value, source, tokenType);
        }
        return;
    }
    if (isNamedList(node) || isNestedList(node) || isListValue(node)) {
        for (const item of node.items) {
            walkNode(item, source, tokenType);
        }
    }
}

function dedentOwnedLines(elements: readonly AstNode[], source: string, tokenType: IndentToken): void {
    const lines = elements.filter((element): element is IndentedLine => isBodyLine(element) || isBlockLine(element));
    const baseLine = lines.find(line => ownedLineIndent(source, line) !== undefined);
    if (!baseLine) {
        return;
    }
    const base = ownedLineIndent(source, baseLine);
    if (base === undefined) {
        return;
    }
    for (const line of lines) {
        const indent = ownedLineIndent(source, line);
        if (indent === undefined) {
            continue;
        }
        const extra = extraIndent(base, indent);
        if (extra.length === 0) {
            continue;
        }
        applyExtraIndent(line, extra, source, tokenType);
    }
}

function ownedLineIndent(source: string, line: IndentedLine): string | undefined {
    const offset = line.$cstNode?.offset;
    if (offset === undefined) {
        return undefined;
    }
    const start = lineStart(source, offset);
    let index = start;
    while (index < source.length && isIndentChar(source[index]!)) {
        index++;
    }
    if (index !== offset) {
        return undefined;
    }
    return source.slice(start, offset);
}

function lineStart(source: string, offset: number): number {
    let index = offset;
    while (index > 0) {
        const previous = source[index - 1];
        if (previous === '\n' || previous === '\r') {
            break;
        }
        index--;
    }
    return index;
}

function isIndentChar(char: string): boolean {
    return char === ' ' || char === '\t';
}

function extraIndent(base: string, indent: string): string {
    if (indent.startsWith(base)) {
        return indent.slice(base.length);
    }
    return indent;
}

function applyExtraIndent(line: IndentedLine, extra: string, source: string, tokenType: IndentToken): void {
    const cst = line.$cstNode;
    if (!cst || !isCompositeCstNode(cst)) {
        throw new Error('A body line with extra indent has no composite CST node.');
    }
    const offset = cst.offset;
    if (offset < extra.length || source.slice(offset - extra.length, offset) !== extra) {
        throw new Error('Body indent bytes do not match the source.');
    }
    prependPartText(line, extra, offset);
    const startNode = firstVisible(cst);
    if (!startNode) {
        throw new Error('A body line with extra indent has no CST child.');
    }
    const start = startNode.range.start;
    if (start.character < extra.length) {
        throw new Error('Body indent is wider than the line start.');
    }
    const leaf = new LeafCstNodeImpl(
        offset - extra.length,
        extra.length,
        {
            start: { line: start.line, character: start.character - extra.length },
            end: { line: start.line, character: start.character }
        },
        tokenType,
        false
    );
    leaf.root = cst.root;
    (cst.content as CstNode[]).unshift(leaf);
}

function firstVisible(cst: { content: readonly CstNode[] }): CstNode | undefined {
    for (const child of cst.content) {
        if (!child.hidden) {
            return child;
        }
    }
    return cst.content[0];
}

function prependPartText(line: IndentedLine, extra: string, lineOffset: number): void {
    const part = line.parts[0];
    if (!part || !isRichTextPart(part) || part.$cstNode?.offset !== lineOffset || typeof part.text !== 'string') {
        return;
    }
    part.text = extra + part.text;
}
