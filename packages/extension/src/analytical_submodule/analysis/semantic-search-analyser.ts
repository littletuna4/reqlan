import type { Analyser } from './analyser-registry.js';
import type { SemanticMatch } from '../core/types.js';

export interface SemanticSearchParams {
    query: string;
    ideaset?: string;
    limit?: number;
}

export const semanticSearchAnalyser: Analyser<SemanticSearchParams, SemanticMatch[]> = {
    id: 'semantic_analysis',
    run({ store }, { query, ideaset, limit = 20 }) {
        const normalized = query.toLowerCase();
        const tokens = normalized.split(/\s+/).filter(Boolean);
        const candidates = store.searchByNameOrSummary(query);
        const matches: SemanticMatch[] = [];

        for (const idea of candidates) {
            if (ideaset && idea.kind === 'ideaset' && idea.name !== ideaset) {
                continue;
            }
            const haystack = `${idea.name} ${idea.summary} ${idea.tags.join(' ')}`.toLowerCase();
            const reasons: string[] = [];
            let score = 0;

            if (idea.name.toLowerCase().includes(normalized)) {
                score += 3;
                reasons.push('name match');
            }
            if (idea.summary.toLowerCase().includes(normalized)) {
                score += 2;
                reasons.push('summary match');
            }
            for (const token of tokens) {
                if (haystack.includes(token)) {
                    score += 1;
                    reasons.push(`token:${token}`);
                }
            }
            for (const tag of idea.tags) {
                if (tag.toLowerCase().includes(normalized)) {
                    score += 1;
                    reasons.push(`tag:${tag}`);
                }
            }

            const relatedEdges = store.getEdgesFrom(idea.id);
            for (const edge of relatedEdges) {
                if (edge.label?.toLowerCase().includes(normalized)) {
                    score += 1;
                    reasons.push('reference label');
                }
            }

            if (score > 0) {
                matches.push({ idea, score, reasons: [...new Set(reasons)] });
            }
        }

        return matches
            .sort((left, right) => right.score - left.score)
            .slice(0, limit);
    }
};
