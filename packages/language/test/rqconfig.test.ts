import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { URI } from 'langium';
import { VirtualFileSystemProvider } from 'langium/test';
import {
    createSourceTextDocument,
    DEFAULT_IMPORT_ROOT_ALIAS,
    defaultRqConfig,
    loadApplyingRqConfig,
    matchImportRootMapping,
    resolveDocumentPathUri,
    resolveRqConfig
} from 'reqlan-language';

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function insertConfig(
    fs: VirtualFileSystemProvider,
    uri: string,
    body: unknown
): void {
    fs.insert(uri, typeof body === 'string' ? body : JSON.stringify(body));
}

describe('rqconfig schema file', () => {
    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_schema_file]
    test('schema file documents importRoots mappings', () => {
        const schemaPath = join(repoDir, 'packages/extension/schemas/rqconfig.schema.json');
        const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as {
            properties?: {
                importRoots?: {
                    items?: {
                        required?: string[];
                        properties?: Record<string, unknown>;
                    };
                };
            };
        };
        expect(schema.properties?.importRoots?.items?.required).toEqual(['alias']);
        expect(schema.properties?.importRoots?.items?.properties).toHaveProperty('alias');
        expect(schema.properties?.importRoots?.items?.properties).toHaveProperty('root');

        const packageJson = JSON.parse(
            readFileSync(join(repoDir, 'packages/extension/package.json'), 'utf8')
        ) as { contributes?: { jsonValidation?: Array<{ fileMatch?: string[]; url?: string }> } };
        const validation = packageJson.contributes?.jsonValidation?.find(entry =>
            entry.fileMatch?.includes('.rqconfig.json')
        );
        expect(validation?.url).toBe('./schemas/rqconfig.schema.json');
    });
});

describe('rqconfig location', () => {
    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_location]
    test('returns undefined when no rqconfig exists', () => {
        const fs = new VirtualFileSystemProvider();
        fs.insert('file:///workspace/pkg/a.rq', 'idea body');
        expect(loadApplyingRqConfig(URI.parse('file:///workspace/pkg'), fs)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_location]
    test('loads rqconfig from the same directory as the start path', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/pkg/.rqconfig.json', {
            importRoots: [{ alias: '~' }]
        });
        const loaded = loadApplyingRqConfig(URI.parse('file:///workspace/pkg'), fs);
        expect(loaded?.importRoots).toEqual([{ alias: '~' }]);
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_location]
    test('loads rqconfig from an ancestor directory', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', {
            importRoots: [{ alias: '#' }]
        });
        fs.insert('file:///workspace/pkg/src/a.rq', 'idea body');
        const loaded = loadApplyingRqConfig(URI.parse('file:///workspace/pkg/src'), fs);
        expect(loaded?.importRoots[0]?.alias).toBe('#');
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_location]
    test('nearest ancestor rqconfig wins over farther ones', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', {
            importRoots: [{ alias: '#' }]
        });
        insertConfig(fs, 'file:///workspace/pkg/.rqconfig.json', {
            importRoots: [{ alias: '~' }]
        });
        const loaded = loadApplyingRqConfig(URI.parse('file:///workspace/pkg/src'), fs);
        expect(loaded?.importRoots[0]?.alias).toBe('~');
    });
});

