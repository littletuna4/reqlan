/**
 * rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { expandToString as s } from 'langium/generate';
import {
    createReqlanServices,
    findWildcardReferenceAtPosition,
    globToRegExp,
    isBracketReference,
    isIdea,
    isWikiLink,
    isWildcardReference,
    matchWildcardAgainstCatalog,
    resolveWildcardReferenceMatches,
    wildcardArgsFromReference,
    type Model,
    type WildcardMatch
} from '@reqlan/language';
import { ReqlanDocumentLinkProvider } from '../src/reqlan-document-link-provider.js';
import { REQLAN_OPEN_WILDCARD_COMMAND } from '../src/reqlan-wildcard-resolve.js';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtureDir = join(repoDir, 'packages/language/test/fixtures/wildcard-refs');

let services: ReturnType<typeof createReqlanServices>;
let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    services = createReqlanServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Reqlan);
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(join(fixtureDir, 'alpha.rq'), s`
        import_alpha {
            alpha idea
        }
        import_beta {
            beta idea
        }
        other_thing {
            not matched by import_*
        }
    `);
    writeFileSync(join(fixtureDir, 'gamma.rq'), s`
        import_gamma {
            gamma idea
        }
    `);
});

afterEach(async () => {
    const documents = services.shared.workspace.LangiumDocuments.all.toArray();
    if (documents.length > 0) {
        clearDocuments(services.shared, documents);
    }
});

async function parseAt(path: string, text: string): Promise<LangiumDocument<Model>> {
    const uri = URI.parse(pathToFileURL(path).href);
    const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
        text,
        uri
    ) as LangiumDocument<Model>;
    services.shared.workspace.LangiumDocuments.addDocument(doc);
    await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
    return doc;
}

describe('wildcard references', () => {
    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
    test('globToRegExp anchors path and name patterns', () => {
        expect(globToRegExp('import_*', 'name').test('import_alpha')).toBe(true);
        expect(globToRegExp('import_*', 'name').test('other_thing')).toBe(false);
        expect(globToRegExp('./*.rq', 'path').test('./alpha.rq')).toBe(true);
        expect(globToRegExp('**/*.rq', 'path').test('a/b/c.rq')).toBe(true);
    });

    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
    test('parses qualified path + idea pattern as WildcardReference', async () => {
        const document = await parse(s`
            host {
                See ["./fixtures/*.rq".import_*].
            }
        `);
        const ref = AstUtils.streamAst(document.parseResult.value)
            .filter(isBracketReference)
            .find(node => isWildcardReference(node.target));
        expect(ref && isWildcardReference(ref.target)).toBe(true);
        if (!ref || !isWildcardReference(ref.target)) {
            return;
        }
        expect(ref.target.ideaPattern).toBe('import_*');
        expect(ref.target.pathPattern).toContain('*.rq');
    });

    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
    test('exact qualified refs stay QualifiedReference', async () => {
        const document = await parse(s`
            from "./fixtures/alpha.rq" import import_alpha
            host {
                See ["./fixtures/alpha.rq".import_alpha].
            }
        `);
        const ref = AstUtils.streamAst(document.parseResult.value)
            .filter(isBracketReference)
            .toArray()[0];
        expect(ref && isWildcardReference(ref.target)).toBe(false);
    });

    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
    test('resolves matches across fixture files', async () => {
        const alphaUri = URI.parse(pathToFileURL(join(fixtureDir, 'alpha.rq')).href);
        const gammaUri = URI.parse(pathToFileURL(join(fixtureDir, 'gamma.rq')).href);
        const alphaDoc = services.shared.workspace.LangiumDocumentFactory.fromString(
            s`
                import_alpha { a }
                import_beta { b }
                other_thing { o }
            `,
            alphaUri
        ) as LangiumDocument<Model>;
        const gammaDoc = services.shared.workspace.LangiumDocumentFactory.fromString(
            s`
                import_gamma { g }
            `,
            gammaUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(alphaDoc);
        services.shared.workspace.LangiumDocuments.addDocument(gammaDoc);

        const hostPath = join(fixtureDir, 'host.rq');
        const host = await parseAt(hostPath, s`
            host {
                See ["./*.rq".import_*].
            }
        `);
        await services.shared.workspace.DocumentBuilder.build(
            [alphaDoc, gammaDoc, host],
            { validation: true }
        );

        const ref = AstUtils.streamAst(host.parseResult.value)
            .filter(isBracketReference)
            .map(node => node.target)
            .find(isWildcardReference);
        expect(ref).toBeTruthy();
        if (!ref) {
            return;
        }
        const matches = resolveWildcardReferenceMatches(
            ref,
            services.shared.workspace.LangiumDocuments
        );
        expect(matches.map((match: WildcardMatch) => match.ideaName).sort()).toEqual([
            'import_alpha',
            'import_beta',
            'import_gamma'
        ]);
    });

    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
    test('document link targets openWildcardReference command', async () => {
        const hostPath = join(fixtureDir, 'link-host.rq');
        const host = await parseAt(hostPath, s`
            host {
                See ["./*.rq".missing_*].
            }
        `);
        const provider = new ReqlanDocumentLinkProvider(services.Reqlan);
        const links = provider.getDocumentLinks(host, { textDocument: { uri: host.uri.toString() } });
        expect(links.some(link => link.target?.includes(REQLAN_OPEN_WILDCARD_COMMAND))).toBe(true);
    });

    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
    test('warns when wildcard matches nothing', async () => {
        const hostPath = join(fixtureDir, 'empty-host.rq');
        const host = await parseAt(hostPath, s`
            host {
                See ["./*.rq".zzz_*].
            }
        `);
        const diagnostics = host.diagnostics ?? [];
        expect(
            diagnostics.some(diagnostic =>
                String(diagnostic.message).includes('No ideas match wildcard reference')
            )
        ).toBe(true);
    });

    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
    test('matchWildcardAgainstCatalog filters by path and idea', () => {
        const document = {
            uri: URI.file(join(fixtureDir, 'host.rq'))
        } as LangiumDocument;
        const matches = matchWildcardAgainstCatalog(
            './*.rq',
            'import_*',
            document,
            [
                {
                    fileUri: pathToFileURL(join(fixtureDir, 'alpha.rq')).href,
                    filePath: join(fixtureDir, 'alpha.rq').replace(/\\/g, '/'),
                    ideaName: 'import_alpha'
                },
                {
                    fileUri: pathToFileURL(join(fixtureDir, 'alpha.rq')).href,
                    filePath: join(fixtureDir, 'alpha.rq').replace(/\\/g, '/'),
                    ideaName: 'other_thing'
                },
                {
                    fileUri: pathToFileURL(join(fixtureDir, 'elsewhere/no.rq')).href,
                    filePath: join(fixtureDir, 'elsewhere/no.rq').replace(/\\/g, '/'),
                    ideaName: 'import_elsewhere'
                }
            ]
        );
        expect(matches.map((match: WildcardMatch) => match.ideaName)).toEqual(['import_alpha']);
    });

    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
    test('e2e: tokenize → parse → resolve → document link → definition → command args', async () => {
        const alphaUri = URI.parse(pathToFileURL(join(fixtureDir, 'alpha.rq')).href);
        const gammaUri = URI.parse(pathToFileURL(join(fixtureDir, 'gamma.rq')).href);
        const alphaDoc = services.shared.workspace.LangiumDocumentFactory.fromString(
            s`
                import_alpha { a }
                import_beta { b }
                other_thing { o }
            `,
            alphaUri
        ) as LangiumDocument<Model>;
        const gammaDoc = services.shared.workspace.LangiumDocumentFactory.fromString(
            s`
                import_gamma { g }
            `,
            gammaUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(alphaDoc);
        services.shared.workspace.LangiumDocuments.addDocument(gammaDoc);

        // Lexer: ID is prefix of WILDCARD_NAME — longer-alt must keep import_* atomic.
        const tokens = services.Reqlan.parser.Lexer.tokenize('import_*').tokens;
        expect(tokens.map(token => `${token.tokenType.name}:${token.image}`)).toEqual([
            'WILDCARD_NAME:import_*'
        ]);

        const hostPath = join(fixtureDir, 'e2e-host.rq');
        const host = await parseAt(hostPath, s`
            host {
                See ["./*.rq".import_*] and [["./*.rq".import_*|all imports]].
            }
        `);
        await services.shared.workspace.DocumentBuilder.build(
            [alphaDoc, gammaDoc, host],
            { validation: true }
        );

        const wildcards = AstUtils.streamAst(host.parseResult.value)
            .filter(node => isBracketReference(node) || isWikiLink(node))
            .map(node => (isBracketReference(node) || isWikiLink(node) ? node.target : undefined))
            .filter((target): target is NonNullable<typeof target> => !!target && isWildcardReference(target))
            .toArray();
        // Bracket + wikilink both parse as WildcardReference.
        expect(wildcards.length).toBe(2);

        const matches = resolveWildcardReferenceMatches(
            wildcards[0]!,
            services.shared.workspace.LangiumDocuments
        );
        expect(matches.map(match => match.ideaName).sort()).toEqual([
            'import_alpha',
            'import_beta',
            'import_gamma'
        ]);

        const provider = new ReqlanDocumentLinkProvider(services.Reqlan);
        const links = provider.getDocumentLinks(host, { textDocument: { uri: host.uri.toString() } });
        const wildcardLinks = links.filter(link => link.target?.includes(REQLAN_OPEN_WILDCARD_COMMAND));
        expect(wildcardLinks.length).toBeGreaterThanOrEqual(1);
        const commandTarget = wildcardLinks[0]!.target!;
        const encoded = commandTarget.slice(commandTarget.indexOf('?') + 1);
        const args = JSON.parse(decodeURIComponent(encoded)) as Array<{
            pathPattern: string;
            ideaPattern: string;
            fromUri: string;
        }>;
        expect(args[0]?.ideaPattern).toBe('import_*');
        expect(args[0]?.pathPattern).toContain('*.rq');
        expect(args[0]?.fromUri).toContain('e2e-host.rq');

        const offset = host.textDocument.getText().indexOf('import_*');
        const position = host.textDocument.positionAt(offset + 1);
        const definitions = await services.Reqlan.lsp.DefinitionProvider?.getDefinition(host, {
            textDocument: { uri: host.textDocument.uri },
            position
        });
        // Go-to does not dump N LocationLinks; extension middleware opens search instead.
        expect(definitions === undefined || definitions.length === 0).toBe(true);

        const at = findWildcardReferenceAtPosition(host, offset);
        expect(at && isWildcardReference(at)).toBe(true);
        if (!at) {
            return;
        }
        const commandArgs = wildcardArgsFromReference(at);
        expect(commandArgs.ideaPattern).toBe('import_*');
        expect(commandArgs.fromUri).toBe(host.uri.toString());
    });

    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references_webview]
    // rq:["../../../reqlan rq/language/imports.rq".idea_path_filter]
    test('e2e: imports.rq captures wildcard ideas with status and implementation', async () => {
        const { readFileSync } = await import('node:fs');
        const importsPath = join(repoDir, 'reqlan rq/language/imports.rq');
        const text = readFileSync(importsPath, 'utf8');
        const document = await parseAt(importsPath, text);
        expect(document.parseResult.parserErrors).toEqual([]);

        const ideas = AstUtils.streamAst(document.parseResult.value)
            .filter(isIdea)
            .toArray();
        const byName = Object.fromEntries(ideas.map(idea => [idea.name, idea]));
        for (const name of [
            'wildcard_references',
            'wildcard_references_webview',
            'idea_path_filter'
        ] as const) {
            expect(byName[name], name).toBeTruthy();
            const names = (byName[name]!.elements ?? [])
                .filter(el => el.$type === 'Attribute')
                .map(el => (el as { name: string }).name);
            expect(names).toContain('status');
            expect(names).toContain('implementation');
            expect(names).toContain('tests');
        }

        // Examples stay in fences — live wildcards must not appear as AST refs in this requirements file.
        const liveWildcards = AstUtils.streamAst(document.parseResult.value)
            .filter(node => isBracketReference(node) || isWikiLink(node))
            .map(node => (isBracketReference(node) || isWikiLink(node) ? node.target : undefined))
            .filter(target => !!target && isWildcardReference(target))
            .toArray();
        expect(liveWildcards).toEqual([]);
    });

    // rq:["../../../reqlan rq/language/imports.rq".wildcard_references]
    test('e2e: ** path glob matches nested fixture files', async () => {
        const nestedDir = join(fixtureDir, 'nested');
        mkdirSync(nestedDir, { recursive: true });
        const nestedUri = URI.parse(pathToFileURL(join(nestedDir, 'deep.rq')).href);
        const nestedDoc = services.shared.workspace.LangiumDocumentFactory.fromString(
            'deep_import_x { nested }\n',
            nestedUri
        ) as LangiumDocument<Model>;
        services.shared.workspace.LangiumDocuments.addDocument(nestedDoc);

        const hostPath = join(fixtureDir, 'e2e-nested-host.rq');
        const host = await parseAt(hostPath, s`
            host {
                See ["./**/*.rq".deep_*].
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([nestedDoc, host], { validation: true });

        const ref = AstUtils.streamAst(host.parseResult.value)
            .filter(isBracketReference)
            .map(node => node.target)
            .find(isWildcardReference);
        expect(ref).toBeTruthy();
        if (!ref) {
            return;
        }
        const matches = resolveWildcardReferenceMatches(
            ref,
            services.shared.workspace.LangiumDocuments
        );
        expect(matches.some(match => match.ideaName === 'deep_import_x')).toBe(true);
    });
});
