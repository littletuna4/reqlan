import { isDeprecated, parseAttributes } from '../core/types.js';
import type { Analyser } from './analyser-registry.js';
import type { DeprecationImpact } from '../core/types.js';

export const deprecationImpactAnalyser: Analyser<void, DeprecationImpact[]> = {
    id: 'deprecation_impact_analysis',
    async run({ store }) {
        const impacts: DeprecationImpact[] = [];
        const allIdeas = await store.listAllIdeas();
        const allRaw = await store.getAllIdeasRaw();
        for (const idea of allIdeas) {
            const raw = allRaw.find(entry => entry.id === idea.id);
            const attributes = parseAttributes(raw?.attributesJson ?? '{}');
            if (!isDeprecated(attributes)) {
                continue;
            }
            const inbound = await store.getEdgesTo(idea.id);
            const dependents = (
                await Promise.all(inbound.map(edge => store.getIdea(edge.sourceId)))
            ).filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
            impacts.push({ deprecated: idea, dependents });
        }
        return impacts;
    }
};