describe('rqconfig schema edges', () => {
    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    test('empty object uses default alias mapping', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', {});
        const loaded = loadApplyingRqConfig(URI.parse('file:///workspace'), fs);
        expect(loaded).toEqual(defaultRqConfig());
        expect(loaded?.importRoots[0]?.alias).toBe(DEFAULT_IMPORT_ROOT_ALIAS);
        expect(loaded?.importRoots[0]?.rootUri).toBeUndefined();
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    test('importRoots alias only overrides the alias', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', {
            importRoots: [{ alias: '~' }]
        });
        const loaded = loadApplyingRqConfig(URI.parse('file:///workspace'), fs);
        expect(loaded?.importRoots).toEqual([{ alias: '~' }]);
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    test('relative root resolves against the config file directory', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/pkg/.rqconfig.json', {
            importRoots: [{ alias: '@', root: './lib' }]
        });
        const loaded = loadApplyingRqConfig(URI.parse('file:///workspace/pkg'), fs);
        expect(loaded?.importRoots[0]?.alias).toBe('@');
        expect(loaded?.importRoots[0]?.rootUri?.toString()).toBe(URI.parse('file:///workspace/pkg/lib').toString());
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    test('absolute filesystem root is used directly', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', {
            importRoots: [{ alias: '@', root: '/abs/lib' }]
        });
        const loaded = loadApplyingRqConfig(URI.parse('file:///workspace'), fs);
        expect(loaded?.importRoots[0]?.rootUri?.toString()).toBe(URI.file('/abs/lib').toString());
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    test('file URI root is used directly', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', {
            importRoots: [{ alias: '@', root: 'file:///elsewhere/lib' }]
        });
        const loaded = loadApplyingRqConfig(URI.parse('file:///workspace'), fs);
        expect(loaded?.importRoots[0]?.rootUri?.toString()).toBe(URI.parse('file:///elsewhere/lib').toString());
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    // rq:["../../../reqlan rq/language/syntax.rq".configuration_import_root_alias]
    test('multiple importRoots map aliases to different roots', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', {
            importRoots: [
                { alias: '@', root: './src' },
                { alias: '#', root: './lib' }
            ]
        });
        const loaded = loadApplyingRqConfig(URI.parse('file:///workspace'), fs);
        expect(loaded?.importRoots).toHaveLength(2);
        expect(loaded?.importRoots[0]?.alias).toBe('@');
        expect(loaded?.importRoots[0]?.rootUri?.toString()).toBe(URI.parse('file:///workspace/src').toString());
        expect(loaded?.importRoots[1]?.alias).toBe('#');
        expect(loaded?.importRoots[1]?.rootUri?.toString()).toBe(URI.parse('file:///workspace/lib').toString());

        const document = createSourceTextDocument('file:///workspace/pkg/a.rq', 'idea body');
        expect(resolveDocumentPathUri('@/a.rq', document, {
            fileSystem: fs,
            workspaceFolderUri: URI.parse('file:///workspace')
        }).toString()).toBe(URI.parse('file:///workspace/src/a.rq').toString());
        expect(resolveDocumentPathUri('#/b.rq', document, {
            fileSystem: fs,
            workspaceFolderUri: URI.parse('file:///workspace')
        }).toString()).toBe(URI.parse('file:///workspace/lib/b.rq').toString());
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    // rq:["../../../reqlan rq/language/syntax.rq".configuration_import_root_alias]
    test('longest alias wins when mappings overlap', () => {
        expect(matchImportRootMapping('@pkg/x.rq', [
            { alias: '@' },
            { alias: '@pkg' }
        ])?.mapping.alias).toBe('@pkg');

        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', {
            importRoots: [
                { alias: '@', root: './src' },
                { alias: '@pkg', root: './packages' }
            ]
        });
        const document = createSourceTextDocument('file:///workspace/a.rq', 'idea body');
        expect(resolveDocumentPathUri('@pkg/util.rq', document, {
            fileSystem: fs,
            workspaceFolderUri: URI.parse('file:///workspace')
        }).toString()).toBe(URI.parse('file:///workspace/packages/util.rq').toString());
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    test('empty string alias entries are skipped', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', {
            importRoots: [{ alias: '' }, { alias: '~' }]
        });
        const loaded = loadApplyingRqConfig(URI.parse('file:///workspace'), fs);
        expect(loaded?.importRoots).toEqual([{ alias: '~' }]);
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    test('empty string root is ignored on a mapping', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', {
            importRoots: [{ alias: '~', root: '' }]
        });
        const loaded = loadApplyingRqConfig(URI.parse('file:///workspace'), fs);
        expect(loaded?.importRoots).toEqual([{ alias: '~' }]);
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    test('invalid importRoots entries are skipped', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', {
            importRoots: [
                null,
                'bad',
                { alias: 12 },
                { root: './lib' },
                { alias: '~', root: true },
                { alias: '#' }
            ]
        });
        const loaded = loadApplyingRqConfig(URI.parse('file:///workspace'), fs);
        expect(loaded?.importRoots).toEqual([{ alias: '~' }, { alias: '#' }]);
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_schema_file]
    test('unknown properties are ignored while known keys still apply', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', {
            importRoots: [{ alias: '~', extra: 1 }],
            futureFlag: true
        });
        const loaded = loadApplyingRqConfig(URI.parse('file:///workspace'), fs);
        expect(loaded?.importRoots).toEqual([{ alias: '~' }]);
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    test('invalid JSON falls back to undefined load', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', '{ not json');
        expect(loadApplyingRqConfig(URI.parse('file:///workspace'), fs)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    test('non-object JSON falls back to undefined load', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/array/.rqconfig.json', ['~']);
        insertConfig(fs, 'file:///workspace/string/.rqconfig.json', '"@"');
        insertConfig(fs, 'file:///workspace/null/.rqconfig.json', 'null');
        expect(loadApplyingRqConfig(URI.parse('file:///workspace/array'), fs)).toBeUndefined();
        expect(loadApplyingRqConfig(URI.parse('file:///workspace/string'), fs)).toBeUndefined();
        expect(loadApplyingRqConfig(URI.parse('file:///workspace/null'), fs)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    test('non-array importRoots falls back to undefined load', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', { importRoots: { alias: '~' } });
        expect(loadApplyingRqConfig(URI.parse('file:///workspace'), fs)).toBeUndefined();
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    test('empty importRoots array uses default alias mapping', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', { importRoots: [] });
        expect(loadApplyingRqConfig(URI.parse('file:///workspace'), fs)).toEqual(defaultRqConfig());
    });
});

describe('rqconfig applied to path resolution', () => {
    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_location]
    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    test('resolveRqConfig uses defaults when no applying file exists', () => {
        const fs = new VirtualFileSystemProvider();
        const document = createSourceTextDocument('file:///workspace/pkg/a.rq', 'idea body');
        expect(resolveRqConfig(document, { fileSystem: fs })).toEqual(defaultRqConfig());
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    test('resolveRqConfig falls back to defaults when applying JSON is invalid', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', '{ broken');
        const document = createSourceTextDocument('file:///workspace/a.rq', 'idea body');
        expect(resolveRqConfig(document, { fileSystem: fs })).toEqual(defaultRqConfig());
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    // rq:["../../../reqlan rq/language/syntax.rq".configuration_import_root_alias]
    test('aliased path uses relative root from applying config', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', {
            importRoots: [{ alias: '#', root: './lib' }]
        });
        const document = createSourceTextDocument('file:///workspace/pkg/a.rq', 'idea body');
        const resolved = resolveDocumentPathUri('#/target.rq', document, {
            fileSystem: fs,
            workspaceFolderUri: URI.parse('file:///workspace')
        });
        expect(resolved.toString()).toBe(URI.parse('file:///workspace/lib/target.rq').toString());
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    // rq:["../../../reqlan rq/language/syntax.rq".configuration_import_root_alias]
    test('aliased path uses workspace folder when root is omitted', () => {
        const fs = new VirtualFileSystemProvider();
        insertConfig(fs, 'file:///workspace/.rqconfig.json', {
            importRoots: [{ alias: '~' }]
        });
        const document = createSourceTextDocument('file:///workspace/pkg/a.rq', 'idea body');
        const resolved = resolveDocumentPathUri('~/shared.rq', document, {
            fileSystem: fs,
            workspaceFolderUri: URI.parse('file:///workspace')
        });
        expect(resolved.toString()).toBe(URI.parse('file:///workspace/shared.rq').toString());
    });
});
