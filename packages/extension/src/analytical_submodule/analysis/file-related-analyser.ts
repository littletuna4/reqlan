import { basename } from 'node:path';
import type { Analyser } from './analyser-registry.js';
import type { FileRelatedRequirements } from '../core/types.js';

export const fileRelatedAnalyser: Analyser<{ fileUri: string }, FileRelatedRequirements> = {
    id: 'file_related_requirements',
    run({ store }, { fileUri }) {
        const ideasInFile = store.getIdeasInFile(fileUri);
        const fileName = basename(fileUri);
        const referencingIds = new Set<string>();

        for (const edge of store.getAllEdges()) {
            if (edge.targetId && ideasInFile.some(idea => idea.id === edge.targetId)) {
                referencingIds.add(edge.sourceId);
            }
            if (edge.targetFile && (edge.targetFile.includes(fileName) || edge.targetFile === fileUri)) {
                referencingIds.add(edge.sourceId);
            }
        }

        const referencingIdeas = [...referencingIds]
            .map(id => store.getIdea(id))
            .filter((idea): idea is NonNullable<typeof idea> => idea !== undefined);

        const commentLinkedIdeas = store.getEdgesReferencingFile(fileName)
            .filter(edge => edge.kind === 'comment_link')
            .map(edge => edge.targetId ? store.getIdea(edge.targetId) : undefined)
            .filter((idea): idea is NonNullable<typeof idea> => idea !== undefined);

        return {
            fileUri,
            ideasInFile,
            referencingIdeas,
            commentLinkedIdeas
        };
    }
};
