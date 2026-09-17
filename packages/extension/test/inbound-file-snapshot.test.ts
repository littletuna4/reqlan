/**
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".file_inbound_code_lens]
 */
import { describe, expect, test } from 'vitest';
import {
    lspLineFromIndexedSourceLine,
    toFileReferencerSnapshotRows
} from '../src/extension/inbound-file-snapshot.js';

describe('inbound file snapshot mapping', () => {
    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".file_inbound_code_lens]
    test('converts 1-based indexed lines to LSP lines', () => {
        expect(lspLineFromIndexedSourceLine(undefined)).toBe(0);
        expect(lspLineFromIndexedSourceLine(1)).toBe(0);
        expect(lspLineFromIndexedSourceLine(12)).toBe(11);
    });

    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".file_inbound_code_lens]
    test('maps file referencers to snapshot rows with resolved source URIs', () => {
        const rows = toFileReferencerSnapshotRows(
            [{
                name: 'cli_package',
                sourceId: 'reqlan rq/cli/cli_package.rq#cli_package',
                fileUri: 'reqlan rq/cli/cli_package.rq',
                line: 12
            }],
            indexed => `file:///${indexed}`
        );
        expect(rows).toEqual([{
            name: 'cli_package',
            uri: 'file:///reqlan rq/cli/cli_package.rq',
            line: 11
        }]);
    });
});
