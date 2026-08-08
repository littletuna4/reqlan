/**
 * Import path helpers for the reference search modal.
 * rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
 */
import { describe, expect, test } from 'vitest';
import {
    isSameIndexedFile,
    relativeImportPathForIndexedFile
} from '../src/extension/reference-search-import-path.js';

describe('relativeImportPathForIndexedFile', () => {
    // rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
    test('resolves workspace-relative index paths against the document', () => {
        const documentUri = 'file:///home/tony/reqlan/reqlan%20rq/extension/features-commands.rq';
        const workspaceRoot = '/home/tony/reqlan';

        expect(
            relativeImportPathForIndexedFile(documentUri, 'reqlan rq/site/site.rq', workspaceRoot)
        ).toBe('../site/site.rq');

        expect(
            relativeImportPathForIndexedFile(
                documentUri,
                'reqlan rq/extension/configuration.rq',
                workspaceRoot
            )
        ).toBe('./configuration.rq');

        expect(
            isSameIndexedFile(
                documentUri,
                'reqlan rq/extension/features-commands.rq',
                workspaceRoot
            )
        ).toBe(true);
    });

    // rq:["../../../reqlan rq/extension/features-commands.rq".search_code_actions]
    test('accepts absolute file:// index URIs', () => {
        expect(
            relativeImportPathForIndexedFile(
                'file:///workspace/app/consumer.rq',
                'file:///workspace/lib/shared.rq'
            )
        ).toBe('../lib/shared.rq');
    });
});
