import { describe, expect, test } from 'vitest';
import { posix } from 'node:path';
import { EmptyFileSystem, URI } from 'langium';
import { VirtualFileSystemProvider } from 'langium/test';
import {
    createReqlanServices,
    createSourceTextDocument,
    fileUriFromFsPath,
    findWorkspaceFolderUri,
    isWindowsAbsolutePath,
    loadApplyingRqConfig,
    matchImportRootAlias,
    resolveDocumentPathUri,
    resolveImportUri,
    rewriteRelativePath,
    toDirectoryUri
} from '@reqlan/language';
import {
    pathResolveContextFromWorkspaceFolders,
    resolveAuthoredFsPath
} from '../src/reqlan-path-resolve.js';
import { resolveFileUri } from '../src/reqlan-comment-resolver.js';

describe('import root alias', () => {
    // rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
    test('matchImportRootAlias requires alias then slash', () => {
        expect(matchImportRootAlias('@/reqs/style.rq', '@')).toBe('reqs/style.rq');
        expect(matchImportRootAlias('@reqs/style.rq', '@')).toBeUndefined();
        expect(matchImportRootAlias('./x.rq', '@')).toBeUndefined();
        expect(matchImportRootAlias('#/x.rq', '#')).toBe('x.rq');
    });

    // rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
    test('findWorkspaceFolderUri picks the longest matching folder', () => {
        const nested = URI.parse('file:///ws/pkg');
        const root = URI.parse('file:///ws');
        const document = URI.parse('file:///ws/pkg/src/a.rq');
        expect(findWorkspaceFolderUri(document, [root, nested])?.toString()).toBe(nested.toString());
    });

    // rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
    test('resolves import-root alias against the workspace folder', () => {
        const workspace = URI.parse('file:///workspace');
        const document = createSourceTextDocument('file:///workspace/pkg/a.rq', 'idea body');
        const resolved = resolveDocumentPathUri('@/shared.rq', document, {
            workspaceFolderUri: workspace,
            config: null
        });
        expect(resolved.toString()).toBe(URI.parse('file:///workspace/shared.rq').toString());
    });

    // rq:["../../../reqlan rq/language/syntax.rq".reference_file]
    test('a climbing relative path resolves from an ancestor directory', () => {
        const fs = new VirtualFileSystemProvider();
        fs.insert('file:///ws/packages/language/test/parsing.test.ts', 'test("parse ontology.rq ideas", () => {})\n');
        const document = createSourceTextDocument(
            'file:///ws/testdata/golden-corpus/ontology.rq',
            'host {}'
        );
        const resolved = resolveFileUri('../packages/language/test/parsing.test.ts', document, {
            workspaceFolderUri: URI.parse('file:///ws'),
            fileSystem: fs,
            config: null
        });
        expect(resolved.toString()).toBe(
            URI.parse('file:///ws/packages/language/test/parsing.test.ts').toString()
        );
    });

    // rq:["../../../reqlan rq/language/syntax.rq".reference_file]
    test('a file next to the document wins over an ancestor', () => {
        const fs = new VirtualFileSystemProvider();
        fs.insert('file:///ws/testdata/packages/app.ts', 'near\n');
        fs.insert('file:///ws/packages/app.ts', 'far\n');
        const document = createSourceTextDocument(
            'file:///ws/testdata/golden-corpus/ontology.rq',
            'host {}'
        );
        const resolved = resolveFileUri('../packages/app.ts', document, {
            workspaceFolderUri: URI.parse('file:///ws'),
            fileSystem: fs,
            config: null
        });
        expect(resolved.toString()).toBe(URI.parse('file:///ws/testdata/packages/app.ts').toString());
    });

    // rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
    // rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_import_root_alias]
    test('resolveAuthoredFsPath joins aliased remainder to the workspace folder', () => {
        const resolved = resolveAuthoredFsPath(
            '@/shared.rq',
            '/workspace/pkg/src',
            posix.resolve,
            {
                workspaceFolderUri: URI.parse('file:///workspace'),
                config: null
            }
        );
        expect(resolved).toBe(posix.resolve('/workspace', 'shared.rq'));
    });

    // rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
    // rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_import_root_alias]
    test('pathResolveContextFromWorkspaceFolders picks the longest matching folder', () => {
        const context = pathResolveContextFromWorkspaceFolders(
            '/workspace/pkg/src/app.ts',
            ['/workspace', '/workspace/pkg']
        );
        expect(context.workspaceFolderUri?.fsPath.replace(/\\/g, '/')).toBe('/workspace/pkg');
    });

    // rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
    test('leaves non-aliased relative paths document-relative', () => {
        const document = createSourceTextDocument('file:///workspace/pkg/a.rq', 'idea body');
        const resolved = resolveImportUri('./shared.rq', document, {
            workspaceFolderUri: URI.parse('file:///workspace'),
            config: null
        });
        expect(resolved.toString()).toBe(URI.parse('file:///workspace/pkg/shared.rq').toString());
    });

    // rq:["../../../reqlan rq/extension/host/configuration.rq".configuration_import_roots]
    // rq:["../../../reqlan rq/extension/host/configuration.rq".configuration_location]
    test('loads importRoots list from nearest base config', () => {
        const fs = new VirtualFileSystemProvider();
        fs.insert('file:///workspace/.reqlan/config.json', JSON.stringify({
            importRoots: [{ alias: '#', root: './lib' }]
        }));
        fs.insert('file:///workspace/pkg/.reqlan/config.json', JSON.stringify({
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

    // rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
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

    // rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
    // rq:["../../../reqlan rq/extension/host/configuration.rq".configuration_import_roots]
    // rq:["../../../reqlan rq/extension/mutation/mutation-hooks.rq".move_file]
    test('rewrite leaves aliased paths unchanged', () => {
        const oldFile = URI.parse('file:///workspace/ext/a/foo.rq');
        const newFile = URI.parse('file:///workspace/ext/c/foo.rq');
        expect(rewriteRelativePath('@/shared.rq', oldFile, newFile)).toBeUndefined();
        expect(rewriteRelativePath('#/shared.rq', oldFile, newFile, {
            importRoots: [{ alias: '#' }]
        })).toBeUndefined();
        expect(rewriteRelativePath('./other.rq', oldFile, newFile)).toBe('../a/other.rq');
    });

    // rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
    test('services construct with EmptyFileSystem', () => {
        expect(() => createReqlanServices(EmptyFileSystem)).not.toThrow();
    });
});

describe('Windows filesystem paths vs URI schemes', () => {
    // rq:["../../../reqlan rq/extension/host/configuration.rq".configuration_import_roots]
    test('isWindowsAbsolutePath detects drive and UNC paths', () => {
        expect(isWindowsAbsolutePath('C:\\Users\\tony\\lib')).toBe(true);
        expect(isWindowsAbsolutePath('c:/Users/tony/lib')).toBe(true);
        expect(isWindowsAbsolutePath('\\\\server\\share')).toBe(true);
        expect(isWindowsAbsolutePath('/abs/lib')).toBe(false);
        expect(isWindowsAbsolutePath('file:///C:/lib')).toBe(false);
        expect(isWindowsAbsolutePath('./relative')).toBe(false);
    });

    // rq:["../../../reqlan rq/extension/host/configuration.rq".configuration_import_roots]
    test('toDirectoryUri does not parse a drive letter as a URI scheme', () => {
        const uri = toDirectoryUri('C:\\libs');
        expect(uri.scheme).toBe('file');
        expect(decodeURIComponent(uri.toString()).toLowerCase()).toContain('/c:/libs');
        expect(fileUriFromFsPath('C:\\libs').scheme).toBe('file');
    });
});
