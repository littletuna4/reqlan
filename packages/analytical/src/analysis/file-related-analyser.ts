import { basename } from 'node:path';
import type { Analyser } from './analyser-registry.js';
import type { FileRelatedRequirements, IdeaSummary } from '../core/types.js';
import { matchFileReferenceTarget } from '../core/file-path-match.js';
import { toWorkspaceRelativePath } from '../core/workspace-paths.js';

export const fileRelatedAnalyser: Analyser<{ fileUri: string }, FileRelatedRequirements> = {
    id: 'file_related_requirements',
    async run({ store, workspaceRoot }, { fileUri }) {
        const indexedFileUri = workspaceRoot ? toWorkspaceRelativePath(fileUri, workspaceRoot) : fileUri;
        const ideasInFile = await store.getIdeasInFile(indexedFileUri);
        const fileName = basename(indexedFileUri);
        const referencingIds = new Set<string>();
        const folderReferencingIds = new Set<string>();

        for (const edge of await store.getAllEdges()) {
            if (edge.targetId && ideasInFile.some(idea => idea.id === edge.targetId)) {
                referencingIds.add(edge.sourceId);
            }
            if (edge.kind === 'file_reference' && edge.targetFile) {
                const match = matchFileReferenceTarget(edge.targetFile, indexedFileUri, fileName);
                if (match === 'file') {
                    referencingIds.add(edge.sourceId);
                } else if (match === 'folder') {
                    folderReferencingIds.add(edge.sourceId);
                }
            }
        }

        const loadIdeas = async (ids: Set<string>): Promise<IdeaSummary[]> =>
            (await Promise.all([...ids].map(id => store.getIdea(id)))).filter(
                (idea): idea is NonNullable<typeof idea> => idea !== undefined
            );

        const referencingIdeas = await loadIdeas(referencingIds);
        const folderReferencingIdeas = (await loadIdeas(folderReferencingIds)).filter(
            idea => !referencingIds.has(idea.id)
        );

        const commentLinkedIdeas = (
            await Promise.all(
                (await store.getEdgesReferencingFile(fileName))
                    .filter(edge => edge.kind === 'comment_link')
                    .map(edge => (edge.targetId ? store.getIdea(edge.targetId) : Promise.resolve(undefined)))
            )
        ).filter((idea): idea is NonNullable<typeof idea> => idea !== undefined);

        return {
            fileUri: indexedFileUri,
            ideasInFile,
            referencingIdeas,
            commentLinkedIdeas,
            folderReferencingIdeas
        };
    }
};
