/**
 * rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".wildcard_reference_highlighting]
 * rq:["../../../reqlan rq/extension/syntax/features-syntax.rq".syntax_highlighting]
 * rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { CancellationToken, SemanticTokenTypes } from 'vscode-languageserver';
import { createReqlanServices, type Model } from '@reqlan/language';

describe('semantic tokens for wildcard references', () => {
    let services: ReturnType<typeof createReqlanServices>;
    let parse: ReturnType<typeof parseHelper<Model>>;

    beforeAll(() => {
        services = createReqlanServices(EmptyFileSystem);
        parse = parseHelper(services.Reqlan);
    });

    // rq:["../../../reqlan rq/extension/syntax/features-syntax-highlighting.rq".wildcard_reference_highlighting]
    test('e2e: WildcardReference emits string + variable tokens', async () => {
        const document = await parse([
            'host {',
            '    See ["../mod/**/*.rq".*_pane].',
            '}',
            ''
        ].join('\n'));

        const provider = services.Reqlan.lsp.SemanticTokenProvider!;
        const result = await provider.semanticHighlight(
            document,
            { textDocument: { uri: document.textDocument.uri } },
            CancellationToken.None
        );
        expect(result.data.length).toBeGreaterThan(0);
        expect(result.data.length % 5).toBe(0);

        const tokens: Array<{ line: number; start: number; length: number; type: number }> = [];
        let line = 0;
        let character = 0;
        for (let i = 0; i < result.data.length; i += 5) {
            const deltaLine = result.data[i]!;
            const deltaStart = result.data[i + 1]!;
            line += deltaLine;
            character = deltaLine === 0 ? character + deltaStart : deltaStart;
            tokens.push({
                line,
                start: character,
                length: result.data[i + 2]!,
                type: result.data[i + 3]!
            });
        }

        const text = document.textDocument.getText();
        const pathOffset = text.indexOf('"../mod/**/*.rq"');
        const patternOffset = text.indexOf('*_pane');
        const pathPos = document.textDocument.positionAt(pathOffset);
        const patternPos = document.textDocument.positionAt(patternOffset);

        const pathTok = tokens.find(
            token => token.line === pathPos.line
                && token.start === pathPos.character
                && token.length === '"../mod/**/*.rq"'.length
        );
        const patternTok = tokens.find(
            token => token.line === patternPos.line
                && token.start === patternPos.character
                && token.length === '*_pane'.length
        );
        expect(pathTok).toBeTruthy();
        expect(patternTok).toBeTruthy();
        expect(provider.tokenTypes[SemanticTokenTypes.string]).toBe(pathTok!.type);
        expect(provider.tokenTypes[SemanticTokenTypes.variable]).toBe(patternTok!.type);
    });
});
