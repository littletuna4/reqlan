import { describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI } from 'langium';
import { VirtualFileSystemProvider } from 'langium/test';
import {
    createReqlanServices,
    createSourceTextDocument,
    findWorkspaceFolderUri,
    loadApplyingRqConfig,
    matchImportRootAlias,
    resolveDocumentPathUri,
    resolveImportUri,
    rewriteRelativePath
} from 'reqlan-language';

describe('import root alias', () => {
    // rq:["../../../reqlan rq/language/syntax.rq".configuration_import_root_alias]
    test('matchImportRootAlias requires alias then slash', () => {
        expect(matchImportRootAlias('@/reqs/style.rq', '@')).toBe('reqs/style.rq');
        expect(matchImportRootAlias('@reqs/style.rq', '@')).toBeUndefined();
        expect(matchImportRootAlias('./x.rq', '@')).toBeUndefined();
        expect(matchImportRootAlias('#/x.rq', '#')).toBe('x.rq');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".configuration_import_root_alias]
    test('findWorkspaceFolderUri picks the longest matching folder', () => {
        const nested = URI.parse('file:///ws/pkg');
        const root = URI.parse('file:///ws');
        const document = URI.parse('file:///ws/pkg/src/a.rq');
        expect(findWorkspaceFolderUri(document, [root, nested])?.toString()).toBe(nested.toString());
    });

    // rq:["../../../reqlan rq/language/syntax.rq".configuration_import_root_alias]
    test('resolves import-root alias against the workspace folder', () => {
        const workspace = URI.parse('file:///workspace');
        const document = createSourceTextDocument('file:///workspace/pkg/a.rq', 'idea body');
        const resolved = resolveDocumentPathUri('@/shared.rq', document, {
            workspaceFolderUri: workspace,
            config: null
        });
        expect(resolved.toString()).toBe(URI.parse('file:///workspace/shared.rq').toString());
    });

    // rq:["../../../reqlan rq/language/syntax.rq".configuration_import_root_alias]
    test('leaves non-aliased relative paths document-relative', () => {
        const document = createSourceTextDocument('file:///workspace/pkg/a.rq', 'idea body');
        const resolved = resolveImportUri('./shared.rq', document, {
            workspaceFolderUri: URI.parse('file:///workspace'),
            config: null
        });
        expect(resolved.toString()).toBe(URI.parse('file:///workspace/pkg/shared.rq').toString());
    });

    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_location]
    test('loads importRoots list from nearest rqconfig', () => {
        const fs = new VirtualFileSystemProvider();
        fs.insert('file:///workspace/.rqconfig.json', JSON.stringify({
            importRoots: [{ alias: '#', root: './lib' }]
        }));
        fs.insert('file:///workspace/pkg/.rqconfig.json', JSON.stringify({
            importRoots: [{ alias: '~' }]
        }));
        fs.insert('file:///workspace/pkg/a.rq', 'idea body');
        fs.insert('file:///workspace/lib/target.rq', 'target body');

        const nearest = loadApplyingRqConfig(URI.parse('file:///workspace/pkg'), fs);
        expect(nearest?.importRoots).toEqual([{ alias: '~' }]);

        const rootConfig = loadApplyingRqConfig(URI.parse('file:///workspace/other'), fs);
        expect(rootConfig?.importRoots[0]?.alias).toBe('#');
        expect(rootConfig?.importRoots[0]?.rootUri?.toString()).toBe(URI.parse('file:///workspace/lib').toString());
    });

    // rq:["../../../reqlan rq/language/syntax.rq".configuration_import_root_alias]
    test('resolves using config importRoots mapping', () => {
        const document = createSourceTextDocument('file:///workspace/pkg/a.rq', 'idea body');
        const resolved = resolveDocumentPathUri('~/target.rq', document, {
            workspaceFolderUri: URI.parse('file:///workspace'),
            config: {
                importRoots: [{
                    alias: '~',
                    rootUri: URI.parse('file:///workspace/lib')
                }]
            }
        });
        expect(resolved.toString()).toBe(URI.parse('file:///workspace/lib/target.rq').toString());
    });

    // rq:["../../../reqlan rq/language/syntax.rq".configuration_import_root_alias]
    // rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
    // rq:["../../../reqlan rq/extension/features-mutation-hooks.rq".move_file]
    test('rewrite leaves aliased paths unchanged', () => {
        const oldFile = URI.parse('file:///workspace/ext/a/foo.rq');
        const newFile = URI.parse('file:///workspace/ext/c/foo.rq');
        expect(rewriteRelativePath('@/shared.rq', oldFile, newFile)).toBeUndefined();
        expect(rewriteRelativePath('#/shared.rq', oldFile, newFile, {
            importRoots: [{ alias: '#' }]
        })).toBeUndefined();
        expect(rewriteRelativePath('./other.rq', oldFile, newFile)).toBe('../a/other.rq');
    });

    // rq:["../../../reqlan rq/language/syntax.rq".configuration_import_root_alias]
    test('services construct with EmptyFileSystem', () => {
        expect(() => createReqlanServices(EmptyFileSystem)).not.toThrow();
    });
});
