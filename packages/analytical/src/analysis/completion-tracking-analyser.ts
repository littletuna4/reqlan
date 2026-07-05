import { isDeprecated, ideaStatus, parseAttributes } from '../core/types.js';
import type { Analyser } from './analyser-registry.js';
import type { CompletionSummary, IdeaSummary } from '../core/types.js';

const OUTSTANDING_STATUSES = new Set(['pending', 'todo', 'open', 'in_progress', 'blocked', 'stub']);

export const completionTrackingAnalyser: Analyser<void, CompletionSummary> = {
    id: 'completion_tracking',
    async run({ store }) {
        const ideas = await store.listAllIdeas();
        const allRaw = await store.getAllIdeasRaw();
        const byStatus: Record<string, number> = {};
        const byTag: Record<string, number> = {};
        const outstanding: IdeaSummary[] = [];
        const deprecated: IdeaSummary[] = [];

        for (const idea of ideas) {
            const raw = allRaw.find(entry => entry.id === idea.id);
            const attributes = parseAttributes(raw?.attributesJson ?? '{}');
            const status = ideaStatus(attributes) ?? 'unspecified';
            byStatus[status] = (byStatus[status] ?? 0) + 1;

            for (const tag of idea.tags) {
                byTag[tag] = (byTag[tag] ?? 0) + 1;
            }

            if (isDeprecated(attributes) || idea.tags.some(tag => tag.toLowerCase() === 'deprecated')) {
                deprecated.push(idea);
            } else if (
                OUTSTANDING_STATUSES.has(status.toLowerCase()) ||
                idea.tags.some(tag => ['todo', 'stub', 'open'].includes(tag.toLowerCase()))
            ) {
                outstanding.push(idea);
            }
        }

        return {
            total: ideas.length,
            byStatus,
            byTag,
            outstanding,
            deprecated
        };
    }
};
