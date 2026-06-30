import type { Analyser } from './analyser-registry.js';
import type { IdeaSummary } from '../core/types.js';

export const listAllIdeasAnalyser: Analyser<void, IdeaSummary[]> = {
    id: 'list_all_ideas',
    run({ store }) {
        return store.listAllIdeas();
    }
};
