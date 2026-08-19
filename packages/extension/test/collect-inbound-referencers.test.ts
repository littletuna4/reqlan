/**
 * Inbound referencer collection for file-move path rewrites.
 * rq:["../../../reqlan rq/extension/refactor_support.rq".comment_reference_refactor_support]
 * rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_file_moves]
 */
import { describe, expect, test } from 'vitest';
import {
    collectInboundReferencerFileUris,
    type InboundReferencerIndex
} from '../src/mutation_hooks_module/collect-inbound-referencers-core.js';

function memoryIndex(init: {
    ideasInFile?: Array<{ id: string; name: string }>;
    edgesFrom?: Record<string, Array<{ kind: string; targetFile?: string }>>;
    edgesTo?: Record<string, Array<{ sourceId: string }>>;
    edgesReferencingFile?: Record<string, Array<{ sourceId: string }>>;
    ideas?: Record<string, { fileUri?: string }>;
}): InboundReferencerIndex {
    return {
        async getEdgesReferencingFile(filePath) {
            return init.edgesReferencingFile?.[filePath] ?? [];
        },
        async getIdeasInFile() {
            return init.ideasInFile ?? [];
        },
        async getEdgesTo(ideaId) {
            return init.edgesTo?.[ideaId] ?? [];
        },
        async getEdgesFrom(ideaId) {
            return init.edgesFrom?.[ideaId] ?? [];
        },
        async getIdea(id) {
            return init.ideas?.[id];
        }
    };
}

describe('collectInboundReferencerFileUris', () => {
    // rq:["../../../reqlan rq/extension/refactor_support.rq".comment_reference_refactor_support]
    test('includes comment_link target files when an rq file moves', async () => {
        const uris = await collectInboundReferencerFileUris(
            'reqs/alpha.rq',
            'alpha.rq',
            true,
            memoryIndex({
                ideasInFile: [{ id: 'idea-alpha', name: 'alpha' }],
                edgesFrom: {
                    'idea-alpha': [
                        { kind: 'comment_link', targetFile: 'src/app.ts' },
                        { kind: 'references' }
                    ]
                }
            })
        );
        expect(uris).toEqual(['src/app.ts']);
    });

    // rq:["../../../reqlan rq/extension/refactor_support.rq".refactor_file_moves]
    test('includes idea files that reference the moved path', async () => {
        const uris = await collectInboundReferencerFileUris(
            'reqs/alpha.rq',
            'alpha.rq',
            true,
            memoryIndex({
                edgesReferencingFile: {
                    'reqs/alpha.rq': [{ sourceId: 'idea-beta' }]
                },
                ideas: {
                    'idea-beta': { fileUri: 'reqs/other.rq' }
                }
            })
        );
        expect(uris).toEqual(['reqs/other.rq']);
    });
});
