/**
 * Collect inbound file URIs for a moved path from the idea index.
 * rq:["../../../../reqlan rq/extension/refactor_support.rq".refactor_file_moves]
 * rq:["../../../../reqlan rq/extension/refactor_support.rq".comment_reference_refactor_support]
 * rq:["../../../../reqlan rq/extension/features-mutation-hooks.rq".rename_file]
 */

export interface InboundReferencerIndex {
    getEdgesReferencingFile(filePath: string): Promise<Array<{ sourceId: string }>>;
    getIdeasInFile(fileUri: string): Promise<Array<{ id: string; name: string }>>;
    getEdgesTo(ideaId: string): Promise<Array<{ sourceId: string }>>;
    getEdgesFrom(ideaId: string): Promise<Array<{ kind: string; targetFile?: string }>>;
    getIdea(id: string): Promise<{ fileUri?: string } | undefined>;
}

export async function collectInboundReferencerFileUris(
    indexedUri: string,
    indexedBasename: string,
    isRqFile: boolean,
    indexStore: InboundReferencerIndex
): Promise<string[]> {
    const sourceIds = new Set<string>();
    const fileUris = new Set<string>();

    for (const edge of await indexStore.getEdgesReferencingFile(indexedUri)) {
        sourceIds.add(edge.sourceId);
    }
    for (const edge of await indexStore.getEdgesReferencingFile(indexedBasename)) {
        sourceIds.add(edge.sourceId);
    }

    if (isRqFile) {
        for (const idea of await indexStore.getIdeasInFile(indexedUri)) {
            for (const edge of await indexStore.getEdgesTo(idea.id)) {
                sourceIds.add(edge.sourceId);
            }
            for (const edge of await indexStore.getEdgesFrom(idea.id)) {
                if (edge.kind === 'comment_link' && edge.targetFile) {
                    fileUris.add(edge.targetFile);
                }
            }
        }
    }

    for (const sourceId of sourceIds) {
        const idea = await indexStore.getIdea(sourceId);
        if (!idea?.fileUri) {
            continue;
        }
        fileUris.add(idea.fileUri);
    }

    return [...fileUris].filter(fileUri => fileUri !== indexedUri);
}
