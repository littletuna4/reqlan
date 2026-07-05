import { basename } from 'node:path';
import type { Analyser } from './analyser-registry.js';
import type { FileRelatedRequirements } from '../core/types.js';
import { toWorkspaceRelativePath } from '../core/workspace-paths.js';

export const fileRelatedAnalyser: Analyser<{ fileUri: string }, FileRelatedRequirements> = {
    id: 'file_related_requirements',
    async run({ store, workspaceRoot }, { fileUri }) {
        const indexedFileUri = workspaceRoot ? toWorkspaceRelativePath(fileUri, workspaceRoot) : fileUri;
        const ideasInFile = await store.getIdeasInFile(indexedFileUri);
        const fileName = basename(indexedFileUri);
        const referencingIds = new Set<string>();

        for (const edge of await store.getAllEdges()) {
            if (edge.targetId && ideasInFile.some(idea => idea.id === edge.targetId)) {
                referencingIds.add(edge.sourceId);
            }
            if (edge.targetFile && (edge.targetFile.includes(fileName) || edge.targetFile === indexedFileUri)) {
                referencingIds.add(edge.sourceId);
            }
        }

        const referencingIdeas = (
            await Promise.all([...referencingIds].map(id => store.getIdea(id)))
        ).filter((idea): idea is NonNullable<typeof idea> => idea !== undefined);

        const commentLinkedIdeas = (
            await Promise.all(
                (await store.getEdgesReferencingFile(fileName))
                    .filter(edge => edge.kind === 'comment_link')
                    .map(edge => edge.targetId ? store.getIdea(edge.targetId) : Promise.resolve(undefined))
            )
        ).filter((idea): idea is NonNullable<typeof idea> => idea !== undefined);

        return {
            fileUri: indexedFileUri,
            ideasInFile,
            referencingIdeas,
            commentLinkedIdeas
        };
    }
};
