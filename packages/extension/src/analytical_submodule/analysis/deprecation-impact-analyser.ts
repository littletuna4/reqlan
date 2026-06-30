import { isDeprecated, parseAttributes } from '../core/types.js';
import type { Analyser } from './analyser-registry.js';
import type { DeprecationImpact } from '../core/types.js';

export const deprecationImpactAnalyser: Analyser<void, DeprecationImpact[]> = {
    id: 'deprecation_impact_analysis',
    run({ store }) {
        const impacts: DeprecationImpact[] = [];
        for (const idea of store.listAllIdeas()) {
            const raw = store.getAllIdeasRaw().find(entry => entry.id === idea.id);
            const attributes = parseAttributes(raw?.attributesJson ?? '{}');
            if (!isDeprecated(attributes)) {
                continue;
            }
            const inbound = store.getEdgesTo(idea.id);
            const dependents = inbound
                .map(edge => store.getIdea(edge.sourceId))
                .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
            impacts.push({ deprecated: idea, dependents });
        }
        return impacts;
    }
};
