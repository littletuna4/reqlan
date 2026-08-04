import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test, vi } from 'vitest';
import { createAnalyticalStore } from '../src/core/analytical-store.js';
import { WorkspaceIndex } from '../src/index-store/workspace-index.js';
import { createReqlanServices } from '@reqlan/language';

vi.mock('@reqlan/language', () => ({
    createReqlanServices: vi.fn()
}));

describe('WorkspaceIndex parser startup', () => {
    test('does not create Langium services in the constructor', () => {
        const root = join(tmpdir(), 'reqlan-lazy-services');
        new WorkspaceIndex(createAnalyticalStore(), join(root, '.reqlan'), root);

        expect(createReqlanServices).not.toHaveBeenCalled();
    });
});
